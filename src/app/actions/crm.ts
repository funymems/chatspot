"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { runStatusLabels } from "@/lib/domain/labels";
import type { ActionResult } from "@/lib/action-result";
import { parseInput, runAction } from "@/lib/server/actions";
import { authorizeWorkspace } from "@/lib/server/auth/guards";
import {
  addContactTag,
  createContact,
  deleteContact,
  mergeContacts,
  removeContactTag,
  setCustomFields,
  updateContact,
} from "@/lib/server/services/contacts";
import {
  addInternalNote,
  assignConversation,
  discardPreview,
  previewAiReply,
  sendHumanReply,
  sendPreview,
  setConversationStatus,
  simulateInbound,
  startSimulatedConversation,
} from "@/lib/server/services/inbox";
import { fieldName } from "@/lib/domain/graph/schema";
import { idSchema } from "@/lib/validation/automation";

const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .transform((s) => s || null)
  .pipe(z.email("Введите корректный адрес эл. почты").nullable());
const optionalPhone = z
  .string()
  .trim()
  .max(32)
  .transform((s) => s || null)
  .pipe(z.string().regex(/^\+?[\d\s()-]{5,}$/, "Введите корректный номер телефона").nullable());

const contactSchema = z.object({
  firstName: z.string().trim().max(80).default(""),
  lastName: z.string().trim().max(80).default(""),
  email: optionalEmail,
  phone: optionalPhone,
  leadStatus: z.enum(["new", "engaged", "qualified", "customer", "lost"]),
  notes: z.string().trim().max(5000).default(""),
});
const text = (max: number, msg: string) => z.string().trim().min(1, msg).max(max);

export async function createContactAction(slug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction("contact.create", async () => {
    const ctx = await authorizeWorkspace(slug);
    const data = parseInput(contactSchema.extend({ tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]) }), input);
    const c = await createContact(ctx, data);
    return { ok: true, data: { id: c.id }, message: "Контакт создан" };
  });
}

export async function updateContactAction(slug: string, id: string, input: unknown): Promise<ActionResult<null>> {
  return runAction("contact.update", async () => {
    const ctx = await authorizeWorkspace(slug);
    await updateContact(ctx, idSchema.parse(id), parseInput(contactSchema, input));
    refresh();
    return { ok: true, data: null, message: "Контакт сохранён" };
  });
}

export async function setCustomFieldsAction(slug: string, id: string, fields: unknown): Promise<ActionResult<null>> {
  return runAction("contact.fields", async () => {
    const ctx = await authorizeWorkspace(slug);
    const data = z.array(z.object({ key: fieldName, value: z.string().max(500) })).max(50).parse(fields);
    await setCustomFields(ctx, idSchema.parse(id), Object.fromEntries(data.map((f) => [f.key, f.value])));
    refresh();
    return { ok: true, data: null, message: "Дополнительные поля сохранены" };
  });
}

export async function contactTagAction(slug: string, id: string, tag: string, add: boolean): Promise<ActionResult<null>> {
  return runAction("contact.tag", async () => {
    const ctx = await authorizeWorkspace(slug);
    const t = text(50, "Тег не может быть пустым").parse(tag);
    if (add) await addContactTag(ctx, idSchema.parse(id), t);
    else await removeContactTag(ctx, idSchema.parse(id), t);
    refresh();
    return { ok: true, data: null };
  });
}

export async function mergeContactsAction(slug: string, primaryId: string, duplicateId: string): Promise<ActionResult<null>> {
  return runAction("contact.merge", async () => {
    const ctx = await authorizeWorkspace(slug);
    await mergeContacts(ctx, idSchema.parse(primaryId), idSchema.parse(duplicateId));
    refresh();
    return { ok: true, data: null, message: "Контакты объединены" };
  });
}

export async function deleteContactAction(slug: string, id: string): Promise<ActionResult<null>> {
  return runAction("contact.delete", async () => {
    const ctx = await authorizeWorkspace(slug);
    await deleteContact(ctx, idSchema.parse(id));
    return { ok: true, data: null, message: "Контакт удалён" };
  });
}

// ─── Inbox ──────────────────────────────────────────────────────────────────

type InboxOp =
  | { op: "note"; text: string }
  | { op: "reply"; text: string }
  | { op: "simulate"; text: string; eventId: string }
  | { op: "status"; status: "open" | "needs_human" | "resolved" }
  | { op: "assign"; toMe: boolean }
  | { op: "preview"; agentId: string }
  | { op: "sendPreview"; previewId: string; text: string }
  | { op: "discardPreview"; previewId: string };

const opSchema: z.ZodType<InboxOp> = z.discriminatedUnion("op", [
  z.object({ op: z.literal("note"), text: text(5000, "Напишите заметку") }),
  z.object({ op: z.literal("reply"), text: text(2000, "Напишите ответ") }),
  z.object({ op: z.literal("simulate"), text: text(2000, "Напишите сообщение клиента"), eventId: z.uuid() }),
  z.object({ op: z.literal("status"), status: z.enum(["open", "needs_human", "resolved"]) }),
  z.object({ op: z.literal("assign"), toMe: z.boolean() }),
  z.object({ op: z.literal("preview"), agentId: z.uuid("Выберите агента") }),
  z.object({ op: z.literal("sendPreview"), previewId: z.uuid(), text: text(2000, "Ответ пустой") }),
  z.object({ op: z.literal("discardPreview"), previewId: z.uuid() }),
]);

/** One entry point for conversation mutations; every op re-authorises the workspace. */
export async function inboxAction(slug: string, conversationId: string, input: unknown): Promise<ActionResult<{ info?: string }>> {
  return runAction("inbox.op", async () => {
    const ctx = await authorizeWorkspace(slug);
    const id = idSchema.parse(conversationId);
    const op = opSchema.parse(input);
    let info: string | undefined;
    switch (op.op) {
      case "note":
        await addInternalNote(ctx, id, op.text);
        break;
      case "reply":
        await sendHumanReply(ctx, id, op.text);
        break;
      case "simulate": {
        const res = await simulateInbound(ctx, id, op.text, op.eventId);
        info = res.duplicate
          ? "Повторное событие пропущено"
          : res.execution
            ? `Автоматизация ${"resumed" in res && res.resumed ? "продолжена" : "запущена"} (${runStatusLabels[res.execution.status] ?? res.execution.status})`
            : "Ни одна активная автоматизация не подошла к этому сообщению";
        break;
      }
      case "status":
        await setConversationStatus(ctx, id, op.status);
        break;
      case "assign":
        await assignConversation(ctx, id, op.toMe);
        break;
      case "preview":
        await previewAiReply(ctx, id, op.agentId);
        break;
      case "sendPreview":
        await sendPreview(ctx, id, op.previewId, op.text);
        break;
      case "discardPreview":
        await discardPreview(ctx, id, op.previewId);
        break;
    }
    refresh();
    return { ok: true, data: { info } };
  });
}

export async function startSimulationAction(slug: string, input: unknown): Promise<ActionResult<{ conversationId: string; info: string }>> {
  return runAction("inbox.start", async () => {
    const ctx = await authorizeWorkspace(slug);
    const data = parseInput(
      z.object({ firstName: text(80, "Введите имя"), lastName: z.string().trim().max(80).default(""), text: text(2000, "Напишите первое сообщение") }),
      input,
    );
    const res = await startSimulatedConversation(ctx, data);
    return {
      ok: true,
      data: {
        conversationId: res.conversationId,
        info: res.result.execution ? `Автоматизация запущена (${runStatusLabels[res.result.execution.status] ?? res.result.execution.status})` : "Ни одна активная автоматизация не подошла к первому сообщению",
      },
    };
  });
}
