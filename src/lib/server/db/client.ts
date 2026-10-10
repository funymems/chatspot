import "server-only";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { logger } from "@/lib/server/logger";
import { syncSystemTemplates } from "./bootstrap";

/**
 * Two interchangeable backends behind one `Database` type:
 *
 * - **Postgres (production)** when `DATABASE_URL` is set — e.g. Supabase via
 *   its transaction pooler (port 6543). Uses node-postgres, which returns
 *   `{ rows }` from raw queries exactly like PGlite. Migrations are applied by
 *   `npm run db:migrate` (run automatically by `vercel-build`), not at runtime,
 *   so concurrent serverless cold starts never race on the schema.
 * - **PGlite (local development)** otherwise: embedded Postgres persisted to
 *   ./.data, migrated on first use, single process (guarded by a lock file).
 *
 * Both are Postgres, share the same SQL migrations and the same Drizzle query
 * API, so services don't know which one they're talking to.
 */

export type Database = PgliteDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Anything that can run queries: the root db or an open transaction. */
export type Executor = Database | Tx;

type DbState = { db: Database; close: () => Promise<void>; ready: Promise<void>; kind: "postgres" | "pglite" };

const globalKey = Symbol.for("chatspot.db");
type GlobalWithDb = typeof globalThis & { [globalKey]?: DbState };

export const migrationsFolder = () => path.resolve(process.cwd(), "drizzle");

export function resolveDataDir(): string {
  const configured = process.env.PGLITE_DATA_DIR ?? ".data/pglite";
  if (configured.startsWith("memory://")) return configured;
  // Runtime data location, not a source dependency: keep it out of file tracing.
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), configured);
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

/** Local/embedded database (development, tests, scripts). */
export function createDatabase(dataDir: string): DbState {
  const inMemory = dataDir.startsWith("memory://");
  if (!inMemory) acquireLock(dataDir);
  const client = new PGlite(dataDir);
  const db = drizzlePglite({ client, schema, casing: "snake_case" });
  const ready = (async () => {
    const started = performance.now();
    await migratePglite(db, { migrationsFolder: migrationsFolder() });
    await syncSystemTemplates(db);
    logger.info("db.ready", { driver: "pglite", dataDir: inMemory ? dataDir : path.relative(process.cwd(), dataDir), ms: Math.round(performance.now() - started) });
  })();
  return { db, close: () => client.close(), ready, kind: "pglite" };
}

function sslFor(url: string) {
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  if (["localhost", "127.0.0.1", "::1"].includes(host) || process.env.DATABASE_SSL === "off") return false;
  // Supabase's pooler presents a certificate from Supabase's own CA. Provide it via
  // DATABASE_SSL_CA (PEM) for full verification; otherwise the connection is
  // still encrypted but the server certificate isn't verified.
  const ca = process.env.DATABASE_SSL_CA?.replace(/\\n/g, "\n");
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false };
}

/** Hosted Postgres (Supabase, Neon, …) via DATABASE_URL. */
export function createPostgresDatabase(url: string): DbState {
  const pool = new Pool({
    connectionString: url,
    ssl: sslFor(url),
    // Serverless functions run many small instances: keep each pool tiny and let the pooler fan in.
    max: Number(process.env.DATABASE_POOL_MAX ?? 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on("error", (err) => logger.error("db.pool_error", { err }));
  const db = drizzlePg({ client: pool, schema, casing: "snake_case" }) as unknown as Database;
  return { db, close: () => pool.end(), ready: Promise.resolve(), kind: "postgres" };
}

function state(): DbState {
  const g = globalThis as GlobalWithDb;
  if (!g[globalKey]) {
    const url = process.env.DATABASE_URL?.trim();
    if (url) g[globalKey] = createPostgresDatabase(url);
    else if (process.env.VERCEL) {
      throw new Error(
        "DATABASE_URL is not set. Serverless deployments can't use the embedded local database — add a Postgres connection string (e.g. Supabase) in the project's environment variables.",
      );
    } else g[globalKey] = createDatabase(resolveDataDir());
  }
  return g[globalKey];
}

/** Returns the ready database. Always await before querying. */
export async function getDb(): Promise<Database> {
  const s = state();
  await s.ready;
  return s.db;
}

/** Which backend is in use ("postgres" | "pglite"). */
export function databaseKind() {
  return state().kind;
}

/** Test/scripts helper: replace the process-wide instance. */
export function setDbForTesting(next: DbState | undefined) {
  (globalThis as GlobalWithDb)[globalKey] = next;
}

/** Scripts: close the connection so the process can exit. */
export async function closeDb() {
  const g = globalThis as GlobalWithDb;
  await g[globalKey]?.close();
  g[globalKey] = undefined;
}
