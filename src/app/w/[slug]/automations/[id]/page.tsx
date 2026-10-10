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
import { nodeDisplayName } from "@/lib/domain/graph/validate";
import { idSchema } from "@/lib/validation/automation";
import { AutomationDetailsForm, AutomationHeaderActions } from "./automation-detail-client";

export const metadata: Metadata = { title: "Automation" };

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
    const [automation, validation] = await Promise.all([getAutomation(ctx, id), validateAutomation(ctx, id)]);
    return { slug, automation, validation };
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  }
}

async function AutomationDetail({ params }: { params: Props["params"] }) {
  const { slug, automation: a, validation } = await load(params);
  const errors = validation.issues.filter((i) => i.severity === "error");
  const warnings = validation.issues.filter((i) => i.severity === "warning");
  const nodeName = (nodeId?: string) => {
    const n = nodeId ? a.graph.nodes.find((x) => x.id === nodeId) : undefined;
    return n ? nodeDisplayName(n) : null;
  };

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[{ label: "Automations", href: `/w/${slug}/automations` }, { label: a.name }]}
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
              <CardTitle>Flow</CardTitle>
              <CardAction>
                <Button asChild size="sm">
                  <Link href={`/w/${slug}/automations/${a.id}/builder`}>
                    <PencilRuler aria-hidden /> Open builder
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
                Validation
              </CardTitle>
              <CardDescription>
                {errors.length === 0
                  ? "This flow is valid and can be activated."
                  : `${errors.length} problem${errors.length === 1 ? "" : "s"} must be fixed before this flow can be activated.`}
              </CardDescription>
            </CardHeader>
            {validation.issues.length > 0 && (
              <CardContent>
                <ul className="divide-y rounded-lg border">
                  {[...errors, ...warnings].map((issue, i) => (
                    <li key={i} className="flex items-start gap-2.5 px-3 py-2.5 text-sm">
                      {issue.severity === "error" ? (
                        <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Error" />
                      ) : (
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-label="Warning" />
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
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <AutomationDetailsForm slug={slug} id={a.id} name={a.name} description={a.description} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitCommitVertical className="size-4 text-muted-foreground" aria-hidden /> Publishing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {a.published ? (
                <p>
                  Version <span className="font-medium">v{a.published.version}</span> published{" "}
                  <RelativeTime date={a.published.createdAt} className="text-muted-foreground" />.
                </p>
              ) : (
                <p className="text-muted-foreground">Never published. Activate the automation to publish a version.</p>
              )}
              {a.hasUnpublishedChanges && (
                <p className="flex items-start gap-2 rounded-lg bg-warning/15 p-2.5 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  The draft has changes that aren&apos;t live yet. Activate again to publish them.
                </p>
              )}
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
                <dt className="text-muted-foreground">Trigger</dt>
                <dd>{a.triggerType ? triggerLabels[a.triggerType] ?? a.triggerType : "—"}</dd>
                <dt className="text-muted-foreground">Created from</dt>
                <dd className="capitalize">{a.origin}</dd>
                <dt className="text-muted-foreground">Last modified</dt>
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
