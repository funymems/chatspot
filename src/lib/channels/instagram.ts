import "server-only";
import { AppError } from "@/lib/server/errors";
import type { ChannelCapabilities, ChannelProvider, InboundEvent, OutboundMessage, SendContext, SendResult, WebhookRequest } from "./types";

/**
 * Instagram adapter (Instagram API with Instagram Login).
 * Receiving is implemented in src/lib/server/integrations/instagram (webhook
 * route → job → inbox). Sending is intentionally disabled until the reply
 * workflow (24-hour window, human-agent tag, opt-in per workspace) is built,
 * so nothing is ever reported as delivered without Meta confirming it.
 */
export class InstagramChannelProvider implements ChannelProvider {
  readonly id = "instagram";
  readonly displayName = "Instagram";

  getCapabilities(): ChannelCapabilities {
    // Text messages are limited to 1000 bytes by the Messaging API.
    return { maxTextLength: 1000, quickReplies: true, maxQuickReplies: 13, linkButtons: false, maxLinkButtons: 0, realDelivery: true };
  }

  async sendMessage(_ctx: SendContext, _message: OutboundMessage): Promise<SendResult> {
    void _ctx;
    void _message;
    throw new AppError("Replying through Instagram isn't enabled yet — this conversation is receive-only.", "validation");
  }

  async receiveEvent(_req: WebhookRequest): Promise<InboundEvent[]> {
    void _req;
    throw new Error("Instagram webhooks are handled by /api/webhooks/instagram");
  }

  async verifyWebhook(_req: WebhookRequest): Promise<{ ok: boolean }> {
    void _req;
    throw new Error("Instagram webhooks are handled by /api/webhooks/instagram");
  }
}
