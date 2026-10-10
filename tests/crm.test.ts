import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { useTestDatabase } from "@/test/db";
import type { Database } from "@/lib/server/db/client";
import { automationExecutions, contacts, conversations, messages } from "@/lib/server/db/schema";
import { registerUser } from "@/lib/server/services/accounts";
import { resolveWorkspaceAccess } from "@/lib/server/services/workspaces";
import {
  addContactTag,
  createContact,
  getContactDetail,
  listContacts,
  listTags,
  mergeContacts,
  removeContactTag,
  updateContact,
} from "@/lib/server/services/contacts";
import {
  addInternalNote,
  assignConversation,
  getConversation,
  listConversations,
  previewAiReply,
  sendHumanReply,
  sendPreview,
  setConversationStatus,
  simulateInbound,
  startSimulatedConversation,
} from "@/lib/server/services/inbox";
import { activateAutomation, createAutomation } from "@/lib/server/services/automations";
import { addKnowledgeQa, createAgent } from "@/lib/server/services/agents";
import { getAnalytics } from "@/lib/server/services/analytics";
import { createAutomationFromTemplate, listTemplates } from "@/lib/server/services/templates";
import type { WorkspaceContext } from "@/lib/server/auth/context";

let db: Database;
let ctx: WorkspaceContext;
let other: WorkspaceContext;

beforeAll(async () => {
  delete process.env.GEMINI_API_KEY;
  db = await useTestDatabase();
  const a = await registerUser({ fullName: "Fatima", email: "fatima@example.test", password: "password-fatima" });
  const b = await registerUser({ fullName: "Galym", email: "galym@example.test", password: "password-galym" });
  ctx = (await resolveWorkspaceAccess(a.userId, a.workspace.slug))!;
  other = (await resolveWorkspaceAccess(b.userId, b.workspace.slug))!;
});

const base = { email: null, phone: null, leadStatus: "new" as const, notes: "" };

describe("contacts", () => {
  it("creates, searches, filters by tag/status, sorts and paginates", async () => {
    const a = await createContact(ctx, { ...base, firstName: "Asel", lastName: "Nurlan", email: "asel@example.com", tags: ["vip"] });
    await createContact(ctx, { ...base, firstName: "Bauyrzhan", lastName: "K", leadStatus: "qualified" });
    for (let i = 0; i < 6; i++) await createContact(ctx, { ...base, firstName: `Bulk${i}`, lastName: "" });

    expect((await listContacts(ctx, { q: "asel@" })).rows.map((r) => r.id)).toEqual([a.id]);
    expect((await listContacts(ctx, { q: "asel nurlan" })).rows.map((r) => r.id)).toEqual([a.id]);
    expect((await listContacts(ctx, { tag: "VIP" })).rows.map((r) => r.id)).toEqual([a.id]);
    expect((await listContacts(ctx, { status: "qualified" })).rows).toHaveLength(1);
    const page = await listContacts(ctx, { pageSize: 5, page: 2, sort: "name" });
    expect(page.total).toBe(8);
    expect(page.pages).toBe(2);
    expect(page.rows).toHaveLength(3);
    expect((await listContacts(ctx, { sort: "name" })).rows[0]!.firstName).toBe("Asel");
  });

  it("edits fields and tags", async () => {
    const c = await createContact(ctx, { ...base, firstName: "Dina", lastName: "" });
    await updateContact(ctx, c.id, { ...base, firstName: "Dina", lastName: "Sh", email: "dina@example.com", leadStatus: "engaged", notes: "met at expo" });
    await addContactTag(ctx, c.id, "expo");
    await addContactTag(ctx, c.id, "lead");
    await removeContactTag(ctx, c.id, "lead");
    const d = await getContactDetail(ctx, c.id);
    expect(d.contact).toMatchObject({ lastName: "Sh", email: "dina@example.com", leadStatus: "engaged" });
    expect(d.tags).toEqual(["expo"]);
    expect((await listTags(ctx)).find((t) => t.name === "expo")?.uses).toBe(1);
  });

  it("suggests duplicates but merges only on explicit request", async () => {
    const p = await createContact(ctx, { ...base, firstName: "Erzhan", lastName: "T", email: "erzhan@example.com", tags: ["a"] });
    const d = await createContact(ctx, { ...base, firstName: "", lastName: "", email: "ERZHAN@example.com", phone: "+77010000000", tags: ["b"] });
    const [conv] = await db.insert(conversations).values({ workspaceId: ctx.workspaceId, contactId: d.id, channel: "mock" }).returning();
    const detail = await getContactDetail(ctx, p.id);
    expect(detail.duplicates.map((x) => x.id)).toEqual([d.id]);
    // Nothing merged yet
    expect((await db.select().from(contacts).where(eq(contacts.id, d.id)))[0]!.mergedIntoId).toBeNull();

    await mergeContacts(ctx, p.id, d.id);
    const merged = await getContactDetail(ctx, p.id);
    expect(merged.contact.phone).toBe("+77010000000");
    expect(merged.tags.sort()).toEqual(["a", "b"]);
    expect((await db.select().from(conversations).where(eq(conversations.id, conv!.id)))[0]!.contactId).toBe(p.id);
    expect((await listContacts(ctx, { q: "erzhan" })).rows.map((r) => r.id)).toEqual([p.id]);
    await expect(mergeContacts(ctx, p.id, d.id)).rejects.toMatchObject({ code: "conflict" });
  });

  it("isolates contacts between workspaces", async () => {
    const c = await createContact(ctx, { ...base, firstName: "Secret", lastName: "" });
    await expect(getContactDetail(other, c.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(updateContact(other, c.id, { ...base, firstName: "x", lastName: "" })).rejects.toMatchObject({ code: "not_found" });
    await expect(mergeContacts(other, c.id, c.id)).rejects.toBeTruthy();
    expect((await listContacts(other)).total).toBe(0);
  });
});

describe("inbox", () => {
  it("simulates a live conversation that runs an active automation, with notes, statuses and human replies", async () => {
    const t = (await listTemplates(ctx)).find((x) => x.slug === "course-sales")!;
    const a = await createAutomationFromTemplate(ctx, t.id);
    await activateAutomation(ctx, a.id);

    const { conversationId, result } = await startSimulatedConversation(ctx, { firstName: "Saule", lastName: "", text: "COURSE please" });
    expect(result.execution?.mode).toBe("live");
    expect(result.execution?.status).toBe("waiting");
    await simulateInbound(ctx, conversationId, "Advanced");
    const [run] = await db.select().from(automationExecutions).where(eq(automationExecutions.conversationId, conversationId));
    expect(run!.status).toBe("completed");

    await addInternalNote(ctx, conversationId, "Interested in group discount");
    await sendHumanReply(ctx, conversationId, "Hi Saule, I'm Fatima from the team!");
    await assignConversation(ctx, conversationId, true);
    await setConversationStatus(ctx, conversationId, "resolved");

    const c = await getConversation(ctx, conversationId);
    expect(c.conversation.status).toBe("resolved");
    expect(c.assignee?.email).toBe("fatima@example.test");
    const kinds = c.messages.map((m) => m.kind);
    expect(kinds).toEqual(expect.arrayContaining(["inbound", "outbound", "internal_note", "system"]));
    const human = c.messages.find((m) => m.source === "human" && m.kind === "outbound")!;
    expect(human.deliveryStatus).toBe("simulated");

    expect((await listConversations(ctx, { status: "resolved" })).map((x) => x.id)).toContain(conversationId);
    expect((await listConversations(ctx, { q: "group discount" })).map((x) => x.id)).toEqual([conversationId]);
    await expect(getConversation(other, conversationId)).rejects.toMatchObject({ code: "not_found" });
  });

  it("creates AI reply previews that are only sent on request", async () => {
    const agent = await createAgent(ctx, { name: "Inbox AI", role: "support", description: "" });
    await addKnowledgeQa(ctx, agent.id, { question: "Do you have parking?", answer: "Yes, free parking is available." });
    const { conversationId } = await startSimulatedConversation(ctx, { firstName: "Timur", lastName: "", text: "is there parking near you?" });
    const preview = await previewAiReply(ctx, conversationId, agent.id);
    expect(preview.reply).toBe("Yes, free parking is available.");
    let outbound = await db.select().from(messages).where(eq(messages.conversationId, conversationId));
    expect(outbound.filter((m) => m.kind === "outbound")).toHaveLength(0);
    await sendPreview(ctx, conversationId, preview.id, "Yes — free parking right next to us!");
    outbound = await db.select().from(messages).where(eq(messages.conversationId, conversationId));
    expect(outbound.filter((m) => m.kind === "outbound").map((m) => m.body)).toEqual(["Yes — free parking right next to us!"]);
    expect(outbound.some((m) => m.kind === "generated_reply")).toBe(false);
  });

  it("dedupes simulator events by id", async () => {
    const { conversationId } = await startSimulatedConversation(ctx, { firstName: "Dup", lastName: "", text: "hi" });
    const id = randomUUID();
    await simulateInbound(ctx, conversationId, "again", id);
    const again = await simulateInbound(ctx, conversationId, "again", id);
    expect(again.duplicate).toBe(true);
  });
});

describe("analytics", () => {
  it("derives metrics from persisted executions", async () => {
    const auto = await createAutomation(ctx, { name: "Analytics flow" });
    void auto;
    const res = await getAnalytics(ctx, "30d");
    expect(res.totals.runs).toBeGreaterThan(0);
    expect(res.totals.completed + res.totals.failed + res.totals.inProgress).toBe(res.totals.runs);
    expect(res.top[0]!.runs).toBeGreaterThan(0);
    expect(res.daily.length).toBeGreaterThanOrEqual(30);
    expect(res.daily.reduce((s, d) => s + d.completed + d.failed + d.other, 0)).toBe(res.totals.runs);
    expect(res.totals.conversions).toBeGreaterThan(0); // course template ends in goal_reached
    const live = await getAnalytics(ctx, "30d", "live");
    expect(live.totals.test).toBe(0);
    const empty = await getAnalytics(other, "all");
    expect(empty.totals.runs).toBe(0);
    expect(empty.totals.completionRate).toBeNull();
  });
});
