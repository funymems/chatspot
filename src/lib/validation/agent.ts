import { z } from "zod";
import "./locale";

const text = (max: number) => z.string().trim().max(max, `Не более ${max} символов`);

export const agentRoles = ["general", "support", "sales"] as const;
export const agentTones = ["friendly", "professional", "casual", "concise", "enthusiastic"] as const;

export const createAgentSchema = z.object({
  name: text(80).min(1, "Укажите имя агента"),
  role: z.enum(agentRoles),
  description: text(500).default(""),
});

export const agentGeneralSchema = z.object({
  name: text(80).min(1, "Укажите имя агента"),
  role: z.enum(agentRoles),
  description: text(500).default(""),
  tone: z.enum(agentTones),
  languageMode: z.enum(["match_user", "fixed"]),
  language: text(40).min(2, "Выберите язык"),
});

export const agentInstructionsSchema = z.object({
  instructions: text(8000).default(""),
  businessInfo: text(8000).default(""),
});

export const agentSettingsSchema = z.object({
  fallbackResponse: text(1000).min(1, "Напишите запасной ответ на случай, когда агент не знает ответа"),
  enabled: z.boolean(),
  escalationKeywords: z.array(text(60).min(1)).max(30).default([]),
  escalateOnNoAnswer: z.boolean(),
  escalateOnExplicitRequest: z.boolean(),
});

export const knowledgeTextSchema = z.object({
  title: text(120).min(1, "Добавьте заголовок"),
  content: text(50_000).min(1, "Добавьте текст"),
});

export const knowledgeQaSchema = z.object({
  question: text(500).min(1, "Напишите вопрос"),
  answer: text(4000).min(1, "Напишите ответ"),
});

export const agentChatSchema = z.object({
  text: text(2000).min(1, "Введите сообщение"),
});
