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

const roleLabels = { owner: "Владелец", admin: "Администратор", member: "Участник" } as const;

export const metadata: Metadata = { title: "Настройки" };

export default function SettingsPage({ params, searchParams }: PageProps<"/w/[slug]/settings">) {
  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title="Настройки" description="Рабочее пространство, участники, интеграции и профиль." />
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
    sp.tiktok === "soon"
      ? { kind: "warning" as const, text: "Подключение TikTok скоро будет доступно — сейчас интеграция ожидает одобрения со стороны TikTok." }
      : sp.instagram === "connected"
      ? sp.instagram_warning === "webhook"
        ? { kind: "warning" as const, text: "Instagram подключён, но Meta не подтвердила подписку на вебхуки. Проверьте, что приложение опубликовано и вебхуки настроены, затем переподключите аккаунт." }
        : { kind: "success" as const, text: "Instagram подключён." }
      : errorReason && errorReason in oauthErrorMessages
        ? { kind: "error" as const, text: oauthErrorMessages[errorReason] }
        : null;
  const base = appBaseUrl();
  const diag = canEdit && ig ? await getWebhookDiagnostics(ctx) : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Рабочее пространство</CardTitle>
          <CardDescription>
            Всё в рабочем пространстве — автоматизации, контакты, агенты — отделено от других ваших пространств.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkspaceForm slug={ctx.workspaceSlug} name={ctx.workspaceName} canEdit={canEdit} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Участники</CardTitle>
          <CardDescription>Люди с доступом к этому рабочему пространству.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Имя</TableHead>
                <TableHead>Эл. почта</TableHead>
                <TableHead>Роль</TableHead>
                <TableHead className="text-right">Добавлен</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.userId}>
                  <TableCell className="font-medium">
                    {m.fullName || "—"}
                    {m.userId === user.id && <span className="ml-1.5 text-xs text-muted-foreground">(вы)</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{m.email}</TableCell>
                  <TableCell>
                    <Badge variant={m.role === "owner" ? "default" : "secondary"}>
                      {roleLabels[m.role]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {m.joinedAt.toLocaleDateString("ru", { dateStyle: "medium" })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            Чтобы приглашать коллег, нужна отправка писем — она пока не настроена.
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
          <CardTitle>Ваш профиль</CardTitle>
          <CardDescription>Вы вошли как {user.email}</CardDescription>
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
    <div className="space-y-6" role="status" aria-label="Загрузка настроек">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-44 rounded-xl" />
      ))}
    </div>
  );
}
