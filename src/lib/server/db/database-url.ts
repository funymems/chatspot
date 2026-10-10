/**
 * Resolves the Postgres connection string:
 * DATABASE_URL (manual setup) or POSTGRES_URL (set by the Vercel ↔ Supabase
 * integration; its pooled, transaction-mode URL).
 *
 * TLS is configured explicitly in code, so `sslmode`/`ssl*` query params are
 * stripped: recent `pg` versions treat `sslmode=require` as full certificate
 * verification, which fails against Supabase's own CA without DATABASE_SSL_CA.
 */
export function resolveDatabaseUrl(): string | null {
  const raw = (process.env.DATABASE_URL || process.env.POSTGRES_URL || "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    for (const k of [...u.searchParams.keys()]) {
      if (k === "sslmode" || k.startsWith("ssl") || k === "supa") u.searchParams.delete(k);
    }
    return u.toString();
  } catch {
    return raw;
  }
}
