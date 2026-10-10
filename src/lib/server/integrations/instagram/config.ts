import "server-only";

/**
 * Instagram API with Instagram Login ("Business Login for Instagram").
 * Endpoints and scopes verified against developers.facebook.com
 * (instagram-platform/instagram-api-with-instagram-login/business-login,
 * instagram-platform/webhooks) on 2026-10-10.
 *
 * NOTE: Instagram Login uses the *Instagram* app ID/secret shown under
 * App Dashboard → Instagram → API setup with Instagram login — not the
 * Facebook Login for Business flow, whose endpoints, scopes and tokens differ.
 */
export const IG_AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
export const IG_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
export const IG_GRAPH_BASE = "https://graph.instagram.com";

/** Only what the implemented features need: profile + receiving DMs. */
export const IG_SCOPES = ["instagram_business_basic", "instagram_business_manage_messages"] as const;

/** Webhook fields subscribed on connect (DMs only; comments need extra scope + Advanced Access). */
export const IG_WEBHOOK_FIELDS = ["messages"] as const;

export const WEBHOOK_PATH = "/api/webhooks/instagram";
export const CALLBACK_PATH = "/api/integrations/instagram/callback";

export type InstagramConfig = {
  appId: string;
  appSecret: string;
  /** Optional extra secret accepted for webhook signatures (Meta app secret from Settings → Basic). */
  metaAppSecret: string | null;
  redirectUri: string;
  webhookVerifyToken: string | null;
  graphVersion: string;
  appBaseUrl: string | null;
};

const env = (k: string) => process.env[k]?.trim() || null;

export function appBaseUrl(): string | null {
  return env("APP_BASE_URL")?.replace(/\/+$/, "") ?? null;
}

/** What's missing for OAuth to work (empty = ready). Never returns secret values. */
export function missingOAuthConfig(): string[] {
  const missing: string[] = [];
  if (!env("INSTAGRAM_APP_ID")) missing.push("INSTAGRAM_APP_ID");
  if (!env("INSTAGRAM_APP_SECRET")) missing.push("INSTAGRAM_APP_SECRET");
  if (!env("INSTAGRAM_REDIRECT_URI") && !appBaseUrl()) missing.push("INSTAGRAM_REDIRECT_URI or APP_BASE_URL");
  if (!env("TOKEN_ENCRYPTION_KEY")) missing.push("TOKEN_ENCRYPTION_KEY");
  return missing;
}

export function getInstagramConfig(): InstagramConfig | null {
  if (missingOAuthConfig().length) return null;
  return {
    appId: env("INSTAGRAM_APP_ID")!,
    appSecret: env("INSTAGRAM_APP_SECRET")!,
    metaAppSecret: env("META_APP_SECRET"),
    redirectUri: env("INSTAGRAM_REDIRECT_URI") ?? `${appBaseUrl()}${CALLBACK_PATH}`,
    webhookVerifyToken: env("INSTAGRAM_WEBHOOK_VERIFY_TOKEN"),
    graphVersion: env("INSTAGRAM_GRAPH_VERSION") ?? "v25.0",
    appBaseUrl: appBaseUrl(),
  };
}

/** Secrets accepted for X-Hub-Signature-256 verification. */
export function webhookSigningSecrets(): string[] {
  return [env("INSTAGRAM_APP_SECRET"), env("META_APP_SECRET")].filter((s): s is string => Boolean(s));
}
