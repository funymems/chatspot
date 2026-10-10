import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, SearchX, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { RelativeTime } from "@/components/common/relative-time";
import { AutomationStatusBadge, triggerLabels } from "@/components/automations/status-badge";
import { AutomationRowMenu } from "@/components/automations/automation-actions";
import { NewAutomationButton } from "@/components/automations/new-automation-button";
import { requireWorkspace } from "@/lib/server/auth/guards";
import { automationStatuses, listAutomations, type AutomationStatus } from "@/lib/server/services/automations";
import { listTemplates } from "@/lib/server/services/templates";
import { AutomationFilters } from "./automation-filters";

export const metadata: Metadata = { title: "Automations" };

type Props = PageProps<"/w/[slug]/automations">;

export default function AutomationsPage({ params, searchParams }: Props) {
  return (
    <PageContainer>
      <PageHeader
        title="Automations"
        description="Conversation flows that react to incoming messages and events."
        actions={
          <Suspense fallback={<Button disabled>New automation</Button>}>
            <NewAutomation params={params} />
          </Suspense>
        }
      />
      <Suspense fallback={<Skeleton className="h-11 w-full rounded-lg" />}>
        <AutomationFilters />
      </Suspense>
      <Suspense fallback={<ListSkeleton />}>
        <AutomationList params={params} searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

async function templateOptions(params: Props["params"]) {
  const { slug } = await params;
  const ctx = await requireWorkspace(slug);
  const templates = await listTemplates(ctx);
  return { slug, templates: templates.map((t) => ({ id: t.id, name: t.name, description: t.description, category: t.category })) };
}

async function NewAutomation({ params }: { params: Props["params"] }) {
  const { slug, templates } = await templateOptions(params);
  return <NewAutomationButton slug={slug} templates={templates} />;
}

async function AutomationList({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireWorkspace(slug);
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const statusParam = typeof sp.status === "string" ? sp.status : undefined;
  const status = automationStatuses.includes(statusParam as AutomationStatus) ? (statusParam as AutomationStatus) : undefined;
  const items = await listAutomations(ctx, { q, status });

  if (items.length === 0) {
    if (q || status) {
      return (
        <EmptyState
          icon={SearchX}
          title="No automations match"
          description="Try a different search term or status filter."
          action={
            <Button variant="outline" asChild>
              <Link href={`/w/${slug}/automations`}>Clear filters</Link>
            </Button>
          }
        />
      );
    }
    const { templates } = await templateOptions(params);
    return (
      <EmptyState
        icon={Workflow}
        title="Create your first automation"
        description="Automations reply to messages, tag contacts and capture leads. Start from scratch or use a proven template."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <NewAutomationButton slug={slug} templates={templates} />
            <NewAutomationButton slug={slug} templates={templates} initialMode="template" variant="outline">
              Browse templates
            </NewAutomationButton>
          </div>
        }
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">Name</th>
            <th className="hidden px-4 py-2.5 font-medium md:table-cell">Trigger</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Runs</th>
            <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Last modified</th>
            <th className="w-12 px-2 py-2.5">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((a) => (
            <tr key={a.id} className="group transition-colors hover:bg-muted/30">
              <td className="w-full max-w-0 px-4 py-3">
                <Link
                  href={`/w/${slug}/automations/${a.id}`}
                  className="block truncate font-medium outline-none hover:text-primary focus-visible:underline"
                >
                  {a.name}
                </Link>
                <p className="truncate text-xs text-muted-foreground">{a.description || "No description"}</p>
              </td>
              <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                {a.triggerType ? triggerLabels[a.triggerType] ?? a.triggerType : "—"}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col items-start gap-1">
                  <AutomationStatusBadge status={a.status} />
                  {a.hasUnpublishedChanges && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-amber-700">
                      <AlertTriangle className="size-3" aria-hidden /> Unpublished changes
                    </span>
                  )}
                </div>
              </td>
              <td className="hidden px-4 py-3 text-right tabular-nums sm:table-cell">
                {a.runs}
                {a.failedRuns > 0 && <span className="ml-1 text-xs text-destructive">({a.failedRuns} failed)</span>}
              </td>
              <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                <RelativeTime date={a.updatedAt} />
              </td>
              <td className="px-2 py-3 text-right">
                <AutomationRowMenu slug={slug} automation={{ id: a.id, name: a.name, status: a.status }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2" role="status" aria-label="Loading automations">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  );
}
