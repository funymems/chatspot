import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { RelativeTime } from "@/components/common/relative-time";
import { RunStatusBadge } from "@/components/automations/run-status";
import { RunsChart } from "@/components/analytics/runs-chart";
import { AnalyticsIcon } from "@/components/brand/nav-icons";
import { nodeMeta } from "@/components/flow/node-meta";
import { requireWorkspace } from "@/lib/server/auth/guards";
import { analyticsRanges, getAnalytics, type AnalyticsRange } from "@/lib/server/services/analytics";
import type { NodeType } from "@/lib/domain/graph/schema";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Analytics" };

type Props = PageProps<"/w/[slug]/analytics">;

const rangeLabels: Record<AnalyticsRange, string> = { "7d": "7 days", "30d": "30 days", "90d": "90 days", all: "All time" };
const modeLabels = { all: "All runs", live: "Live only", test: "Test only" } as const;

export default function AnalyticsPage({ params, searchParams }: Props) {
  return (
    <PageContainer>
      <PageHeader title="Analytics" description="Performance derived from persisted automation runs." />
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-9 w-96" />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-80 rounded-xl" />
          </div>
        }
      >
        <Analytics params={params} searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

async function Analytics({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireWorkspace(slug);
  const range = ((Object.keys(analyticsRanges) as AnalyticsRange[]).find((r) => r === sp.range) ?? "30d") as AnalyticsRange;
  const mode = (["all", "live", "test"] as const).find((m) => m === sp.mode) ?? "all";
  const a = await getAnalytics(ctx, range, mode);
  const link = (next: { range?: string; mode?: string }) => {
    const p = new URLSearchParams({ range, mode, ...next });
    if (p.get("range") === "30d") p.delete("range");
    if (p.get("mode") === "all") p.delete("mode");
    const s = p.toString();
    return `/w/${slug}/analytics${s ? `?${s}` : ""}`;
  };

  const kpis = [
    { label: "Total runs", value: a.totals.runs.toLocaleString("en"), hint: `${a.totals.live} live · ${a.totals.test} test` },
    { label: "Successful", value: a.totals.completed.toLocaleString("en"), hint: `${a.totals.inProgress} still in progress` },
    { label: "Failed", value: a.totals.failed.toLocaleString("en"), hint: "See node failures below" },
    { label: "Completion rate", value: a.totals.completionRate === null ? "—" : `${a.totals.completionRate}%`, hint: "Completed ÷ finished runs" },
    { label: "Leads captured", value: a.totals.leads.toLocaleString("en"), hint: "Contacts with email, phone or qualified status" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented options={Object.entries(rangeLabels).map(([k, l]) => ({ href: link({ range: k }), label: l, active: k === range }))} label="Date range" />
        <Segmented options={Object.entries(modeLabels).map(([k, l]) => ({ href: link({ mode: k }), label: l, active: k === mode }))} label="Run type" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.label} className="gap-0 py-4">
            <CardContent className="space-y-1 px-4">
              <p className="text-sm text-muted-foreground">{k.label}</p>
              <p className="text-2xl font-semibold tabular-nums tracking-tight">{k.value}</p>
              <p className="truncate text-xs text-muted-foreground">{k.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">
        {a.totals.conversions} test/live conversion{a.totals.conversions === 1 ? "" : "s"} — runs that reached a “Goal reached” end step. Purchases aren&apos;t tracked; no
        external channel or store is connected.
      </p>

      {a.totals.runs === 0 ? (
        <EmptyState
          icon={AnalyticsIcon}
          title="No runs in this period"
          description="Analytics fill in as automations run — from builder test runs or simulated conversations in the inbox."
          action={
            <Link href={`/w/${slug}/conversations`} className="text-sm font-medium text-primary hover:underline">
              Simulate a conversation →
            </Link>
          }
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Runs per day</CardTitle>
              <CardDescription>{rangeLabels[range]} · {modeLabels[mode].toLowerCase()}</CardDescription>
            </CardHeader>
            <CardContent>
              <RunsChart data={a.daily} />
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Most triggered automations</CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="pb-2 font-medium">Automation</th>
                      <th className="pb-2 text-right font-medium">Runs</th>
                      <th className="pb-2 text-right font-medium">Success</th>
                      <th className="pb-2 text-right font-medium">Goals</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {a.top.map((t) => {
                      const finished = t.completed + t.failed;
                      return (
                        <tr key={t.id}>
                          <td className="max-w-0 py-2 pr-2">
                            <Link href={`/w/${slug}/automations/${t.id}`} className="block truncate hover:text-primary">
                              {t.name}
                            </Link>
                          </td>
                          <td className="py-2 text-right tabular-nums">{t.runs}</td>
                          <td className="py-2 text-right tabular-nums">{finished ? `${Math.round((t.completed / finished) * 100)}%` : "—"}</td>
                          <td className="py-2 text-right tabular-nums">{t.conversions}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-destructive" aria-hidden /> Node failures
                </CardTitle>
                <CardDescription>Where runs break, grouped by step.</CardDescription>
              </CardHeader>
              <CardContent>
                {a.failures.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No failed steps in this period. 🎉</p>
                ) : (
                  <ul className="space-y-3">
                    {a.failures.map((f) => (
                      <li key={`${f.automationId}-${f.nodeId}`} className="text-sm">
                        <p className="flex items-center gap-2">
                          <span className="font-medium">{nodeMeta[f.nodeType as NodeType]?.label ?? f.nodeType}</span>
                          <span className="text-muted-foreground">in</span>
                          <Link href={`/w/${slug}/automations/${f.automationId}`} className="truncate hover:text-primary">
                            {f.automationName}
                          </Link>
                          <span className="ml-auto shrink-0 rounded bg-destructive/10 px-1.5 text-xs font-medium text-destructive">{f.failures}×</span>
                        </p>
                        <p className="line-clamp-2 text-xs text-muted-foreground">{f.lastError}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Execution history</CardTitle>
              <CardDescription>Latest 25 runs in this period.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {a.recent.map((r) => (
                  <li key={r.id}>
                    <Link href={`/w/${slug}/automations/${r.automationId}/runs/${r.id}`} className="flex items-center gap-3 py-2 text-sm hover:bg-muted/40">
                      <RunStatusBadge status={r.status} />
                      <span className="w-10 text-xs text-muted-foreground uppercase">{r.mode}</span>
                      <span className="min-w-0 flex-1 truncate">{r.automationName}</span>
                      {r.error && <span className="hidden max-w-60 truncate text-xs text-destructive md:inline">{r.error}</span>}
                      <span className="text-xs text-muted-foreground tabular-nums">{r.stepCount} steps</span>
                      <RelativeTime date={r.createdAt} className="w-24 text-right text-xs text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Segmented({ options, label }: { options: { href: string; label: string; active: boolean }[]; label: string }) {
  return (
    <nav aria-label={label} className="inline-flex rounded-lg bg-muted p-1">
      {options.map((o) => (
        <Link
          key={o.label}
          href={o.href}
          aria-current={o.active ? "page" : undefined}
          className={cn("rounded-md px-3 py-1 text-sm font-medium", o.active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}
