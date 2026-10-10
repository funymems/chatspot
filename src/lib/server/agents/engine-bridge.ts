import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { aiAgents, conversations, messages } from "@/lib/server/db/schema";
import { getChannelProvider } from "@/lib/channels/registry";
import { registerAiStep } from "@/lib/server/engine/ai-step";
import { recordUnanswered } from "@/lib/server/services/agents";
import type { ChatTurn } from "@/lib/server/ai/provider";
import { generateAgentReply } from "./runtime";

/**
 * Recent conversation turns (oldest first) for model context. The current
 * inbound message is passed to the model separately, so it's excluded here.
 */
export async function conversationHistory(conversationId: string, currentMessage: string, limit = 10): Promise<ChatTurn[]> {
  const db = await getDb();
  const rows = await db
    .select({ kind: messages.kind, body: messages.body })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), inArray(messages.kind, ["inbound", "outbound"])))
    .orderBy(desc(messages.createdAt))
    .limit(limit + 1);
  const newest = rows[0];
  if (newest && newest.kind === "inbound" && newest.body === currentMessage) rows.shift();
  return rows
    .slice(0, limit)
    .reverse()
    .map((r) => ({ role: r.kind === "inbound" ? ("user" as const) : ("assistant" as const), text: r.body }));
}

/**
 * Implementation of the automation engine's AI step: answer with the
 * selected agent, apply the node's fallback behaviour, send via the channel.
 */
registerAiStep(async ({ execution, config, scope }) => {
  const db = await getDb();
  const [agent] = await db
    .select()
    .from(aiAgents)
    .where(and(eq(aiAgents.id, config.agentId), eq(aiAgents.workspaceId, execution.workspaceId)))
    .limit(1);
  if (!agent) throw new Error("ИИ-агента, выбранного в этом шаге, больше нет");
  if (!agent.enabled) throw new Error(`ИИ-агент «${agent.name}» выключен`);

  const history = execution.conversationId ? await conversationHistory(execution.conversationId, scope.message) : [];
  const res = await generateAgentReply({
    agent,
    message: scope.message,
    history,
    instructions: config.instructions,
    knowledgeContext: config.knowledgeContext,
  });

  let reply = res.reply;
  let handoff = res.handoff;
  if (!res.answered) {
    await recordUnanswered(execution.workspaceId, agent.id, scope.message, execution.conversationId);
    if (config.fallback === "custom_message" && config.fallbackMessage.trim()) reply = config.fallbackMessage;
    if (config.fallback === "handoff") handoff = true;
  }

  if (execution.conversationId) {
    const [conv] = await db.select({ channel: conversations.channel }).from(conversations).where(eq(conversations.id, execution.conversationId)).limit(1);
    if (conv) {
      await getChannelProvider(conv.channel).sendMessage(
        {
          workspaceId: execution.workspaceId,
          conversationId: execution.conversationId,
          contactId: execution.contactId,
          recipientId: null,
          executionId: execution.id,
          agentId: agent.id,
          source: "agent",
        },
        { text: reply },
      );
    }
  }
  return {
    reply,
    usedSources: res.usedSources,
    handoff,
    handoffReason: handoff ? res.handoffReason ?? "Если ответа нет, диалог передаётся человеку" : undefined,
    provider: res.provider,
  };
});
