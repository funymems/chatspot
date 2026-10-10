import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { automationVersions, type automations } from "@/lib/server/db/schema";
import { automationGraph, type AutomationGraph } from "@/lib/domain/graph/schema";
import { stableStringify } from "@/lib/domain/stable-hash";

export const hashGraph = (graph: unknown) => createHash("sha256").update(stableStringify(graph)).digest("hex");

/** Creates an immutable version for a graph, reusing an identical existing one. */
export async function snapshotGraphVersion(input: {
  workspaceId: string;
  automationId: string;
  graph: AutomationGraph;
  source: "publish" | "test" | "snapshot";
  userId: string | null;
}) {
  const db = await getDb();
  const contentHash = hashGraph(input.graph);
  return db.transaction(async (tx) => {
    const [same] = await tx
      .select()
      .from(automationVersions)
      .where(and(eq(automationVersions.automationId, input.automationId), eq(automationVersions.contentHash, contentHash)))
      .orderBy(desc(automationVersions.version))
      .limit(1);
    if (same) return same;
    const [{ next } = { next: 1 }] = await tx
      .select({ next: sql<number>`coalesce(max(${automationVersions.version}), 0)::int + 1` })
      .from(automationVersions)
      .where(eq(automationVersions.automationId, input.automationId));
    const [created] = await tx
      .insert(automationVersions)
      .values({
        workspaceId: input.workspaceId,
        automationId: input.automationId,
        version: next,
        graph: input.graph,
        contentHash,
        source: input.source,
        createdBy: input.userId,
      })
      .returning();
    return created!;
  });
}

/** Test runs execute the current draft: snapshot it so the run is pinned to exactly what was tested. */
export async function snapshotDraftForTest(workspaceId: string, automation: typeof automations.$inferSelect, userId: string | null = null) {
  const v = await snapshotGraphVersion({
    workspaceId,
    automationId: automation.id,
    graph: automationGraph.parse(automation.graph),
    source: "test",
    userId,
  });
  return v.id;
}
