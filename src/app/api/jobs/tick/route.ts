import { timingSafeEqual } from "node:crypto";
import { processDueJobs } from "@/lib/server/jobs/worker";
import { logger } from "@/lib/server/logger";
import { maybeRefreshInstagramTokens } from "@/lib/server/integrations/instagram/connections";

/**
 * Processes due background jobs (delays, reply timeouts, retries).
 * Called every second by the in-process ticker in development and by a
 * cron (with `Authorization: Bearer $CRON_SECRET`) in production.
 */
export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const processed = await processDueJobs();
    // Hourly at most: refresh Instagram long-lived tokens before they expire.
    await maybeRefreshInstagramTokens().catch((err) => logger.error("instagram.refresh_tick_failed", { err }));
    return Response.json({ processed });
  } catch (err) {
    logger.error("jobs.tick_failed", { err });
    return Response.json({ error: "Job processing failed" }, { status: 500 });
  }
}

// Vercel Cron issues GET requests.
export const GET = POST;

function authorized(request: Request) {
  const expected = [process.env.JOB_TICK_SECRET, process.env.CRON_SECRET].filter((s): s is string => Boolean(s));
  const given = request.headers.get("x-job-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return expected.some((s) => s.length === given.length && timingSafeEqual(Buffer.from(s), Buffer.from(given)));
}
