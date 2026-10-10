import { cn } from "@/lib/utils";

/** Original ChatSpot mark: a speech bubble with a spark node. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path
        d="M9 10.5A2.5 2.5 0 0 1 11.5 8h9A2.5 2.5 0 0 1 23 10.5v7a2.5 2.5 0 0 1-2.5 2.5H15l-4.2 3.4c-.5.4-1.3 0-1.3-.6V20.6A2.5 2.5 0 0 1 9 18.5z"
        fill="white"
        fillOpacity=".95"
      />
      <circle cx="13" cy="14" r="1.6" className="fill-primary" />
      <circle cx="19" cy="14" r="1.6" className="fill-primary" />
      <path d="M14.6 14h2.8" stroke="var(--primary)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      <span className={inverted ? "text-white" : "text-foreground"}>ChatSpot</span>
    </span>
  );
}
