"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, fieldA11y } from "@/components/forms/field";
import { createAgentAction } from "@/app/actions/agents";
import { cn } from "@/lib/utils";

const roles = [
  { id: "general", label: "Универсальный помощник", text: "Отвечает на вопросы о вашем бизнесе." },
  { id: "support", label: "Поддержка клиентов", text: "Решает проблемы, а в сложных случаях зовёт человека." },
  { id: "sales", label: "Консультант по продажам", text: "Советует товары и подводит к покупке." },
] as const;

export function NewAgentButton({ slug, variant = "default", children }: { slug: string; variant?: React.ComponentProps<typeof Button>["variant"]; children?: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<(typeof roles)[number]["id"]>("support");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, start] = useTransition();

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {children ?? (
          <>
            <Plus aria-hidden /> Новый агент
          </>
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await createAgentAction(slug, { name, role, description });
                if (!res.ok) {
                  setErrors(res.fieldErrors ?? {});
                  if (!res.fieldErrors) toast.error(res.error);
                  return;
                }
                toast.success(res.message);
                setOpen(false);
                router.push(`/w/${slug}/agents/${res.data.id}?tab=knowledge`);
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Новый ИИ-агент</DialogTitle>
              <DialogDescription>Агенты отвечают на основе знаний, которые вы им даёте, и передают диалог человеку, если не могут помочь.</DialogDescription>
            </DialogHeader>
            <Field id="agent-name" label="Имя" error={errors.name}>
              <Input {...fieldA11y("agent-name", errors.name)} value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Айгерим из поддержки" autoFocus />
            </Field>
            <div role="radiogroup" aria-label="Роль" className="grid gap-2 sm:grid-cols-3">
              {roles.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={role === r.id}
                  onClick={() => setRole(r.id)}
                  className={cn(
                    "rounded-lg border p-2.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    role === r.id ? "border-primary bg-accent" : "hover:bg-muted/60",
                  )}
                >
                  <span className="block font-medium">{r.label}</span>
                  <span className="block text-xs text-muted-foreground">{r.text}</span>
                </button>
              ))}
            </div>
            <Field id="agent-desc" label="Описание (необязательно)" error={errors.description}>
              <Textarea {...fieldA11y("agent-desc", errors.description)} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Создаём…" : "Создать агента"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
