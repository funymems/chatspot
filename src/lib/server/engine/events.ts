import "server-only";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  automationExecutions,
  automationVersions,
  automations,
  conversations,
  inboundEvents,
  messages,
} from "@/lib/server/db/schema";
import { automationGraph, type TriggerConfig } from "@/lib/domain/graph/schema";
import { matchesTrigger } from "@/lib/domain/trigger-match";
import { touchContact } from "@/lib/server/services/contact-data";
import { logger } from "@/lib/server/logger";
import { runExecution, startExecution } from "./runtime";
import type { ExecState } from "./types";

/**
 * Records an inbound event exactly once. Returns `duplicate: true` when the
 * same (workspace, channel, external id) was already received.
 */
export async function recordInboundEvent(input: {
  workspaceId: string;
  channel: string;
  externalEventId: string;
  type: string;
  payload: unknown;
}): Promise<{ id: string; duplicate: boolean }> {
  const db = await getDb();
  const [row] = await db
    .insert(inboundEvents)
    .values({ ...input, payload: input.payload ?? {} })
    .onConflictDoNothing()
    .returning({ id: inboundEvents.id });
  if (row) return { id: row.id, duplicate: false };
  const [existing] = await db
    .select({ id: inboundEvents.id })
    .from(inboundEvents)
    .where(and(eq(inboundEvents.workspaceId, input.workspaceId), eq(inboundEvents.channel, input.channel), eq(inboundEvents.externalEventId, input.externalEventId)))
    .limit(1);
  return { id: existing!.id, duplicate: true };
}

export async function markEventProcessed(id: string) {
  const db = await getDb();
  await db.update(inboundEvents).set({ processedAt: new Date() }).where(eq(inboundEvents.id, id));
}

/** Stores the contact's message in the conversation. */
export async function storeInboundMessage(workspaceId: string, conversationId: string, contactId: string | null, text: string, payload: Record<string, unknown> = {}) {
  const db = await getDb();
  const [msg] = await db
    .insert(messages)
    .values({ workspaceId, conversationId, kind: "inbound", source: "contact", body: text, payload })
    .returning();
  await db
    .update(conversations)
    .set({ lastMessageAt: new Date(), lastMessagePreview: text.slice(0, 140), updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
  if (contactId) await touchContact(workspaceId, contactId);
  return msg!;
}

/** An execution in this conversation that is paused waiting for the contact's reply. */
export async function findWaitingForReply(workspaceId: string, conversationId: string, automationId?: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(automationExecutions)
    .where(
      and(
        eq(automationExecutions.workspaceId, workspaceId),
        eq(automationExecutions.conversationId, conversationId),
        eq(automationExecutions.status, "waiting"),
        automationId ? eq(automationExecutions.automationId, automationId) : undefined,
        sql`${automationExecutions.state} -> 'wait' ->> 'kind' = 'reply'`,
      ),
    )
    .orderBy(desc(automationExecutions.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function resumeWithReply(executionId: string, text: string) {
  const db = await getDb();
  const [exec] = await db.select().from(automationExecutions).where(eq(automationExecutions.id, executionId)).limit(1);
  const token = (exec?.state as ExecState | undefined)?.wait?.token;
  if (!exec || !token) return exec ?? null;
  return runExecution(executionId, { token, reason: "reply", text });
}

/**
 * Live inbound message pipeline:
 * dedupe → store message → resume a waiting run, or start the best matching active automation.
 * Keyword/phrase triggers win over catch-all "any message" triggers; at most one automation starts.
 */
export async function handleInboundMessage(input: {
  workspaceId: string;
  conversationId: string;
  contactId: string | null;
  channel: string;
  externalEventId: string;
  text: string;
}) {
  const event = await recordInboundEvent({
    workspaceId: input.workspaceId,
    channel: input.channel,
    externalEventId: input.externalEventId,
    type: "message",
    payload: { text: input.text },
  });
  if (event.duplicate) {
    logger.info("inbound.duplicate", { workspaceId: input.workspaceId, externalEventId: input.externalEventId });
    return { duplicate: true as const, execution: null };
  }
  await storeInboundMessage(input.workspaceId, input.conversationId, input.contactId, input.text, { eventId: input.externalEventId });

  const res = await dispatchInboundToAutomations({ ...input, inboundEventId: event.id });
  await markEventProcessed(event.id);
  return { duplicate: false as const, ...res };
}

/**
 * Routes an already-stored inbound message: resume a run waiting for this
 * conversation's reply, otherwise start the best matching active automation.
 */
export async function dispatchInboundToAutomations(input: {
  workspaceId: string;
  conversationId: string;
  contactId: string | null;
  text: string;
  inboundEventId: string | null;
}) {
  const waiting = await findWaitingForReply(input.workspaceId, input.conversationId);
  if (waiting) {
    const execution = await resumeWithReply(waiting.id, input.text);
    return { execution, resumed: true };
  }
  const match = await findMatchingAutomation(input.workspaceId, input.text);
  if (!match) return { execution: null, resumed: false };
  const execution = await startExecution({
    workspaceId: input.workspaceId,
    automationId: match.automationId,
    versionId: match.versionId,
    conversationId: input.conversationId,
    contactId: input.contactId,
    mode: "live",
    input: { text: input.text, source: "inbound" },
    inboundEventId: input.inboundEventId,
  });
  return { execution, resumed: false };
}

export async function findMatchingAutomation(workspaceId: string, text: string) {
  const db = await getDb();
  const candidates = await db
    .select({ automationId: automations.id, versionId: automationVersions.id, graph: automationVersions.graph, updatedAt: automations.updatedAt })
    .from(automations)
    .innerJoin(automationVersions, eq(automationVersions.id, automations.publishedVersionId))
    .where(and(eq(automations.workspaceId, workspaceId), eq(automations.status, "active"), isNotNull(automations.publishedVersionId)))
    .orderBy(desc(automations.updatedAt));

  let catchAll: { automationId: string; versionId: string } | null = null;
  for (const c of candidates) {
    const trigger = automationGraph.parse(c.graph).nodes.find((n) => n.type === "trigger");
    if (!trigger) continue;
    const config = trigger.data as TriggerConfig;
    if (config.kind === "incoming_message") {
      catchAll ??= { automationId: c.automationId, versionId: c.versionId };
    } else if (matchesTrigger(config, text)) {
      return { automationId: c.automationId, versionId: c.versionId };
    }
  }
  return catchAll && text.trim() ? catchAll : null;
}
