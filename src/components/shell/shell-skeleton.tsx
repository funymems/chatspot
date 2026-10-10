import { Skeleton } from "@/components/ui/skeleton";

export function ShellSkeleton() {
  return (
    <div className="flex min-h-svh">
      <div className="hidden w-64 shrink-0 flex-col gap-3 bg-sidebar p-4 lg:flex" aria-hidden>
        <div className="h-7 w-28 rounded-md bg-sidebar-accent" />
        <div className="mt-2 h-10 rounded-lg bg-sidebar-accent" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-8 rounded-lg bg-sidebar-accent/50" />
        ))}
      </div>
      <div className="flex-1">
        <PageSkeleton />
      </div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-6 lg:p-8" role="status" aria-label="Загрузка">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}
