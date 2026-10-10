import "server-only";
import { randomUUID } from "node:crypto";
import { getDb, type Executor } from "@/lib/server/db/client";
import { conversations, messages } from "@/lib/server/db/schema";
import { eq } from "drizzle-orm";
import {
  fitToCapabilities,
  type ChannelCapabilities,
  type ChannelProvider,
  type InboundEvent,
  type OutboundMessage,
  type SendContext,
  type SendResult,
  type WebhookRequest,
} from "./types";

/**
 * Development channel. "Sending" writes the message into the internal
 * conversation with delivery status `simulated` — nothing leaves the app.
 */
export class MockChannelProvider implements ChannelProvider {
  readonly id = "mock";
  readonly displayName = "Симулятор";

  constructor(private readonly tx?: Executor) {}

  getCapabilities(): ChannelCapabilities {
    return { maxTextLength: 2000, quickReplies: true, maxQuickReplies: 10, linkButtons: true, maxLinkButtons: 3, realDelivery: false };
  }

  async sendMessage(ctx: SendContext, message: OutboundMessage): Promise<SendResult> {
    const db = this.tx ?? (await getDb());
    const m = fitToCapabilities(message, this.getCapabilities());
    const [row] = await db
      .insert(messages)
      .values({
        workspaceId: ctx.workspaceId,
        conversationId: ctx.conversationId,
        kind: "outbound",
        source: ctx.source,
        deliveryStatus: "simulated",
        body: m.text,
        payload: { quickReplies: m.quickReplies ?? [], linkButtons: m.linkButtons ?? [] },
        executionId: ctx.executionId ?? null,
        agentId: ctx.agentId ?? null,
        authorUserId: ctx.authorUserId ?? null,
      })
      .returning({ id: messages.id });
    await db
      .update(conversations)
      .set({ lastMessageAt: new Date(), lastMessagePreview: m.text.slice(0, 140), updatedAt: new Date() })
      .where(eq(conversations.id, ctx.conversationId));
    return { status: "simulated", messageId: row!.id };
  }

  async receiveEvent(req: WebhookRequest): Promise<InboundEvent[]> {
    // The simulator posts already-normalised JSON: { senderId, text, eventId?, firstName? }.
    const body = JSON.parse(req.body) as { senderId: string; text?: string; eventId?: string; firstName?: string; lastName?: string };
    return [
      {
        channel: this.id,
        externalEventId: body.eventId ?? randomUUID(),
        type: "message",
        sender: { channelUserId: body.senderId, firstName: body.firstName, lastName: body.lastName },
        text: body.text ?? "",
        receivedAt: new Date(),
        raw: body,
      },
    ];
  }

  async verifyWebhook(): Promise<{ ok: boolean }> {
    return { ok: true }; // internal only; real providers verify signatures here
  }
}
