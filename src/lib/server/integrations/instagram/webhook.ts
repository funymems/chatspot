import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "@/lib/server/logger";
import { enqueueJob } from "@/lib/server/jobs/queue";
import { webhookSigningSecrets } from "./config";
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

/**
 * POST event notification: verify signature on the raw body, validate,
 * enqueue for async processing, and acknowledge quickly. Duplicate
 * deliveries are absorbed twice: a body-hash job key and per-event
 * idempotency records.
 */
export async function receiveWebhook(rawBody: string, signatureHeader: string | null): Promise<WebhookResponse> {
  const secrets = webhookSigningSecrets();
  if (!secrets.length) {
    logger.error("instagram.webhook.no_secret");
    return { status: 503, body: "Webhook is not configured" };
  }
  if (!isValidSignature(rawBody, signatureHeader, secrets)) {
    logger.warn("instagram.webhook.bad_signature", { hasHeader: Boolean(signatureHeader) });
    return { status: 401, body: "Invalid signature" };
  }
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: "Invalid JSON" };
  }
  const parsed = webhookPayloadSchema.safeParse(json);
  if (!parsed.success) {
    logger.warn("instagram.webhook.invalid_payload", { issues: parsed.error.issues.length });
    return { status: 400, body: "Invalid payload" };
  }
  if (parsed.data.object !== "instagram") {
    logger.info("instagram.webhook.ignored_object", { object: parsed.data.object });
    return { status: 200, body: "EVENT_RECEIVED" };
  }
  const events = normalizePayload(parsed.data);
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
  return { status: 200, body: "EVENT_RECEIVED" };
}
