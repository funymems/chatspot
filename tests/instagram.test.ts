import { createHmac, randomBytes } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { useTestDatabase } from "@/test/db";
import type { Database } from "@/lib/server/db/client";
import { channelConnections, contacts, conversations, messages } from "@/lib/server/db/schema";
import { registerUser } from "@/lib/server/services/accounts";
import { resolveWorkspaceAccess } from "@/lib/server/services/workspaces";
import { completeInstagramOAuth, startInstagramConnect } from "@/lib/server/integrations/instagram/oauth";
import { disconnectInstagram, getInstagramConnection, refreshInstagramTokens, setInstagramAutoReply, getWebhookDiagnostics } from "@/lib/server/integrations/instagram/connections";
import { activateAutomation, createAutomation } from "@/lib/server/services/automations";
import { createAutomationFromTemplate, listTemplates } from "@/lib/server/services/templates";
import { sendHumanReply } from "@/lib/server/services/inbox";
import { isValidSignature, receiveWebhook, verifySubscription } from "@/lib/server/integrations/instagram/webhook";
import { decryptSecret } from "@/lib/server/integrations/token-crypto";
import { processDueJobs } from "@/lib/server/jobs/worker";
import { GET as webhookGET } from "@/app/api/webhooks/instagram/route";
import type { WorkspaceContext } from "@/lib/server/auth/context";

const APP_SECRET = "test-instagram-app-secret";
const VERIFY = "verify-me-123";
const IG_ACCOUNT = "17841400000000001";

let db: Database;
let ctx: WorkspaceContext;
let other: WorkspaceContext;

beforeAll(async () => {
  Object.assign(process.env, {
    INSTAGRAM_APP_ID: "1234567890",
    INSTAGRAM_APP_SECRET: APP_SECRET,
    INSTAGRAM_WEBHOOK_VERIFY_TOKEN: VERIFY,
    APP_BASE_URL: "https://app.example.test",
    TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  });
  delete process.env.META_APP_SECRET;
  db = await useTestDatabase();
  const a = await registerUser({ fullName: "Owner A", email: "owner-a@example.test", password: "password-aaaa" });
  const b = await registerUser({ fullName: "Owner B", email: "owner-b@example.test", password: "password-bbbb" });
  ctx = (await resolveWorkspaceAccess(a.userId, a.workspace.slug))!;
  other = (await resolveWorkspaceAccess(b.userId, b.workspace.slug))!;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Mocks the four Meta calls of a successful connection. */
const sentBodies: { recipient: { id: string }; message: Record<string, unknown> }[] = [];

function mockMeta(opts: { accountId?: string; failExchange?: boolean; subscribeOk?: boolean } = {}) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url.split("?")[0]}`);
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      if (url.startsWith("https://api.instagram.com/oauth/access_token")) {
        if (opts.failExchange) return json({ error_type: "OAuthException", code: 400, error_message: "Matching code was not found or was already used" }, 400);
        return json({ data: [{ access_token: "SHORT-TOKEN", user_id: "111", permissions: "instagram_business_basic,instagram_business_manage_messages" }] });
      }
      if (url.startsWith("https://graph.instagram.com/access_token")) return json({ access_token: "LONG-TOKEN", token_type: "bearer", expires_in: 5183944 });
      if (url.startsWith("https://graph.instagram.com/refresh_access_token")) return json({ access_token: "REFRESHED-TOKEN", token_type: "bearer", expires_in: 5183944 });
      if (url.includes("/me/messages")) {
        sentBodies.push(JSON.parse(String(init?.body)));
        return json({ recipient_id: "x", message_id: `mid.out.${sentBodies.length}` });
      }
      if (/\/v25\.0\/\d+\?fields=name/.test(url)) return json({ name: "Dana Bek", username: "dana.bek" });
      if (url.includes("/me/subscribed_apps")) return opts.subscribeOk === false ? json({ error: { message: "App not live" } }, 400) : json({ success: true });
      if (url.includes("/me?")) return json({ user_id: opts.accountId ?? IG_ACCOUNT, username: "bloom.studio", id: "111" });
      return json({ error: { message: "unexpected" } }, 404);
    }),
  );
  return calls;
}

async function startState(c: WorkspaceContext) {
  const url = new URL(await startInstagramConnect(c));
  return { url, state: url.searchParams.get("state")! };
}

describe("Instagram OAuth", () => {
  it("builds the official Instagram Login authorize URL with minimal scopes and state", async () => {
    const { url, state } = await startState(ctx);
    expect(`${url.origin}${url.pathname}`).toBe("https://www.instagram.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("1234567890");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.example.test/api/integrations/instagram/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_manage_messages");
    expect(state.length).toBeGreaterThan(30);
  });

  it("rejects non-admins", async () => {
    await expect(startInstagramConnect({ ...ctx, role: "member" })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("rejects a state that is unknown, reused, or issued to another user", async () => {
    mockMeta();
    expect(await completeInstagramOAuth({ currentUserId: ctx.userId, state: "forged", code: "c", error: null, errorReason: null })).toMatchObject({ ok: false, reason: "state" });
    const { state } = await startState(ctx);
    expect(await completeInstagramOAuth({ currentUserId: other.userId, state, code: "c", error: null, errorReason: null })).toMatchObject({ ok: false, reason: "state" });
    // consumed even on mismatch → can't be replayed by the right user either
    expect(await completeInstagramOAuth({ currentUserId: ctx.userId, state, code: "c", error: null, errorReason: null })).toMatchObject({ ok: false, reason: "state" });
    expect(await completeInstagramOAuth({ currentUserId: ctx.userId, state: null, code: "c", error: null, errorReason: null })).toMatchObject({ ok: false, reason: "state" });
  });

  it("handles a cancelled authorization", async () => {
    const calls = mockMeta();
    const { state } = await startState(ctx);
    const res = await completeInstagramOAuth({ currentUserId: ctx.userId, state, code: null, error: "access_denied", errorReason: "user_denied" });
    expect(res).toEqual({ ok: false, workspaceSlug: ctx.workspaceSlug, reason: "cancelled" });
    expect(calls).toEqual([]);
  });

  it("handles a failed code exchange without storing anything", async () => {
    mockMeta({ failExchange: true });
    const { state } = await startState(ctx);
    const res = await completeInstagramOAuth({ currentUserId: ctx.userId, state, code: "used-code", error: null, errorReason: null });
    expect(res).toMatchObject({ ok: false, reason: "exchange_failed" });
    expect(await getInstagramConnection(ctx)).toBeNull();
  });

  it("connects: exchanges tokens server-side, stores the token encrypted and subscribes webhooks", async () => {
    const calls = mockMeta();
    const { state } = await startState(ctx);
    const res = await completeInstagramOAuth({ currentUserId: ctx.userId, state, code: "AUTH-CODE#_", error: null, errorReason: null });
    expect(res).toEqual({ ok: true, workspaceSlug: ctx.workspaceSlug, username: "bloom.studio", webhookSubscribed: true });
    expect(calls).toEqual([
      "POST https://api.instagram.com/oauth/access_token",
      "GET https://graph.instagram.com/access_token",
      "GET https://graph.instagram.com/v25.0/me",
      "POST https://graph.instagram.com/v25.0/me/subscribed_apps",
    ]);
    const [row] = await db.select().from(channelConnections).where(eq(channelConnections.workspaceId, ctx.workspaceId));
    expect(row!.accessTokenEncrypted).not.toContain("LONG-TOKEN");
    expect(decryptSecret(row!.accessTokenEncrypted!)).toBe("LONG-TOKEN");
    expect(row!.providerAccountId).toBe(IG_ACCOUNT);
    const view = await getInstagramConnection(ctx);
    expect(view).toMatchObject({ username: "bloom.studio", status: "active" });
    expect(JSON.stringify(view)).not.toContain("TOKEN"); // client-safe view
  });

  it("isolates connections between workspaces", async () => {
    expect(await getInstagramConnection(other)).toBeNull();
    await expect(disconnectInstagram(other)).rejects.toMatchObject({ code: "not_found" });
    // the same Instagram account can't be attached to a second workspace
    mockMeta();
    const { state } = await startState(other);
    expect(await completeInstagramOAuth({ currentUserId: other.userId, state, code: "x", error: null, errorReason: null })).toMatchObject({
      ok: false,
      reason: "already_connected",
    });
  });
});

const sign = (body: string, secret = APP_SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
const dm = (mid: string, text: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    object: "instagram",
    entry: [{ id: IG_ACCOUNT, time: 1760000000, messaging: [{ sender: { id: "999" }, recipient: { id: IG_ACCOUNT }, timestamp: 1760000000000, message: { mid, text, ...extra } }] }],
  });

describe("Instagram webhook verification (GET)", () => {
  const q = (p: Record<string, string>) => new URLSearchParams(p);
  it("returns the challenge for a valid subscription request", async () => {
    expect(verifySubscription(q({ "hub.mode": "subscribe", "hub.verify_token": VERIFY, "hub.challenge": "1158201444" }))).toMatchObject({ status: 200, body: "1158201444" });
    const res = await webhookGET(new Request(`https://app.example.test/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=42`));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("42");
  });
  it("rejects an incorrect token without revealing the expected one", () => {
    const r = verifySubscription(q({ "hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "1" }));
    expect(r.status).toBe(403);
    expect(r.body).not.toContain(VERIFY);
    expect(verifySubscription(q({ "hub.mode": "unsubscribe", "hub.verify_token": VERIFY, "hub.challenge": "1" })).status).toBe(403);
  });
  it("rejects missing parameters", () => {
    expect(verifySubscription(q({ "hub.mode": "subscribe", "hub.challenge": "1" })).status).toBe(400);
    expect(verifySubscription(q({})).status).toBe(400);
  });
});

describe("Instagram webhook events (POST)", () => {
  it("validates signatures over the raw body", () => {
    const body = dm("m-sig", "hi");
    expect(isValidSignature(body, sign(body), [APP_SECRET])).toBe(true);
    expect(isValidSignature(body + " ", sign(body), [APP_SECRET])).toBe(false);
    expect(isValidSignature(body, sign(body, "wrong-secret"), [APP_SECRET])).toBe(false);
    expect(isValidSignature(body, null, [APP_SECRET])).toBe(false);
    expect(isValidSignature(body, "sha256=xyz", [APP_SECRET])).toBe(false);
  });

  it("rejects invalid signatures and invalid payloads", async () => {
    const body = dm("m-x", "hi");
    expect((await receiveWebhook(body, sign(body, "attacker"))).status).toBe(401);
    expect((await receiveWebhook(body, null)).status).toBe(401);
    expect((await receiveWebhook("not json", sign("not json"))).status).toBe(400);
    const bad = JSON.stringify({ foo: 1 });
    expect((await receiveWebhook(bad, sign(bad))).status).toBe(400);
  });

  it("accepts a valid DM, processes it asynchronously into the right workspace's inbox", async () => {
    const body = dm("m-1", "Hello from Instagram");
    const res = await receiveWebhook(body, sign(body));
    expect(res).toEqual({ status: 200, body: "EVENT_RECEIVED" });
    // nothing stored until the job runs
    expect(await db.select().from(messages).where(eq(messages.body, "Hello from Instagram"))).toHaveLength(0);
    await processDueJobs(new Date());
    const [msg] = await db.select().from(messages).where(eq(messages.body, "Hello from Instagram"));
    expect(msg).toMatchObject({ workspaceId: ctx.workspaceId, kind: "inbound", source: "contact" });
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, msg!.conversationId));
    expect(conv!.channel).toBe("instagram");
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, conv!.contactId!));
    expect(contact).toMatchObject({ source: "instagram", channelUserId: "999" });
    // nothing was sent back (auto-replies are not enabled)
    expect(await db.select().from(messages).where(and(eq(messages.conversationId, conv!.id), eq(messages.kind, "outbound")))).toHaveLength(0);
    expect((await getInstagramConnection(ctx))!.lastWebhookAt).not.toBeNull();
  });

  it("handles duplicate deliveries idempotently", async () => {
    const body = dm("m-dup", "Only once please");
    await receiveWebhook(body, sign(body));
    await receiveWebhook(body, sign(body)); // identical retry
    const variant = JSON.stringify({ ...JSON.parse(body), entry: [{ ...JSON.parse(body).entry[0], time: 1760000999 }] }); // same mid, different envelope
    await receiveWebhook(variant, sign(variant));
    await processDueJobs(new Date());
    await processDueJobs(new Date());
    expect(await db.select().from(messages).where(eq(messages.body, "Only once please"))).toHaveLength(1);
  });

  it("ignores echoes, unknown accounts and other objects without failing", async () => {
    const echo = dm("m-echo", "sent from the IG app", { is_echo: true });
    expect((await receiveWebhook(echo, sign(echo))).status).toBe(200);
    const unknown = JSON.stringify({ object: "instagram", entry: [{ id: "55555", messaging: [{ sender: { id: "1" }, message: { mid: "m-u", text: "who?" } }] }] });
    expect((await receiveWebhook(unknown, sign(unknown))).status).toBe(200);
    const page = JSON.stringify({ object: "page", entry: [{ id: "1" }] });
    expect((await receiveWebhook(page, sign(page))).status).toBe(200);
    await processDueJobs(new Date());
    expect(await db.select().from(messages).where(eq(messages.body, "sent from the IG app"))).toHaveLength(0);
    expect(await db.select().from(messages).where(eq(messages.body, "who?"))).toHaveLength(0);
  });
});

describe("Instagram replies through automations", () => {
  const dmFrom = (sender: string, mid: string, text: string) =>
    JSON.stringify({ object: "instagram", entry: [{ id: IG_ACCOUNT, time: 1, messaging: [{ sender: { id: sender }, recipient: { id: IG_ACCOUNT }, timestamp: Date.now(), message: { mid, text } }] }] });
  const deliver = async (body: string) => {
    expect((await receiveWebhook(body, sign(body))).status).toBe(200);
    await processDueJobs(new Date());
  };

  it("stores DMs but sends nothing while auto-replies are off", async () => {
    mockMeta();
    sentBodies.length = 0;
    const flow = await createAutomation(ctx, { name: "IG hello" }); // keyword "привет" → message → end
    await activateAutomation(ctx, flow.id);
    await deliver(dmFrom("2001", "m-off", "привет"));
    expect(sentBodies).toHaveLength(0);
    const [contact] = await db.select().from(contacts).where(and(eq(contacts.workspaceId, ctx.workspaceId), eq(contacts.channelUserId, "2001")));
    expect(contact).toMatchObject({ firstName: "Dana", lastName: "Bek", customFields: { instagram_username: "dana.bek" } });
  });

  it("replies via the official API when enabled, rendering variables, and records it as sent", async () => {
    mockMeta();
    sentBodies.length = 0;
    await setInstagramAutoReply(ctx, true);
    await deliver(dmFrom("2002", "m-on", "привет всем"));
    expect(sentBodies).toHaveLength(1);
    expect(sentBodies[0]!.recipient.id).toBe("2002");
    expect(String(sentBodies[0]!.message.text)).toContain("Привет, Dana!");
    const out = await db.select().from(messages).where(and(eq(messages.workspaceId, ctx.workspaceId), eq(messages.kind, "outbound"), eq(messages.deliveryStatus, "sent")));
    expect(out.some((m) => (m.payload as { externalId?: string }).externalId === "mid.out.1")).toBe(true);
  });

  it("maps quick replies and link buttons to Instagram formats", async () => {
    mockMeta();
    sentBodies.length = 0;
    const t = (await listTemplates(ctx)).find((x) => x.slug === "course-sales")!;
    const course = await createAutomationFromTemplate(ctx, t.id);
    await activateAutomation(ctx, course.id);
    await deliver(dmFrom("2003", "m-c1", "КУРС"));
    expect(sentBodies[0]!.message).toMatchObject({ quick_replies: [{ content_type: "text", title: "Для начинающих", payload: "Для начинающих" }, { content_type: "text", title: "Продвинутый" }] });
    await deliver(dmFrom("2003", "m-c2", "Для начинающих"));
    const tmpl = sentBodies[1]!.message as { attachment: { payload: { template_type: string; buttons: { type: string; url: string }[] } } };
    expect(tmpl.attachment.payload.template_type).toBe("button");
    expect(tmpl.attachment.payload.buttons[0]).toMatchObject({ type: "web_url", url: "https://example.com/courses/beginner" });
  });

  it("refuses to reply outside the 24-hour window", async () => {
    mockMeta();
    const [conv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .innerJoin(contacts, eq(contacts.id, conversations.contactId))
      .where(and(eq(conversations.workspaceId, ctx.workspaceId), eq(contacts.channelUserId, "2002")));
    await db.update(messages).set({ createdAt: new Date(Date.now() - 25 * 3_600_000) }).where(eq(messages.conversationId, conv!.id));
    await expect(sendHumanReply(ctx, conv!.id, "late reply")).rejects.toMatchObject({ message: expect.stringContaining("24-часовое") });
    await setInstagramAutoReply(ctx, false);
  });
});

describe("webhook payload formats", () => {
  it("accepts the App Dashboard test format (changes[] with field messages)", async () => {
    const body = JSON.stringify({
      object: "instagram",
      entry: [{ id: IG_ACCOUNT, time: 1760000000, changes: [{ field: "messages", value: { sender: { id: "4001" }, recipient: { id: IG_ACCOUNT }, timestamp: "1527459824", message: { mid: "m-changes", text: "from changes format" } } }] }],
    });
    expect((await receiveWebhook(body, sign(body))).status).toBe(200);
    await processDueJobs(new Date());
    expect(await db.select().from(messages).where(eq(messages.body, "from changes format"))).toHaveLength(1);
  });
});

describe("webhook diagnostics", () => {
  it("records outcomes without message content and matches the token's user id too", async () => {
    const bad = dm("m-diag-bad", "secret text");
    await receiveWebhook(bad, sign(bad, "wrong"));
    // entry.id = app-scoped user id from the token exchange ("111") instead of the account id
    const alt = JSON.stringify({ object: "instagram", entry: [{ id: "111", messaging: [{ sender: { id: "3001" }, message: { mid: "m-diag-alt", text: "via user id" } }] }] });
    expect((await receiveWebhook(alt, sign(alt))).status).toBe(200);
    await processDueJobs(new Date());
    expect(await db.select().from(messages).where(eq(messages.body, "via user id"))).toHaveLength(1);

    const d = await getWebhookDiagnostics(ctx);
    const outcomes = d.receipts.map((r) => r.outcome);
    expect(outcomes).toEqual(expect.arrayContaining(["bad_signature", "accepted"]));
    expect(JSON.stringify(d)).not.toContain("secret text");
    // another workspace with no connection sees nothing about this account
    expect((await getWebhookDiagnostics(other)).receipts.every((r) => !r.mine)).toBe(true);
  });
});

describe("token lifecycle", () => {
  it("refreshes tokens close to expiry and flags expired ones for reconnect", async () => {
    mockMeta();
    const [row] = await db.select().from(channelConnections).where(eq(channelConnections.workspaceId, ctx.workspaceId));
    await db
      .update(channelConnections)
      .set({ tokenExpiresAt: new Date(Date.now() + 3 * 86_400_000), tokenRefreshedAt: new Date(Date.now() - 50 * 86_400_000) })
      .where(eq(channelConnections.id, row!.id));
    expect(await refreshInstagramTokens()).toBe(1);
    const [after] = await db.select().from(channelConnections).where(eq(channelConnections.id, row!.id));
    expect(decryptSecret(after!.accessTokenEncrypted!)).toBe("REFRESHED-TOKEN");

    await db.update(channelConnections).set({ tokenExpiresAt: new Date(Date.now() - 1000) }).where(eq(channelConnections.id, row!.id));
    await refreshInstagramTokens();
    expect((await getInstagramConnection(ctx))!.status).toBe("token_expired");
  });
});
