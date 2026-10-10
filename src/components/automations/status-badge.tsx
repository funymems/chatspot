import { cn } from "@/lib/utils";

export type AutomationStatusValue = "draft" | "active" | "inactive" | "error";

const styles: Record<AutomationStatusValue, { label: string; dot: string; badge: string }> = {
  active: { label: "Активна", dot: "bg-success", badge: "bg-success/10 text-success" },
  draft: { label: "Черновик", dot: "bg-muted-foreground", badge: "bg-muted text-muted-foreground" },
  inactive: { label: "Выключена", dot: "bg-warning", badge: "bg-warning/15 text-amber-700" },
  error: { label: "Ошибка", dot: "bg-destructive", badge: "bg-destructive/10 text-destructive" },
};

export function AutomationStatusBadge({ status, className }: { status: AutomationStatusValue; className?: string }) {
  const s = styles[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", s.badge, className)}>
      <span className={cn("size-1.5 rounded-full", s.dot, status === "active" && "animate-pulse")} aria-hidden />
      {s.label}
    </span>
  );
}

export const triggerLabels: Record<string, string> = {
  manual: "Вручную",
  incoming_message: "Любое сообщение",
  keyword: "Ключевое слово",
  phrase: "Фраза",
  webhook: "Событие",
};
