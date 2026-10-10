import { z } from "zod";
import "./locale";

export const automationNameSchema = z.string().trim().min(1, "Укажите название автоматизации").max(120);
export const automationDescriptionSchema = z.string().trim().max(500, "Не более 500 символов").default("");

export const automationDetailsSchema = z.object({
  name: automationNameSchema,
  description: automationDescriptionSchema,
});

export const createAutomationSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("scratch"), name: automationNameSchema, description: automationDescriptionSchema }),
  z.object({ mode: z.literal("template"), templateId: z.uuid("Выберите шаблон"), name: z.string().trim().max(120).default("") }),
  z.object({ mode: z.literal("ai"), name: automationNameSchema, description: automationDescriptionSchema, graph: z.unknown() }),
]);
export type CreateAutomationInput = z.input<typeof createAutomationSchema>;

export const idSchema = z.uuid("Некорректный идентификатор");
