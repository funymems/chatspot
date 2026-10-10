import { Construction } from "lucide-react";

/**
 * Honest placeholder for sections scheduled in a later implementation stage.
 * Deliberately has no actions so nothing pretends to work.
 */
export function NotBuiltYet({ feature, stage, details }: { feature: string; stage: number; details: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card px-6 py-16 text-center">
      <span className="mb-4 flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Construction className="size-5" aria-hidden />
      </span>
      <h2 className="text-base font-semibold">{feature} is not built yet</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{details}</p>
      <span className="mt-4 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
        Planned for implementation stage {stage}
      </span>
    </div>
  );
}
