import { cn } from "@/lib/utils";

export const leadStatusOptions = [
  { value: "new", label: "New" },
  { value: "engaged", label: "Engaged" },
  { value: "qualified", label: "Qualified" },
  { value: "customer", label: "Customer" },
  { value: "lost", label: "Lost" },
];

const styles: Record<string, string> = {
  new: "bg-muted text-muted-foreground",
  engaged: "bg-sky-100 text-sky-800",
  qualified: "bg-primary/10 text-primary",
  customer: "bg-success/10 text-success",
  lost: "bg-destructive/10 text-destructive",
};

export function LeadStatusBadge({ status }: { status: string }) {
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize", styles[status] ?? styles.new)}>{status}</span>;
}

export function TagChip({ name }: { name: string }) {
  return <span className="inline-flex rounded-md bg-accent px-1.5 py-0.5 text-xs text-accent-foreground">{name}</span>;
}

export function contactName(c: { firstName: string | null; lastName: string | null; email?: string | null; phone?: string | null }) {
  return [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || c.email || c.phone || "Unnamed contact";
}
