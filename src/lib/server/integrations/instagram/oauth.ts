import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, lt, ne } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { channelConnections, oauthStates, workspaces } from "@/lib/server/db/schema";
import type { WorkspaceContext } from "@/lib/server/auth/context";
import { hasRole } from "@/lib/server/auth/context";
import { AppError, forbidden } from "@/lib/server/errors";
import { logger } from "@/lib/server/logger";
import { recordActivity } from "@/lib/server/services/activity";
import { encryptSecret } from "@/lib/server/integrations/token-crypto";
import { IG_AUTHORIZE_URL, IG_SCOPES, IG_WEBHOOK_FIELDS, getInstagramConfig, missingOAuthConfig } from "./config";
import { InstagramApiError, exchangeCode, exchangeLongLived, getProfile, subscribeWebhooks } from "./api";

const STATE_TTL_MS = 10 * 60 * 1000;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Starts the Instagram Login flow for a workspace. Only owners/admins may
 * connect accounts. Returns the authorize URL to redirect the browser to.
 */
export async function startInstagramConnect(ctx: WorkspaceContext): Promise<string> {
  if (!hasRole(ctx.role, "admin")) throw forbidden("Подключать Instagram могут только владельцы и администраторы рабочего пространства");
  const missing = missingOAuthConfig();
  if (missing.length) throw new AppError(`Instagram ещё не настроен на сервере (не заданы: ${missing.join(", ")})`, "validation");
  const cfg = getInstagramConfig()!;
  const state = randomBytes(32).toString("base64url");
  const db = await getDb();
  await db.delete(oauthStates).where(lt(oauthStates.expiresAt, new Date())); // housekeeping
  await db.insert(oauthStates).values({
    id: hash(state),
    provider: "instagram",
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    expiresAt: new Date(Date.now() + STATE_TTL_MS),
  });
  const params = new URLSearchParams({
    client_id: cfg.appId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: IG_SCOPES.join(","),
    state,
  });
  return `${IG_AUTHORIZE_URL}?${params}`;
}

export type OAuthOutcome =
  | { ok: true; workspaceSlug: string; username: string; webhookSubscribed: boolean }
  | { ok: false; workspaceSlug: string | null; reason: "state" | "cancelled" | "denied_scopes" | "provider_error" | "exchange_failed" | "already_connected" | "config" | "forbidden" };

/**
 * Completes the callback. `currentUserId` comes from the session cookie; the
 * state must have been issued to that same user (CSRF / login-swap protection).
 * Query params are untrusted: only `state`, `code`, `error*` are read.
 */
export async function completeInstagramOAuth(input: {
  currentUserId: string | null;
  state: string | null;
  code: string | null;
  error: string | null;
  errorReason: string | null;
}): Promise<OAuthOutcome> {
  const db = await getDb();
  if (!input.state) return { ok: false, workspaceSlug: null, reason: "state" };

  // Consume the state (single use) whatever happens next.
  const [stored] = await db.delete(oauthStates).where(eq(oauthStates.id, hash(input.state))).returning();
  if (!stored || stored.provider !== "instagram" || stored.expiresAt.getTime() < Date.now() || stored.userId !== input.currentUserId) {
    logger.warn("instagram.oauth.state_rejected", { found: Boolean(stored) });
    return { ok: false, workspaceSlug: null, reason: "state" };
  }
  const [ws] = await db.select({ slug: workspaces.slug }).from(workspaces).where(eq(workspaces.id, stored.workspaceId)).limit(1);
  const slug = ws?.slug ?? null;

  if (input.error) {
    const cancelled = input.error === "access_denied" || input.errorReason === "user_denied";
    logger.info("instagram.oauth.denied", { workspaceId: stored.workspaceId, error: input.error, reason: input.errorReason });
    return { ok: false, workspaceSlug: slug, reason: cancelled ? "cancelled" : "provider_error" };
  }
  if (!input.code) return { ok: false, workspaceSlug: slug, reason: "provider_error" };

  const cfg = getInstagramConfig();
  if (!cfg) return { ok: false, workspaceSlug: slug, reason: "config" };

  try {
    // Meta appends "#_" to the redirect; strip it defensively.
    const code = input.code.replace(/#_$/, "");
    const short = await exchangeCode(cfg, code);
    const missingScopes = short.scopes.length ? IG_SCOPES.filter((s) => !short.scopes.includes(s)) : [];
    if (missingScopes.length) {
      logger.info("instagram.oauth.missing_scopes", { workspaceId: stored.workspaceId, missingScopes });
      return { ok: false, workspaceSlug: slug, reason: "denied_scopes" };
    }
    const long = await exchangeLongLived(cfg, short.accessToken);
    const profile = await getProfile(cfg, long.accessToken);

    // An Instagram account can only be connected to one workspace.
    const [taken] = await db
      .select({ workspaceId: channelConnections.workspaceId })
      .from(channelConnections)
      .where(and(eq(channelConnections.provider, "instagram"), eq(channelConnections.providerAccountId, profile.accountId), ne(channelConnections.workspaceId, stored.workspaceId), ne(channelConnections.status, "disconnected")))
      .limit(1);
    if (taken) return { ok: false, workspaceSlug: slug, reason: "already_connected" };

    let webhookSubscribedAt: Date | null = null;
    let lastError: string | null = null;
    try {
      await subscribeWebhooks(cfg, long.accessToken, IG_WEBHOOK_FIELDS);
      webhookSubscribedAt = new Date();
    } catch (err) {
      lastError = err instanceof Error ? `Подписка на вебхуки: ${err.message}` : "Не удалось подписаться на вебхуки";
      logger.warn("instagram.webhook_subscribe_failed", { workspaceId: stored.workspaceId, status: err instanceof InstagramApiError ? err.status : undefined });
    }

    const values = {
      workspaceId: stored.workspaceId,
      provider: "instagram",
      providerAccountId: profile.accountId,
      providerUserId: short.userId,
      username: profile.username,
      status: "active" as const,
      accessTokenEncrypted: encryptSecret(long.accessToken),
      tokenExpiresAt: long.expiresAt,
      tokenRefreshedAt: new Date(),
      grantedScopes: short.scopes.length ? short.scopes : [...IG_SCOPES],
      webhookSubscribedAt,
      lastError,
      connectedBy: stored.userId,
      updatedAt: new Date(),
    };
    await db
      .insert(channelConnections)
      .values(values)
      .onConflictDoUpdate({ target: [channelConnections.provider, channelConnections.providerAccountId], set: values });

    await recordActivity(
      { workspaceId: stored.workspaceId, userId: stored.userId },
      { type: "integration.connected", summary: `Подключён аккаунт Instagram @${profile.username || profile.accountId}`, entityType: "integration" },
    );
    logger.info("instagram.connected", { workspaceId: stored.workspaceId, webhookSubscribed: Boolean(webhookSubscribedAt) });
    return { ok: true, workspaceSlug: slug!, username: profile.username, webhookSubscribed: Boolean(webhookSubscribedAt) };
  } catch (err) {
    logger.warn("instagram.oauth.exchange_failed", {
      workspaceId: stored.workspaceId,
      status: err instanceof InstagramApiError ? err.status : undefined,
      kind: err instanceof InstagramApiError ? err.kind : "unknown",
    });
    return { ok: false, workspaceSlug: slug, reason: "exchange_failed" };
  }
}

export const oauthErrorMessages: Record<Exclude<OAuthOutcome, { ok: true }>["reason"], string> = {
  state: "Запрос на подключение устарел или не совпал с вашей сессией. Попробуйте ещё раз.",
  cancelled: "Авторизация в Instagram отменена.",
  denied_scopes: "Не все нужные разрешения выданы. Переподключите аккаунт и разрешите доступ к сообщениям.",
  provider_error: "Instagram вернул ошибку при авторизации. Попробуйте ещё раз.",
  exchange_failed: "Не удалось завершить подключение к Instagram. Проверьте данные приложения и попробуйте ещё раз.",
  already_connected: "Этот аккаунт Instagram уже подключён к другому рабочему пространству.",
  config: "Instagram не настроен на сервере.",
  forbidden: "У вас нет прав подключать Instagram в этом рабочем пространстве.",
};
