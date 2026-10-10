import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb, type Executor } from "@/lib/server/db/client";
import { activityEvents } from "@/lib/server/db/schema";
import type { WorkspaceContext } from "@/lib/server/auth/context";

export type ActivityInput = {
  type: string;
  summary: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

export async function recordActivity(ctx: Pick<WorkspaceContext, "workspaceId" | "userId">, input: ActivityInput, tx?: Executor) {
  const db = tx ?? (await getDb());
  await db.insert(activityEvents).values({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.userId,
    type: input.type,
    summary: input.summary,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: input.metadata ?? {},
  });
}

export async function listRecentActivity(ctx: WorkspaceContext, limit = 10) {
  const db = await getDb();
  return db
    .select()
    .from(activityEvents)
    .where(eq(activityEvents.workspaceId, ctx.workspaceId))
    .orderBy(desc(activityEvents.createdAt))
    .limit(limit);
}
