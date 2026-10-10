import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, lt, ne, or } from "drizzle-orm";
import { logger } from "@/lib/server/logger";
import { getDb } from "@/lib/server/db/client";
import { channelConnections, webhookReceipts } from "@/lib/server/db/schema";
import { enqueueJob } from "@/lib/server/jobs/queue";
import { webhookSigningSecrets } from "./config";
import { parseJsonKeepingIds } from "./api";
import { normalizePayload, webhookPayloadSchema } from "./events";

export type WebhookResponse = { status: number; body: string; contentType?: string };

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * GET subscription verification: returns hub.challenge only when
 * hub.mode=subscribe and hub.verify_token matches INSTAGRAM_WEBHOOK_VERIFY_TOKEN.
 * The expected token is never echoed or logged.
 */
export function verifySubscription(params: URLSearchParams): WebhookResponse {
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  if (!mode || !token || !challenge) return { status: 400, body: "Missing verification parameters" };
  const expected = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN?.trim();
  if (!expected) {
    logger.warn("instagram.webhook.verify_unconfigured");
    return { status: 503, body: "Webhook verification is not configured" };
  }
  if (mode !== "subscribe" || !safeEqual(token, expected)) {
    logger.warn("instagram.webhook.verify_failed", { mode });
    return { status: 403, body: "Verification failed" };
  }
  logger.info("instagram.webhook.verified");
  return { status: 200, body: challenge, contentType: "text/plain" };
}

/** X-Hub-Signature-256: "sha256=" + hex(HMAC-SHA256(rawBody, appSecret)). */
export function isValidSignature(rawBody: string, header: string | null, secrets: string[]): boolean {
  if (!header?.startsWith("sha256=") || !secrets.length) return false;
  const given = header.slice("sha256=".length).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(given)) return false;
  return secrets.some((secret) => safeEqual(createHmac("sha256", secret).update(rawBody, "utf8").digest("hex"), given));
}

type Outcome = "accepted" | "bad_signature" | "invalid_json" | "invalid_payload" | "ignored_object" | "unknown_account" | "not_configured";

/** Best-effort extraction of entry ids for diagnostics (never trusted for routing). */
function claimedAccountIds(raw: string): string[] {
  try {
    const j = parseJsonKeepingIds(raw) as { entry?: { id?: unknown }[] };
    return [...new Set((j.entry ?? []).map((e) => String(e?.id ?? "")).filter(Boolean))].slice(0, 20);
  } catch {
    return [];
  }
}

async function recordReceipt(r: { httpStatus: number; outcome: Outcome; accountIds: string[]; eventKinds?: string[]; eventCount?: number }) {
  try {
    const db = await getDb();
    await db.insert(webhookReceipts).values({
      provider: "instagram",
      httpStatus: r.httpStatus,
      outcome: r.outcome,
      accountIds: r.accountIds,
      eventCount: r.eventCount ?? 0,
      eventKinds: [...new Set(r.eventKinds ?? [])],
    });
    // Keep the diagnostics table small.
    await db.delete(webhookReceipts).where(lt(webhookReceipts.receivedAt, new Date(Date.now() - 7 * 86_400_000)));
  } catch (err) {
    logger.warn("instagram.webhook.receipt_failed", { err });
  }
}

/**
 * POST event notification: verify signature on the raw body, validate,
 * enqueue for async processing, and acknowledge quickly. Duplicate
 * deliveries are absorbed twice: a body-hash job key and per-event
 * idempotency records. Every request is recorded in webhook_receipts
 * (outcome + account ids only) for the Settings diagnostics.
 */
export async function receiveWebhook(rawBody: string, signatureHeader: string | null): Promise<WebhookResponse> {
  const respond = async (status: number, body: string, outcome: Outcome, extra: { eventKinds?: string[]; eventCount?: number } = {}) => {
    await recordReceipt({ httpStatus: status, outcome, accountIds: claimedAccountIds(rawBody), ...extra });
    return { status, body };
  };
  const secrets = webhookSigningSecrets();
  if (!secrets.length) {
    logger.error("instagram.webhook.no_secret");
    return respond(503, "Webhook is not configured", "not_configured");
  }
  if (!isValidSignature(rawBody, signatureHeader, secrets)) {
    logger.warn("instagram.webhook.bad_signature", { hasHeader: Boolean(signatureHeader) });
    return respond(401, "Invalid signature", "bad_signature");
  }
  let json: unknown;
  try {
    json = parseJsonKeepingIds(rawBody);
  } catch {
    return respond(400, "Invalid JSON", "invalid_json");
  }
  const parsed = webhookPayloadSchema.safeParse(json);
  if (!parsed.success) {
    logger.warn("instagram.webhook.invalid_payload", { issues: parsed.error.issues.length });
    return respond(400, "Invalid payload", "invalid_payload");
  }
  if (parsed.data.object !== "instagram") {
    logger.info("instagram.webhook.ignored_object", { object: parsed.data.object });
    return respond(200, "EVENT_RECEIVED", "ignored_object");
  }
  const events = normalizePayload(parsed.data);
  const kinds = events.map((e) => e.kind);

  const ids = [...new Set(events.map((e) => e.accountId))];
  const db = await getDb();
  const known = ids.length
    ? await db
        .select({ id: channelConnections.providerAccountId })
        .from(channelConnections)
        .where(
          and(
            eq(channelConnections.provider, "instagram"),
            or(inArray(channelConnections.providerAccountId, ids), inArray(channelConnections.providerUserId, ids)),
            ne(channelConnections.status, "disconnected"),
          ),
        )
    : [];
  if (ids.length && !known.length) {
    logger.info("instagram.webhook.unknown_account", { events: events.length });
    return respond(200, "EVENT_RECEIVED", "unknown_account", { eventKinds: kinds, eventCount: events.length });
  }

  if (events.length) {
    await enqueueJob({
      workspaceId: null,
      kind: "instagram.webhook",
      payload: { events },
      runAt: new Date(),
      dedupeKey: `igwh:${createHash("sha256").update(rawBody).digest("hex")}`,
      maxAttempts: 5,
    });
  }
  logger.info("instagram.webhook.accepted", { entries: parsed.data.entry.length, events: events.length });
  return respond(200, "EVENT_RECEIVED", "accepted", { eventKinds: kinds, eventCount: events.length });
}
