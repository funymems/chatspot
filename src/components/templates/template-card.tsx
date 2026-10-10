"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Eye, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FlowPreview } from "@/components/flow/flow-preview";
import { createAutomationAction } from "@/app/actions/automations";
import { templateCategories, type TemplateCategory } from "@/lib/domain/template-categories";
import type { AutomationGraph } from "@/lib/domain/graph/schema";

export function TemplateCard({
  slug,
  template,
}: {
  slug: string;
  template: { id: string; name: string; description: string; category: TemplateCategory; graph: AutomationGraph; nodeCount: number; usesAi: boolean };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const use = () =>
    start(async () => {
      const res = await createAutomationAction(slug, { mode: "template", templateId: template.id, name: "" });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      router.push(`/w/${slug}/automations/${res.data.id}/builder`);
    });

  return (
    <>
      <article className="flex flex-col rounded-xl border bg-card p-4 shadow-xs">
        <p className="text-[11px] font-semibold tracking-wide text-primary uppercase">{templateCategories[template.category]}</p>
        <h3 className="mt-1 font-medium">{template.name}</h3>
        <p className="mt-1 line-clamp-3 flex-1 text-sm text-muted-foreground">{template.description}</p>
        <p className="mt-3 text-xs text-muted-foreground">Шагов: {template.nodeCount} · готов к настройке</p>
        <div className="mt-3 flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <Eye aria-hidden /> Просмотр
          </Button>
          <Button size="sm" onClick={use} disabled={pending}>
            <Plus aria-hidden /> {pending ? "Создаём…" : "Использовать шаблон"}
          </Button>
        </div>
      </article>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{template.name}</DialogTitle>
            <DialogDescription>{template.description}</DialogDescription>
          </DialogHeader>
          <FlowPreview graph={template.graph} className="h-[460px]" />
          <DialogFooter>
            <p className="mr-auto self-center text-xs text-muted-foreground">Шаблон создаёт редактируемую копию-черновик. Ничего не включается автоматически.</p>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Закрыть
            </Button>
            <Button onClick={use} disabled={pending}>
              {pending ? "Создаём…" : "Использовать шаблон"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
