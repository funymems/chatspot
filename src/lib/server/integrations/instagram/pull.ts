import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { channelConnections } from "@/lib/server/db/schema";
import type { WorkspaceContext } from "@/lib/server/auth/context";
import { assertRole } from "@/lib/server/services/workspaces";
import { conflict, notFound } from "@/lib/server/errors";
import { decryptSecret } from "@/lib/server/integrations/token-crypto";
import { listRecentMessages } from "./api";
import { processInstagramEvents, type NormalizedIgEvent } from "./events";

const WINDOW_MS = 24 * 3_600_000; // Meta's standard messaging window

/**
 * Manual alternative to webhooks: fetches recent DMs through the
 * Conversations API and runs them through the same pipeline as webhook
 * events. Only the latest incoming message per thread (within 24h) is taken,
 * so a first pull never fires automations for a whole backlog; already-seen
 * message ids are skipped by the inbound event log.
 */
export async function pullInstagramMessages(ctx: WorkspaceContext) {
  assertRole(ctx, "admin");
  const db = await getDb();
  const [conn] = await db
    .select({ accountId: channelConnections.providerAccountId, userId: channelConnections.providerUserId, username: channelConnections.username, token: channelConnections.accessTokenEncrypted, status: channelConnections.status })
    .from(channelConnections)
    .where(and(eq(channelConnections.workspaceId, ctx.workspaceId), eq(channelConnections.provider, "instagram")))
    .limit(1);
  if (!conn) throw notFound("подключение Instagram");
  if (conn.status !== "active" || !conn.token) throw conflict("Сначала переподключите Instagram");

  const own = new Set([conn.accountId, conn.userId].filter(Boolean));
  const threads = await listRecentMessages(decryptSecret(conn.token));
  const events: NormalizedIgEvent[] = [];
  for (const messages of threads) {
    const latest = messages.find((m) => !own.has(m.senderId) && (!conn.username || m.senderUsername !== conn.username));
    if (!latest || (latest.createdAt && Date.now() - latest.createdAt.getTime() > WINDOW_MS)) continue;
    events.push({
      accountId: conn.accountId,
      kind: "message",
      eventId: `msg:${latest.mid}`,
      senderId: latest.senderId,
      text: latest.text || null,
      attachments: latest.text ? 0 : 1,
      timestamp: latest.createdAt?.getTime() ?? null,
    });
  }
  const res = events.length ? await processInstagramEvents(events) : { stored: 0, dispatched: 0 };
  return { threads: threads.length, candidates: events.length, ...res };
}
