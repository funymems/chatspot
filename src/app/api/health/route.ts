import { sql } from "drizzle-orm";
import { databaseKind, getDb } from "@/lib/server/db/client";
import { queryRows } from "@/lib/server/db/rows";
import { logger } from "@/lib/server/logger";

/**
 * Liveness + database check for monitoring. Returns no secrets or data:
 * only whether the database answers and whether migrations were applied.
 */
export async function GET() {
  try {
    const db = await getDb();
    const [row] = await queryRows<{ tables: number }>(
      db,
      sql`select count(*)::int as tables from information_schema.tables where table_schema = 'public' and table_name in ('users','workspaces','automations','channel_connections')`,
    );
    const migrated = (row?.tables ?? 0) === 4;
    return Response.json({ ok: migrated, database: databaseKind(), migrated }, { status: migrated ? 200 : 503, headers: { "cache-control": "no-store" } });
  } catch (err) {
    logger.error("health.db_failed", { err: err instanceof Error ? new Error(err.message.replace(/postgres(ql)?:\/\/\S+/g, "postgres://***")) : err });
    return Response.json({ ok: false, database: "unreachable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
