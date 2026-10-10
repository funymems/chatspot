"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, Check, CircleAlert, FilePlus2, LayoutTemplate, Loader2, PenLine, Plus, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, fieldA11y } from "@/components/forms/field";
import { createAutomationAction } from "@/app/actions/automations";
import { generateFlowAction } from "@/app/actions/agents";
import { FlowPreview } from "@/components/flow/flow-preview";
import type { AutomationGraph } from "@/lib/domain/graph/schema";
import type { GraphIssue } from "@/lib/domain/graph/validate";
import { templateCategories, type TemplateCategory } from "@/lib/domain/template-categories";
import { cn } from "@/lib/utils";

export type TemplateOption = { id: string; name: string; description: string; category: TemplateCategory };
type Mode = "scratch" | "template" | "ai";

export function NewAutomationButton({
  slug,
  templates,
  initialMode = "scratch",
  children,
  variant = "default",
  size = "default",
  className,
}: {
  slug: string;
  templates: TemplateOption[];
  initialMode?: Mode;
  children?: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        {children ?? (
          <>
            <Plus aria-hidden /> New automation
          </>
        )}
      </Button>
      {open && <CreateAutomationDialog slug={slug} templates={templates} initialMode={initialMode} onClose={() => setOpen(false)} />}
    </>
  );
}

function CreateAutomationDialog({
  slug,
  templates,
  initialMode,
  onClose,
}: {
  slug: string;
  templates: TemplateOption[];
  initialMode: Mode;
  onClose: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [prompt, setPrompt] = useState("");
  const [generating, startGenerating] = useTransition();
  const [generated, setGenerated] = useState<{
    name: string;
    description: string;
    graph: AutomationGraph;
    issues: GraphIssue[];
    valid: boolean;
    fixes: string[];
    provider: string;
  } | null>(null);

  const generate = () =>
    startGenerating(async () => {
      setFormError(null);
      const res = await generateFlowAction(slug, prompt);
      if (!res.ok) {
        setFormError(res.fieldErrors ? Object.values(res.fieldErrors).flat()[0] ?? res.error : res.error);
        return;
      }
      setGenerated(res.data);
      setName(res.data.name);
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "ai" && !generated?.valid) return;
    startTransition(async () => {
      const res = await createAutomationAction(
        slug,
        mode === "scratch"
          ? { mode, name, description }
          : mode === "template"
            ? { mode, templateId: templateId ?? "", name }
            : { mode, name, description: generated!.description, graph: generated!.graph },
      );
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        setFormError(res.fieldErrors ? null : res.error);
        return;
      }
      toast.success(res.message);
      onClose();
      router.push(`/w/${slug}/automations/${res.data.id}/builder`);
    });
  };

  const modes: { id: Mode; label: string; icon: typeof Plus; hint: string; disabled?: boolean }[] = [
    { id: "scratch", label: "From scratch", icon: FilePlus2, hint: "Start with a simple starter flow" },
    { id: "template", label: "From template", icon: LayoutTemplate, hint: `${templates.length} ready-made flows` },
    { id: "ai", label: "Describe it", icon: PenLine, hint: "AI drafts the flow for you" },
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>New automation</DialogTitle>
            <DialogDescription>New automations start as drafts. Nothing runs until you activate it.</DialogDescription>
          </DialogHeader>

          <div role="radiogroup" aria-label="How to start" className="grid gap-2 sm:grid-cols-3">
            {modes.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={mode === m.id}
                disabled={m.disabled}
                onClick={() => setMode(m.id)}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                  mode === m.id ? "border-primary bg-accent" : "hover:bg-muted/60",
                )}
              >
                <m.icon className={cn("mt-0.5 size-4 shrink-0", mode === m.id ? "text-primary" : "text-muted-foreground")} aria-hidden />
                <span>
                  <span className="block text-sm font-medium">{m.label}</span>
                  <span className="block text-xs text-muted-foreground">{m.hint}</span>
                </span>
              </button>
            ))}
          </div>

          {formError && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {formError}
            </p>
          )}

          {mode === "scratch" && (
            <div className="space-y-4">
              <Field id="automation-name" label="Name" error={errors.name}>
                <Input
                  {...fieldA11y("automation-name", errors.name)}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Course inquiries"
                  autoFocus
                />
              </Field>
              <Field id="automation-description" label="Description (optional)" error={errors.description}>
                <Textarea
                  {...fieldA11y("automation-description", errors.description)}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="What does this automation do?"
                />
              </Field>
            </div>
          )}

          {mode === "template" && (
            <div className="space-y-4">
              <div role="radiogroup" aria-label="Templates" className="grid max-h-72 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={templateId === t.id}
                    onClick={() => setTemplateId(t.id)}
                    className={cn(
                      "relative rounded-lg border p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      templateId === t.id ? "border-primary bg-accent" : "hover:bg-muted/60",
                    )}
                  >
                    {templateId === t.id && <Check className="absolute top-3 right-3 size-4 text-primary" aria-hidden />}
                    <span className="block text-[11px] font-medium tracking-wide text-primary uppercase">
                      {templateCategories[t.category]}
                    </span>
                    <span className="mt-0.5 block pr-5 text-sm font-medium">{t.name}</span>
                    <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">{t.description}</span>
                  </button>
                ))}
              </div>
              {errors.templateId && <p className="text-xs text-destructive" role="alert">{errors.templateId[0]}</p>}
              <Field id="template-name" label="Name (optional)" hint="Defaults to the template name." error={errors.name}>
                <Input {...fieldA11y("template-name", errors.name)} value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            </div>
          )}

          {mode === "ai" && (
            <div className="space-y-4">
              <Field
                id="ai-prompt"
                label="Describe the automation"
                hint="Mention the trigger word, what to ask, which links to send and what to save."
              >
                <Textarea
                  id="ai-prompt"
                  rows={4}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="When someone sends the word COURSE, ask whether they want the beginner or advanced course. Then send the relevant link and save their interest as a contact field."
                />
              </Field>
              <Button type="button" variant="outline" onClick={generate} disabled={generating || prompt.trim().length < 15}>
                {generating ? <Loader2 className="animate-spin" aria-hidden /> : <PenLine aria-hidden />}
                {generating ? "Drafting the flow…" : generated ? "Generate again" : "Generate draft"}
              </Button>

              {generated && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                      {generated.provider === "demo" ? "Demo generator (rule-based, no AI key set)" : `Generated by ${generated.provider.replace("gemini:", "Gemini · ")}`}
                    </span>
                    <span className="text-muted-foreground">
                      {generated.graph.nodes.length} nodes · saved as a draft, never activated automatically
                    </span>
                  </div>
                  <FlowPreview graph={generated.graph} issues={generated.issues} className="h-64" />
                  {generated.fixes.length > 0 && (
                    <details className="rounded-lg border p-2.5 text-xs text-muted-foreground">
                      <summary className="flex cursor-pointer items-center gap-1.5">
                        <Wrench className="size-3.5" aria-hidden /> {generated.fixes.length} automatic fix{generated.fixes.length === 1 ? "" : "es"} applied
                      </summary>
                      <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
                        {generated.fixes.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {generated.issues.length > 0 && (
                    <ul className="space-y-1 rounded-lg border p-2.5 text-xs">
                      {generated.issues.map((i, k) => (
                        <li key={k} className="flex items-start gap-1.5">
                          {i.severity === "error" ? (
                            <CircleAlert className="mt-px size-3.5 shrink-0 text-destructive" aria-hidden />
                          ) : (
                            <AlertTriangle className="mt-px size-3.5 shrink-0 text-amber-600" aria-hidden />
                          )}
                          {i.message}
                        </li>
                      ))}
                    </ul>
                  )}
                  <Field id="ai-name" label="Name" error={errors.name}>
                    <Input {...fieldA11y("ai-name", errors.name)} value={name} onChange={(e) => setName(e.target.value)} />
                  </Field>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || (mode === "template" && !templateId) || (mode === "ai" && !generated?.valid)}>
              {pending ? "Creating…" : "Create draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
