"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Menu, PanelLeftClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Logo, LogoMark } from "@/components/brand/logo";
import { sidebarLabel } from "./sidebar-fade";
import { cn } from "@/lib/utils";
import { mainNav, secondaryNav, type NavItem } from "./nav-items";
import { WorkspaceSwitcher, type ShellWorkspace } from "./workspace-switcher";
import { UserMenu, type ShellUser } from "./user-menu";

const COLLAPSE_KEY = "chatspot.sidebar.collapsed";

// localStorage-backed preference (per viewer convenience only).
const collapseStore = {
  listeners: new Set<() => void>(),
  get(): boolean {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  },
  set(v: boolean) {
    try {
      localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0");
    } catch {
      // storage unavailable; preference simply won't persist
    }
    collapseStore.listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    collapseStore.listeners.add(l);
    return () => collapseStore.listeners.delete(l);
  },
};

export function AppShell({
  workspace,
  workspaces,
  user,
  children,
}: {
  workspace: ShellWorkspace;
  workspaces: ShellWorkspace[];
  user: ShellUser;
  children: React.ReactNode;
}) {
  const collapsed = useSyncExternalStore(collapseStore.subscribe, collapseStore.get, () => false);
  const pathname = usePathname();
  // The drawer is open only for the path it was opened on, so navigating closes it.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const mobileOpen = openedOn === pathname;
  const setMobileOpen = (open: boolean) => setOpenedOn(open ? pathname : null);

  // Ctrl/⌘+B toggles the sidebar (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "b" || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable=true]")) return;
      e.preventDefault();
      collapseStore.set(!collapseStore.get());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-svh bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground lg:flex",
          "transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          collapsed ? "w-[68px]" : "w-64",
        )}
        aria-label="Основная навигация"
      >
        <SidebarContent
          workspace={workspace}
          workspaces={workspaces}
          user={user}
          collapsed={collapsed}
          onToggle={() => collapseStore.set(!collapsed)}
        />
      </aside>

      {/* Mobile / tablet drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 border-none bg-sidebar p-0 text-sidebar-foreground">
          <SheetTitle className="sr-only">Навигация</SheetTitle>
          <SidebarContent workspace={workspace} workspaces={workspaces} user={user} collapsed={false} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Открыть меню">
            <Menu />
          </Button>
          <Logo />
        </header>
        <main id="main" className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  workspace,
  workspaces,
  user,
  collapsed,
  onToggle,
}: {
  workspace: ShellWorkspace;
  workspaces: ShellWorkspace[];
  user: ShellUser;
  collapsed: boolean;
  /** Desktop only; the mobile drawer has its own close control. */
  onToggle?: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="group/brand relative flex h-14 shrink-0 items-center px-5">
        <Link
          href={`/w/${workspace.slug}/dashboard`}
          aria-label="ChatSpot — главная"
          tabIndex={collapsed && onToggle ? -1 : undefined}
          className="flex min-w-0 items-center gap-2 rounded-md font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          <LogoMark className={cn("transition-opacity duration-200", collapsed && onToggle && "group-hover/brand:opacity-0")} />
          <span className={sidebarLabel(collapsed, "text-white")}>
            Chat<span className="text-violet-300">Spot</span>
          </span>
        </Link>
        {onToggle && <SidebarToggle collapsed={collapsed} onToggle={onToggle} />}
      </div>
      <div className="px-2 pb-2">
        <WorkspaceSwitcher current={workspace} workspaces={workspaces} collapsed={collapsed} />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2" aria-label="Разделы">
        {mainNav.map((item) => (
          <NavLink key={item.segment} item={item} slug={workspace.slug} collapsed={collapsed} />
        ))}
        <div className="my-3 border-t border-sidebar-border" />
        {secondaryNav.map((item) => (
          <NavLink key={item.segment} item={item} slug={workspace.slug} collapsed={collapsed} />
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-2">
        <UserMenu user={user} slug={workspace.slug} collapsed={collapsed} />
      </div>
    </div>
  );
}

function SidebarToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const label = collapsed ? "Развернуть панель" : "Свернуть панель";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onToggle}
          aria-label={label}
          aria-expanded={!collapsed}
          className={cn(
            "absolute top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-sidebar-foreground/70 outline-none",
            "transition-[left,opacity,background-color,color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
            "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            collapsed ? "left-5 opacity-0 group-hover/brand:opacity-100 focus-visible:opacity-100" : "left-[216px] opacity-100",
          )}
        >
          <PanelLeftClose
            className={cn("size-[18px] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]", collapsed && "rotate-180")}
            aria-hidden
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {label} <kbd className="ml-1 rounded bg-background/20 px-1 font-sans text-[10px]">Ctrl+B</kbd>
      </TooltipContent>
    </Tooltip>
  );
}

function NavLink({ item, slug, collapsed }: { item: NavItem; slug: string; collapsed: boolean }) {
  const pathname = usePathname();
  const href = `/w/${slug}/${item.segment}`;
  const active = pathname === href || pathname.startsWith(`${href}/`);
  const Icon = item.icon;
  const link = (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-9 items-center gap-3 rounded-lg px-[17px] text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon
        className={cn("size-[18px] shrink-0", active ? "text-sidebar-primary" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground")}
        aria-hidden
      />
      {active && <span className="absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-primary" aria-hidden />}
      <span className={sidebarLabel(collapsed)}>{item.label}</span>
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}
