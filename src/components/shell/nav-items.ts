import {
  AgentsIcon,
  AnalyticsIcon,
  AutomationsIcon,
  ContactsIcon,
  ConversationsIcon,
  DashboardIcon,
  SettingsIcon,
  TemplatesIcon,
  type NavIcon,
} from "@/components/brand/nav-icons";

export type NavItem = { label: string; segment: string; icon: NavIcon };

export const mainNav: NavItem[] = [
  { label: "Dashboard", segment: "dashboard", icon: DashboardIcon },
  { label: "Automations", segment: "automations", icon: AutomationsIcon },
  { label: "AI Agents", segment: "agents", icon: AgentsIcon },
  { label: "Contacts", segment: "contacts", icon: ContactsIcon },
  { label: "Conversations", segment: "conversations", icon: ConversationsIcon },
  { label: "Templates", segment: "templates", icon: TemplatesIcon },
  { label: "Analytics", segment: "analytics", icon: AnalyticsIcon },
];

export const secondaryNav: NavItem[] = [{ label: "Settings", segment: "settings", icon: SettingsIcon }];
