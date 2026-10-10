import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, CircleAlert, GitCommitVertical, Info, PencilRuler } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { AutomationStatusBadge, triggerLabels } from "@/components/automations/status-badge";
import { FlowPreview } from "@/components/flow/flow-preview";
import { RelativeTime } from "@/components/common/relative-time";
import { requireWorkspace } from "@/lib/server/auth/guards";
import { AppError } from "@/lib/server/errors";
import { getAutomation, validateAutomation } from "@/lib/server/services/automations";
import { listExecutions } from "@/lib/server/services/executions";
import { RunStatusBadge } from "@/components/automations/run-status";
import { nodeDisplayName } from "@/lib/domain/graph/validate";
import { idSchema } from "@/lib/validation/automation";
import { AutomationDetailsForm, AutomationHeaderActions } from "./automation-detail-client";

const originLabels: Record<string, string> = { scratch: "с нуля", template: "из шаблона", ai: "по описанию (ИИ)", duplicate: "копированием" };

export const metadata: Metadata = { title: "Автоматизация" };

type Props = PageProps<"/w/[slug]/automations/[id]">;

export default function AutomationPage({ params }: Props) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <AutomationDetail params={params} />
    </Suspense>
  );
}

async function load(params: Props["params"]) {
  const { slug, id } = await params;
  const ctx = await requireWorkspace(slug);
  if (!idSchema.safeParse(id).success) notFound();
  try {
    const [automation, validation, runs] = await Promise.all([getAutomation(ctx, id), validateAutomation(ctx, id), listExecutions(ctx, id, 10)]);
    return { slug, automation, validation, runs };
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  }
}

async function AutomationDetail({ params }: { params: Props["params"] }) {
  const { slug, automation: a, validation, runs } = await load(params);
  const errors = validation.issues.filter((i) => i.severity === "error");
  const warnings = validation.issues.filter((i) => i.severity === "warning");
  const nodeName = (nodeId?: string) => {
    const n = nodeId ? a.graph.nodes.find((x) => x.id === nodeId) : undefined;
    return n ? nodeDisplayName(n) : null;
  };

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[{ label: "Автоматизации", href: `/w/${slug}/automations` }, { label: a.name }]}
        title={
          <span className="flex items-center gap-3">
            <span className="truncate">{a.name}</span>
            <AutomationStatusBadge status={a.status} />
          </span>
        }
        description={a.description || undefined}
        actions={
          <AutomationHeaderActions
            slug={slug}
            automation={{ id: a.id, name: a.name, status: a.status }}
            canActivate={validation.valid}
          />
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Сценарий</CardTitle>
              <CardAction>
                <Button asChild size="sm">
                  <Link href={`/w/${slug}/automations/${a.id}/builder`}>
                    <PencilRuler aria-hidden /> Открыть конструктор
                  </Link>
                </Button>
              </CardAction>
              <CardDescription>
                {a.graph.nodes.length} nodes · {a.graph.edges.length} connections
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FlowPreview graph={a.graph} issues={validation.issues} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {errors.length === 0 ? (
                  <CheckCircle2 className="size-4 text-success" aria-hidden />
                ) : (
                  <CircleAlert className="size-4 text-destructive" aria-hidden />
                )}
                Проверка
              </CardTitle>
              <CardDescription>
                {errors.length === 0
                  ? "Сценарий без ошибок, его можно включить."
                  : `Перед включением нужно исправить ошибки в сценарии (${errors.length}).`}
              </CardDescription>
            </CardHeader>
            {validation.issues.length > 0 && (
              <CardContent>
                <ul className="divide-y rounded-lg border">
                  {[...errors, ...warnings].map((issue, i) => (
                    <li key={i} className="flex items-start gap-2.5 px-3 py-2.5 text-sm">
                      {issue.severity === "error" ? (
                        <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Ошибка" />
                      ) : (
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-label="Предупреждение" />
                      )}
                      <span className="min-w-0">
                        <span>{issue.message}</span>
                        {nodeName(issue.nodeId) && (
                          <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                            {nodeName(issue.nodeId)}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            )}
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Последние запуски</CardTitle>
              <CardDescription>Тестовые запуски из конструктора и реальные — по входящим сообщениям.</CardDescription>
            </CardHeader>
            <CardContent>
              {runs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Запусков пока нет.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {runs.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/w/${slug}/automations/${a.id}/runs/${r.id}`}
                        className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/50"
                      >
                        <RunStatusBadge status={r.status} />
                        <span className="text-xs text-muted-foreground uppercase">{r.mode === "test" ? "тест" : "реальный"}</span>
                        <span className="min-w-0 flex-1 truncate">
                          {[r.contactFirst, r.contactLast].filter(Boolean).join(" ") || "Без контакта"}
                          {r.error && <span className="ml-2 text-xs text-destructive">{r.error}</span>}
                        </span>
                        <span className="text-xs text-muted-foreground">v{r.version} · шагов: {r.stepCount}</span>
                        <RelativeTime date={r.createdAt} className="w-24 text-right text-xs text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Описание</CardTitle>
            </CardHeader>
            <CardContent>
              <AutomationDetailsForm slug={slug} id={a.id} name={a.name} description={a.description} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitCommitVertical className="size-4 text-muted-foreground" aria-hidden /> Публикация
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {a.published ? (
                <p>
                  Версия <span className="font-medium">v{a.published.version}</span> опубликована{" "}
                  <RelativeTime date={a.published.createdAt} className="text-muted-foreground" />.
                </p>
              ) : (
                <p className="text-muted-foreground">Ещё не публиковалась. Включите автоматизацию, чтобы опубликовать версию.</p>
              )}
              {a.hasUnpublishedChanges && (
                <p className="flex items-start gap-2 rounded-lg bg-warning/15 p-2.5 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  В черновике есть изменения, которые ещё не работают. Включите автоматизацию снова, чтобы их опубликовать.
                </p>
              )}
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
                <dt className="text-muted-foreground">Триггер</dt>
                <dd>{a.triggerType ? triggerLabels[a.triggerType] ?? a.triggerType : "—"}</dd>
                <dt className="text-muted-foreground">Создана</dt>
                <dd>{originLabels[a.origin] ?? a.origin}</dd>
                <dt className="text-muted-foreground">Изменена</dt>
                <dd>
                  <RelativeTime date={a.updatedAt} />
                </dd>
              </dl>
              {a.lastError && (
                <p className="flex items-start gap-2 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {a.lastError}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}

function DetailSkeleton() {
  return (
    <PageContainer>
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-72" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Skeleton className="h-[520px] rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </PageContainer>
  );
}
