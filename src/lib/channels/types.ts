/**
 * Channel abstraction. The engine and inbox talk only to this interface; a
 * future Instagram adapter implements it and keeps every platform-specific
 * rule (24h window, button limits, payload formats) inside the adapter.
 */

export type ChannelCapabilities = {
  maxTextLength: number;
  quickReplies: boolean;
  maxQuickReplies: number;
  linkButtons: boolean;
  maxLinkButtons: number;
  /** Whether delivery is real (false for the simulator). */
  realDelivery: boolean;
};

export type OutboundMessage = {
  text: string;
  quickReplies?: { id: string; label: string }[];
  linkButtons?: { id: string; label: string; url: string }[];
};

export type SendContext = {
  workspaceId: string;
  conversationId: string;
  contactId: string | null;
  /** Channel-scoped recipient id (e.g. an Instagram-scoped user id). */
  recipientId: string | null;
  executionId?: string | null;
  agentId?: string | null;
  source: "automation" | "agent" | "human";
  authorUserId?: string | null;
};

export type SendResult = {
  /** "simulated" when no external platform was contacted. Never claim "sent" without provider confirmation. */
  status: "simulated" | "sent" | "failed";
  messageId: string;
  externalId?: string;
  error?: string;
};

/** Internal, platform-neutral event produced from a provider webhook. */
export type InboundEvent = {
  channel: string;
  /** Provider's event/message id — used for idempotency. */
  externalEventId: string;
  type: "message" | "event";
  sender: { channelUserId: string; firstName?: string; lastName?: string };
  text?: string;
  eventName?: string;
  receivedAt: Date;
  raw?: unknown;
};

export type WebhookRequest = { headers: Record<string, string>; query: Record<string, string>; body: string };

export interface ChannelProvider {
  readonly id: string;
  readonly displayName: string;
  getCapabilities(): ChannelCapabilities;
  sendMessage(ctx: SendContext, message: OutboundMessage): Promise<SendResult>;
  /** Parse a verified webhook payload into internal events. */
  receiveEvent(req: WebhookRequest): Promise<InboundEvent[]>;
  /** Verify signatures / subscription challenges. */
  verifyWebhook(req: WebhookRequest): Promise<{ ok: boolean; challenge?: string }>;
}

/** Clamp a message to what the channel supports. */
export function fitToCapabilities(message: OutboundMessage, caps: ChannelCapabilities): OutboundMessage {
  return {
    text: message.text.slice(0, caps.maxTextLength),
    quickReplies: caps.quickReplies ? message.quickReplies?.slice(0, caps.maxQuickReplies) : undefined,
    linkButtons: caps.linkButtons ? message.linkButtons?.slice(0, caps.maxLinkButtons) : undefined,
  };
}
