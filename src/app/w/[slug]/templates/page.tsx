import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { TemplateCard } from "@/components/templates/template-card";
import { requireWorkspace } from "@/lib/server/auth/guards";
import { listTemplates } from "@/lib/server/services/templates";
import { templateCategories, type TemplateCategory } from "@/lib/domain/template-categories";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Templates" };

type Props = PageProps<"/w/[slug]/templates">;

export default function TemplatesPage({ params, searchParams }: Props) {
  return (
    <PageContainer>
      <PageHeader title="Templates" description="Start from proven, ready-to-customise automation flows." />
      <Suspense
        fallback={
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-52 rounded-xl" />
            ))}
          </div>
        }
      >
        <Gallery params={params} searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

async function Gallery({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireWorkspace(slug);
  const all = await listTemplates(ctx);
  const category = (Object.keys(templateCategories) as TemplateCategory[]).find((c) => c === sp.category);
  const visible = category ? all.filter((t) => t.category === category) : all;
  const used = new Set(all.map((t) => t.category));

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1.5" aria-label="Categories">
        <Link
          href={`/w/${slug}/templates`}
          aria-current={!category ? "page" : undefined}
          className={cn("rounded-full border px-3 py-1 text-sm", !category ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
        >
          All ({all.length})
        </Link>
        {(Object.entries(templateCategories) as [TemplateCategory, string][])
          .filter(([key]) => used.has(key))
          .map(([key, label]) => (
            <Link
              key={key}
              href={`/w/${slug}/templates?category=${key}`}
              aria-current={category === key ? "page" : undefined}
              className={cn("rounded-full border px-3 py-1 text-sm", category === key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
            >
              {label}
            </Link>
          ))}
      </nav>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((t) => (
          <TemplateCard
            key={t.id}
            slug={slug}
            template={{
              id: t.id,
              name: t.name,
              description: t.description,
              category: t.category,
              graph: t.graph,
              nodeCount: t.graph.nodes.filter((n) => n.type !== "note").length,
              usesAi: t.graph.nodes.some((n) => n.type === "ai_response"),
            }}
          />
        ))}
      </div>
    </div>
  );
}
