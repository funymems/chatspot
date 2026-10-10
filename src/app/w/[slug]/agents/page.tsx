import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookOpen, CircleHelp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { RelativeTime } from "@/components/common/relative-time";
import { AgentsIcon } from "@/components/brand/nav-icons";
import { NewAgentButton } from "@/components/agents/new-agent-button";
import { AiStatusBanner } from "@/components/agents/ai-status-banner";
import { requireWorkspace } from "@/lib/server/auth/guards";
import { listAgents } from "@/lib/server/services/agents";
import { aiStatus } from "@/lib/server/ai/provider";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "AI Agents" };

type Props = PageProps<"/w/[slug]/agents">;

const roleLabels = { general: "General assistant", support: "Customer support", sales: "Sales assistant" } as const;

export default function AgentsPage({ params }: Props) {
  return (
    <PageContainer>
      <Suspense fallback={<Skeleton className="h-16 rounded-xl" />}>
        <Header params={params} />
      </Suspense>
      <Suspense
        fallback={
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        }
      >
        <AgentList params={params} />
      </Suspense>
    </PageContainer>
  );
}

async function Header({ params }: { params: Props["params"] }) {
  const { slug } = await params;
  await requireWorkspace(slug);
  return (
    <>
      <PageHeader
        title="AI Agents"
        description="Assistants that answer from your own knowledge base and know when to hand off."
        actions={<NewAgentButton slug={slug} />}
      />
      <AiStatusBanner status={aiStatus()} />
    </>
  );
}

async function AgentList({ params }: { params: Props["params"] }) {
  const { slug } = await params;
  const ctx = await requireWorkspace(slug);
  const agents = await listAgents(ctx);

  if (agents.length === 0) {
    return (
      <EmptyState
        icon={AgentsIcon}
        title="No AI agents yet"
        description="Create an agent, give it your FAQs and documents, and test it in the built-in chat before using it in automations."
        action={<NewAgentButton slug={slug}>Create your first agent</NewAgentButton>}
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {agents.map((a) => (
        <Link
          key={a.id}
          href={`/w/${slug}/agents/${a.id}`}
          className="group flex flex-col rounded-xl border bg-card p-4 shadow-xs transition-colors outline-none hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-lg font-semibold text-accent-foreground">
              {a.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium group-hover:text-primary">{a.name}</p>
              <p className="text-xs text-muted-foreground">{roleLabels[a.role]}</p>
            </div>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", a.enabled ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
              {a.enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          <p className="mt-3 line-clamp-2 min-h-10 text-sm text-muted-foreground">{a.description || "No description"}</p>
          <div className="mt-4 flex items-center gap-4 border-t pt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <BookOpen className="size-3.5" aria-hidden /> {a.sourceCount} sources
            </span>
            <span className={cn("flex items-center gap-1", a.unansweredCount > 0 && "text-amber-700")}>
              <CircleHelp className="size-3.5" aria-hidden /> {a.unansweredCount} unanswered
            </span>
            <RelativeTime date={a.updatedAt} className="ml-auto" />
          </div>
        </Link>
      ))}
    </div>
  );
}

