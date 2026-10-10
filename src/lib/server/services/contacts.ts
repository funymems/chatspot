import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  automationExecutions,
  automations,
  contactTags,
  contacts,
  conversations,
  messages,
  tags,
} from "@/lib/server/db/schema";
import type { WorkspaceContext } from "@/lib/server/auth/context";
import { conflict, notFound, validationError } from "@/lib/server/errors";
import { addTagToContact, removeTagFromContact } from "./contact-data";
import { recordActivity } from "./activity";

export type LeadStatus = (typeof contacts.$inferSelect)["leadStatus"];
export const leadStatuses: LeadStatus[] = ["new", "engaged", "qualified", "customer", "lost"];
export const contactSorts = ["recent", "oldest", "name", "last_interaction"] as const;
export type ContactSort = (typeof contactSorts)[number];

export type ContactFilter = {
  q?: string;
  tag?: string;
  status?: LeadStatus;
  sort?: ContactSort;
  page?: number;
  pageSize?: number;
  includeTest?: boolean;
};

const like = (s: string) => `%${s.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

export async function listContacts(ctx: WorkspaceContext, f: ContactFilter = {}) {
  const db = await getDb();
  const pageSize = Math.min(Math.max(f.pageSize ?? 25, 5), 100);
  const page = Math.max(f.page ?? 1, 1);
  const where: (SQL | undefined)[] = [eq(contacts.workspaceId, ctx.workspaceId), isNull(contacts.mergedIntoId)];
  if (!f.includeTest) where.push(ne(contacts.source, "test"));
  if (f.status) where.push(eq(contacts.leadStatus, f.status));
  if (f.q?.trim()) {
    const t = like(f.q.trim());
    where.push(
      or(
        ilike(contacts.firstName, t),
        ilike(contacts.lastName, t),
        ilike(contacts.email, t),
        ilike(contacts.phone, t),
        sql`(${contacts.firstName} || ' ' || ${contacts.lastName}) ilike ${t}`,
      ),
    );
  }
  if (f.tag) {
    where.push(
      sql`exists (select 1 from ${contactTags} ct join ${tags} t on t.id = ct.tag_id
                   where ct.contact_id = ${contacts.id} and lower(t.name) = ${f.tag.toLowerCase()})`,
    );
  }
  const order =
    f.sort === "oldest"
      ? [asc(contacts.createdAt)]
      : f.sort === "name"
        ? [asc(sql`lower(${contacts.firstName} || ' ' || ${contacts.lastName})`)]
        : f.sort === "last_interaction"
          ? [sql`${contacts.lastInteractionAt} desc nulls last`]
          : [desc(contacts.createdAt)];

  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    db
      .select()
      .from(contacts)
      .where(and(...where))
      .orderBy(...order)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(contacts).where(and(...where)),
  ]);
  const tagMap = await tagsFor(ctx.workspaceId, rows.map((r) => r.id));
  return { rows: rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] })), total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

async function tagsFor(workspaceId: string, contactIds: string[]) {
  const map = new Map<string, string[]>();
  if (!contactIds.length) return map;
  const db = await getDb();
  const rows = await db
    .select({ contactId: contactTags.contactId, name: tags.name })
    .from(contactTags)
    .innerJoin(tags, eq(tags.id, contactTags.tagId))
    .where(and(eq(contactTags.workspaceId, workspaceId), inArray(contactTags.contactId, contactIds)))
    .orderBy(asc(tags.name));
  for (const r of rows) map.set(r.contactId, [...(map.get(r.contactId) ?? []), r.name]);
  return map;
}

export async function listTags(ctx: WorkspaceContext) {
  const db = await getDb();
  return db
    .select({ id: tags.id, name: tags.name, uses: count(contactTags.contactId) })
    .from(tags)
    .leftJoin(contactTags, eq(contactTags.tagId, tags.id))
    .where(eq(tags.workspaceId, ctx.workspaceId))
    .groupBy(tags.id)
    .orderBy(asc(tags.name));
}

async function getOwned(ctx: WorkspaceContext, id: string) {
  const db = await getDb();
  const [row] = await db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.workspaceId, ctx.workspaceId))).limit(1);
  if (!row) throw notFound("контакт");
  return row;
}

export async function getContactDetail(ctx: WorkspaceContext, id: string) {
  const contact = await getOwned(ctx, id);
  const db = await getDb();
  const convIds = (
    await db.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.workspaceId, ctx.workspaceId), eq(conversations.contactId, id)))
  ).map((c) => c.id);
  const [tagNames, history, runs, duplicates] = await Promise.all([
    tagsFor(ctx.workspaceId, [id]).then((m) => m.get(id) ?? []),
    convIds.length
      ? db
          .select({ id: messages.id, kind: messages.kind, source: messages.source, body: messages.body, createdAt: messages.createdAt, conversationId: messages.conversationId })
          .from(messages)
          .where(and(eq(messages.workspaceId, ctx.workspaceId), inArray(messages.conversationId, convIds)))
          .orderBy(desc(messages.createdAt))
          .limit(50)
      : Promise.resolve([]),
    db
      .select({
        id: automationExecutions.id,
        automationId: automationExecutions.automationId,
        automationName: automations.name,
        status: automationExecutions.status,
        mode: automationExecutions.mode,
        createdAt: automationExecutions.createdAt,
      })
      .from(automationExecutions)
      .innerJoin(automations, eq(automations.id, automationExecutions.automationId))
      .where(and(eq(automationExecutions.workspaceId, ctx.workspaceId), eq(automationExecutions.contactId, id)))
      .orderBy(desc(automationExecutions.createdAt))
      .limit(20),
    findDuplicates(ctx, contact),
  ]);
  return { contact, tags: tagNames, history, runs, duplicates, conversationIds: convIds };
}

/** Possible duplicates: same email, same phone, or same full name (never merged automatically). */
export async function findDuplicates(ctx: WorkspaceContext, c: typeof contacts.$inferSelect) {
  const db = await getDb();
  const conds: SQL[] = [];
  if (c.email) conds.push(sql`lower(${contacts.email}) = ${c.email.toLowerCase()}`);
  if (c.phone) conds.push(eq(contacts.phone, c.phone));
  if (c.firstName && c.lastName) conds.push(sql`lower(${contacts.firstName}) = ${c.firstName.toLowerCase()} and lower(${contacts.lastName}) = ${c.lastName.toLowerCase()}`);
  if (!conds.length) return [];
  return db
    .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email, phone: contacts.phone, createdAt: contacts.createdAt })
    .from(contacts)
    .where(and(eq(contacts.workspaceId, ctx.workspaceId), ne(contacts.id, c.id), isNull(contacts.mergedIntoId), or(...conds)))
    .limit(5);
}

export type ContactInput = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  leadStatus: LeadStatus;
  notes: string;
};

export async function createContact(ctx: WorkspaceContext, input: ContactInput & { tags?: string[] }) {
  if (!input.firstName && !input.lastName && !input.email && !input.phone) throw validationError("Укажите хотя бы имя, эл. почту или телефон");
  const db = await getDb();
  const [row] = await db
    .insert(contacts)
    .values({ workspaceId: ctx.workspaceId, ...input, source: "manual" })
    .returning();
  for (const t of input.tags ?? []) await addTagToContact(ctx.workspaceId, row!.id, t);
  await recordActivity(ctx, {
    type: "contact.created",
    summary: `Добавлен контакт «${[row!.firstName, row!.lastName].filter(Boolean).join(" ") || row!.email || row!.phone}»`,
    entityType: "contact",
    entityId: row!.id,
  });
  return row!;
}

export async function updateContact(ctx: WorkspaceContext, id: string, input: ContactInput) {
  await getOwned(ctx, id);
  const db = await getDb();
  await db
    .update(contacts)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(contacts.id, id), eq(contacts.workspaceId, ctx.workspaceId)));
}

export async function setCustomFields(ctx: WorkspaceContext, id: string, fields: Record<string, string>) {
  await getOwned(ctx, id);
  const db = await getDb();
  await db.update(contacts).set({ customFields: fields, updatedAt: new Date() }).where(and(eq(contacts.id, id), eq(contacts.workspaceId, ctx.workspaceId)));
}

export async function addContactTag(ctx: WorkspaceContext, id: string, tag: string) {
  await getOwned(ctx, id);
  if (!tag.trim()) throw validationError("Тег не может быть пустым");
  await addTagToContact(ctx.workspaceId, id, tag);
}

export async function removeContactTag(ctx: WorkspaceContext, id: string, tag: string) {
  await getOwned(ctx, id);
  await removeTagFromContact(ctx.workspaceId, id, tag);
}

export async function deleteContact(ctx: WorkspaceContext, id: string) {
  const c = await getOwned(ctx, id);
  const db = await getDb();
  await db.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.workspaceId, ctx.workspaceId)));
  await recordActivity(ctx, { type: "contact.deleted", summary: `Удалён контакт «${[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "без имени"}»`, entityType: "contact" });
}

/**
 * Explicit merge: `duplicateId` is folded into `primaryId`. Conversations,
 * runs and tags move over, empty fields on the primary are filled, custom
 * fields are combined (primary wins), and the duplicate is marked merged.
 */
export async function mergeContacts(ctx: WorkspaceContext, primaryId: string, duplicateId: string) {
  if (primaryId === duplicateId) throw validationError("Выберите два разных контакта");
  const [primary, dup] = await Promise.all([getOwned(ctx, primaryId), getOwned(ctx, duplicateId)]);
  if (primary.mergedIntoId || dup.mergedIntoId) throw conflict("Один из этих контактов уже объединён");
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.update(conversations).set({ contactId: primary.id }).where(and(eq(conversations.workspaceId, ctx.workspaceId), eq(conversations.contactId, dup.id)));
    await tx
      .update(automationExecutions)
      .set({ contactId: primary.id })
      .where(and(eq(automationExecutions.workspaceId, ctx.workspaceId), eq(automationExecutions.contactId, dup.id)));
    await tx.execute(sql`
      insert into contact_tags (contact_id, tag_id, workspace_id)
      select ${primary.id}, tag_id, workspace_id from contact_tags where contact_id = ${dup.id}
      on conflict do nothing`);
    await tx.delete(contactTags).where(eq(contactTags.contactId, dup.id));
    await tx
      .update(contacts)
      .set({
        firstName: primary.firstName || dup.firstName,
        lastName: primary.lastName || dup.lastName,
        email: primary.email ?? dup.email,
        phone: primary.phone ?? dup.phone,
        notes: [primary.notes, dup.notes].filter(Boolean).join("\n\n"),
        customFields: { ...(dup.customFields as Record<string, string>), ...(primary.customFields as Record<string, string>) },
        lastInteractionAt:
          [primary.lastInteractionAt, dup.lastInteractionAt].filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, primary.id));
    await tx.update(contacts).set({ mergedIntoId: primary.id, updatedAt: new Date() }).where(eq(contacts.id, dup.id));
  });
  await recordActivity(ctx, {
    type: "contact.merged",
    summary: `Дубликат объединён с контактом «${[primary.firstName, primary.lastName].filter(Boolean).join(" ") || primary.email}»`,
    entityType: "contact",
    entityId: primary.id,
  });
}
