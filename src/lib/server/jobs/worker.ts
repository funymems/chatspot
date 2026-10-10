import "server-only";
import { logger } from "@/lib/server/logger";
import { runExecution } from "@/lib/server/engine/runtime";
import { claimDueJobs, completeJob, failJob, type JobRow } from "./queue";

async function handle(job: JobRow) {
  switch (job.kind) {
    case "execution.resume": {
      const { executionId, token, reason } = job.payload;
      // Stale tokens are ignored inside runExecution, so replays are harmless.
      await runExecution(executionId, { token, reason });
      return;
    }
  }
}

/** Processes all jobs due at `now`. Returns how many jobs ran. */
export async function processDueJobs(now = new Date(), limit = 20): Promise<number> {
  const jobs = await claimDueJobs(now, limit);
  for (const job of jobs) {
    try {
      await handle(job);
      await completeJob(job.id);
    } catch (err) {
      logger.error("job.failed", { jobId: job.id, kind: job.kind, attempts: job.attempts, err });
      await failJob(job, err instanceof Error ? err.message : String(err), now);
    }
  }
  return jobs.length;
}
