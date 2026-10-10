/**
 * Starts a lightweight job ticker for local / single-instance servers.
 * It only pings the protected /api/jobs/tick route, so all job processing
 * happens inside the regular server bundle. Disable with JOB_WORKER=off
 * (e.g. on serverless, where a cron calls the route instead).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.JOB_WORKER === "off") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { randomBytes } = await import("node:crypto");
  process.env.JOB_TICK_SECRET ??= randomBytes(24).toString("hex");
  const port = process.env.PORT ?? "3000";
  const url = `http://127.0.0.1:${port}/api/jobs/tick`;
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await fetch(url, { method: "POST", headers: { "x-job-secret": process.env.JOB_TICK_SECRET! } });
    } catch {
      // server not listening yet; try again next tick
    } finally {
      busy = false;
    }
  }, 1_000);
  timer.unref?.();
}
