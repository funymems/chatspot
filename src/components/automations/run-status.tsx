"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { retryExecutionAction } from "@/app/actions/test-runs";
import { cn } from "@/lib/utils";
import { runStatusLabels } from "@/lib/domain/labels";

export type ExecutionStatusValue = "queued" | "running" | "waiting" | "completed" | "failed" | "cancelled";

const styles: Record<ExecutionStatusValue, string> = {
  completed: "bg-success/10 text-success",
  failed: "bg-destructive/10 text-destructive",
  waiting: "bg-warning/15 text-amber-700",
  running: "bg-primary/10 text-primary",
  queued: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
};

export function RunStatusBadge({ status, className }: { status: ExecutionStatusValue; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium first-letter:uppercase", styles[status], className)}>
      {runStatusLabels[status]}
    </span>
  );
}

export function RetryRunButton({ slug, automationId, executionId }: { slug: string; automationId: string; executionId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await retryExecutionAction(slug, executionId);
          if (!res.ok) return void toast.error(res.error);
          toast.success(`Запуск повторён · статус: ${runStatusLabels[res.data.status] ?? res.data.status}`);
          router.push(`/w/${slug}/automations/${automationId}/runs/${res.data.id}`);
        })
      }
    >
      <RotateCcw aria-hidden /> {pending ? "Повторяем…" : "Повторить запуск"}
    </Button>
  );
}
