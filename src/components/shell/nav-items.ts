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
  { label: "Главная", segment: "dashboard", icon: DashboardIcon },
  { label: "Автоматизации", segment: "automations", icon: AutomationsIcon },
  { label: "ИИ-агенты", segment: "agents", icon: AgentsIcon },
  { label: "Контакты", segment: "contacts", icon: ContactsIcon },
  { label: "Диалоги", segment: "conversations", icon: ConversationsIcon },
  { label: "Шаблоны", segment: "templates", icon: TemplatesIcon },
  { label: "Аналитика", segment: "analytics", icon: AnalyticsIcon },
];

export const secondaryNav: NavItem[] = [{ label: "Настройки", segment: "settings", icon: SettingsIcon }];
