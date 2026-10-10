import "server-only";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { templates } from "@/lib/server/db/schema";
import type { WorkspaceContext } from "@/lib/server/auth/context";
import { notFound } from "@/lib/server/errors";
import type { AutomationGraph } from "@/lib/domain/graph/schema";
import { createAutomation } from "./automations";

/** Templates visible to a workspace: built-ins plus its own saved templates. */
const visibleTo = (ctx: WorkspaceContext) => or(isNull(templates.workspaceId), eq(templates.workspaceId, ctx.workspaceId));

export async function listTemplates(ctx: WorkspaceContext) {
  const db = await getDb();
  const rows = await db.select().from(templates).where(visibleTo(ctx)).orderBy(asc(templates.isSystem), asc(templates.name));
  return rows.map((r) => ({ ...r, graph: r.graph as AutomationGraph }));
}

export async function getTemplate(ctx: WorkspaceContext, id: string) {
  const db = await getDb();
  const [row] = await db.select().from(templates).where(and(eq(templates.id, id), visibleTo(ctx))).limit(1);
  if (!row) throw notFound("шаблон");
  return { ...row, graph: row.graph as AutomationGraph };
}

export async function createAutomationFromTemplate(ctx: WorkspaceContext, templateId: string, name?: string) {
  const t = await getTemplate(ctx, templateId);
  return createAutomation(ctx, { name: name?.trim() || t.name, description: t.description, graph: t.graph, origin: "template" });
}
