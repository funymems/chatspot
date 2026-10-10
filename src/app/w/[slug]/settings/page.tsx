import type { Metadata } from "next";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { requireUser, requireWorkspace } from "@/lib/server/auth/guards";
import { hasRole } from "@/lib/server/auth/context";
import { listMembers } from "@/lib/server/services/workspaces";
import { ProfileForm, WorkspaceForm } from "./settings-forms";
import { InstagramCard } from "@/components/integrations/instagram-card";
import { getInstagramConnection, getWebhookDiagnostics } from "@/lib/server/integrations/instagram/connections";
import { oauthErrorMessages } from "@/lib/server/integrations/instagram/oauth";
import { WEBHOOK_PATH, appBaseUrl, missingOAuthConfig } from "@/lib/server/integrations/instagram/config";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage({ params, searchParams }: PageProps<"/w/[slug]/settings">) {
  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title="Settings" description="Manage your workspace, members, integrations and profile." />
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsContent params={params} searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

async function SettingsContent({
  params,
  searchParams,
}: {
  params: PageProps<"/w/[slug]/settings">["params"];
  searchParams: PageProps<"/w/[slug]/settings">["searchParams"];
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const [ctx, user] = await Promise.all([requireWorkspace(slug), requireUser()]);
  const [members, ig] = await Promise.all([listMembers(ctx), getInstagramConnection(ctx)]);
  const canEdit = hasRole(ctx.role, "admin");
  const errorReason = typeof sp.instagram_error === "string" ? (sp.instagram_error as keyof typeof oauthErrorMessages) : null;
  const flash =
    sp.instagram === "connected"
      ? sp.instagram_warning === "webhook"
        ? { kind: "warning" as const, text: "Instagram connected, but Meta didn't confirm the webhook subscription. Check that the app is Live and webhooks are configured, then reconnect." }
        : { kind: "success" as const, text: "Instagram connected." }
      : errorReason && errorReason in oauthErrorMessages
        ? { kind: "error" as const, text: oauthErrorMessages[errorReason] }
        : null;
  const base = appBaseUrl();
  const diag = canEdit && ig ? await getWebhookDiagnostics(ctx) : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>
            Everything in a workspace — automations, contacts, agents — is isolated from your other workspaces.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkspaceForm slug={ctx.workspaceSlug} name={ctx.workspaceName} canEdit={canEdit} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>People with access to this workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.userId}>
                  <TableCell className="font-medium">
                    {m.fullName || "—"}
                    {m.userId === user.id && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{m.email}</TableCell>
                  <TableCell>
                    <Badge variant={m.role === "owner" ? "default" : "secondary"} className="capitalize">
                      {m.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {m.joinedAt.toLocaleDateString("en", { dateStyle: "medium" })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            Inviting teammates requires email delivery, which isn&apos;t configured in this local build.
          </p>
        </CardContent>
      </Card>

      <InstagramCard
        slug={ctx.workspaceSlug}
        canManage={canEdit}
        missingConfig={missingOAuthConfig()}
        callbackUrl={base ? `${base}${WEBHOOK_PATH}` : null}
        verifyTokenConfigured={Boolean(process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN?.trim())}
        flash={flash}
        diagnostics={
          diag ? { ownIdHints: diag.ownIdHints, receipts: diag.receipts.map((r) => ({ ...r, receivedAt: r.receivedAt.toISOString() })) } : null
        }
        connection={
          ig
            ? {
                username: ig.username,
                status: ig.status,
                tokenExpiresAt: ig.tokenExpiresAt?.toISOString() ?? null,
                grantedScopes: ig.grantedScopes,
                webhookSubscribedAt: ig.webhookSubscribedAt?.toISOString() ?? null,
                lastWebhookAt: ig.lastWebhookAt?.toISOString() ?? null,
                lastError: ig.lastError,
                autoReplyEnabled: ig.autoReplyEnabled,
              }
            : null
        }
      />

      <Card id="profile">
        <CardHeader>
          <CardTitle>Your profile</CardTitle>
          <CardDescription>Signed in as {user.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm fullName={user.fullName} />
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading settings">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-44 rounded-xl" />
      ))}
    </div>
  );
}
