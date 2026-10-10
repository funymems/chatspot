"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Copy, MoreHorizontal, Pause, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, fieldA11y } from "@/components/forms/field";
import { DeleteAutomationDialog, useAutomationMutations } from "@/components/automations/automation-actions";
import type { AutomationStatusValue } from "@/components/automations/status-badge";
import { updateAutomationDetailsAction } from "@/app/actions/automations";

export function AutomationHeaderActions({
  slug,
  automation,
  canActivate,
}: {
  slug: string;
  automation: { id: string; name: string; status: AutomationStatusValue };
  canActivate: boolean;
}) {
  const router = useRouter();
  const m = useAutomationMutations(slug);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isLive = automation.status === "active";

  const activateButton = (
    <Button
      onClick={() => m.setActive(automation, !isLive)}
      disabled={m.pending || (!isLive && !canActivate)}
      variant={isLive ? "outline" : "default"}
    >
      {isLive ? <Pause aria-hidden /> : <Play aria-hidden />}
      {isLive ? "Выключить" : "Включить"}
    </Button>
  );

  return (
    <>
      {!isLive && !canActivate ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0}>{activateButton}</span>
          </TooltipTrigger>
          <TooltipContent>Сначала исправьте ошибки в сценарии</TooltipContent>
        </Tooltip>
      ) : (
        activateButton
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Другие действия" disabled={m.pending}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => m.duplicate(automation)}>
            <Copy aria-hidden /> Создать копию
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setConfirmDelete(true)} className="text-destructive focus:text-destructive">
            <Trash2 aria-hidden /> Удалить
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteAutomationDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        name={automation.name}
        onConfirm={() => m.remove(automation, () => router.push(`/w/${slug}/automations`))}
      />
    </>
  );
}

export function AutomationDetailsForm({ slug, id, name, description }: { slug: string; id: string; name: string; description: string }) {
  const [values, setValues] = useState({ name, description });
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, startTransition] = useTransition();
  const dirty = values.name.trim() !== name || values.description.trim() !== description;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await updateAutomationDetailsAction(slug, id, values);
          if (res.ok) {
            setErrors({});
            toast.success(res.message);
          } else {
            setErrors(res.fieldErrors ?? {});
            if (!res.fieldErrors) toast.error(res.error);
          }
        });
      }}
    >
      <Field id="a-name" label="Название" error={errors.name}>
        <Input {...fieldA11y("a-name", errors.name)} value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} />
      </Field>
      <Field id="a-description" label="Описание" error={errors.description}>
        <Textarea
          {...fieldA11y("a-description", errors.description)}
          rows={3}
          value={values.description}
          onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
          placeholder="Что делает эта автоматизация?"
        />
      </Field>
      <Button type="submit" size="sm" disabled={!dirty || pending}>
        {pending ? "Сохраняем…" : "Сохранить"}
      </Button>
    </form>
  );
}
