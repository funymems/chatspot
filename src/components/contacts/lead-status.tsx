import { cn } from "@/lib/utils";

export const leadStatusOptions = [
  { value: "new", label: "Новый" },
  { value: "engaged", label: "Вовлечён" },
  { value: "qualified", label: "Квалифицирован" },
  { value: "customer", label: "Клиент" },
  { value: "lost", label: "Потерян" },
];

const styles: Record<string, string> = {
  new: "bg-muted text-muted-foreground",
  engaged: "bg-sky-100 text-sky-800",
  qualified: "bg-primary/10 text-primary",
  customer: "bg-success/10 text-success",
  lost: "bg-destructive/10 text-destructive",
};

export function LeadStatusBadge({ status }: { status: string }) {
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", styles[status] ?? styles.new)}>{leadStatusOptions.find((o) => o.value === status)?.label ?? status}</span>;
}

export const contactSourceLabels: Record<string, string> = { manual: "вручную", mock: "симулятор", instagram: "Instagram", import: "импорт", test: "тест" };

export function TagChip({ name }: { name: string }) {
  return <span className="inline-flex rounded-md bg-accent px-1.5 py-0.5 text-xs text-accent-foreground">{name}</span>;
}

export function contactName(c: { firstName: string | null; lastName: string | null; email?: string | null; phone?: string | null }) {
  return [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || c.email || c.phone || "Контакт без имени";
}
