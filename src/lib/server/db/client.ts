import "server-only";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";
import { logger } from "@/lib/server/logger";
import { syncSystemTemplates } from "./bootstrap";

/**
 * Phase-1 persistence: an embedded Postgres (PGlite) persisted to ./.data.
 *
 * PGlite is single-process. We keep exactly one instance per Node process
 * (cached on globalThis so dev HMR and separate route bundles share it) and a
 * lock file so a second process (e.g. `npm run db:reset` while `next dev` runs)
 * fails loudly instead of corrupting the data directory.
 *
 * Swapping to Supabase/Postgres later means replacing this module with a
 * `drizzle-orm/postgres-js` client; repositories only depend on `Database`.
 */

export type Database = PgliteDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Anything that can run queries: the root db or an open transaction. */
export type Executor = Database | Tx;

type DbState = { db: Database; client: PGlite; ready: Promise<void> };

const globalKey = Symbol.for("chatspot.db");
type GlobalWithDb = typeof globalThis & { [globalKey]?: DbState };

export function resolveDataDir(): string {
  const configured = process.env.PGLITE_DATA_DIR ?? ".data/pglite";
  if (configured.startsWith("memory://")) return configured;
  return path.resolve(process.cwd(), configured);
}

function acquireLock(dataDir: string) {
  const lockPath = `${dataDir}.lock`;
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  if (fs.existsSync(lockPath)) {
    const pid = Number(fs.readFileSync(lockPath, "utf8"));
    if (pid && pid !== process.pid && isAlive(pid)) {
      throw new Error(
        `The local database at ${dataDir} is in use by another process (pid ${pid}). ` +
          `Stop the other process (e.g. the dev server) and try again.`,
      );
    }
  }
  fs.writeFileSync(lockPath, String(process.pid));
  const release = () => {
    try {
      if (fs.readFileSync(lockPath, "utf8") === String(process.pid)) fs.unlinkSync(lockPath);
    } catch {
      // already gone
    }
  };
  process.once("exit", release);
}

function isAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function createDatabase(dataDir: string): DbState {
  const inMemory = dataDir.startsWith("memory://");
  if (!inMemory) acquireLock(dataDir);
  const client = new PGlite(dataDir);
  const db = drizzle({ client, schema, casing: "snake_case" });
  const ready = (async () => {
    const started = performance.now();
    await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
    await syncSystemTemplates(db);
    logger.info("db.ready", { dataDir: inMemory ? dataDir : path.relative(process.cwd(), dataDir), ms: Math.round(performance.now() - started) });
  })();
  return { db, client, ready };
}

function state(): DbState {
  const g = globalThis as GlobalWithDb;
  if (!g[globalKey]) g[globalKey] = createDatabase(resolveDataDir());
  return g[globalKey];
}

/** Returns the migrated database. Always await before querying. */
export async function getDb(): Promise<Database> {
  const s = state();
  await s.ready;
  return s.db;
}

/** Test/scripts helper: replace the process-wide instance. */
export function setDbForTesting(next: DbState | undefined) {
  (globalThis as GlobalWithDb)[globalKey] = next;
}
