import "server-only";
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { channelConnections } from "@/lib/server/db/schema";
import type { WorkspaceContext } from "@/lib/server/auth/context";
import { assertRole } from "@/lib/server/services/workspaces";
import { notFound } from "@/lib/server/errors";
import { logger } from "@/lib/server/logger";
import { recordActivity } from "@/lib/server/services/activity";
import { decryptSecret, encryptSecret } from "@/lib/server/integrations/token-crypto";
import { InstagramApiError, refreshLongLived } from "./api";

/** Client-safe view of a connection: never includes token material. */
export type InstagramConnectionView = {
  id: string;
  username: string;
  accountId: string;
  status: "active" | "token_expired" | "error" | "disconnected";
  tokenExpiresAt: Date | null;
  grantedScopes: string[];
  webhookSubscribedAt: Date | null;
  lastWebhookAt: Date | null;
  lastError: string | null;
  autoReplyEnabled: boolean;
  createdAt: Date;
};

const safeColumns = {
  id: channelConnections.id,
  username: channelConnections.username,
  accountId: channelConnections.providerAccountId,
  status: channelConnections.status,
  tokenExpiresAt: channelConnections.tokenExpiresAt,
  grantedScopes: channelConnections.grantedScopes,
  webhookSubscribedAt: channelConnections.webhookSubscribedAt,
  lastWebhookAt: channelConnections.lastWebhookAt,
  lastError: channelConnections.lastError,
  autoReplyEnabled: channelConnections.autoReplyEnabled,
  createdAt: channelConnections.createdAt,
};

export async function getInstagramConnection(ctx: WorkspaceContext): Promise<InstagramConnectionView | null> {
  const db = await getDb();
  const [row] = await db
    .select(safeColumns)
    .from(channelConnections)
    .where(and(eq(channelConnections.workspaceId, ctx.workspaceId), eq(channelConnections.provider, "instagram")))
    .limit(1);
  return row ?? null;
}

export async function disconnectInstagram(ctx: WorkspaceContext) {
  assertRole(ctx, "admin");
  const db = await getDb();
  const [row] = await db
    .delete(channelConnections)
    .where(and(eq(channelConnections.workspaceId, ctx.workspaceId), eq(channelConnections.provider, "instagram")))
    .returning({ username: channelConnections.username });
  if (!row) throw notFound("Instagram connection");
  await recordActivity(ctx, { type: "integration.disconnected", summary: `Instagram account @${row.username} disconnected`, entityType: "integration" });
}

/** Opt-in switch: run automations on incoming Instagram DMs and reply through Instagram. */
export async function setInstagramAutoReply(ctx: WorkspaceContext, enabled: boolean) {
  assertRole(ctx, "admin");
  const db = await getDb();
  const [row] = await db
    .update(channelConnections)
    .set({ autoReplyEnabled: enabled, updatedAt: new Date() })
    .where(and(eq(channelConnections.workspaceId, ctx.workspaceId), eq(channelConnections.provider, "instagram")))
    .returning({ username: channelConnections.username });
  if (!row) throw notFound("Instagram connection");
  await recordActivity(ctx, {
    type: enabled ? "integration.autoreply_on" : "integration.autoreply_off",
    summary: `Instagram auto-replies ${enabled ? "enabled" : "disabled"} for @${row.username}`,
    entityType: "integration",
  });
}

/** Server-only: decrypted token for API calls. Never pass the result to client code. */
export async function getAccessTokenForConnection(connectionId: string): Promise<string | null> {
  const db = await getDb();
  const [row] = await db
    .select({ token: channelConnections.accessTokenEncrypted, status: channelConnections.status })
    .from(channelConnections)
    .where(eq(channelConnections.id, connectionId))
    .limit(1);
  if (!row?.token || row.status !== "active") return null;
  return decryptSecret(row.token);
}

/**
 * Refreshes long-lived tokens that are older than 24h and expire within 10
 * days (Meta only refreshes valid tokens ≥24h old). Expired tokens are marked
 * `token_expired` so the UI asks for a reconnect.
 */
export async function refreshInstagramTokens(now = new Date()) {
  const db = await getDb();
  await db
    .update(channelConnections)
    .set({ status: "token_expired", lastError: "Access token expired — reconnect Instagram", updatedAt: new Date() })
    .where(and(eq(channelConnections.provider, "instagram"), eq(channelConnections.status, "active"), lt(channelConnections.tokenExpiresAt, now)));

  const due = await db
    .select({ id: channelConnections.id, token: channelConnections.accessTokenEncrypted, workspaceId: channelConnections.workspaceId })
    .from(channelConnections)
    .where(
      and(
        eq(channelConnections.provider, "instagram"),
        eq(channelConnections.status, "active"),
        isNotNull(channelConnections.accessTokenEncrypted),
        lt(channelConnections.tokenExpiresAt, new Date(now.getTime() + 10 * 86_400_000)),
        lt(channelConnections.tokenRefreshedAt, new Date(now.getTime() - 86_400_000)),
      ),
    );
  let refreshed = 0;
  for (const c of due) {
    try {
      const next = await refreshLongLived(decryptSecret(c.token!));
      await db
        .update(channelConnections)
        .set({ accessTokenEncrypted: encryptSecret(next.accessToken), tokenExpiresAt: next.expiresAt, tokenRefreshedAt: new Date(), lastError: null, updatedAt: new Date() })
        .where(eq(channelConnections.id, c.id));
      refreshed++;
    } catch (err) {
      const auth = err instanceof InstagramApiError && err.kind === "auth";
      await db
        .update(channelConnections)
        .set({
          status: auth ? "token_expired" : "active",
          lastError: auth ? "Instagram rejected the token refresh — reconnect the account" : "Token refresh failed temporarily; will retry",
          updatedAt: new Date(),
        })
        .where(eq(channelConnections.id, c.id));
      logger.warn("instagram.token_refresh_failed", { connectionId: c.id, workspaceId: c.workspaceId, status: err instanceof InstagramApiError ? err.status : undefined });
    }
  }
  return refreshed;
}

const throttleKey = Symbol.for("chatspot.igRefreshAt");
/** Runs the refresh at most hourly (called from the job tick). */
export async function maybeRefreshInstagramTokens() {
  const g = globalThis as unknown as Record<symbol, number | undefined>;
  if (g[throttleKey] && Date.now() - g[throttleKey] < 3_600_000) return;
  g[throttleKey] = Date.now();
  await refreshInstagramTokens();
}

