/**
 * Applies SQL migrations (drizzle/) and syncs built-in templates.
 * - With DATABASE_URL: runs against that Postgres (e.g. Supabase). Used by
 *   `vercel-build`, so every deploy migrates once before the new code goes live.
 * - Without it: migrates the local PGlite database.
 */
import { closeDb, getDb } from "@/lib/server/db/client";
import { migratePostgres } from "@/lib/server/db/migrate-postgres";

const url = process.env.DATABASE_URL?.trim();

if (!url) {
  if (process.env.VERCEL) {
    console.error("DATABASE_URL is not set — refusing to deploy without a database. Add it in Vercel → Settings → Environment Variables.");
    process.exit(1);
  }
  await getDb(); // PGlite migrates on open
  await closeDb();
  console.log("Local PGlite database migrated.");
  process.exit(0);
}

const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const ca = process.env.DATABASE_SSL_CA?.replace(/\n/g, "\n");
const ssl = local || process.env.DATABASE_SSL === "off" ? false : ca ? { ca } : { rejectUnauthorized: false };
const started = Date.now();
try {
  await migratePostgres(url, ssl);
  console.log(`Postgres migrated and templates synced in ${Date.now() - started} ms.`);
} catch (err) {
  // Print only the message: connection errors can echo parts of the URL otherwise.
  console.error("Migration failed:", err instanceof Error ? err.message.replace(/postgres(ql)?:\/\/\S+/g, "postgres://***") : "unknown error");
  process.exit(1);
}
