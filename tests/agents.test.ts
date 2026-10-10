import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { useTestDatabase } from "@/test/db";
import type { Database } from "@/lib/server/db/client";
import { conversations, notifications, unansweredQuestions } from "@/lib/server/db/schema";
import { registerUser } from "@/lib/server/services/accounts";
import { resolveWorkspaceAccess } from "@/lib/server/services/workspaces";
import {
  addKnowledgeQa,
  addKnowledgeText,
  createAgent,
  deleteKnowledgeSource,
  getAgent,
  listUnanswered,
  resolveUnanswered,
  searchKnowledge,
  updateAgent,
} from "@/lib/server/services/agents";
import { getAgentTestChat, sendAgentTestMessage } from "@/lib/server/services/agent-chat";
import { createAutomation } from "@/lib/server/services/automations";
import { getTestSession, sendTestMessage } from "@/lib/server/services/test-runs";
import { generateFlow } from "@/lib/server/services/flow-generator";
import { repairDraft } from "@/lib/domain/graph/repair";
import { validateGraph } from "@/lib/domain/graph/validate";
import { GraphBuilder } from "@/lib/domain/graph/builder";
import type { WorkspaceContext } from "@/lib/server/auth/context";

let db: Database;
let ctx: WorkspaceContext;
let other: WorkspaceContext;

beforeAll(async () => {
  delete process.env.GEMINI_API_KEY; // demo mode for deterministic tests
  db = await useTestDatabase();
  const a = await registerUser({ fullName: "Dana", email: "dana@example.test", password: "password-dana" });
  const b = await registerUser({ fullName: "Erlan", email: "erlan@example.test", password: "password-erlan" });
  ctx = (await resolveWorkspaceAccess(a.userId, a.workspace.slug))!;
  other = (await resolveWorkspaceAccess(b.userId, b.workspace.slug))!;
});

describe("knowledge base", () => {
  it("indexes text and Q&A sources and retrieves them by meaning-bearing terms", async () => {
    const agent = await createAgent(ctx, { name: "Support", role: "support", description: "" });
    await addKnowledgeText(ctx, agent.id, {
      title: "Shipping policy",
      content: "We ship worldwide. Orders are dispatched within 2 business days.\n\nDelivery to Kazakhstan takes 3–5 days.",
    });
    await addKnowledgeQa(ctx, agent.id, { question: "Сколько стоит курс?", answer: "Курс стоит 49 000 ₸." });
    const hits = await searchKnowledge(ctx.workspaceId, agent.id, "How long does delivery take?");
    expect(hits[0]?.title).toBe("Shipping policy");
    const ru = await searchKnowledge(ctx.workspaceId, agent.id, "сколько стоит этот курс");
    expect(ru[0]?.answer).toBe("Курс стоит 49 000 ₸.");
    // Scoped: another workspace can't search this agent's knowledge.
    expect(await searchKnowledge(other.workspaceId, agent.id, "delivery")).toEqual([]);
  });

  it("removes a source from retrieval when deleted", async () => {
    const agent = await createAgent(ctx, { name: "Temp", role: "general", description: "" });
    const s = await addKnowledgeText(ctx, agent.id, { title: "Hours", content: "Open Monday to Friday" });
    expect((await searchKnowledge(ctx.workspaceId, agent.id, "monday")).length).toBe(1);
    await deleteKnowledgeSource(ctx, s.id);
    expect(await searchKnowledge(ctx.workspaceId, agent.id, "monday")).toEqual([]);
  });
});

describe("agent test chat (demo provider)", () => {
  it("answers from knowledge and cites the source", async () => {
    const agent = await createAgent(ctx, { name: "Sales", role: "sales", description: "" });
    const qa = await addKnowledgeQa(ctx, agent.id, { question: "What is the price of the course?", answer: "The course costs $49." });
    const res = await sendAgentTestMessage(ctx, agent.id, "what's the course price?");
    expect(res).toMatchObject({ reply: "The course costs $49.", answered: true, provider: "demo", handoff: false });
    expect(res.usedSources).toEqual([{ id: qa.id, title: qa.title }]);
    const chat = await getAgentTestChat(ctx, agent.id);
    expect(chat.messages.map((m) => m.kind)).toEqual(["inbound", "outbound"]);
    expect(chat.messages[1]!.deliveryStatus).toBe("simulated");
  });

  it("never invents answers: unknown questions get the fallback and are logged", async () => {
    const agent = await createAgent(ctx, { name: "Strict", role: "support", description: "" });
    const res = await sendAgentTestMessage(ctx, agent.id, "Do you offer franchise opportunities?");
    expect(res.answered).toBe(false);
    expect(res.reply).toBe(agent.fallbackResponse);
    const open = await listUnanswered(ctx, agent.id);
    expect(open.map((q) => q.question)).toEqual(["Do you offer franchise opportunities?"]);

    await resolveUnanswered(ctx, open[0]!.id, "No, we don't offer franchises.");
    const again = await sendAgentTestMessage(ctx, agent.id, "franchise opportunities?");
    expect(again.reply).toBe("No, we don't offer franchises.");
    const [row] = await db.select().from(unansweredQuestions).where(eq(unansweredQuestions.id, open[0]!.id));
    expect(row!.resolvedAt).not.toBeNull();
  });

  it("hands off to a human on request and creates an internal notification", async () => {
    const agent = await createAgent(ctx, { name: "Handoff", role: "support", description: "" });
    const res = await sendAgentTestMessage(ctx, agent.id, "I want to talk to a human");
    expect(res.handoff).toBe(true);
    const chat = await getAgentTestChat(ctx, agent.id);
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, chat.conversation.id));
    expect(conv!.status).toBe("needs_human");
    const notes = await db.select().from(notifications).where(eq(notifications.workspaceId, ctx.workspaceId));
    expect(notes.some((n) => n.type === "handoff")).toBe(true);
  });

  it("escalates on no answer when configured", async () => {
    const agent = await createAgent(ctx, { name: "Escalate", role: "support", description: "" });
    await updateAgent(ctx, agent.id, { escalationRules: { keywords: [], onNoAnswer: true, onExplicitRequest: true } });
    const res = await sendAgentTestMessage(ctx, agent.id, "random unknown thing");
    expect(res.handoff).toBe(true);
  });

  it("isolates agents between workspaces", async () => {
    const agent = await createAgent(ctx, { name: "Private agent", role: "general", description: "" });
    await expect(getAgent(other, agent.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(sendAgentTestMessage(other, agent.id, "hi")).rejects.toMatchObject({ code: "not_found" });
    await expect(addKnowledgeText(other, agent.id, { title: "x", content: "y" })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("AI response node in automations", () => {
  it("replies through the agent inside a flow", async () => {
    const agent = await createAgent(ctx, { name: "Flow agent", role: "support", description: "" });
    await addKnowledgeQa(ctx, agent.id, { question: "What are your opening hours?", answer: "We're open 9:00–18:00, Monday to Friday." });
    const g = new GraphBuilder();
    const t = g.trigger({ kind: "incoming_message" });
    const ai = g.aiResponse({ agentId: agent.id, saveReplyAs: "answer" });
    const e = g.end();
    g.chain(t, ai, e);
    const a = await createAutomation(ctx, { name: "AI flow", graph: g.build() });
    const res = await sendTestMessage(ctx, a.id, { text: "what are your opening hours", eventId: randomUUID() });
    expect(res.outcome).toBe("started");
    const session = await getTestSession(ctx, a.id);
    expect(session.execution?.status).toBe("completed");
    const out = session.messages.filter((m) => m.kind === "outbound");
    expect(out.at(-1)?.body).toBe("We're open 9:00–18:00, Monday to Friday.");
    expect(out.at(-1)?.source).toBe("agent");
  });
});

describe("AI flow generation", () => {
  it("demo mode returns a valid draft for the course example", async () => {
    const res = await generateFlow(ctx, "When someone sends the word COURSE, ask whether they want the beginner or advanced course. Then send the relevant link and save their interest as a contact field.");
    expect(res.provider).toBe("demo");
    expect(res.valid).toBe(true);
  });

  it("repairs model output: unknown types, bad JSON, dangling edges, open outputs", () => {
    const { graph, fixes } = repairDraft({
      name: "x",
      description: "",
      nodes: [
        { id: "t", type: "trigger", config_json: '{"kind":"keyword","keywords":["hi"]}' },
        { id: "m", type: "message", config_json: '{"messages":[{"id":"m1","text":"Hello!"}]}' },
        { id: "c", type: "condition", config_json: "not json" },
        { id: "z", type: "teleport", config_json: "{}" },
      ],
      edges: [
        { source: "t", target: "m", handle: "out" },
        { source: "m", target: "ghost", handle: "out" },
        { source: "m", target: "t", handle: "out" },
      ],
    });
    expect(fixes.length).toBeGreaterThan(0);
    const v = validateGraph(graph);
    expect(v.issues.filter((i) => i.code === "missing_connection" || i.code === "missing_end" || i.code === "dangling_edge")).toEqual([]);
    expect(graph.nodes.some((n) => n.type === ("teleport" as never))).toBe(false);
  });

  it("uses the LLM when configured and returns a validated graph", async () => {
    const provider = await import("@/lib/server/ai/provider");
    const generate = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        name: "Hello flow",
        description: "Greets people",
        nodes: [
          { id: "t", type: "trigger", config_json: JSON.stringify({ kind: "keyword", keywords: ["hello"] }) },
          { id: "m", type: "message", config_json: JSON.stringify({ messages: [{ id: "m1", text: "Hi {{contact.first_name}}!" }] }) },
          { id: "e", type: "end", config_json: JSON.stringify({ outcome: "completed" }) },
        ],
        edges: [
          { source: "t", target: "m", handle: "out" },
          { source: "m", target: "e", handle: "out" },
        ],
      }),
    });
    const spy = vi.spyOn(provider, "getAiProvider").mockReturnValue({ id: "gemini", model: "test-model", generate });
    const res = await generateFlow(ctx, "say hi when someone says hello");
    expect(res).toMatchObject({ name: "Hello flow", valid: true, provider: "gemini:test-model" });
    expect(generate).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
