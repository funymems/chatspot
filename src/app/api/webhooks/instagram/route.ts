import { after } from "next/server";
import { receiveWebhook, verifySubscription } from "@/lib/server/integrations/instagram/webhook";
import { processDueJobs } from "@/lib/server/jobs/worker";
import { logger } from "@/lib/server/logger";

/**
 * Instagram webhook endpoint (configure in Meta as
 * https://YOUR-DEPLOYED-DOMAIN/api/webhooks/instagram).
 *  GET  — subscription verification (hub.mode / hub.verify_token / hub.challenge)
 *  POST — signed event notifications (X-Hub-Signature-256)
 */
export async function GET(request: Request) {
  const res = verifySubscription(new URL(request.url).searchParams);
  return new Response(res.body, { status: res.status, headers: { "content-type": res.contentType ?? "text/plain" } });
}

export async function POST(request: Request) {
  // The signature covers the exact bytes Meta sent, so read the raw body.
  const raw = await request.text();
  const res = await receiveWebhook(raw, request.headers.get("x-hub-signature-256"));
  if (res.status === 200) {
    // Acknowledge first; process queued events right after the response.
    after(async () => {
      try {
        await processDueJobs();
      } catch (err) {
        logger.error("instagram.webhook.after_failed", { err });
      }
    });
  }
  return new Response(res.body, { status: res.status, headers: { "content-type": "text/plain" } });
}
