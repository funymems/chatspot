import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { users } from "@/lib/server/db/schema";
import { registerUser } from "@/lib/server/services/accounts";
import { logger } from "@/lib/server/logger";

/**
 * Local demo account. These are throwaway credentials for the local
 * development database only — never reuse them anywhere else.
 */
export const DEMO_ACCOUNT = {
  email: "demo@chatspot.local",
  password: "chatspot-demo-2026",
  fullName: "Демо-пользователь",
} as const;

/** Idempotent: creates the demo account + workspace if missing. */
export async function seedDemo() {
  const db = await getDb();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${DEMO_ACCOUNT.email}`)
    .limit(1);
  if (existing) {
    logger.info("seed.skip", { reason: "demo account exists" });
    return { created: false };
  }
  const { workspace } = await registerUser(DEMO_ACCOUNT, { workspaceName: "Демо-пространство", isDemo: true });
  logger.info("seed.done", { workspace: workspace.slug });
  return { created: true, workspaceSlug: workspace.slug };
}
