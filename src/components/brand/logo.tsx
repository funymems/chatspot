import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * ChatSpot mark: a speech bubble whose tail is a flow connector — three
 * nodes linked by a path, i.e. "conversation as a workflow".
 */
export function LogoMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7 shrink-0", className)} aria-hidden>
      <defs>
        <linearGradient id={`${id}-bg`} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#5B21B6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id}-bg)`} />
      {/* bubble */}
      <path
        d="M8 9.5A3.5 3.5 0 0 1 11.5 6h9A3.5 3.5 0 0 1 24 9.5v6a3.5 3.5 0 0 1-3.5 3.5h-5.2l-4.1 3.6c-.6.5-1.5.1-1.5-.7V18.6A3.5 3.5 0 0 1 8 15.5z"
        fill="#fff"
      />
      {/* flow inside the bubble */}
      <path d="M12.6 12.7h2.8l1.4-2.2M15.4 12.7l1.4 2.2" stroke="#6D28D9" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="12.4" cy="12.7" r="1.6" fill="#6D28D9" />
      <circle cx="18.6" cy="10.3" r="1.35" fill="#A78BFA" />
      <circle cx="18.6" cy="15.1" r="1.35" fill="#A78BFA" />
    </svg>
  );
}

export function Logo({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      <span className={inverted ? "text-white" : "text-foreground"}>
        Chat<span className={inverted ? "text-violet-300" : "text-primary"}>Spot</span>
      </span>
    </span>
  );
}
