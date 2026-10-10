"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { parseInput, runAction } from "@/lib/server/actions";
import { authorizeWorkspace } from "@/lib/server/auth/guards";
import { validationError } from "@/lib/server/errors";
import {
  addKnowledgeQa,
  addKnowledgeText,
  createAgent,
  deleteAgent,
  deleteKnowledgeSource,
  resolveUnanswered,
  searchKnowledge,
  getAgent,
  updateAgent,
  updateKnowledgeSource,
} from "@/lib/server/services/agents";
import { resetAgentTestChat, sendAgentTestMessage } from "@/lib/server/services/agent-chat";
import { generateFlow, type GeneratedFlow } from "@/lib/server/services/flow-generator";
import {
  agentChatSchema,
  agentGeneralSchema,
  agentInstructionsSchema,
  agentSettingsSchema,
  createAgentSchema,
  knowledgeQaSchema,
  knowledgeTextSchema,
} from "@/lib/validation/agent";
import { idSchema } from "@/lib/validation/automation";

export async function createAgentAction(slug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction("agent.create", async () => {
    const ctx = await authorizeWorkspace(slug);
    const agent = await createAgent(ctx, parseInput(createAgentSchema, input));
    return { ok: true, data: { id: agent.id }, message: `Agent “${agent.name}” created` };
  });
}

type Section = "general" | "instructions" | "settings";
export async function updateAgentAction(slug: string, agentId: string, section: Section, input: unknown): Promise<ActionResult<null>> {
  return runAction("agent.update", async () => {
    const ctx = await authorizeWorkspace(slug);
    const id = idSchema.parse(agentId);
    if (section === "general") await updateAgent(ctx, id, parseInput(agentGeneralSchema, input));
    else if (section === "instructions") await updateAgent(ctx, id, parseInput(agentInstructionsSchema, input));
    else {
      const s = parseInput(agentSettingsSchema, input);
      await updateAgent(ctx, id, {
        fallbackResponse: s.fallbackResponse,
        enabled: s.enabled,
        escalationRules: { keywords: s.escalationKeywords, onNoAnswer: s.escalateOnNoAnswer, onExplicitRequest: s.escalateOnExplicitRequest },
      });
    }
    refresh();
    return { ok: true, data: null, message: "Agent saved" };
  });
}

export async function deleteAgentAction(slug: string, agentId: string): Promise<ActionResult<null>> {
  return runAction("agent.delete", async () => {
    const ctx = await authorizeWorkspace(slug);
    await deleteAgent(ctx, idSchema.parse(agentId));
    return { ok: true, data: null, message: "Agent deleted" };
  });
}

// ─── Knowledge ──────────────────────────────────────────────────────────────

export async function addKnowledgeAction(slug: string, agentId: string, kind: "text" | "qa", input: unknown): Promise<ActionResult<null>> {
  return runAction("knowledge.add", async () => {
    const ctx = await authorizeWorkspace(slug);
    const id = idSchema.parse(agentId);
    if (kind === "qa") await addKnowledgeQa(ctx, id, parseInput(knowledgeQaSchema, input));
    else await addKnowledgeText(ctx, id, parseInput(knowledgeTextSchema, input));
    refresh();
    return { ok: true, data: null, message: kind === "qa" ? "Q&A added" : "Document added" };
  });
}

const MAX_UPLOAD_BYTES = 1024 * 1024;
const ALLOWED = [".txt", ".md", ".markdown", ".csv"];

/** Plain-text uploads only (.txt/.md/.csv); content is indexed like a text document. */
export async function uploadKnowledgeFileAction(slug: string, agentId: string, formData: FormData): Promise<ActionResult<null>> {
  return runAction("knowledge.upload", async () => {
    const ctx = await authorizeWorkspace(slug);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw validationError("Choose a file to upload");
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED.includes(ext)) throw validationError(`Supported formats: ${ALLOWED.join(", ")}. PDF and Word aren't supported yet.`);
    if (file.size > MAX_UPLOAD_BYTES) throw validationError("Files are limited to 1 MB");
    const text = new TextDecoder("utf-8", { fatal: false }).decode(await file.arrayBuffer()).replace(/\u0000/g, "");
    if (!text.trim()) throw validationError("The file is empty");
    await addKnowledgeText(ctx, idSchema.parse(agentId), {
      title: file.name.slice(0, 120),
      content: text.slice(0, 50_000),
      fileName: file.name.slice(0, 200),
      mimeType: file.type || "text/plain",
    });
    refresh();
    return { ok: true, data: null, message: `“${file.name}” added to the knowledge base` };
  });
}

export async function updateKnowledgeAction(slug: string, sourceId: string, input: unknown): Promise<ActionResult<null>> {
  return runAction("knowledge.update", async () => {
    const ctx = await authorizeWorkspace(slug);
    const data = z
      .union([knowledgeQaSchema, knowledgeTextSchema])
      .parse(input);
    await updateKnowledgeSource(ctx, idSchema.parse(sourceId), data);
    refresh();
    return { ok: true, data: null, message: "Source updated" };
  });
}

export async function deleteKnowledgeAction(slug: string, sourceId: string): Promise<ActionResult<null>> {
  return runAction("knowledge.delete", async () => {
    const ctx = await authorizeWorkspace(slug);
    await deleteKnowledgeSource(ctx, idSchema.parse(sourceId));
    refresh();
    return { ok: true, data: null, message: "Source removed" };
  });
}

export async function testRetrievalAction(
  slug: string,
  agentId: string,
  question: string,
): Promise<ActionResult<{ title: string; content: string; rank: number }[]>> {
  return runAction("knowledge.test", async () => {
    const ctx = await authorizeWorkspace(slug);
    const agent = await getAgent(ctx, idSchema.parse(agentId));
    const q = z.string().trim().min(1, "Type a question").max(500).parse(question);
    const hits = await searchKnowledge(ctx.workspaceId, agent.id, q, 5);
    return { ok: true, data: hits.map((h) => ({ title: h.title, content: h.content, rank: h.rank })) };
  });
}

export async function resolveUnansweredAction(slug: string, questionId: string, answer: string): Promise<ActionResult<null>> {
  return runAction("unanswered.resolve", async () => {
    const ctx = await authorizeWorkspace(slug);
    await resolveUnanswered(ctx, idSchema.parse(questionId), z.string().max(4000).parse(answer));
    refresh();
    return { ok: true, data: null, message: answer.trim() ? "Answer added to the knowledge base" : "Marked as resolved" };
  });
}

// ─── Playground ─────────────────────────────────────────────────────────────

export async function sendAgentMessageAction(slug: string, agentId: string, input: unknown) {
  return runAction("agent.chat", async () => {
    const ctx = await authorizeWorkspace(slug);
    const { text } = parseInput(agentChatSchema, input);
    const res = await sendAgentTestMessage(ctx, idSchema.parse(agentId), text);
    refresh();
    return { ok: true as const, data: res };
  });
}

export async function resetAgentChatAction(slug: string, agentId: string): Promise<ActionResult<null>> {
  return runAction("agent.chatReset", async () => {
    const ctx = await authorizeWorkspace(slug);
    await resetAgentTestChat(ctx, idSchema.parse(agentId));
    refresh();
    return { ok: true, data: null, message: "Conversation reset" };
  });
}

// ─── AI flow generation ─────────────────────────────────────────────────────

export async function generateFlowAction(slug: string, description: string): Promise<ActionResult<GeneratedFlow>> {
  return runAction("flow.generate", async () => {
    const ctx = await authorizeWorkspace(slug);
    const d = z.string().trim().min(15, "Describe the automation in at least a sentence").max(2000).parse(description);
    return { ok: true, data: await generateFlow(ctx, d) };
  });
}
