import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, MinusCircle, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { RelativeTime } from "@/components/common/relative-time";
import { RetryRunButton, RunStatusBadge } from "@/components/automations/run-status";
import { nodeMeta } from "@/components/flow/node-meta";
import { requireWorkspace } from "@/lib/server/auth/guards";
import { AppError } from "@/lib/server/errors";
import { getExecutionDetail } from "@/lib/server/services/executions";
import { nodeDisplayName } from "@/lib/domain/graph/validate";
import type { NodeType } from "@/lib/domain/graph/schema";
import { idSchema } from "@/lib/validation/automation";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Run" };

type Props = PageProps<"/w/[slug]/automations/[id]/runs/[runId]">;

export default function RunPage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <PageContainer>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-96 rounded-xl" />
        </PageContainer>
      }
    >
      <RunDetail params={params} />
    </Suspense>
  );
}

const statusIcon = {
  success: <CheckCircle2 className="size-4 text-success" aria-label="Succeeded" />,
  failed: <XCircle className="size-4 text-destructive" aria-label="Failed" />,
  waiting: <Clock className="size-4 text-amber-600" aria-label="Waiting" />,
  skipped: <MinusCircle className="size-4 text-muted-foreground" aria-label="Skipped" />,
} as const;

function Json({ value }: { value: unknown }) {
  if (value === null || value === undefined) return null;
  return <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-[11px] leading-relaxed">{JSON.stringify(value, null, 2)}</pre>;
}

async function RunDetail({ params }: { params: Props["params"] }) {
  const { slug, id, runId } = await params;
  const ctx = await requireWorkspace(slug);
  if (!idSchema.safeParse(runId).success) notFound();
  let detail;
  try {
    detail = await getExecutionDetail(ctx, runId);
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  }
  const { exec, version, graph, automation, logs, transcript } = detail;
  if (exec.automationId !== id) notFound();
  const nodeName = (nodeId: string, type: string) => {
    const n = graph.nodes.find((x) => x.id === nodeId);
    return n ? nodeDisplayName(n) : nodeMeta[type as NodeType]?.label ?? type;
  };
  const durationMs = exec.finishedAt && exec.startedAt ? exec.finishedAt.getTime() - exec.startedAt.getTime() : null;

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader
        breadcrumbs={[
          { label: "Automations", href: `/w/${slug}/automations` },
          { label: automation.name, href: `/w/${slug}/automations/${automation.id}` },
          { label: "Run" },
        ]}
        title={
          <span className="flex items-center gap-3">
            Run details <RunStatusBadge status={exec.status} />
          </span>
        }
        description={
          <>
            {exec.mode === "test" ? "Test run" : "Live run"} on version v{version.version} · started <RelativeTime date={exec.createdAt} /> ·{" "}
            {exec.stepCount} steps{durationMs !== null ? ` · ${(durationMs / 1000).toFixed(1)}s` : ""}
          </>
        }
        actions={exec.status === "failed" ? <RetryRunButton slug={slug} automationId={automation.id} executionId={exec.id} /> : undefined}
      />

      {exec.error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <span className="font-medium">Failed{exec.errorNodeId ? ` at “${nodeName(exec.errorNodeId, "")}”` : ""}:</span> {exec.error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Node log</CardTitle>
            <CardDescription>Every step with its input, output and timing.</CardDescription>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No steps were executed.</p>
            ) : (
              <ol className="space-y-2">
                {logs.map((l) => (
                  <li key={l.id} className={cn("rounded-lg border p-3 text-sm", l.status === "failed" && "border-destructive/40 bg-destructive/5")}>
                    <details>
                      <summary className="flex cursor-pointer list-none items-center gap-2">
                        {statusIcon[l.status]}
                        <span className="font-medium">{nodeName(l.nodeId, l.nodeType)}</span>
                        <span className="text-xs text-muted-foreground">{nodeMeta[l.nodeType as NodeType]?.label}</span>
                        {l.branch && (
                          <span className={cn("rounded px-1.5 text-xs font-medium", l.branch === "true" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                            {l.branch === "true" ? "Yes" : "No"}
                          </span>
                        )}
                        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{l.durationMs ?? 0} ms</span>
                      </summary>
                      {l.error && <p className="mt-2 text-xs text-destructive">{l.error}</p>}
                      {l.input !== null && (
                        <div className="mt-2 text-xs">
                          <span className="text-muted-foreground">Input</span>
                          <Json value={l.input} />
                        </div>
                      )}
                      {l.output !== null && (
                        <div className="mt-2 text-xs">
                          <span className="text-muted-foreground">Output</span>
                          <Json value={l.output} />
                        </div>
                      )}
                    </details>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Messages sent</CardTitle>
              <CardDescription>Simulated — no external channel is connected.</CardDescription>
            </CardHeader>
            <CardContent>
              {transcript.length === 0 ? (
                <p className="text-sm text-muted-foreground">This run didn&apos;t send any messages.</p>
              ) : (
                <ul className="space-y-2">
                  {transcript.map((m) => (
                    <li key={m.id} className="rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm">
                      <p className="whitespace-pre-wrap">{m.body}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{m.deliveryStatus}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Input & variables</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <span className="text-muted-foreground">Input</span>
              <Json value={exec.input} />
              <span className="text-muted-foreground">Variables at end</span>
              <Json value={(exec.state as { vars?: unknown }).vars ?? {}} />
              {exec.result !== null && (
                <>
                  <span className="text-muted-foreground">Result</span>
                  <Json value={exec.result} />
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
