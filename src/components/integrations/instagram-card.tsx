"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, CircleAlert, Copy, Inbox, Loader2, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RelativeTime } from "@/components/common/relative-time";
import { disconnectInstagramAction, pullInstagramMessagesAction, setInstagramAutoReplyAction, startInstagramConnectAction } from "@/app/actions/integrations";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type InstagramCardProps = {
  slug: string;
  canManage: boolean;
  missingConfig: string[];
  callbackUrl: string | null;
  verifyTokenConfigured: boolean;
  connection: {
    username: string;
    status: "active" | "token_expired" | "error" | "disconnected";
    tokenExpiresAt: string | null;
    grantedScopes: string[];
    webhookSubscribedAt: string | null;
    lastWebhookAt: string | null;
    lastError: string | null;
    autoReplyEnabled: boolean;
  } | null;
  flash: { kind: "success" | "error" | "warning"; text: string } | null;
  diagnostics: {
    ownIdHints: string[];
    receipts: { receivedAt: string; outcome: string; httpStatus: number; eventKinds: string[]; eventCount: number; mine: boolean; idHint: string | null }[];
  } | null;
};

const outcomeText: Record<string, { label: string; tone: "ok" | "bad" | "warn"; help?: string }> = {
  accepted: { label: "Accepted", tone: "ok", help: "Saved to Conversations (echoes of your own messages are ignored)." },
  bad_signature: {
    label: "Rejected: invalid signature",
    tone: "bad",
    help: "Meta signed with a secret the server doesn't have. Add META_APP_SECRET in Vercel (App settings → Basic → App secret) and redeploy.",
  },
  unknown_account: { label: "Ignored: account not connected", tone: "warn", help: "The event is for an Instagram account ID that isn't connected to any workspace." },
  not_configured: { label: "Rejected: server not configured", tone: "bad", help: "INSTAGRAM_APP_SECRET is missing on the server." },
  invalid_json: { label: "Rejected: invalid JSON", tone: "bad" },
  invalid_payload: { label: "Rejected: unexpected payload", tone: "bad" },
  ignored_object: { label: "Ignored: not an Instagram event", tone: "warn" },
};

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function InstagramCard(p: InstagramCardProps) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const c = p.connection;
  const configured = p.missingConfig.length === 0;
  const needsReconnect = c && c.status !== "active";

  const connect = () =>
    start(async () => {
      const res = await startInstagramConnectAction(p.slug);
      if (!res.ok) return void toast.error(res.error);
      window.location.assign(res.data.url); // leave the app for Instagram's consent screen
    });

  return (
    <Card id="integrations">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <InstagramGlyph className="size-5 text-pink-600" /> Instagram
        </CardTitle>
        <CardDescription>Connect a professional (Business or Creator) account to receive Direct messages in your inbox.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {p.flash && (
          <p
            role="status"
            className={cn(
              "flex items-start gap-2 rounded-lg p-3 text-sm",
              p.flash.kind === "success" && "bg-success/10 text-success",
              p.flash.kind === "error" && "bg-destructive/10 text-destructive",
              p.flash.kind === "warning" && "bg-warning/15 text-amber-800",
            )}
          >
            {p.flash.kind === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" />}
            {p.flash.text}
          </p>
        )}

        {c ? (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">@{c.username || "unknown"}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  c.status === "active" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
                )}
              >
                {c.status === "active" ? "Connected" : c.status === "token_expired" ? "Reconnect required" : c.status === "error" ? "Error" : "Disconnected"}
              </span>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Access token</dt>
              <dd>{c.tokenExpiresAt ? <>expires <RelativeTime date={c.tokenExpiresAt} /> (refreshed automatically)</> : "—"}</dd>
              <dt className="text-muted-foreground">Permissions</dt>
              <dd className="break-words">{c.grantedScopes.join(", ") || "—"}</dd>
              <dt className="text-muted-foreground">Webhook subscription</dt>
              <dd>{c.webhookSubscribedAt ? <>confirmed by Meta <RelativeTime date={c.webhookSubscribedAt} /></> : <span className="text-amber-700">not confirmed</span>}</dd>
              <dt className="text-muted-foreground">Last event received</dt>
              <dd>{c.lastWebhookAt ? <RelativeTime date={c.lastWebhookAt} /> : "none yet"}</dd>
            </dl>
            {c.lastError && (
              <p className="flex items-start gap-2 rounded-md bg-destructive/5 p-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {c.lastError}
              </p>
            )}
            <div className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 p-2.5">
              <span className="text-xs">
                <span className="block text-sm font-medium">Auto-replies</span>
                {c.autoReplyEnabled
                  ? "On — active automations answer incoming DMs through Instagram (within Meta's 24-hour window)."
                  : "Off — DMs arrive in Conversations only; nothing is sent automatically."}
              </span>
              <Switch
                checked={c.autoReplyEnabled}
                disabled={!p.canManage || pending || c.status !== "active"}
                aria-label="Instagram auto-replies"
                onCheckedChange={(v) =>
                  start(async () => {
                    const res = await setInstagramAutoReplyAction(p.slug, v);
                    if (res.ok) toast.success(res.message);
                    else toast.error(res.error);
                  })
                }
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No Instagram account connected.</p>
        )}

        {!configured && (
          <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            The server isn&apos;t configured for Instagram yet. Missing environment variables: <span className="font-mono">{p.missingConfig.join(", ")}</span>.
          </p>
        )}

        {p.canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={connect} disabled={pending || !configured}>
              {pending ? <Loader2 className="animate-spin" /> : <InstagramGlyph className="size-4" />}
              {c ? (needsReconnect ? "Reconnect Instagram" : "Reconnect / change account") : "Connect Instagram"}
            </Button>
            {c && c.status === "active" && (
              <Button
                variant="outline"
                disabled={pending}
                title="Fetch recent DMs directly from Instagram — works even when webhooks aren't delivered (e.g. unpublished Meta app)"
                onClick={() =>
                  start(async () => {
                    const res = await pullInstagramMessagesAction(p.slug);
                    if (res.ok) toast.success(res.message);
                    else toast.error(res.error);
                  })
                }
              >
                <Inbox /> Check for new DMs
              </Button>
            )}
            {c && (
              <Button variant="outline" onClick={() => setConfirm(true)} disabled={pending}>
                <Unplug /> Disconnect
              </Button>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Only workspace owners and admins can manage integrations.</p>
        )}

        {p.diagnostics && c && (
          <details className="rounded-lg border p-3 text-sm" open={p.diagnostics.receipts.some((r) => r.outcome !== "accepted")}>
            <summary className="cursor-pointer font-medium">Recent webhook deliveries</summary>
            <div className="mt-3 space-y-2 text-xs">
              {p.diagnostics.receipts.length === 0 ? (
                <div className="space-y-1 text-muted-foreground">
                  <p className="font-medium text-amber-700">No requests from Meta have reached the server yet.</p>
                  <p>Check in the Meta App Dashboard: the app is in Live mode, the webhook “messages” field is subscribed, and the account you message from isn&apos;t the connected account itself. In development mode, the sender also needs a role in the app.</p>
                </div>
              ) : (
                <ul className="divide-y rounded-md border">
                  {p.diagnostics.receipts.map((r, i) => {
                    const o = outcomeText[r.outcome] ?? { label: r.outcome, tone: "warn" as const };
                    return (
                      <li key={i} className="space-y-0.5 p-2">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className={cn("font-medium", o.tone === "ok" ? "text-success" : o.tone === "bad" ? "text-destructive" : "text-amber-700")}>{o.label}</span>
                          <span className="text-muted-foreground">HTTP {r.httpStatus}</span>
                          {r.eventCount > 0 && <span className="text-muted-foreground">· {r.eventKinds.join(", ")}</span>}
                          {r.idHint && <span className="text-muted-foreground">· account {r.idHint}</span>}
                          <RelativeTime date={r.receivedAt} className="ml-auto text-muted-foreground" />
                        </p>
                        {o.help && <p className="text-muted-foreground">{o.help}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="text-muted-foreground">Connected account IDs: {p.diagnostics.ownIdHints.join(", ") || "—"}. Message text is never stored here.</p>
            </div>
          </details>
        )}

        <details className="rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Webhook setup in Meta</summary>
          <div className="mt-3 space-y-2 text-xs">
            <p>In the Meta App Dashboard → Instagram → API setup with Instagram login → Configure webhooks, enter:</p>
            <p className="font-medium">Callback URL</p>
            {p.callbackUrl ? (
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-muted px-2 py-1">{p.callbackUrl}</code>
                <Button size="icon-sm" variant="ghost" aria-label="Copy callback URL" onClick={() => navigator.clipboard.writeText(p.callbackUrl!).then(() => toast.success("Copied"))}>
                  <Copy />
                </Button>
              </div>
            ) : (
              <p className="text-amber-700">Set APP_BASE_URL to your public HTTPS domain to see the exact URL (https://YOUR-DEPLOYED-DOMAIN/api/webhooks/instagram).</p>
            )}
            {p.callbackUrl?.startsWith("http://") && <p className="text-amber-700">Meta requires HTTPS with a valid certificate. Localhost isn&apos;t reachable by Meta without a secure tunnel.</p>}
            <p className="font-medium">Verify token</p>
            <p>{p.verifyTokenConfigured ? "The exact value of INSTAGRAM_WEBHOOK_VERIFY_TOKEN from your server environment (not shown here)." : <span className="text-amber-700">INSTAGRAM_WEBHOOK_VERIFY_TOKEN is not set — verification will fail.</span>}</p>
            <p className="text-muted-foreground">Then subscribe to the <code>messages</code> field. This page can&apos;t see whether Meta verified the URL; “Last event received” confirms delivery once messages arrive.</p>
          </div>
        </details>
      </CardContent>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect @{c?.username}?</AlertDialogTitle>
            <AlertDialogDescription>
              The stored access token is deleted and new Instagram messages will no longer arrive. Existing conversations stay in your inbox.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                start(async () => {
                  const res = await disconnectInstagramAction(p.slug);
                  if (res.ok) toast.success(res.message);
                  else toast.error(res.error);
                })
              }
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
