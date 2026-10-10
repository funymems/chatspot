"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Logo, LogoMark } from "@/components/brand/logo";
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

  return (
    <div className="flex min-h-svh bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex",
          collapsed ? "w-[68px]" : "w-64",
        )}
        aria-label="Main navigation"
      >
        <SidebarContent workspace={workspace} workspaces={workspaces} user={user} collapsed={collapsed} />
        <div className={cn("border-t border-sidebar-border p-2", collapsed && "flex justify-center")}>
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "sm"}
            className="w-full justify-start text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={() => collapseStore.set(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            {!collapsed && <span>Collapse</span>}
          </Button>
        </div>
      </aside>

      {/* Mobile / tablet drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 border-none bg-sidebar p-0 text-sidebar-foreground">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent workspace={workspace} workspaces={workspaces} user={user} collapsed={false} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
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
}: {
  workspace: ShellWorkspace;
  workspaces: ShellWorkspace[];
  user: ShellUser;
  collapsed: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn("flex h-14 items-center px-4", collapsed && "justify-center px-0")}>
        <Link href={`/w/${workspace.slug}/dashboard`} aria-label="ChatSpot home">
          {collapsed ? <LogoMark /> : <Logo inverted />}
        </Link>
      </div>
      <div className="px-2 pb-2">
        <WorkspaceSwitcher current={workspace} workspaces={workspaces} collapsed={collapsed} />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2" aria-label="Primary">
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
        "group flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon
        className={cn("size-[18px] shrink-0", active ? "text-sidebar-primary" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground")}
        aria-hidden
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
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
