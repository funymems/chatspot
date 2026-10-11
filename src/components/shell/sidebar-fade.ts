import { cn } from "@/lib/utils";

/**
 * Text that fades and slides out while the sidebar collapses (instead of
 * unmounting, which makes the width animation jump). Fades out quickly when
 * collapsing and back in after a short delay when expanding.
 */
export function sidebarLabel(collapsed: boolean, className?: string) {
  return cn(
    "min-w-0 overflow-hidden whitespace-nowrap transition-[opacity,transform] motion-reduce:transition-none",
    collapsed ? "pointer-events-none -translate-x-1.5 opacity-0 duration-100" : "translate-x-0 opacity-100 delay-100 duration-200",
    className,
  );
}

/** Russian labels for workspace roles. */
export const roleLabels: Record<string, string> = { owner: "Владелец", admin: "Администратор", member: "Участник" };
