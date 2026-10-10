import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { conversations, messages, notifications } from "@/lib/server/db/schema";
import type { WorkspaceContext } from "@/lib/server/auth/context";
import { getChannelProvider } from "@/lib/channels/registry";
import { generateAgentReply } from "@/lib/server/agents/runtime";
import { conversationHistory } from "@/lib/server/agents/engine-bridge";
import { storeInboundMessage } from "@/lib/server/engine/events";
import { getAgent, recordUnanswered } from "./agents";
import { ensureTestConversation } from "./test-runs";

/** A private playground conversation per (user, agent). */
async function ensureAgentTestConversation(ctx: WorkspaceContext, agentId: string) {
  const { contact } = await ensureTestConversation(ctx);
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.workspaceId, ctx.workspaceId),
        eq(conversations.contactId, contact.id),
        eq(conversations.agentId, agentId),
        eq(conversations.isTest, true),
      ),
    )
    .limit(1);
  if (existing) return { contact, conversation: existing };
  const [created] = await db
    .insert(conversations)
    .values({ workspaceId: ctx.workspaceId, contactId: contact.id, channel: "test", isTest: true, agentId })
    .returning();
  return { contact, conversation: created! };
}

export async function getAgentTestChat(ctx: WorkspaceContext, agentId: string) {
  await getAgent(ctx, agentId);
  const { conversation } = await ensureAgentTestConversation(ctx, agentId);
  const db = await getDb();
  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.workspaceId, ctx.workspaceId), eq(messages.conversationId, conversation.id)))
    .orderBy(asc(messages.createdAt))
    .limit(200);
  return { conversation, messages: rows };
}

/** Sends a playground message and stores the agent's grounded reply. */
export async function sendAgentTestMessage(ctx: WorkspaceContext, agentId: string, text: string) {
  const agent = await getAgent(ctx, agentId);
  const { contact, conversation } = await ensureAgentTestConversation(ctx, agentId);
  await storeInboundMessage(ctx.workspaceId, conversation.id, contact.id, text);
  const history = await conversationHistory(conversation.id, text);
  const res = await generateAgentReply({ agent, message: text, history });

  if (!res.answered) await recordUnanswered(ctx.workspaceId, agent.id, text, conversation.id);
  const sent = await getChannelProvider("test").sendMessage(
    { workspaceId: ctx.workspaceId, conversationId: conversation.id, contactId: contact.id, recipientId: null, agentId: agent.id, source: "agent" },
    { text: res.reply },
  );
  const db = await getDb();
  await db
    .update(messages)
    .set({ payload: { usedSources: res.usedSources, provider: res.provider, answered: res.answered, handoff: res.handoff, handoffReason: res.handoffReason ?? null } })
    .where(eq(messages.id, sent.messageId));

  if (res.handoff) {
    await db.update(conversations).set({ status: "needs_human", updatedAt: new Date() }).where(eq(conversations.id, conversation.id));
    await db.insert(notifications).values({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      type: "handoff",
      title: `Test chat with “${agent.name}” needs a human`,
      body: res.handoffReason ?? "",
      link: `/agents/${agent.id}?tab=testing`,
    });
  }
  return res;
}

export async function resetAgentTestChat(ctx: WorkspaceContext, agentId: string) {
  await getAgent(ctx, agentId);
  const { conversation } = await ensureAgentTestConversation(ctx, agentId);
  const db = await getDb();
  await db.delete(messages).where(and(eq(messages.workspaceId, ctx.workspaceId), eq(messages.conversationId, conversation.id)));
  await db
    .update(conversations)
    .set({ status: "open", lastMessagePreview: "", lastMessageAt: null, updatedAt: new Date() })
    .where(eq(conversations.id, conversation.id));
}
