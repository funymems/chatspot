import type { EscalationRules } from "@/lib/domain/escalation";

export type AgentView = {
  id: string;
  name: string;
  role: "general" | "support" | "sales";
  description: string;
  tone: string;
  languageMode: string;
  language: string;
  instructions: string;
  businessInfo: string;
  fallbackResponse: string;
  enabled: boolean;
  escalationRules: EscalationRules;
};

export type SourceView = {
  id: string;
  type: "text" | "qa" | "file";
  title: string;
  content: string;
  question: string | null;
  answer: string | null;
  fileName: string | null;
  updatedAt: string;
};

export type UnansweredView = { id: string; question: string; createdAt: string; resolved: boolean };

export type ChatMessageView = {
  id: string;
  kind: string;
  body: string;
  payload: { usedSources?: { id: string; title: string }[]; provider?: string; answered?: boolean; handoff?: boolean; handoffReason?: string | null };
};
