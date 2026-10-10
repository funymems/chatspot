import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  automationExecutions,
  contactTags,
  contacts,
  conversations,
  messages,
  nodeExecutionLogs,
  profiles,
} from "@/lib/server/db/schema";
import type { WorkspaceContext } from "@/lib/server/auth/context";
import { notFound } from "@/lib/server/errors";
import type { TriggerConfig } from "@/lib/domain/graph/schema";
import { matchesTrigger } from "@/lib/domain/trigger-match";
import type { GraphIssue } from "@/lib/domain/graph/validate";
import { findWaitingForReply, recordInboundEvent, resumeWithReply, storeInboundMessage, markEventProcessed } from "@/lib/server/engine/events";
import { retryExecution, startExecution } from "@/lib/server/engine/runtime";
import { snapshotGraphVersion } from "@/lib/server/engine/snapshots";
import { getAutomation, validateAutomation } from "./automations";

/** Each user gets a personal test contact + test conversation per workspace. */
export async function ensureTestConversation(ctx: WorkspaceContext) {
  const db = await getDb();
  const channelUserId = `test:${ctx.userId}`;
  let [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.workspaceId, ctx.workspaceId), eq(contacts.source, "test"), eq(contacts.channelUserId, channelUserId)))
    .limit(1);
  if (!contact) {
    const [profile] = await db.select({ fullName: profiles.fullName }).from(profiles).where(eq(profiles.userId, ctx.userId)).limit(1);
    const first = profile?.fullName.split(/\s+/)[0] || "Test";
    [contact] = await db
      .insert(contacts)
      .values({ workspaceId: ctx.workspaceId, firstName: first, lastName: "(test)", source: "test", channelUserId, notes: "Created for builder test runs" })
      .returning();
  }
  let [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.workspaceId, ctx.workspaceId), eq(conversations.contactId, contact!.id), eq(conversations.isTest, true)))
    .limit(1);
  if (!conv) {
    [conv] = await db
      .insert(conversations)
      .values({ workspaceId: ctx.workspaceId, contactId: contact!.id, channel: "test", isTest: true })
      .returning();
  }
  return { contact: contact!, conversation: conv! };
}

export type TestSendResult =
  | { outcome: "started" | "resumed"; executionId: string }
  | { outcome: "no_match"; message: string }
  | { outcome: "invalid"; issues: GraphIssue[] }
  | { outcome: "duplicate" };

/**
 * Sends a simulated inbound message to an automation's current draft.
 * If a test run of this automation is waiting for a reply, the message resumes it.
 */
export async function sendTestMessage(
  ctx: WorkspaceContext,
  automationId: string,
  input: { text: string; eventId: string },
): Promise<TestSendResult> {
  const automation = await getAutomation(ctx, automationId);
  const { contact, conversation } = await ensureTestConversation(ctx);

  const event = await recordInboundEvent({
    workspaceId: ctx.workspaceId,
    channel: "test",
    externalEventId: input.eventId,
    type: "message",
    payload: { text: input.text, automationId },
  });
  if (event.duplicate) return { outcome: "duplicate" };

  if (input.text.trim()) await storeInboundMessage(ctx.workspaceId, conversation.id, contact.id, input.text);

  const waiting = await findWaitingForReply(ctx.workspaceId, conversation.id, automationId);
  if (waiting) {
    await resumeWithReply(waiting.id, input.text);
    await markEventProcessed(event.id);
    return { outcome: "resumed", executionId: waiting.id };
  }

  const validation = await validateAutomation(ctx, automationId);
  if (!validation.valid || !validation.graph) {
    await markEventProcessed(event.id);
    return { outcome: "invalid", issues: validation.issues.filter((i) => i.severity === "error") };
  }

  const trigger = validation.graph.nodes.find((n) => n.type === "trigger")!;
  const config = trigger.data as TriggerConfig;
  const explicit = config.kind === "manual" || config.kind === "webhook";
  if (!explicit && !matchesTrigger(config, input.text)) {
    await markEventProcessed(event.id);
    return {
      outcome: "no_match",
      message:
        config.kind === "keyword"
          ? `This message doesn't contain any trigger keyword (${config.keywords.join(", ")}), so the flow didn't start.`
          : "This message doesn't match the trigger, so the flow didn't start.",
    };
  }

  const version = await snapshotGraphVersion({
    workspaceId: ctx.workspaceId,
    automationId: automation.id,
    graph: validation.graph,
    source: "test",
    userId: ctx.userId,
  });
  const exec = await startExecution({
    workspaceId: ctx.workspaceId,
    automationId: automation.id,
    versionId: version.id,
    conversationId: conversation.id,
    contactId: contact.id,
    mode: "test",
    input: { text: input.text, eventName: config.kind === "webhook" ? config.eventName : undefined, source: "test" },
    inboundEventId: event.id,
  });
  await markEventProcessed(event.id);
  return { outcome: "started", executionId: exec.id };
}

export async function getTestSession(ctx: WorkspaceContext, automationId: string) {
  await getAutomation(ctx, automationId); // authorisation + existence
  const { contact, conversation } = await ensureTestConversation(ctx);
  const db = await getDb();
  const [msgs, [latest]] = await Promise.all([
    db
      .select()
      .from(messages)
      .where(and(eq(messages.workspaceId, ctx.workspaceId), eq(messages.conversationId, conversation.id)))
      .orderBy(asc(messages.createdAt))
      .limit(200),
    db
      .select()
      .from(automationExecutions)
      .where(
        and(
          eq(automationExecutions.workspaceId, ctx.workspaceId),
          eq(automationExecutions.automationId, automationId),
          eq(automationExecutions.conversationId, conversation.id),
          eq(automationExecutions.mode, "test"),
        ),
      )
      .orderBy(desc(automationExecutions.createdAt))
      .limit(1),
  ]);
  const logs = latest
    ? await db.select().from(nodeExecutionLogs).where(eq(nodeExecutionLogs.executionId, latest.id)).orderBy(asc(nodeExecutionLogs.seq))
    : [];
  return { contact, conversation, messages: msgs, execution: latest ?? null, logs };
}

/** Clears the test conversation and test contact data, cancelling paused test runs. */
export async function resetTestSession(ctx: WorkspaceContext) {
  const { contact, conversation } = await ensureTestConversation(ctx);
  const db = await getDb();
  await db
    .update(automationExecutions)
    .set({ status: "cancelled", finishedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(automationExecutions.workspaceId, ctx.workspaceId),
        eq(automationExecutions.conversationId, conversation.id),
        inArray(automationExecutions.status, ["queued", "running", "waiting"]),
      ),
    );
  await db.delete(messages).where(and(eq(messages.workspaceId, ctx.workspaceId), eq(messages.conversationId, conversation.id)));
  await db.delete(contactTags).where(and(eq(contactTags.workspaceId, ctx.workspaceId), eq(contactTags.contactId, contact.id)));
  await db
    .update(contacts)
    .set({ email: null, phone: null, customFields: {}, leadStatus: "new", updatedAt: new Date() })
    .where(eq(contacts.id, contact.id));
  await db
    .update(conversations)
    .set({ status: "open", lastMessagePreview: "", lastMessageAt: null, updatedAt: new Date() })
    .where(eq(conversations.id, conversation.id));
}

export async function retryTestOrLiveExecution(ctx: WorkspaceContext, executionId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ id: automationExecutions.id })
    .from(automationExecutions)
    .where(and(eq(automationExecutions.id, executionId), eq(automationExecutions.workspaceId, ctx.workspaceId)))
    .limit(1);
  if (!row) throw notFound("Run");
  return retryExecution(ctx.workspaceId, executionId);
}

