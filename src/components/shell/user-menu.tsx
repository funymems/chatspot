"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronsUpDown, LogOut, Settings, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";
import { sidebarLabel } from "./sidebar-fade";

export type ShellUser = { fullName: string; email: string };

export function initials(name: string, fallback = "?") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || fallback).slice(0, 2);
}

export function UserMenu({ user, slug, collapsed }: { user: ShellUser; slug: string; collapsed: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          )}
          aria-label="Меню аккаунта"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
            {initials(user.fullName, user.email[0]?.toUpperCase())}
          </span>
          <span className={sidebarLabel(collapsed, "flex flex-1 items-center gap-2")}>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-sidebar-accent-foreground">{user.fullName || "Аккаунт"}</span>
              <span className="block truncate text-xs text-sidebar-foreground/60">{user.email}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-sidebar-foreground/50" aria-hidden />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuLabel>
          <span className="block truncate">{user.fullName || "Аккаунт"}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push(`/w/${slug}/settings#profile`)}>
          <UserRound aria-hidden /> Профиль
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push(`/w/${slug}/settings`)}>
          <Settings aria-hidden /> Настройки пространства
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={pending}
          onSelect={() => startTransition(() => signOutAction())}
          className="text-destructive focus:text-destructive"
        >
          <LogOut aria-hidden /> {pending ? "Выходим…" : "Выйти"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
