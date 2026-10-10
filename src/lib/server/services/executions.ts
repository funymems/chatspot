import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { automationExecutions, automationVersions, automations, contacts, messages, nodeExecutionLogs } from "@/lib/server/db/schema";
import type { WorkspaceContext } from "@/lib/server/auth/context";
import { notFound } from "@/lib/server/errors";
import { automationGraph } from "@/lib/domain/graph/schema";

export async function listExecutions(ctx: WorkspaceContext, automationId: string, limit = 10) {
  const db = await getDb();
  return db
    .select({
      id: automationExecutions.id,
      status: automationExecutions.status,
      mode: automationExecutions.mode,
      stepCount: automationExecutions.stepCount,
      error: automationExecutions.error,
      createdAt: automationExecutions.createdAt,
      finishedAt: automationExecutions.finishedAt,
      version: automationVersions.version,
      contactFirst: contacts.firstName,
      contactLast: contacts.lastName,
    })
    .from(automationExecutions)
    .innerJoin(automationVersions, eq(automationVersions.id, automationExecutions.versionId))
    .leftJoin(contacts, eq(contacts.id, automationExecutions.contactId))
    .where(and(eq(automationExecutions.workspaceId, ctx.workspaceId), eq(automationExecutions.automationId, automationId)))
    .orderBy(desc(automationExecutions.createdAt))
    .limit(limit);
}

export async function getExecutionDetail(ctx: WorkspaceContext, executionId: string) {
  const db = await getDb();
  const [exec] = await db
    .select()
    .from(automationExecutions)
    .where(and(eq(automationExecutions.id, executionId), eq(automationExecutions.workspaceId, ctx.workspaceId)))
    .limit(1);
  if (!exec) throw notFound("Run");
  const [[version], [automation], logs, transcript] = await Promise.all([
    db.select().from(automationVersions).where(eq(automationVersions.id, exec.versionId)).limit(1),
    db.select({ id: automations.id, name: automations.name }).from(automations).where(eq(automations.id, exec.automationId)).limit(1),
    db.select().from(nodeExecutionLogs).where(eq(nodeExecutionLogs.executionId, exec.id)).orderBy(asc(nodeExecutionLogs.seq)),
    exec.conversationId
      ? db
          .select()
          .from(messages)
          .where(and(eq(messages.conversationId, exec.conversationId), eq(messages.executionId, exec.id)))
          .orderBy(asc(messages.createdAt))
      : Promise.resolve([]),
  ]);
  return { exec, version: version!, graph: automationGraph.parse(version!.graph), automation: automation!, logs, transcript };
}
