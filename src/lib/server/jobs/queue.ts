import "server-only";
import { queryRows } from "@/lib/server/db/rows";
import { eq, sql } from "drizzle-orm";
import { getDb, type Executor } from "@/lib/server/db/client";
import { scheduledJobs } from "@/lib/server/db/schema";

export type JobKind = "execution.resume" | "instagram.webhook";

export type ResumePayload = {
  executionId: string;
  /** Must match the execution's current wait token, otherwise the job is stale and ignored. */
  token: string;
  reason: "delay" | "reply_timeout" | "retry";
};

export type InstagramWebhookPayload = { events: import("@/lib/server/integrations/instagram/events").NormalizedIgEvent[] };

export type JobPayload = ResumePayload | InstagramWebhookPayload;

export type JobRow = {
  id: string;
  kind: JobKind;
  payload: JobPayload;
  attempts: number;
  maxAttempts: number;
};

/** Persists a job. With a dedupe key, enqueueing the same logical job twice is a no-op. */
export async function enqueueJob(
  input:
    | { workspaceId: string | null; kind: "execution.resume"; payload: ResumePayload; runAt: Date; dedupeKey?: string; maxAttempts?: number }
    | { workspaceId: string | null; kind: "instagram.webhook"; payload: InstagramWebhookPayload; runAt: Date; dedupeKey?: string; maxAttempts?: number },
  tx?: Executor,
) {
  const db = tx ?? (await getDb());
  await db
    .insert(scheduledJobs)
    .values({
      workspaceId: input.workspaceId,
      kind: input.kind,
      payload: input.payload,
      runAt: input.runAt,
      dedupeKey: input.dedupeKey,
      maxAttempts: input.maxAttempts ?? 3,
    })
    .onConflictDoNothing({ target: scheduledJobs.dedupeKey });
}

const STALE_LOCK = "5 minutes";

/**
 * Atomically claims due jobs. `FOR UPDATE SKIP LOCKED` keeps concurrent
 * workers from taking the same job; jobs stuck in `running` (crashed worker)
 * are reclaimed after a timeout.
 */
export async function claimDueJobs(now: Date, limit = 20): Promise<JobRow[]> {
  const db = await getDb();
  const rows = await queryRows<{ id: string; kind: JobKind; payload: JobPayload; attempts: number; max_attempts: number }>(db, sql`
    update scheduled_jobs
       set status = 'running', locked_at = now(), attempts = attempts + 1, updated_at = now()
     where id in (
       select id from scheduled_jobs
        where (status = 'queued' and run_at <= ${now.toISOString()}::timestamptz)
           or (status = 'running' and locked_at < now() - interval '${sql.raw(STALE_LOCK)}')
        order by run_at
        limit ${limit}
        for update skip locked
     )
     returning id, kind, payload, attempts, max_attempts`);
  return rows.map((r) => ({ id: r.id, kind: r.kind, payload: r.payload, attempts: r.attempts, maxAttempts: r.max_attempts }));
}

export async function completeJob(id: string) {
  const db = await getDb();
  await db.update(scheduledJobs).set({ status: "done", lockedAt: null, updatedAt: new Date() }).where(eq(scheduledJobs.id, id));
}

/** Requeues with exponential backoff, or marks failed after max attempts. */
export async function failJob(job: JobRow, error: string, now: Date) {
  const db = await getDb();
  const exhausted = job.attempts >= job.maxAttempts;
  await db
    .update(scheduledJobs)
    .set({
      status: exhausted ? "failed" : "queued",
      lastError: error.slice(0, 2000),
      lockedAt: null,
      runAt: exhausted ? undefined : new Date(now.getTime() + 2 ** job.attempts * 5_000),
      updatedAt: new Date(),
    })
    .where(eq(scheduledJobs.id, job.id));
}
