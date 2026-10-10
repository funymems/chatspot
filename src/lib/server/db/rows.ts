import type { SQL } from "drizzle-orm";
import type { Executor } from "./client";

/** Runs raw SQL and returns rows (PGlite and node-postgres both return `{ rows }`). */
export async function queryRows<T>(db: Executor, query: SQL): Promise<T[]> {
  const res = (await db.execute(query)) as unknown as { rows?: T[] } | T[];
  return Array.isArray(res) ? res : (res.rows ?? []);
}
