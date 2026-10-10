import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AutomationBuilder } from "@/components/builder/builder";
import { requireWorkspace } from "@/lib/server/auth/guards";
import { AppError } from "@/lib/server/errors";
import { getAutomation, listAutomationOptions } from "@/lib/server/services/automations";
import { listAgentOptions } from "@/lib/server/services/agents";
import { idSchema } from "@/lib/validation/automation";

export const metadata: Metadata = { title: "Конструктор" };

type Props = PageProps<"/w/[slug]/automations/[id]/builder">;

export default function BuilderPage({ params }: Props) {
  return (
    <div className="h-[calc(100svh-3.5rem)] lg:h-svh">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground" role="status">
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> Загружаем конструктор…
          </div>
        }
      >
        <BuilderLoader params={params} />
      </Suspense>
    </div>
  );
}

async function BuilderLoader({ params }: { params: Props["params"] }) {
  const { slug, id } = await params;
  const ctx = await requireWorkspace(slug);
  if (!idSchema.safeParse(id).success) notFound();
  let automation;
  try {
    automation = await getAutomation(ctx, id);
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") notFound();
    throw err;
  }
  const [agentRows, automationRows] = await Promise.all([listAgentOptions(ctx), listAutomationOptions(ctx, id)]);

  return (
    <AutomationBuilder
      slug={slug}
      automation={{
        id: automation.id,
        name: automation.name,
        status: automation.status,
        revision: automation.revision,
        hasUnpublishedChanges: automation.hasUnpublishedChanges,
      }}
      graph={automation.graph}
      agents={agentRows}
      automations={automationRows}
    />
  );
}
