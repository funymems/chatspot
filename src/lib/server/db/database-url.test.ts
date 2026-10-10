import { afterEach, describe, expect, it } from "vitest";
import { resolveDatabaseUrl } from "./database-url";

const keep = { DATABASE_URL: process.env.DATABASE_URL, POSTGRES_URL: process.env.POSTGRES_URL };
afterEach(() => Object.assign(process.env, keep));

describe("resolveDatabaseUrl", () => {
  it("prefers DATABASE_URL, falls back to POSTGRES_URL (Vercel integration)", () => {
    process.env.DATABASE_URL = "";
    process.env.POSTGRES_URL = "postgres://u:p@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x";
    expect(resolveDatabaseUrl()).toBe("postgres://u:p@aws-0-eu-central-1.pooler.supabase.com:6543/postgres");
    process.env.DATABASE_URL = "postgresql://a:b@host:6543/db";
    expect(resolveDatabaseUrl()).toBe("postgresql://a:b@host:6543/db");
  });
  it("returns null when nothing is configured", () => {
    process.env.DATABASE_URL = "";
    process.env.POSTGRES_URL = "";
    expect(resolveDatabaseUrl()).toBeNull();
  });
});
