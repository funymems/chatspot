import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { aiAgents, contacts, conversations, messages, profiles, users } from "@/lib/server/db/schema";
import type { WorkspaceContext } from "@/lib/server/auth/context";
import { notFound, validationError } from "@/lib/server/errors";
import { getChannelProvider } from "@/lib/channels/registry";
import { handleInboundMessage } from "@/lib/server/engine/events";
import { generateAgentReply } from "@/lib/server/agents/runtime";
import { conversationHistory } from "@/lib/server/agents/engine-bridge";
import { recordActivity } from "./activity";

export type ConversationStatus = (typeof conversations.$inferSelect)["status"];

export async function listConversations(ctx: WorkspaceContext, f: { q?: string; status?: ConversationStatus | "all" } = {}) {
  const db = await getDb();
  const where: (SQL | undefined)[] = [eq(conversations.workspaceId, ctx.workspaceId), eq(conversations.isTest, false)];
  if (f.status && f.status !== "all") where.push(eq(conversations.status, f.status));
  if (f.q?.trim()) {
    const t = `%${f.q.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where.push(
      or(
        ilike(contacts.firstName, t),
        ilike(contacts.lastName, t),
        ilike(contacts.email, t),
        ilike(conversations.lastMessagePreview, t),
        sql`exists (select 1 from ${messages} m where m.conversation_id = ${conversations.id} and m.body ilike ${t})`,
      ),
    );
  }
  return db
    .select({
      id: conversations.id,
      status: conversations.status,
      channel: conversations.channel,
      preview: conversations.lastMessagePreview,
      lastMessageAt: conversations.lastMessageAt,
      assignedTo: conversations.assignedTo,
      contactId: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(conversations)
    .leftJoin(contacts, eq(contacts.id, conversations.contactId))
    .where(and(...where))
    .orderBy(sql`${conversations.lastMessageAt} desc nulls last`)
    .limit(100);
}

export async function statusCounts(ctx: WorkspaceContext) {
  const db = await getDb();
  const rows = await db
    .select({ status: conversations.status, n: sql<number>`count(*)::int` })
    .from(conversations)
    .where(and(eq(conversations.workspaceId, ctx.workspaceId), eq(conversations.isTest, false)))
    .groupBy(conversations.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<ConversationStatus, number>>;
}

async function getOwned(ctx: WorkspaceContext, id: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.workspaceId, ctx.workspaceId), eq(conversations.isTest, false)))
    .limit(1);
  if (!row) throw notFound("Conversation");
  return row;
}

export async function getConversation(ctx: WorkspaceContext, id: string) {
  const conv = await getOwned(ctx, id);
  const db = await getDb();
  const [contact] = conv.contactId ? await db.select().from(contacts).where(eq(contacts.id, conv.contactId)).limit(1) : [];
  const [assignee] = conv.assignedTo
    ? await db.select({ id: users.id, email: users.email, fullName: profiles.fullName }).from(users).leftJoin(profiles, eq(profiles.userId, users.id)).where(eq(users.id, conv.assignedTo)).limit(1)
    : [];
  const msgs = await db
    .select({
      id: messages.id,
      kind: messages.kind,
      source: messages.source,
      body: messages.body,
      deliveryStatus: messages.deliveryStatus,
      payload: messages.payload,
      createdAt: messages.createdAt,
      authorName: profiles.fullName,
      agentName: aiAgents.name,
      executionId: messages.executionId,
    })
    .from(messages)
    .leftJoin(profiles, eq(profiles.userId, messages.authorUserId))
    .leftJoin(aiAgents, eq(aiAgents.id, messages.agentId))
    .where(and(eq(messages.workspaceId, ctx.workspaceId), eq(messages.conversationId, id)))
    .orderBy(asc(messages.createdAt))
    .limit(500);
  return { conversation: conv, contact: contact ?? null, assignee: assignee ?? null, messages: msgs };
}

export async function addInternalNote(ctx: WorkspaceContext, id: string, text: string) {
  await getOwned(ctx, id);
  const db = await getDb();
  await db.insert(messages).values({ workspaceId: ctx.workspaceId, conversationId: id, kind: "internal_note", source: "human", body: text, authorUserId: ctx.userId });
}

/** A human operator's reply, delivered through the conversation's channel (simulated for the mock channel). */
export async function sendHumanReply(ctx: WorkspaceContext, id: string, text: string) {
  const conv = await getOwned(ctx, id);
  await getChannelProvider(conv.channel).sendMessage(
    { workspaceId: ctx.workspaceId, conversationId: id, contactId: conv.contactId, recipientId: null, source: "human", authorUserId: ctx.userId },
    { text },
  );
}

export async function setConversationStatus(ctx: WorkspaceContext, id: string, status: ConversationStatus) {
  const conv = await getOwned(ctx, id);
  const db = await getDb();
  await db.update(conversations).set({ status, updatedAt: new Date() }).where(eq(conversations.id, id));
  const label = { open: "reopened", needs_human: "marked as needing a human", resolved: "resolved" }[status];
  await db.insert(messages).values({ workspaceId: ctx.workspaceId, conversationId: id, kind: "system", source: "system", body: `Conversation ${label}`, authorUserId: ctx.userId });
  if (status === "resolved" && conv.status !== "resolved") {
    await recordActivity(ctx, { type: "conversation.resolved", summary: "A conversation was resolved", entityType: "conversation", entityId: id });
  }
}

export async function assignConversation(ctx: WorkspaceContext, id: string, toMe: boolean) {
  await getOwned(ctx, id);
  const db = await getDb();
  await db.update(conversations).set({ assignedTo: toMe ? ctx.userId : null, updatedAt: new Date() }).where(eq(conversations.id, id));
}

/**
 * Generates an AI reply *preview* (stored as `generated_reply`, not sent).
 * The operator can send it as-is, edit it, or discard it.
 */
export async function previewAiReply(ctx: WorkspaceContext, id: string, agentId: string) {
  await getOwned(ctx, id);
  const db = await getDb();
  const [agent] = await db.select().from(aiAgents).where(and(eq(aiAgents.id, agentId), eq(aiAgents.workspaceId, ctx.workspaceId))).limit(1);
  if (!agent) throw notFound("AI agent");
  const [lastInbound] = await db
    .select({ body: messages.body })
    .from(messages)
    .where(and(eq(messages.conversationId, id), eq(messages.kind, "inbound")))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  if (!lastInbound) throw validationError("There's no customer message to reply to yet");
  const history = await conversationHistory(id, lastInbound.body);
  const res = await generateAgentReply({ agent, message: lastInbound.body, history });
  const [row] = await db
    .insert(messages)
    .values({
      workspaceId: ctx.workspaceId,
      conversationId: id,
      kind: "generated_reply",
      source: "agent",
      body: res.reply,
      agentId: agent.id,
      payload: { usedSources: res.usedSources, provider: res.provider, answered: res.answered, handoff: res.handoff },
    })
    .returning({ id: messages.id });
  return { id: row!.id, ...res };
}

/** Sends a stored AI preview (optionally edited) and removes the preview. */
export async function sendPreview(ctx: WorkspaceContext, conversationId: string, previewId: string, text: string) {
  const conv = await getOwned(ctx, conversationId);
  const db = await getDb();
  const [preview] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, previewId), eq(messages.conversationId, conversationId), eq(messages.kind, "generated_reply")))
    .limit(1);
  if (!preview) throw notFound("Reply preview");
  await getChannelProvider(conv.channel).sendMessage(
    { workspaceId: ctx.workspaceId, conversationId, contactId: conv.contactId, recipientId: null, source: "agent", agentId: preview.agentId, authorUserId: ctx.userId },
    { text },
  );
  await db.delete(messages).where(eq(messages.id, previewId));
}

export async function discardPreview(ctx: WorkspaceContext, conversationId: string, previewId: string) {
  await getOwned(ctx, conversationId);
  const db = await getDb();
  await db.delete(messages).where(and(eq(messages.id, previewId), eq(messages.conversationId, conversationId), eq(messages.kind, "generated_reply")));
}

/**
 * Simulator: an inbound message "from the customer" on the demo channel.
 * It goes through the real live pipeline (dedupe → store → resume / trigger).
 */
export async function simulateInbound(ctx: WorkspaceContext, id: string, text: string, eventId: string = randomUUID()) {
  const conv = await getOwned(ctx, id);
  return handleInboundMessage({ workspaceId: ctx.workspaceId, conversationId: id, contactId: conv.contactId, channel: conv.channel, externalEventId: eventId, text });
}

/** Starts a new simulated conversation with a new demo-channel contact. */
export async function startSimulatedConversation(ctx: WorkspaceContext, input: { firstName: string; lastName: string; text: string }) {
  const db = await getDb();
  const [contact] = await db
    .insert(contacts)
    .values({ workspaceId: ctx.workspaceId, firstName: input.firstName, lastName: input.lastName, source: "mock", channelUserId: `sim_${randomUUID().slice(0, 8)}` })
    .returning();
  const [conv] = await db.insert(conversations).values({ workspaceId: ctx.workspaceId, contactId: contact!.id, channel: "mock" }).returning();
  const result = await simulateInbound(ctx, conv!.id, input.text);
  return { conversationId: conv!.id, contactId: contact!.id, result };
}
