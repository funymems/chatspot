import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { aiAgents } from "@/lib/server/db/schema";
import type { WorkspaceContext } from "@/lib/server/auth/context";

export async function listAgentOptions(ctx: WorkspaceContext) {
  const db = await getDb();
  return db
    .select({ id: aiAgents.id, name: aiAgents.name })
    .from(aiAgents)
    .where(eq(aiAgents.workspaceId, ctx.workspaceId))
    .orderBy(asc(aiAgents.name));
}
