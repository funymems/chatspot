import { z } from "zod";

const text = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters`);

export const agentRoles = ["general", "support", "sales"] as const;
export const agentTones = ["friendly", "professional", "casual", "concise", "enthusiastic"] as const;

export const createAgentSchema = z.object({
  name: text(80).min(1, "Give the agent a name"),
  role: z.enum(agentRoles),
  description: text(500).default(""),
});

export const agentGeneralSchema = z.object({
  name: text(80).min(1, "Give the agent a name"),
  role: z.enum(agentRoles),
  description: text(500).default(""),
  tone: z.enum(agentTones),
  languageMode: z.enum(["match_user", "fixed"]),
  language: text(40).min(2, "Choose a language"),
});

export const agentInstructionsSchema = z.object({
  instructions: text(8000).default(""),
  businessInfo: text(8000).default(""),
});

export const agentSettingsSchema = z.object({
  fallbackResponse: text(1000).min(1, "Write a fallback response used when the agent doesn't know the answer"),
  enabled: z.boolean(),
  escalationKeywords: z.array(text(60).min(1)).max(30).default([]),
  escalateOnNoAnswer: z.boolean(),
  escalateOnExplicitRequest: z.boolean(),
});

export const knowledgeTextSchema = z.object({
  title: text(120).min(1, "Add a title"),
  content: text(50_000).min(1, "Add some content"),
});

export const knowledgeQaSchema = z.object({
  question: text(500).min(1, "Write the question"),
  answer: text(4000).min(1, "Write the answer"),
});

export const agentChatSchema = z.object({
  text: text(2000).min(1, "Type a message"),
});
