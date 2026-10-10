"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Copy, ExternalLink, MoreHorizontal, Pause, PencilRuler, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  deleteAutomationAction,
  duplicateAutomationAction,
  setAutomationActiveAction,
} from "@/app/actions/automations";
import type { ActionResult } from "@/lib/action-result";
import type { AutomationStatusValue } from "./status-badge";

type Target = { id: string; name: string; status: AutomationStatusValue };

/** Shared mutation helpers with toasts and pending state. */
export function useAutomationMutations(slug: string) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = <T,>(fn: () => Promise<ActionResult<T>>, onOk?: (data: T) => void) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(res.message ?? "Готово");
        onOk?.(res.data);
      } else {
        toast.error(res.error);
      }
    });

  return {
    pending,
    setActive: (a: Target, active: boolean) => run(() => setAutomationActiveAction(slug, a.id, active)),
    duplicate: (a: Target) => run(() => duplicateAutomationAction(slug, a.id), (d) => router.push(`/w/${slug}/automations/${d.id}`)),
    remove: (a: Target, after?: () => void) => run(() => deleteAutomationAction(slug, a.id), () => after?.()),
  };
}

export function AutomationRowMenu({ slug, automation }: { slug: string; automation: Target }) {
  const m = useAutomationMutations(slug);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isLive = automation.status === "active";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Действия: ${automation.name}`} disabled={m.pending}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild>
            <Link href={`/w/${slug}/automations/${automation.id}`}>
              <ExternalLink aria-hidden /> Открыть
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/w/${slug}/automations/${automation.id}/builder`}>
              <PencilRuler aria-hidden /> Открыть конструктор
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => m.setActive(automation, !isLive)}>
            {isLive ? <Pause aria-hidden /> : <Play aria-hidden />} {isLive ? "Выключить" : "Включить"}
          </DropdownMenuItem>
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
        onConfirm={() => m.remove(automation)}
      />
    </>
  );
}

export function DeleteAutomationDialog({
  open,
  onOpenChange,
  name,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  name: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить «{name}»?</AlertDialogTitle>
          <AlertDialogDescription>
            Автоматизация, все её версии и история запусков будут удалены навсегда. Это действие нельзя отменить.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            Удалить автоматизацию
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
