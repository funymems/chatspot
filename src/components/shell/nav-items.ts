import {
  BarChart3,
  Bot,
  LayoutDashboard,
  LayoutTemplate,
  MessagesSquare,
  Settings,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { label: string; segment: string; icon: LucideIcon };

export const mainNav: NavItem[] = [
  { label: "Dashboard", segment: "dashboard", icon: LayoutDashboard },
  { label: "Automations", segment: "automations", icon: Workflow },
  { label: "AI Agents", segment: "agents", icon: Bot },
  { label: "Contacts", segment: "contacts", icon: Users },
  { label: "Conversations", segment: "conversations", icon: MessagesSquare },
  { label: "Templates", segment: "templates", icon: LayoutTemplate },
  { label: "Analytics", segment: "analytics", icon: BarChart3 },
];

export const secondaryNav: NavItem[] = [{ label: "Settings", segment: "settings", icon: Settings }];
