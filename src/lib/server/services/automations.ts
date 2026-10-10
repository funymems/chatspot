import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, ilike, inArray, max, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { aiAgents, automationExecutions, automationVersions, automations } from "@/lib/server/db/schema";
import type { WorkspaceContext } from "@/lib/server/auth/context";
import { AppError, conflict, notFound } from "@/lib/server/errors";
import { automationGraph, type AutomationGraph } from "@/lib/domain/graph/schema";
import { triggerSummary, validateGraph, type ValidationResult } from "@/lib/domain/graph/validate";
import { defaultGraph } from "@/lib/domain/graph/builder";
import { stableStringify } from "@/lib/domain/stable-hash";
import { recordActivity } from "./activity";

export type AutomationStatus = (typeof automations.$inferSelect)["status"];
export const automationStatuses: AutomationStatus[] = ["draft", "active", "inactive", "error"];

export type AutomationListItem = {
  id: string;
  name: string;
  description: string;
  status: AutomationStatus;
  triggerType: string | null;
  origin: string;
  updatedAt: Date;
  hasUnpublishedChanges: boolean;
  runs: number;
  failedRuns: number;
  lastRunAt: Date | null;
};

export const hashGraph = (graph: unknown) => createHash("sha256").update(stableStringify(graph)).digest("hex");

/** Parses the structural shape of a graph (configs may still be incomplete in a draft). */
function parseGraph(graph: unknown): AutomationGraph {
  const parsed = automationGraph.safeParse(graph);
  if (!parsed.success) throw new AppError("The flow data is malformed and can't be saved", "validation");
  return parsed.data;
}

async function getOwned(ctx: WorkspaceContext, id: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(automations)
    .where(and(eq(automations.id, id), eq(automations.workspaceId, ctx.workspaceId)))
    .limit(1);
  if (!row) throw notFound("Automation");
  return row;
}

export async function listAutomations(
  ctx: WorkspaceContext,
  filter: { q?: string; status?: AutomationStatus } = {},
): Promise<AutomationListItem[]> {
  const db = await getDb();
  const conditions = [eq(automations.workspaceId, ctx.workspaceId)];
  if (filter.status) conditions.push(eq(automations.status, filter.status));
  if (filter.q?.trim()) {
    const term = `%${filter.q.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conditions.push(or(ilike(automations.name, term), ilike(automations.description, term))!);
  }
  const rows = await db
    .select({
      id: automations.id,
      name: automations.name,
      description: automations.description,
      status: automations.status,
      triggerType: automations.triggerType,
      origin: automations.origin,
      updatedAt: automations.updatedAt,
      graph: automations.graph,
      publishedHash: automationVersions.contentHash,
    })
    .from(automations)
    .leftJoin(automationVersions, eq(automationVersions.id, automations.publishedVersionId))
    .where(and(...conditions))
    .orderBy(desc(automations.updatedAt));

  const ids = rows.map((r) => r.id);
  const stats = ids.length
    ? await db
        .select({
          automationId: automationExecutions.automationId,
          runs: sql<number>`count(*)::int`,
          failed: sql<number>`count(*) filter (where ${automationExecutions.status} = 'failed')::int`,
          lastRunAt: max(automationExecutions.createdAt),
        })
        .from(automationExecutions)
        .where(and(eq(automationExecutions.workspaceId, ctx.workspaceId), inArray(automationExecutions.automationId, ids)))
        .groupBy(automationExecutions.automationId)
    : [];
  const statsById = new Map(stats.map((s) => [s.automationId, s]));

  return rows.map((r) => {
    const s = statsById.get(r.id);
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      status: r.status,
      triggerType: r.triggerType,
      origin: r.origin,
      updatedAt: r.updatedAt,
      hasUnpublishedChanges: r.publishedHash !== null && r.publishedHash !== hashGraph(r.graph),
      runs: s?.runs ?? 0,
      failedRuns: s?.failed ?? 0,
      lastRunAt: s?.lastRunAt ?? null,
    };
  });
}

export async function getAutomation(ctx: WorkspaceContext, id: string) {
  const row = await getOwned(ctx, id);
  const db = await getDb();
  const published = row.publishedVersionId
    ? (
        await db
          .select({ id: automationVersions.id, version: automationVersions.version, contentHash: automationVersions.contentHash, createdAt: automationVersions.createdAt })
          .from(automationVersions)
          .where(eq(automationVersions.id, row.publishedVersionId))
          .limit(1)
      )[0] ?? null
    : null;
  return {
    ...row,
    graph: row.graph as AutomationGraph,
    published,
    hasUnpublishedChanges: published !== null && published.contentHash !== hashGraph(row.graph),
  };
}

export async function createAutomation(
  ctx: WorkspaceContext,
  input: { name: string; description?: string; graph?: unknown; origin?: "scratch" | "template" | "ai" | "duplicate" },
) {
  const graph = input.graph === undefined ? defaultGraph() : parseGraph(input.graph);
  const db = await getDb();
  const [row] = await db
    .insert(automations)
    .values({
      workspaceId: ctx.workspaceId,
      name: input.name,
      description: input.description ?? "",
      graph,
      triggerType: triggerSummary(graph),
      origin: input.origin ?? "scratch",
      createdBy: ctx.userId,
    })
    .returning();
  if (!row) throw new Error("Insert failed");
  await recordActivity(ctx, {
    type: "automation.created",
    summary: `Automation “${row.name}” created`,
    entityType: "automation",
    entityId: row.id,
    metadata: { origin: row.origin },
  });
  return row;
}

export async function updateAutomationDetails(ctx: WorkspaceContext, id: string, input: { name: string; description: string }) {
  await getOwned(ctx, id);
  const db = await getDb();
  await db
    .update(automations)
    .set({ name: input.name, description: input.description, updatedAt: new Date() })
    .where(and(eq(automations.id, id), eq(automations.workspaceId, ctx.workspaceId)));
}

/**
 * Saves the working copy of the graph. Uses optimistic concurrency so two
 * editors (tabs) can't silently overwrite each other.
 */
export async function saveAutomationGraph(ctx: WorkspaceContext, id: string, graph: unknown, expectedRevision: number) {
  const parsed = parseGraph(graph);
  const db = await getDb();
  const [row] = await db
    .update(automations)
    .set({
      graph: parsed,
      triggerType: triggerSummary(parsed),
      revision: sql`${automations.revision} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(automations.id, id), eq(automations.workspaceId, ctx.workspaceId), eq(automations.revision, expectedRevision)))
    .returning({ revision: automations.revision });
  if (!row) {
    await getOwned(ctx, id); // 404 if it doesn't exist
    throw conflict("This automation was changed somewhere else. Reload to get the latest version.");
  }
  return row.revision;
}

export async function duplicateAutomation(ctx: WorkspaceContext, id: string) {
  const source = await getOwned(ctx, id);
  return createAutomation(ctx, {
    name: `${source.name} (copy)`.slice(0, 120),
    description: source.description,
    graph: source.graph,
    origin: "duplicate",
  });
}

export async function deleteAutomation(ctx: WorkspaceContext, id: string) {
  const row = await getOwned(ctx, id);
  const db = await getDb();
  await db.delete(automations).where(and(eq(automations.id, id), eq(automations.workspaceId, ctx.workspaceId)));
  await recordActivity(ctx, { type: "automation.deleted", summary: `Automation “${row.name}” deleted`, entityType: "automation" });
}

/** Builds the reference context (agents, automations) for validating in this workspace. */
async function referenceContext(ctx: WorkspaceContext, selfAutomationId?: string) {
  const db = await getDb();
  const [agentRows, automationRows] = await Promise.all([
    db.select({ id: aiAgents.id }).from(aiAgents).where(eq(aiAgents.workspaceId, ctx.workspaceId)),
    db.select({ id: automations.id }).from(automations).where(eq(automations.workspaceId, ctx.workspaceId)),
  ]);
  return {
    agentIds: new Set(agentRows.map((r) => r.id)),
    automationIds: new Set(automationRows.map((r) => r.id)),
    selfAutomationId,
  };
}

export async function validateAutomation(ctx: WorkspaceContext, id: string): Promise<ValidationResult> {
  const row = await getOwned(ctx, id);
  return validateGraph(row.graph, await referenceContext(ctx, id));
}

/** Creates an immutable version for a graph, reusing an identical existing one. */
export async function snapshotVersion(
  ctx: WorkspaceContext,
  automationId: string,
  graph: AutomationGraph,
  source: "publish" | "test" | "snapshot",
) {
  const db = await getDb();
  const contentHash = hashGraph(graph);
  return db.transaction(async (tx) => {
    const [same] = await tx
      .select()
      .from(automationVersions)
      .where(and(eq(automationVersions.automationId, automationId), eq(automationVersions.contentHash, contentHash)))
      .orderBy(desc(automationVersions.version))
      .limit(1);
    if (same) return same;
    const [{ next } = { next: 1 }] = await tx
      .select({ next: sql<number>`coalesce(max(${automationVersions.version}), 0)::int + 1` })
      .from(automationVersions)
      .where(eq(automationVersions.automationId, automationId));
    const [created] = await tx
      .insert(automationVersions)
      .values({ workspaceId: ctx.workspaceId, automationId, version: next, graph, contentHash, source, createdBy: ctx.userId })
      .returning();
    return created!;
  });
}

/**
 * Activates (publishes) an automation. Never activates an invalid graph:
 * validation errors are returned to the caller and the status is unchanged.
 */
export async function activateAutomation(ctx: WorkspaceContext, id: string) {
  const row = await getOwned(ctx, id);
  const result = validateGraph(row.graph, await referenceContext(ctx, id));
  if (!result.valid || !result.graph) {
    const count = result.issues.filter((i) => i.severity === "error").length;
    throw new AppError(`Fix ${count} problem${count === 1 ? "" : "s"} in the flow before activating`, "validation");
  }
  const version = await snapshotVersion(ctx, id, result.graph, "publish");
  const db = await getDb();
  await db
    .update(automations)
    .set({ status: "active", publishedVersionId: version.id, lastError: null, updatedAt: new Date() })
    .where(and(eq(automations.id, id), eq(automations.workspaceId, ctx.workspaceId)));
  await recordActivity(ctx, {
    type: "automation.activated",
    summary: `Automation “${row.name}” activated (v${version.version})`,
    entityType: "automation",
    entityId: id,
  });
  return version;
}

export async function deactivateAutomation(ctx: WorkspaceContext, id: string) {
  const row = await getOwned(ctx, id);
  if (row.status !== "active" && row.status !== "error") return;
  const db = await getDb();
  await db
    .update(automations)
    .set({ status: "inactive", updatedAt: new Date() })
    .where(and(eq(automations.id, id), eq(automations.workspaceId, ctx.workspaceId)));
  await recordActivity(ctx, {
    type: "automation.deactivated",
    summary: `Automation “${row.name}” deactivated`,
    entityType: "automation",
    entityId: id,
  });
}

/** Lightweight id/name list, e.g. for the "redirect to flow" picker. */
export async function listAutomationOptions(ctx: WorkspaceContext, excludeId?: string) {
  const db = await getDb();
  const rows = await db
    .select({ id: automations.id, name: automations.name })
    .from(automations)
    .where(eq(automations.workspaceId, ctx.workspaceId))
    .orderBy(automations.name);
  return rows.filter((r) => r.id !== excludeId);
}
