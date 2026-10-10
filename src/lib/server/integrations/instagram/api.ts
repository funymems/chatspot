import "server-only";
import { z } from "zod";
import { IG_GRAPH_BASE, IG_TOKEN_URL, type InstagramConfig } from "./config";

/**
 * Thin client for the Instagram Platform endpoints we use. Errors never
 * include tokens or secrets; responses are validated before use.
 */
export class InstagramApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind: "auth" | "rate_limit" | "server" | "bad_response" | "request",
  ) {
    super(message);
    this.name = "InstagramApiError";
  }
}

async function call(url: string, init: RequestInit, label: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new InstagramApiError(`${label}: could not reach Instagram`, 0, "server");
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const err = body as { error_message?: string; error?: { message?: string; type?: string; code?: number } } | null;
    const msg = err?.error_message ?? err?.error?.message ?? `HTTP ${res.status}`;
    const kind = res.status === 429 ? "rate_limit" : res.status >= 500 ? "server" : res.status === 400 || res.status === 401 || res.status === 403 ? "auth" : "request";
    throw new InstagramApiError(`${label} failed: ${msg.slice(0, 200)}`, res.status, kind);
  }
  return body;
}

const shortLivedSchema = z.object({
  data: z
    .array(z.object({ access_token: z.string().min(1), user_id: z.union([z.string(), z.number()]).transform(String), permissions: z.union([z.string(), z.array(z.string())]).optional() }))
    .min(1),
});
const flatShortLivedSchema = z.object({
  access_token: z.string().min(1),
  user_id: z.union([z.string(), z.number()]).transform(String),
  permissions: z.union([z.string(), z.array(z.string())]).optional(),
});
const longLivedSchema = z.object({ access_token: z.string().min(1), token_type: z.string().optional(), expires_in: z.number().int().positive() });
const profileSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String).optional(),
  user_id: z.union([z.string(), z.number()]).transform(String).optional(),
  username: z.string().default(""),
});

const scopesOf = (p: string | string[] | undefined) => (Array.isArray(p) ? p : (p ?? "").split(",")).map((s) => s.trim()).filter(Boolean);

/** Step 1: authorization code → short-lived Instagram User access token. */
export async function exchangeCode(cfg: InstagramConfig, code: string) {
  const body = new URLSearchParams({
    client_id: cfg.appId,
    client_secret: cfg.appSecret,
    grant_type: "authorization_code",
    redirect_uri: cfg.redirectUri,
    code,
  });
  const raw = await call(IG_TOKEN_URL, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } }, "Code exchange");
  // Documented shape is { data: [...] }; accept the flat legacy shape too.
  const nested = shortLivedSchema.safeParse(raw);
  const flat = flatShortLivedSchema.safeParse(raw);
  const t = nested.success ? nested.data.data[0]! : flat.success ? flat.data : null;
  if (!t) throw new InstagramApiError("Code exchange returned an unexpected response", 502, "bad_response");
  return { accessToken: t.access_token, userId: t.user_id, scopes: scopesOf(t.permissions) };
}

/** Step 2: short-lived → long-lived token (60 days). Server-side only. */
export async function exchangeLongLived(cfg: InstagramConfig, shortLivedToken: string) {
  const url = `${IG_GRAPH_BASE}/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: cfg.appSecret, access_token: shortLivedToken })}`;
  const parsed = longLivedSchema.safeParse(await call(url, { method: "GET" }, "Long-lived token exchange"));
  if (!parsed.success) throw new InstagramApiError("Long-lived token exchange returned an unexpected response", 502, "bad_response");
  return { accessToken: parsed.data.access_token, expiresAt: new Date(Date.now() + parsed.data.expires_in * 1000) };
}

/** Refresh a long-lived token (must be ≥24h old and not expired). */
export async function refreshLongLived(token: string) {
  const url = `${IG_GRAPH_BASE}/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token })}`;
  const parsed = longLivedSchema.safeParse(await call(url, { method: "GET" }, "Token refresh"));
  if (!parsed.success) throw new InstagramApiError("Token refresh returned an unexpected response", 502, "bad_response");
  return { accessToken: parsed.data.access_token, expiresAt: new Date(Date.now() + parsed.data.expires_in * 1000) };
}

/** Profile of the connected professional account. */
export async function getProfile(cfg: InstagramConfig, token: string) {
  const url = `${IG_GRAPH_BASE}/${cfg.graphVersion}/me?${new URLSearchParams({ fields: "user_id,username", access_token: token })}`;
  const parsed = profileSchema.safeParse(await call(url, { method: "GET" }, "Profile lookup"));
  if (!parsed.success) throw new InstagramApiError("Profile lookup returned an unexpected response", 502, "bad_response");
  // `user_id` is the professional account id that webhooks use as entry[].id.
  const accountId = parsed.data.user_id ?? parsed.data.id;
  if (!accountId) throw new InstagramApiError("Profile lookup returned no account id", 502, "bad_response");
  return { accountId, appScopedId: parsed.data.id ?? null, username: parsed.data.username };
}

/** Subscribe the app to this account's webhook fields. */
export async function subscribeWebhooks(cfg: InstagramConfig, token: string, fields: readonly string[]) {
  const url = `${IG_GRAPH_BASE}/${cfg.graphVersion}/me/subscribed_apps?${new URLSearchParams({ subscribed_fields: fields.join(","), access_token: token })}`;
  const body = (await call(url, { method: "POST" }, "Webhook subscription")) as { success?: boolean } | null;
  if (!body?.success) throw new InstagramApiError("Webhook subscription was not confirmed by Meta", 502, "bad_response");
}
