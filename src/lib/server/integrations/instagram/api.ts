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

/**
 * JSON.parse that keeps large integer ids exact: Meta sometimes sends ids
 * (e.g. the token exchange's user_id) as JSON numbers above 2^53, which
 * would otherwise be silently rounded (…129 → …130).
 */
export function parseJsonKeepingIds(text: string): unknown {
  return JSON.parse(text.replace(/("(?:[a-z_]*_)?id"\s*:\s*)(-?\d{16,})(?=\s*[,}\]])/g, '$1"$2"'));
}

async function call(url: string, init: RequestInit, label: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new InstagramApiError(`${label}: не удалось связаться с Instagram`, 0, "server");
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? parseJsonKeepingIds(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const err = body as { error_message?: string; error?: { message?: string; type?: string; code?: number } } | null;
    const msg = err?.error_message ?? err?.error?.message ?? `HTTP ${res.status}`;
    const kind = res.status === 429 ? "rate_limit" : res.status >= 500 ? "server" : res.status === 400 || res.status === 401 || res.status === 403 ? "auth" : "request";
    throw new InstagramApiError(`${label}: ошибка — ${msg.slice(0, 200)}`, res.status, kind);
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
  const raw = await call(IG_TOKEN_URL, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } }, "Обмен кода на токен");
  // Documented shape is { data: [...] }; accept the flat legacy shape too.
  const nested = shortLivedSchema.safeParse(raw);
  const flat = flatShortLivedSchema.safeParse(raw);
  const t = nested.success ? nested.data.data[0]! : flat.success ? flat.data : null;
  if (!t) throw new InstagramApiError("Обмен кода на токен: Instagram вернул неожиданный ответ", 502, "bad_response");
  return { accessToken: t.access_token, userId: t.user_id, scopes: scopesOf(t.permissions) };
}

/** Step 2: short-lived → long-lived token (60 days). Server-side only. */
export async function exchangeLongLived(cfg: InstagramConfig, shortLivedToken: string) {
  const url = `${IG_GRAPH_BASE}/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: cfg.appSecret, access_token: shortLivedToken })}`;
  const parsed = longLivedSchema.safeParse(await call(url, { method: "GET" }, "Получение долгосрочного токена"));
  if (!parsed.success) throw new InstagramApiError("Получение долгосрочного токена: Instagram вернул неожиданный ответ", 502, "bad_response");
  return { accessToken: parsed.data.access_token, expiresAt: new Date(Date.now() + parsed.data.expires_in * 1000) };
}

/** Refresh a long-lived token (must be ≥24h old and not expired). */
export async function refreshLongLived(token: string) {
  const url = `${IG_GRAPH_BASE}/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token })}`;
  const parsed = longLivedSchema.safeParse(await call(url, { method: "GET" }, "Продление токена"));
  if (!parsed.success) throw new InstagramApiError("Продление токена: Instagram вернул неожиданный ответ", 502, "bad_response");
  return { accessToken: parsed.data.access_token, expiresAt: new Date(Date.now() + parsed.data.expires_in * 1000) };
}

/** Profile of the connected professional account. */
export async function getProfile(cfg: InstagramConfig, token: string) {
  const url = `${IG_GRAPH_BASE}/${cfg.graphVersion}/me?${new URLSearchParams({ fields: "user_id,username", access_token: token })}`;
  const parsed = profileSchema.safeParse(await call(url, { method: "GET" }, "Запрос профиля"));
  if (!parsed.success) throw new InstagramApiError("Запрос профиля: Instagram вернул неожиданный ответ", 502, "bad_response");
  // `user_id` is the professional account id that webhooks use as entry[].id.
  const accountId = parsed.data.user_id ?? parsed.data.id;
  if (!accountId) throw new InstagramApiError("Запрос профиля: Instagram не вернул ID аккаунта", 502, "bad_response");
  return { accountId, appScopedId: parsed.data.id ?? null, username: parsed.data.username };
}

/** Subscribe the app to this account's webhook fields. */
export async function subscribeWebhooks(cfg: InstagramConfig, token: string, fields: readonly string[]) {
  const url = `${IG_GRAPH_BASE}/${cfg.graphVersion}/me/subscribed_apps?${new URLSearchParams({ subscribed_fields: fields.join(","), access_token: token })}`;
  const body = (await call(url, { method: "POST" }, "Подписка на вебхуки")) as { success?: boolean } | null;
  if (!body?.success) throw new InstagramApiError("Meta не подтвердила подписку на вебхуки", 502, "bad_response");
}

export const graphVersion = () => process.env.INSTAGRAM_GRAPH_VERSION?.trim() || "v25.0";

export type IgOutgoing =
  | { kind: "text"; text: string; quickReplies?: { title: string; payload: string }[] }
  | { kind: "buttons"; text: string; buttons: { title: string; url: string }[] };

/** POST /me/messages (Instagram API with Instagram Login). Returns Meta's message id. */
export async function sendInstagramMessage(token: string, recipientIgsid: string, out: IgOutgoing): Promise<{ messageId: string }> {
  const message =
    out.kind === "buttons"
      ? {
          attachment: {
            type: "template",
            payload: { template_type: "button", text: out.text, buttons: out.buttons.map((b) => ({ type: "web_url", url: b.url, title: b.title })) },
          },
        }
      : {
          text: out.text,
          ...(out.quickReplies?.length ? { quick_replies: out.quickReplies.map((q) => ({ content_type: "text", title: q.title, payload: q.payload })) } : {}),
        };
  const body = await call(
    `${IG_GRAPH_BASE}/${graphVersion()}/me/messages`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ recipient: { id: recipientIgsid }, message }),
    },
    "Отправка сообщения",
  );
  const parsed = z.object({ message_id: z.string() }).loose().safeParse(body);
  if (!parsed.success) throw new InstagramApiError("Отправка сообщения: Instagram вернул неожиданный ответ", 502, "bad_response");
  return { messageId: parsed.data.message_id };
}

const conversationsSchema = z.object({
  data: z.array(
    z
      .object({
        id: z.string(),
        messages: z
          .object({
            data: z.array(
              z
                .object({
                  id: z.string(),
                  created_time: z.string().optional(),
                  message: z.string().optional(),
                  from: z.object({ id: z.union([z.string(), z.number()]).transform(String), username: z.string().optional() }).loose().optional(),
                })
                .loose(),
            ),
          })
          .loose()
          .optional(),
      })
      .loose(),
  ),
});

export type IgConversationMessage = { mid: string; senderId: string; senderUsername: string; text: string; createdAt: Date | null };

/**
 * Conversations API: recent messages of the account's DM threads, newest
 * first. Works without webhooks (e.g. while the Meta app is unpublished).
 */
export async function listRecentMessages(token: string, perThread = 5): Promise<IgConversationMessage[][]> {
  const url = `${IG_GRAPH_BASE}/${graphVersion()}/me/conversations?${new URLSearchParams({
    platform: "instagram",
    fields: `messages.limit(${perThread}){id,created_time,message,from}`,
    limit: "20",
    access_token: token,
  })}`;
  const parsed = conversationsSchema.safeParse(await call(url, { method: "GET" }, "Загрузка переписок"));
  if (!parsed.success) throw new InstagramApiError("Загрузка переписок: Instagram вернул неожиданный ответ", 502, "bad_response");
  return parsed.data.data.map((c) =>
    (c.messages?.data ?? [])
      .filter((m) => m.from?.id)
      .map((m) => ({
        mid: m.id,
        senderId: m.from!.id,
        senderUsername: m.from!.username ?? "",
        text: m.message ?? "",
        createdAt: m.created_time ? new Date(m.created_time) : null,
      })),
  );
}

/** User Profile API: available once the user has messaged the account. */
export async function getMessagingUserProfile(token: string, igsid: string): Promise<{ name: string; username: string }> {
  const url = `${IG_GRAPH_BASE}/${graphVersion()}/${encodeURIComponent(igsid)}?${new URLSearchParams({ fields: "name,username", access_token: token })}`;
  const parsed = z.object({ name: z.string().optional(), username: z.string().optional() }).loose().safeParse(await call(url, { method: "GET" }, "Запрос профиля"));
  if (!parsed.success) throw new InstagramApiError("Запрос профиля: Instagram вернул неожиданный ответ", 502, "bad_response");
  return { name: parsed.data.name ?? "", username: parsed.data.username ?? "" };
}
