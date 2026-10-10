import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { AiStatusBanner } from "@/components/agents/ai-status-banner";
import { AgentTabs } from "@/components/agents/agent-tabs";
import { requireWorkspace } from "@/lib/server/auth/guards";
import { AppError } from "@/lib/server/errors";
import { getAgent, listKnowledgeSources, listUnanswered } from "@/lib/server/services/agents";
import { getAgentTestChat } from "@/lib/server/services/agent-chat";
import { aiStatus } from "@/lib/server/ai/provider";
import type { EscalationRules } from "@/lib/domain/escalation";
import { idSchema } from "@/lib/validation/automation";

export const metadata: Metadata = { title: "AI Agent" };

type Props = PageProps<"/w/[slug]/agents/[id]">;

export default function AgentPage({ params, searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <PageContainer>
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[480px] rounded-xl" />
        </PageContainer>
      }
    >
      <AgentDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const TABS = ["general", "instructions", "knowledge", "testing", "unanswered", "settings"] as const;

async function AgentDetail({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await requireWorkspace(slug);
  if (!idSchema.safeParse(id).success) notFound();
  let agent;
  try {
    agent = await getAgent(ctx, id);
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  }
  const [sources, unanswered, chat] = await Promise.all([listKnowledgeSources(ctx, id), listUnanswered(ctx, id), getAgentTestChat(ctx, id)]);
  const tab = TABS.find((t) => t === sp.tab) ?? "general";

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader
        breadcrumbs={[{ label: "AI Agents", href: `/w/${slug}/agents` }, { label: agent.name }]}
        title={agent.name}
        description={agent.description || undefined}
      />
      <AiStatusBanner status={aiStatus()} />
      <AgentTabs
        key={agent.id}
        slug={slug}
        initialTab={tab}
        agent={{
          id: agent.id,
          name: agent.name,
          role: agent.role,
          description: agent.description,
          tone: agent.tone,
          languageMode: agent.languageMode,
          language: agent.language,
          instructions: agent.instructions,
          businessInfo: agent.businessInfo,
          fallbackResponse: agent.fallbackResponse,
          enabled: agent.enabled,
          escalationRules: agent.escalationRules as EscalationRules,
        }}
        sources={sources.map((s) => ({
          id: s.id,
          type: s.type,
          title: s.title,
          content: s.content,
          question: s.question,
          answer: s.answer,
          fileName: s.fileName,
          updatedAt: s.updatedAt.toISOString(),
        }))}
        unanswered={unanswered.map((q) => ({ id: q.id, question: q.question, createdAt: q.createdAt.toISOString(), resolved: q.resolvedAt !== null }))}
        chat={{
          status: chat.conversation.status,
          messages: chat.messages.map((m) => ({
            id: m.id,
            kind: m.kind,
            body: m.body,
            payload: m.payload as { usedSources?: { id: string; title: string }[]; provider?: string; answered?: boolean; handoff?: boolean; handoffReason?: string | null },
          })),
        }}
      />
    </PageContainer>
  );
}
