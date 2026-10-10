import "server-only";
import { and, desc, eq, gte, isNotNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { automationExecutions, automations, contacts, conversations } from "@/lib/server/db/schema";
import type { WorkspaceContext } from "@/lib/server/auth/context";
import { listRecentActivity } from "./activity";

/** Leads = contacts we can follow up with or who were qualified. */
export const leadCondition = or(
  isNotNull(contacts.email),
  isNotNull(contacts.phone),
  sql`${contacts.leadStatus} in ('qualified','customer')`,
);

export async function getDashboard(ctx: WorkspaceContext) {
  const db = await getDb();
  const ws = ctx.workspaceId;
  const since = sql`now() - interval '30 days'`;
  const notMerged = sql`${contacts.mergedIntoId} is null`;

  const [contactStats, automationStats, execStats, perAutomation, recentConversations, activity] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        leads: sql<number>`count(*) filter (where ${leadCondition})::int`,
        demo: sql<number>`count(*) filter (where ${contacts.isDemo})::int`,
      })
      .from(contacts)
      .where(and(eq(contacts.workspaceId, ws), notMerged)),
    db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${automations.status} = 'active')::int`,
      })
      .from(automations)
      .where(eq(automations.workspaceId, ws)),
    db
      .select({
        total: sql<number>`count(*)::int`,
        last30: sql<number>`count(*) filter (where ${automationExecutions.createdAt} >= ${since})::int`,
        completed: sql<number>`count(*) filter (where ${automationExecutions.status} = 'completed')::int`,
        failed: sql<number>`count(*) filter (where ${automationExecutions.status} = 'failed')::int`,
        test: sql<number>`count(*) filter (where ${automationExecutions.mode} = 'test')::int`,
      })
      .from(automationExecutions)
      .where(eq(automationExecutions.workspaceId, ws)),
    db
      .select({
        id: automations.id,
        name: automations.name,
        status: automations.status,
        runs: sql<number>`count(${automationExecutions.id})::int`,
        completed: sql<number>`count(${automationExecutions.id}) filter (where ${automationExecutions.status} = 'completed')::int`,
        failed: sql<number>`count(${automationExecutions.id}) filter (where ${automationExecutions.status} = 'failed')::int`,
      })
      .from(automations)
      .leftJoin(
        automationExecutions,
        and(eq(automationExecutions.automationId, automations.id), gte(automationExecutions.createdAt, since)),
      )
      .where(eq(automations.workspaceId, ws))
      .groupBy(automations.id)
      .orderBy(desc(sql`count(${automationExecutions.id})`), desc(automations.updatedAt))
      .limit(6),
    db
      .select({
        id: conversations.id,
        status: conversations.status,
        channel: conversations.channel,
        preview: conversations.lastMessagePreview,
        lastMessageAt: conversations.lastMessageAt,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
      })
      .from(conversations)
      .leftJoin(contacts, eq(contacts.id, conversations.contactId))
      .where(and(eq(conversations.workspaceId, ws), eq(conversations.isTest, false)))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(5),
    listRecentActivity(ctx, 8),
  ]);

  return {
    contacts: contactStats[0] ?? { total: 0, leads: 0, demo: 0 },
    automations: automationStats[0] ?? { total: 0, active: 0 },
    executions: execStats[0] ?? { total: 0, last30: 0, completed: 0, failed: 0, test: 0 },
    perAutomation,
    recentConversations,
    activity,
  };
}
