import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { useTestDatabase } from "@/test/db";
import type { Database } from "@/lib/server/db/client";
import { automationExecutions, contacts, conversations, messages, nodeExecutionLogs, scheduledJobs } from "@/lib/server/db/schema";
import { registerUser } from "@/lib/server/services/accounts";
import { resolveWorkspaceAccess } from "@/lib/server/services/workspaces";
import { activateAutomation, createAutomation } from "@/lib/server/services/automations";
import { createAutomationFromTemplate, listTemplates } from "@/lib/server/services/templates";
import { getTestSession, resetTestSession, sendTestMessage } from "@/lib/server/services/test-runs";
import { getContactTags } from "@/lib/server/services/contact-data";
import { handleInboundMessage } from "@/lib/server/engine/events";
import { runExecution, startExecution } from "@/lib/server/engine/runtime";
import { snapshotGraphVersion } from "@/lib/server/engine/snapshots";
import { registerAiStep } from "@/lib/server/engine/ai-step";
import { RetryableError, type ExecState } from "@/lib/server/engine/types";
import { processDueJobs } from "@/lib/server/jobs/worker";
import { GraphBuilder } from "@/lib/domain/graph/builder";
import type { WorkspaceContext } from "@/lib/server/auth/context";

let db: Database;
let ctx: WorkspaceContext;
let other: WorkspaceContext;

beforeAll(async () => {
  db = await useTestDatabase();
  const a = await registerUser({ fullName: "Aida Sultanova", email: "aida@example.test", password: "password-aida" });
  const b = await registerUser({ fullName: "Bek", email: "bek@example.test", password: "password-bek" });
  ctx = (await resolveWorkspaceAccess(a.userId, a.workspace.slug))!;
  other = (await resolveWorkspaceAccess(b.userId, b.workspace.slug))!;
});

afterEach(async () => {
  await resetTestSession(ctx);
});

const send = (automationId: string, text: string, eventId = randomUUID()) => sendTestMessage(ctx, automationId, { text, eventId });
const later = (seconds: number) => new Date(Date.now() + seconds * 1000);

async function execution(id: string) {
  const [row] = await db.select().from(automationExecutions).where(eq(automationExecutions.id, id));
  return row!;
}
async function logs(id: string) {
  return db.select().from(nodeExecutionLogs).where(eq(nodeExecutionLogs.executionId, id)).orderBy(nodeExecutionLogs.seq);
}
async function outbound(conversationId: string) {
  const rows = await db.select().from(messages).where(and(eq(messages.conversationId, conversationId), eq(messages.kind, "outbound"))).orderBy(messages.createdAt);
  return rows;
}

describe("test runs", () => {
  it("runs trigger → message → end, rendering variables into a simulated message", async () => {
    const a = await createAutomation(ctx, { name: "Hello" });
    const res = await send(a.id, "hello there");
    expect(res.outcome).toBe("started");
    const exec = await execution((res as { executionId: string }).executionId);
    expect(exec.status).toBe("completed");
    expect(exec.mode).toBe("test");
    expect((await logs(exec.id)).map((l) => [l.nodeType, l.status])).toEqual([
      ["trigger", "success"],
      ["message", "success"],
      ["end", "success"],
    ]);
    const out = await outbound(exec.conversationId!);
    expect(out).toHaveLength(1);
    expect(out[0]!.body).toContain("Hi Aida!");
    expect(out[0]!.deliveryStatus).toBe("simulated");
  });

  it("does not start when the trigger doesn't match", async () => {
    const a = await createAutomation(ctx, { name: "Hello 2" });
    const res = await send(a.id, "good morning");
    expect(res.outcome).toBe("no_match");
  });

  it("refuses to run an invalid draft", async () => {
    const g = new GraphBuilder();
    g.trigger({ kind: "manual" });
    const a = await createAutomation(ctx, { name: "Broken", graph: g.build() });
    const res = await send(a.id, "");
    expect(res.outcome).toBe("invalid");
  });

  it("ignores a duplicate event id", async () => {
    const a = await createAutomation(ctx, { name: "Dupes" });
    const eventId = randomUUID();
    expect((await send(a.id, "hello", eventId)).outcome).toBe("started");
    expect((await send(a.id, "hello", eventId)).outcome).toBe("duplicate");
    const runs = await db.select().from(automationExecutions).where(eq(automationExecutions.automationId, a.id));
    expect(runs).toHaveLength(1);
  });

  it("waits for a reply, branches on it, sets fields and tags (course template)", async () => {
    const t = (await listTemplates(ctx)).find((x) => x.slug === "course-sales")!;
    const a = await createAutomationFromTemplate(ctx, t.id);
    const started = await send(a.id, "COURSE");
    const id = (started as { executionId: string }).executionId;
    let exec = await execution(id);
    expect(exec.status).toBe("waiting");
    expect((exec.state as ExecState).wait?.kind).toBe("reply");

    const resumed = await send(a.id, "Beginner please");
    expect(resumed).toEqual({ outcome: "resumed", executionId: id });
    exec = await execution(id);
    expect(exec.status).toBe("completed");
    const branch = (await logs(id)).find((l) => l.nodeType === "condition");
    expect(branch?.branch).toBe("true");

    const [contact] = await db.select().from(contacts).where(eq(contacts.id, exec.contactId!));
    expect(contact!.customFields).toMatchObject({ course_interest: "beginner" });
    expect(await getContactTags(ctx.workspaceId, contact!.id)).toContain("course-lead");
    const out = await outbound(exec.conversationId!);
    expect(out.at(-1)!.payload).toMatchObject({ linkButtons: [{ url: "https://example.com/courses/beginner" }] });
  });

  it("captures an email from a reply (lead magnet template)", async () => {
    const t = (await listTemplates(ctx)).find((x) => x.slug === "lead-magnet")!;
    const a = await createAutomationFromTemplate(ctx, t.id);
    const { executionId } = (await send(a.id, "send the free guide")) as { executionId: string };
    await send(a.id, "sure: Aida@Example.com");
    const exec = await execution(executionId);
    expect(exec.status).toBe("completed");
    expect(exec.result).toMatchObject({ outcome: "goal_reached" });
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, exec.contactId!));
    expect(contact!.email).toBe("aida@example.com");
  });

  it("runs message delays through the job queue, not by blocking", async () => {
    const g = new GraphBuilder();
    const t = g.trigger({ kind: "manual" });
    const m = g.message("Delayed hello", { delaySeconds: 60 });
    const e = g.end();
    g.chain(t, m, e);
    const a = await createAutomation(ctx, { name: "Delay", graph: g.build() });
    const { executionId } = (await send(a.id, "")) as { executionId: string };
    expect((await execution(executionId)).status).toBe("waiting");
    expect(await outbound((await execution(executionId)).conversationId!)).toHaveLength(0);

    expect(await processDueJobs(new Date())).toBe(0); // not due yet
    expect(await processDueJobs(later(61))).toBe(1);
    const exec = await execution(executionId);
    expect(exec.status).toBe("completed");
    expect((await outbound(exec.conversationId!)).map((x) => x.body)).toEqual(["Delayed hello"]);
    const [job] = await db.select().from(scheduledJobs).where(eq(scheduledJobs.status, "done"));
    expect(job).toBeTruthy();
  });

  it("ignores stale or replayed resume tokens", async () => {
    const g = new GraphBuilder();
    const t = g.trigger({ kind: "manual" });
    const w = g.action({ kind: "wait", seconds: 30 });
    const m = g.message("after wait");
    const e = g.end();
    g.chain(t, w, m, e);
    const a = await createAutomation(ctx, { name: "Wait", graph: g.build() });
    const { executionId } = (await send(a.id, "")) as { executionId: string };
    const token = ((await execution(executionId)).state as ExecState).wait!.token;

    await runExecution(executionId, { token: "wrong", reason: "delay" });
    expect((await execution(executionId)).status).toBe("waiting");

    await runExecution(executionId, { token, reason: "delay" });
    await runExecution(executionId, { token, reason: "delay" }); // replay
    const exec = await execution(executionId);
    expect(exec.status).toBe("completed");
    expect(await outbound(exec.conversationId!)).toHaveLength(1);
  });

  it("times out waiting for a reply and continues", async () => {
    const t = (await listTemplates(ctx)).find((x) => x.slug === "follow-up-sequence")!;
    const a = await createAutomationFromTemplate(ctx, t.id);
    const { executionId } = (await send(a.id, "")) as { executionId: string };
    await processDueJobs(later(3601)); // wait 1h → sends nudge, waits for reply (24h timeout)
    expect(((await execution(executionId)).state as ExecState).wait?.kind).toBe("reply");
    await processDueJobs(later(3601 + 86401));
    const exec = await execution(executionId);
    expect(exec.status).toBe("completed");
    expect(exec.result).toMatchObject({ label: "No response" });
  });

  it("isolates test sessions between workspaces", async () => {
    const a = await createAutomation(ctx, { name: "Mine" });
    await expect(getTestSession(other, a.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(sendTestMessage(other, a.id, { text: "hello", eventId: randomUUID() })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("runtime safety", () => {
  async function runRaw(build: (g: GraphBuilder) => void, maxSteps = 100) {
    const g = new GraphBuilder();
    build(g);
    const graph = { ...g.build(), settings: { maxSteps } };
    const a = await createAutomation(ctx, { name: "raw", graph });
    const version = await snapshotGraphVersion({ workspaceId: ctx.workspaceId, automationId: a.id, graph, source: "test", userId: ctx.userId });
    const session = await getTestSession(ctx, a.id);
    return startExecution({
      workspaceId: ctx.workspaceId,
      automationId: a.id,
      versionId: version.id,
      conversationId: session.conversation.id,
      contactId: session.contact.id,
      mode: "test",
      input: { text: "x", source: "test" },
    });
  }

  it("stops runaway loops at the step limit even if validation was bypassed", async () => {
    const exec = await runRaw((g) => {
      const t = g.trigger({ kind: "manual" });
      const a = g.action({ kind: "add_tag", tag: "loop" });
      const c = g.condition([{ kind: "has_tag", tag: "never" }]);
      const e = g.end();
      g.chain(t, a, c).connect(c, e, "true").connect(c, a, "false");
    }, 20);
    expect(exec.status).toBe("failed");
    expect(exec.error).toMatch(/Stopped after 20 steps/);
  });

  it("retries retryable failures through the queue, then succeeds", async () => {
    let calls = 0;
    registerAiStep(async () => {
      calls++;
      if (calls === 1) throw new RetryableError("provider returned 503");
      return { reply: "ok", usedSources: [], handoff: false, provider: "test" };
    });
    const exec = await runRaw((g) => {
      const t = g.trigger({ kind: "manual" });
      const ai = g.aiResponse({ agentId: randomUUID() });
      const e = g.end();
      g.chain(t, ai, e);
    });
    expect(exec.status).toBe("waiting");
    expect((exec.state as ExecState).wait?.kind).toBe("retry");
    await processDueJobs(later(10));
    const done = await execution(exec.id);
    expect(done.status).toBe("completed");
    expect(calls).toBe(2);
    const statuses = (await logs(exec.id)).filter((l) => l.nodeType === "ai_response").map((l) => l.status);
    expect(statuses).toEqual(["failed", "success"]);
  });

  it("fails non-retryable errors with the node recorded", async () => {
    registerAiStep(async () => {
      throw new Error("agent misconfigured");
    });
    const exec = await runRaw((g) => {
      const t = g.trigger({ kind: "manual" });
      const ai = g.aiResponse({ agentId: randomUUID() });
      const e = g.end();
      g.chain(t, ai, e);
    });
    expect(exec.status).toBe("failed");
    expect(exec.error).toBe("agent misconfigured");
    expect(exec.errorNodeId).toMatch(/^ai_response/);
  });
});

describe("live inbound messages", () => {
  it("starts the matching active automation once per event, preferring keyword triggers", async () => {
    const catchAll = new GraphBuilder();
    const t1 = catchAll.trigger({ kind: "incoming_message" });
    const m1 = catchAll.message("generic reply");
    const e1 = catchAll.end();
    catchAll.chain(t1, m1, e1);
    const generic = await createAutomation(ctx, { name: "Catch all", graph: catchAll.build() });
    await activateAutomation(ctx, generic.id);
    const specific = await createAutomation(ctx, { name: "Hello live" }); // keyword "hello"
    await activateAutomation(ctx, specific.id);

    const [contact] = await db.insert(contacts).values({ workspaceId: ctx.workspaceId, firstName: "Live", source: "mock", channelUserId: "u1" }).returning();
    const [conv] = await db.insert(conversations).values({ workspaceId: ctx.workspaceId, contactId: contact!.id, channel: "mock" }).returning();

    const eventId = randomUUID();
    const r1 = await handleInboundMessage({ workspaceId: ctx.workspaceId, conversationId: conv!.id, contactId: contact!.id, channel: "mock", externalEventId: eventId, text: "hello!" });
    expect(r1.execution?.automationId).toBe(specific.id);
    expect(r1.execution?.mode).toBe("live");
    const again = await handleInboundMessage({ workspaceId: ctx.workspaceId, conversationId: conv!.id, contactId: contact!.id, channel: "mock", externalEventId: eventId, text: "hello!" });
    expect(again.duplicate).toBe(true);

    const r2 = await handleInboundMessage({ workspaceId: ctx.workspaceId, conversationId: conv!.id, contactId: contact!.id, channel: "mock", externalEventId: randomUUID(), text: "what's up" });
    expect(r2.execution?.automationId).toBe(generic.id);
    const inbound = await db.select().from(messages).where(and(eq(messages.conversationId, conv!.id), eq(messages.kind, "inbound")));
    expect(inbound).toHaveLength(2);
  });

  it("redirects into another automation", async () => {
    const target = new GraphBuilder();
    const tt = target.trigger({ kind: "manual" });
    const tm = target.message("from the target flow");
    const te = target.end();
    target.chain(tt, tm, te);
    const b = await createAutomation(ctx, { name: "Target", graph: target.build() });

    const src = new GraphBuilder();
    const st = src.trigger({ kind: "manual" });
    const sr = src.action({ kind: "redirect", automationId: b.id });
    src.chain(st, sr);
    const se = src.end();
    void se;
    const graph = src.build();
    // Redirect ends the run, but validation still wants the action's output connected.
    graph.edges.push({ id: "e_r_end", source: sr, target: graph.nodes.find((n) => n.type === "end")!.id, sourceHandle: "out" });
    const a = await createAutomation(ctx, { name: "Source", graph });

    const res = await send(a.id, "");
    const exec = await execution((res as { executionId: string }).executionId);
    expect(exec.status).toBe("completed");
    expect(exec.result).toMatchObject({ outcome: "redirected" });
    expect((await outbound(exec.conversationId!)).map((x) => x.body)).toContain("from the target flow");
  });
});
