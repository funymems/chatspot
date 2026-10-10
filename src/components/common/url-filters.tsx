"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Shared hook: read/write filters in the URL (shareable, survives refresh). */
export function useUrlFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (next: Record<string, string | undefined>, resetPage = true) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    if (resetPage) sp.delete("page");
    const qs = sp.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };
  return { params, set, pending };
}

export function SearchFilter({ placeholder, param = "q" }: { placeholder: string; param?: string }) {
  const { params, set, pending } = useUrlFilters();
  const [q, setQ] = useState(params.get(param) ?? "");
  useEffect(() => {
    if ((params.get(param) ?? "") === q) return;
    const t = setTimeout(() => set({ [param]: q.trim() || undefined }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-9 pr-8 pl-8" />
      {pending ? (
        <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Загрузка" />
      ) : q ? (
        <button type="button" onClick={() => setQ("")} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Очистить поиск">
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

export function SelectFilter({ param, label, options, allLabel }: { param: string; label: string; options: { value: string; label: string }[]; allLabel: string }) {
  const { params, set } = useUrlFilters();
  return (
    <Select value={params.get(param) ?? "__all"} onValueChange={(v) => set({ [param]: v === "__all" ? undefined : v })}>
      <SelectTrigger className="h-9 w-full sm:w-44" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
