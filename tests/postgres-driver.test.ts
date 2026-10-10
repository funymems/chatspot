/**
 * Exercises the production code path (node-postgres + SQL migrations over TCP)
 * against a real Postgres wire-protocol server (PGlite socket server), so the
 * Supabase setup is tested without Docker or network access.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { closeDb, createPostgresDatabase, getDb, setDbForTesting } from "@/lib/server/db/client";
import { migratePostgres } from "@/lib/server/db/migrate-postgres";
import { templates } from "@/lib/server/db/schema";
import { registerUser, authenticate } from "@/lib/server/services/accounts";
import { resolveWorkspaceAccess } from "@/lib/server/services/workspaces";
import { createAutomationFromTemplate } from "@/lib/server/services/templates";
import { listTemplates } from "@/lib/server/services/templates";
import { sendTestMessage, getTestSession } from "@/lib/server/services/test-runs";
import { addKnowledgeQa, createAgent, searchKnowledge } from "@/lib/server/services/agents";
import { processDueJobs } from "@/lib/server/jobs/worker";
import { GraphBuilder } from "@/lib/domain/graph/builder";
import { activateAutomation, createAutomation } from "@/lib/server/services/automations";

let pg: PGlite;
let server: PGLiteSocketServer;
const PORT = 54000 + Math.floor(Math.random() * 1000);
const URL = `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`;

beforeAll(async () => {
  pg = await PGlite.create();
  server = new PGLiteSocketServer({ db: pg, port: PORT, host: "127.0.0.1", maxConnections: 4 });
  await server.start();
  await migratePostgres(URL, false);
  process.env.DATABASE_POOL_MAX = "1";
  setDbForTesting(createPostgresDatabase(URL));
});

afterAll(async () => {
  await closeDb();
  await server.stop();
  await pg.close();
});

describe("Postgres driver (production path)", () => {
  it("applied migrations and synced templates", async () => {
    const db = await getDb();
    expect((await db.select().from(templates)).length).toBeGreaterThanOrEqual(8);
    // running migrations again is a no-op
    await expect(migratePostgres(URL, false)).resolves.toBeUndefined();
  });

  it("runs auth, automations, the engine, job queue and FTS over the pg driver", async () => {
    const { userId, workspace } = await registerUser({ fullName: "Pg User", email: "pg@example.test", password: "password-pg" });
    expect(await authenticate({ email: "PG@example.test", password: "password-pg" })).toBe(userId);
    const ctx = (await resolveWorkspaceAccess(userId, workspace.slug))!;

    const t = (await listTemplates(ctx)).find((x) => x.slug === "course-sales")!;
    const a = await createAutomationFromTemplate(ctx, t.id);
    await activateAutomation(ctx, a.id);
    await sendTestMessage(ctx, a.id, { text: "COURSE", eventId: randomUUID() });
    await sendTestMessage(ctx, a.id, { text: "Beginner", eventId: randomUUID() });
    expect((await getTestSession(ctx, a.id)).execution?.status).toBe("completed");

    // delayed message via the job queue (raw SQL claim with SKIP LOCKED)
    const g = new GraphBuilder();
    const trig = g.trigger({ kind: "manual" });
    const msg = g.message("later", { delaySeconds: 30 });
    g.chain(trig, msg, g.end());
    const d = await createAutomation(ctx, { name: "delay", graph: g.build() });
    await sendTestMessage(ctx, d.id, { text: "", eventId: randomUUID() });
    expect(await processDueJobs(new Date(Date.now() + 31_000))).toBe(1);
    expect((await getTestSession(ctx, d.id)).execution?.status).toBe("completed");

    const agent = await createAgent(ctx, { name: "Pg agent", role: "support", description: "" });
    await addKnowledgeQa(ctx, agent.id, { question: "Где вы находитесь?", answer: "Алматы, Абая 10" });
    expect((await searchKnowledge(ctx.workspaceId, agent.id, "где находитесь"))[0]?.answer).toBe("Алматы, Абая 10");
  });
});
