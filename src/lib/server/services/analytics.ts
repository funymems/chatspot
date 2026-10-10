import "server-only";
import { and, desc, eq, gte, isNull, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { automationExecutions, automations, contacts, nodeExecutionLogs } from "@/lib/server/db/schema";
import type { WorkspaceContext } from "@/lib/server/auth/context";

export const analyticsRanges = { "7d": 7, "30d": 30, "90d": 90, all: null } as const;
export type AnalyticsRange = keyof typeof analyticsRanges;

/**
 * All numbers come from persisted executions/contacts. "Conversions" are
 * runs that ended in a goal_reached End node (test and live runs, labelled
 * as such in the UI) — no purchase tracking is connected.
 */
export async function getAnalytics(ctx: WorkspaceContext, range: AnalyticsRange, mode: "all" | "live" | "test" = "all") {
  const db = await getDb();
  const days = analyticsRanges[range];
  const since = days ? new Date(Date.now() - days * 86_400_000) : null;
  const ws = eq(automationExecutions.workspaceId, ctx.workspaceId);
  const inRange = since ? gte(automationExecutions.createdAt, since) : undefined;
  const modeCond = mode === "all" ? undefined : eq(automationExecutions.mode, mode);
  const base = and(ws, inRange, modeCond);

  const [totals, daily, top, failures, recent, leads] = await Promise.all([
    db
      .select({
        runs: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${automationExecutions.status} = 'completed')::int`,
        failed: sql<number>`count(*) filter (where ${automationExecutions.status} = 'failed')::int`,
        inProgress: sql<number>`count(*) filter (where ${automationExecutions.status} in ('queued','running','waiting'))::int`,
        conversions: sql<number>`count(*) filter (where ${automationExecutions.result} ->> 'outcome' = 'goal_reached')::int`,
        test: sql<number>`count(*) filter (where ${automationExecutions.mode} = 'test')::int`,
        live: sql<number>`count(*) filter (where ${automationExecutions.mode} = 'live')::int`,
      })
      .from(automationExecutions)
      .where(base),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${automationExecutions.createdAt}), 'YYYY-MM-DD')`,
        completed: sql<number>`count(*) filter (where ${automationExecutions.status} = 'completed')::int`,
        failed: sql<number>`count(*) filter (where ${automationExecutions.status} = 'failed')::int`,
        other: sql<number>`count(*) filter (where ${automationExecutions.status} not in ('completed','failed'))::int`,
      })
      .from(automationExecutions)
      .where(base)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        id: automations.id,
        name: automations.name,
        status: automations.status,
        runs: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${automationExecutions.status} = 'completed')::int`,
        failed: sql<number>`count(*) filter (where ${automationExecutions.status} = 'failed')::int`,
        conversions: sql<number>`count(*) filter (where ${automationExecutions.result} ->> 'outcome' = 'goal_reached')::int`,
      })
      .from(automationExecutions)
      .innerJoin(automations, eq(automations.id, automationExecutions.automationId))
      .where(base)
      .groupBy(automations.id)
      .orderBy(desc(sql`count(*)`))
      .limit(8),
    db
      .select({
        automationId: automations.id,
        automationName: automations.name,
        nodeId: nodeExecutionLogs.nodeId,
        nodeType: nodeExecutionLogs.nodeType,
        failures: sql<number>`count(*)::int`,
        lastError: sql<string>`(array_agg(${nodeExecutionLogs.error} order by ${nodeExecutionLogs.startedAt} desc))[1]`,
        lastAt: sql<Date>`max(${nodeExecutionLogs.startedAt})`,
      })
      .from(nodeExecutionLogs)
      .innerJoin(automationExecutions, eq(automationExecutions.id, nodeExecutionLogs.executionId))
      .innerJoin(automations, eq(automations.id, automationExecutions.automationId))
      .where(and(base, eq(nodeExecutionLogs.status, "failed")))
      .groupBy(automations.id, nodeExecutionLogs.nodeId, nodeExecutionLogs.nodeType)
      .orderBy(desc(sql`count(*)`))
      .limit(10),
    db
      .select({
        id: automationExecutions.id,
        automationId: automations.id,
        automationName: automations.name,
        status: automationExecutions.status,
        mode: automationExecutions.mode,
        stepCount: automationExecutions.stepCount,
        error: automationExecutions.error,
        createdAt: automationExecutions.createdAt,
        finishedAt: automationExecutions.finishedAt,
        startedAt: automationExecutions.startedAt,
      })
      .from(automationExecutions)
      .innerJoin(automations, eq(automations.id, automationExecutions.automationId))
      .where(base)
      .orderBy(desc(automationExecutions.createdAt))
      .limit(25),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, ctx.workspaceId),
          isNull(contacts.mergedIntoId),
          ne(contacts.source, "test"),
          since ? gte(contacts.updatedAt, since) : undefined,
          sql`(${contacts.email} is not null or ${contacts.phone} is not null or ${contacts.leadStatus} in ('qualified','customer'))`,
        ),
      ),
  ]);

  const t = totals[0] ?? { runs: 0, completed: 0, failed: 0, inProgress: 0, conversions: 0, test: 0, live: 0 };
  const finished = t.completed + t.failed;
  return {
    range,
    mode,
    since,
    totals: { ...t, completionRate: finished ? Math.round((t.completed / finished) * 1000) / 10 : null, leads: leads[0]?.n ?? 0 },
    daily: fillDays(daily, since),
    top,
    failures,
    recent,
  };
}

/** Adds zero rows for days without runs so the chart has a continuous axis. */
function fillDays(rows: { day: string; completed: number; failed: number; other: number }[], since: Date | null) {
  if (!rows.length && !since) return [];
  const map = new Map(rows.map((r) => [r.day, r]));
  const start = since ?? new Date(`${rows[0]!.day}T00:00:00Z`);
  const out = [];
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const end = new Date();
  while (d <= end) {
    const key = d.toISOString().slice(0, 10);
    out.push(map.get(key) ?? { day: key, completed: 0, failed: 0, other: 0 });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

