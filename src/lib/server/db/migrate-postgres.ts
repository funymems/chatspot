import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";
import { migrationsFolder } from "./client";
import { syncSystemTemplates } from "./bootstrap";

/** Applies drizzle/ migrations and syncs built-in templates on a Postgres URL. */
export async function migratePostgres(url: string, ssl: PoolConfig["ssl"]) {
  const pool = new Pool({ connectionString: url, ssl, max: 1 });
  try {
    const db = drizzle({ client: pool, schema, casing: "snake_case" });
    await migrate(db, { migrationsFolder: migrationsFolder() });
    await syncSystemTemplates(db as never);
  } finally {
    await pool.end();
  }
}
