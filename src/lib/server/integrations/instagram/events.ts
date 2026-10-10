import "server-only";
import { and, eq, ne, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/server/db/client";
import { channelConnections, contacts, conversations } from "@/lib/server/db/schema";
import { logger } from "@/lib/server/logger";
import { dispatchInboundToAutomations, markEventProcessed, recordInboundEvent, storeInboundMessage } from "@/lib/server/engine/events";
import { decryptSecret } from "@/lib/server/integrations/token-crypto";
import { getMessagingUserProfile } from "./api";
import { createHash } from "node:crypto";

/**
 * Instagram webhook payloads (Instagram Login), verified against
 * developers.facebook.com/documentation/instagram-platform/webhooks/examples:
 *   { object: "instagram", entry: [{ id, time, messaging?: [...], changes?: [...] }] }
 * Unknown shapes are tolerated: every field is optional and anything we
 * don't understand is recorded as "unknown" instead of failing the batch.
 */
const id = z.union([z.string(), z.number()]).transform(String);

const messagingItem = z
  .object({
    sender: z.object({ id }).partial().optional(),
    recipient: z.object({ id }).partial().optional(),
    timestamp: z.union([z.number(), z.string().transform(Number)]).optional(),
    message: z
      .object({
        mid: z.string().optional(),
        text: z.string().optional(),
        is_echo: z.boolean().optional(),
        is_deleted: z.boolean().optional(),
        attachments: z.array(z.object({ type: z.string().optional() }).loose()).optional(),
        quick_reply: z.object({ payload: z.string().optional() }).loose().optional(),
      })
      .loose()
      .optional(),
    postback: z.object({ mid: z.string().optional(), title: z.string().optional(), payload: z.string().optional() }).loose().optional(),
    reaction: z.object({ mid: z.string().optional(), action: z.string().optional() }).loose().optional(),
    read: z.object({ mid: z.string().optional() }).loose().optional(),
    referral: z.object({ ref: z.string().optional() }).loose().optional(),
  })
  .loose();

const changeItem = z.object({ field: z.string(), value: z.record(z.string(), z.unknown()).optional() }).loose();

export const webhookPayloadSchema = z.object({
  object: z.string(),
  entry: z
    .array(
      z
        .object({
          id,
          time: z.number().optional(),
          messaging: z.array(messagingItem).optional(),
          changes: z.array(changeItem).optional(),
        })
        .loose(),
    )
    .max(1000),
});
export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;

export type NormalizedIgEvent = {
  /** Professional account that received the event (entry[].id). */
  accountId: string;
  kind: "message" | "echo" | "deleted" | "postback" | "reaction" | "read" | "referral" | "comment" | "unknown";
  /** Stable id for idempotency (message id when available, otherwise a content hash). */
  eventId: string;
  senderId: string | null;
  text: string | null;
  attachments: number;
  timestamp: number | null;
  field?: string;
};

const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 32);

const MESSAGING_FIELDS = new Set(["messages", "messaging_postbacks", "message_reactions", "messaging_seen", "messaging_referral", "message_edit"]);

function normalizeMessaging(accountId: string, m: z.infer<typeof messagingItem>): NormalizedIgEvent {
  const base = { accountId, senderId: m.sender?.id ?? null, timestamp: m.timestamp ?? null, text: null, attachments: 0 };
  if (m.message) {
    const kind = m.message.is_deleted ? "deleted" : m.message.is_echo ? "echo" : "message";
    return {
      ...base,
      kind,
      eventId: m.message.mid ? `msg:${m.message.mid}` : `msg:${digest(m)}`,
      text: kind === "message" ? m.message.text ?? null : null,
      attachments: m.message.attachments?.length ?? 0,
    };
  }
  if (m.postback) return { ...base, kind: "postback", eventId: `pb:${m.postback.mid ?? digest(m)}`, text: m.postback.title ?? null };
  if (m.reaction) return { ...base, kind: "reaction", eventId: `rx:${digest(m)}` };
  if (m.read) return { ...base, kind: "read", eventId: `rd:${digest(m)}` };
  if (m.referral) return { ...base, kind: "referral", eventId: `rf:${digest(m)}` };
  return { ...base, kind: "unknown", eventId: `un:${digest(m)}` };
}

/**
 * Real messaging notifications use `entry[].messaging[]`; the App Dashboard
 * "Test" button (and some fields) use `entry[].changes[{ field, value }]`
 * with the same messaging object as `value`. Both are accepted.
 */
export function normalizePayload(payload: WebhookPayload): NormalizedIgEvent[] {
  const out: NormalizedIgEvent[] = [];
  for (const entry of payload.entry) {
    for (const m of entry.messaging ?? []) out.push(normalizeMessaging(entry.id, m));
    for (const c of entry.changes ?? []) {
      if (MESSAGING_FIELDS.has(c.field)) {
        const parsed = messagingItem.safeParse(c.value ?? {});
        if (parsed.success && (parsed.data.message || parsed.data.postback || parsed.data.reaction || parsed.data.read || parsed.data.referral)) {
          out.push(normalizeMessaging(entry.id, parsed.data));
          continue;
        }
      }
      const value = (c.value ?? {}) as { id?: unknown; from?: { id?: unknown } };
      out.push({
        accountId: entry.id,
        kind: c.field === "comments" ? "comment" : "unknown",
        field: c.field,
        eventId: value.id ? `${c.field}:${String(value.id)}` : `${c.field}:${digest(c)}`,
        senderId: value.from?.id ? String(value.from.id) : null,
        text: null, // comment text is not needed until comment automations exist
        attachments: 0,
        timestamp: entry.time ?? null,
      });
    }
  }
  return out;
}

/**
 * Processes normalized events (runs in the job worker, not in the webhook
 * request). Incoming DMs are stored in the inbox; automations do NOT reply
 * automatically — sending through Instagram isn't enabled yet.
 */
export async function processInstagramEvents(events: NormalizedIgEvent[]) {
  const db = await getDb();
  const connectionCache = new Map<string, { id: string; workspaceId: string; autoReply: boolean; token: string | null } | null>();
  let stored = 0;
  let dispatched = 0;
  for (const ev of events) {
    let conn = connectionCache.get(ev.accountId);
    if (conn === undefined) {
      const [row] = await db
        .select({
          id: channelConnections.id,
          workspaceId: channelConnections.workspaceId,
          autoReply: channelConnections.autoReplyEnabled,
          token: channelConnections.accessTokenEncrypted,
        })
        .from(channelConnections)
        .where(
          and(
            eq(channelConnections.provider, "instagram"),
            // entry[].id is documented as the professional account id; accept the token's user id too.
            or(eq(channelConnections.providerAccountId, ev.accountId), eq(channelConnections.providerUserId, ev.accountId)),
            ne(channelConnections.status, "disconnected"),
          ),
        )
        .limit(1);
      conn = row ?? null;
      connectionCache.set(ev.accountId, conn);
      if (conn) await db.update(channelConnections).set({ lastWebhookAt: new Date() }).where(eq(channelConnections.id, conn.id));
    }
    if (!conn) {
      logger.info("instagram.webhook.unknown_account", { kind: ev.kind });
      continue;
    }

    const rec = await recordInboundEvent({
      workspaceId: conn.workspaceId,
      channel: "instagram",
      externalEventId: ev.eventId,
      type: ev.kind,
      // Minimal metadata only; message text lives in the conversation, not in the event log.
      payload: { accountId: ev.accountId, senderId: ev.senderId, attachments: ev.attachments, timestamp: ev.timestamp, field: ev.field ?? null },
    });
    if (rec.duplicate) continue;

    if (ev.kind === "message" && ev.senderId && ev.senderId !== ev.accountId) {
      const { contactId, conversationId } = await ensureInstagramThread(conn.workspaceId, ev.senderId, conn.token);
      const body = ev.text ?? (ev.attachments ? `[${ev.attachments} attachment${ev.attachments === 1 ? "" : "s"}]` : "[unsupported message]");
      await storeInboundMessage(conn.workspaceId, conversationId, contactId, body, { eventId: ev.eventId, channel: "instagram" });
      stored++;
      // Automations reply only when the workspace explicitly enabled it (Settings → Instagram).
      if (conn.autoReply && ev.text) {
        try {
          const res = await dispatchInboundToAutomations({ workspaceId: conn.workspaceId, conversationId, contactId, text: ev.text, inboundEventId: rec.id });
          if (res.execution) dispatched++;
        } catch (err) {
          logger.error("instagram.automation_failed", { workspaceId: conn.workspaceId, err });
        }
      }
    }
    await markEventProcessed(rec.id);
  }
  logger.info("instagram.webhook.processed", { events: events.length, storedMessages: stored, automationRuns: dispatched });
  return { stored, dispatched };
}

async function ensureInstagramThread(workspaceId: string, igsid: string, encryptedToken: string | null) {
  const db = await getDb();
  let [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.source, "instagram"), eq(contacts.channelUserId, igsid)))
    .limit(1);
  if (!contact) {
    // The User Profile API works once the person has messaged the account (consent); fall back gracefully.
    let name = "";
    let username = "";
    if (encryptedToken) {
      try {
        ({ name, username } = await getMessagingUserProfile(decryptSecret(encryptedToken), igsid));
      } catch {
        logger.info("instagram.profile_unavailable", { workspaceId });
      }
    }
    const display = name || username;
    const [first, ...rest] = display ? display.split(/\s+/) : ["Instagram user"];
    [contact] = await db
      .insert(contacts)
      .values({
        workspaceId,
        firstName: first ?? "Instagram user",
        lastName: display ? rest.join(" ") : igsid.slice(-4),
        source: "instagram",
        channelUserId: igsid,
        customFields: username ? { instagram_username: username } : {},
      })
      .returning({ id: contacts.id });
  }
  let [conv] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.workspaceId, workspaceId), eq(conversations.contactId, contact!.id), eq(conversations.channel, "instagram")))
    .limit(1);
  if (!conv) {
    [conv] = await db.insert(conversations).values({ workspaceId, contactId: contact!.id, channel: "instagram" }).returning({ id: conversations.id });
  }
  return { contactId: contact!.id, conversationId: conv!.id };
}
