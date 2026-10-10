import "server-only";
import { and, desc, eq, ne } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { channelConnections, contacts, conversations, messages } from "@/lib/server/db/schema";
import { AppError } from "@/lib/server/errors";
import { logger } from "@/lib/server/logger";
import { RetryableError } from "@/lib/server/engine/types";
import { decryptSecret } from "@/lib/server/integrations/token-crypto";
import { InstagramApiError, sendInstagramMessage, type IgOutgoing } from "@/lib/server/integrations/instagram/api";
import type { ChannelCapabilities, ChannelProvider, InboundEvent, OutboundMessage, SendContext, SendResult, WebhookRequest } from "./types";

const WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_TEXT_BYTES = 1000;
const MAX_TEMPLATE_TEXT = 640;

/** Trims to a UTF-8 byte budget without splitting a character. */
function clampBytes(text: string, max: number) {
  const enc = new TextEncoder();
  if (enc.encode(text).length <= max) return text;
  let out = "";
  for (const ch of text) {
    if (enc.encode(out + ch + "…").length > max) break;
    out += ch;
  }
  return `${out}…`;
}

/**
 * Instagram adapter (Instagram API with Instagram Login). Platform rules live
 * here: the 24-hour reply window, text/byte limits, quick-reply and button
 * formats. A message is recorded as "sent" only after Meta returns its id.
 */
export class InstagramChannelProvider implements ChannelProvider {
  readonly id = "instagram";
  readonly displayName = "Instagram";

  getCapabilities(): ChannelCapabilities {
    return { maxTextLength: 1000, quickReplies: true, maxQuickReplies: 13, linkButtons: true, maxLinkButtons: 3, realDelivery: true };
  }

  async sendMessage(ctx: SendContext, message: OutboundMessage): Promise<SendResult> {
    const db = await getDb();
    const [conv] = await db
      .select({ id: conversations.id, contactId: conversations.contactId })
      .from(conversations)
      .where(and(eq(conversations.id, ctx.conversationId), eq(conversations.workspaceId, ctx.workspaceId), eq(conversations.channel, "instagram")))
      .limit(1);
    if (!conv?.contactId) throw new AppError("Диалог в Instagram не найден", "not_found");
    const [contact] = await db.select({ igsid: contacts.channelUserId }).from(contacts).where(eq(contacts.id, conv.contactId)).limit(1);
    if (!contact?.igsid) throw new AppError("У этого контакта нет Instagram ID, ответить невозможно", "validation");

    const [conn] = await db
      .select({ id: channelConnections.id, token: channelConnections.accessTokenEncrypted, status: channelConnections.status })
      .from(channelConnections)
      .where(and(eq(channelConnections.workspaceId, ctx.workspaceId), eq(channelConnections.provider, "instagram"), ne(channelConnections.status, "disconnected")))
      .limit(1);
    if (!conn?.token || conn.status !== "active") {
      throw new AppError("Instagram не подключён или срок действия токена истёк. Переподключите его в настройках.", "validation");
    }

    // Meta only allows replies within 24 hours of the person's last message.
    const [lastInbound] = await db
      .select({ at: messages.createdAt })
      .from(messages)
      .where(and(eq(messages.conversationId, conv.id), eq(messages.kind, "inbound")))
      .orderBy(desc(messages.createdAt))
      .limit(1);
    if (!lastInbound || Date.now() - lastInbound.at.getTime() > WINDOW_MS) {
      throw new AppError("24-часовое окно для ответа в Instagram закрыто — дождитесь, пока клиент напишет снова.", "validation");
    }

    const links = (message.linkButtons ?? []).slice(0, 3);
    const quick = (message.quickReplies ?? []).slice(0, 13);
    const out: IgOutgoing = links.length
      ? { kind: "buttons", text: clampBytes(message.text, MAX_TEMPLATE_TEXT), buttons: links.map((b) => ({ title: b.label.slice(0, 20), url: b.url })) }
      : { kind: "text", text: clampBytes(message.text, MAX_TEXT_BYTES), quickReplies: quick.map((q) => ({ title: q.label.slice(0, 20), payload: q.label.slice(0, 1000) })) };

    let externalId: string;
    try {
      externalId = (await sendInstagramMessage(decryptSecret(conn.token), contact.igsid, out)).messageId;
    } catch (err) {
      if (err instanceof InstagramApiError) {
        logger.warn("instagram.send_failed", { workspaceId: ctx.workspaceId, status: err.status, kind: err.kind });
        if (err.kind === "rate_limit" || err.kind === "server") throw new RetryableError("Instagram временно недоступен");
        if (err.status === 401 || /access token|OAuthException|\(#?190\)/i.test(err.message)) {
          await db.update(channelConnections).set({ status: "token_expired", lastError: "Instagram отклонил токен доступа — переподключите аккаунт", updatedAt: new Date() }).where(eq(channelConnections.id, conn.id));
        }
        throw new AppError(`Instagram не принял сообщение: ${err.message.replace(/^Отправка сообщения: ошибка — /, "")}`, "validation");
      }
      throw err;
    }

    const [row] = await db
      .insert(messages)
      .values({
        workspaceId: ctx.workspaceId,
        conversationId: conv.id,
        kind: "outbound",
        source: ctx.source,
        deliveryStatus: "sent",
        body: out.text,
        payload: { externalId, quickReplies: quick, linkButtons: links, channel: "instagram" },
        executionId: ctx.executionId ?? null,
        agentId: ctx.agentId ?? null,
        authorUserId: ctx.authorUserId ?? null,
      })
      .returning({ id: messages.id });
    await db.update(conversations).set({ lastMessageAt: new Date(), lastMessagePreview: out.text.slice(0, 140), updatedAt: new Date() }).where(eq(conversations.id, conv.id));
    return { status: "sent", messageId: row!.id, externalId };
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
