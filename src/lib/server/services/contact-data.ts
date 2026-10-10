import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { contacts, contactTags, tags } from "@/lib/server/db/schema";
import { isBuiltinContactField, type EvalScope } from "@/lib/domain/engine/expressions";

/**
 * Low-level, workspace-scoped contact mutations used by the engine and the
 * CRM. Callers must pass a workspaceId they already trust (from an authorised
 * context or a server-side execution row) — never one from client input.
 */

export async function getContactTags(workspaceId: string, contactId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ name: tags.name })
    .from(contactTags)
    .innerJoin(tags, eq(tags.id, contactTags.tagId))
    .where(and(eq(contactTags.workspaceId, workspaceId), eq(contactTags.contactId, contactId)));
  return rows.map((r) => r.name);
}

export async function ensureTag(workspaceId: string, name: string) {
  const db = await getDb();
  const clean = name.trim().slice(0, 50);
  const [existing] = await db
    .select()
    .from(tags)
    .where(and(eq(tags.workspaceId, workspaceId), sql`lower(${tags.name}) = ${clean.toLowerCase()}`))
    .limit(1);
  if (existing) return existing;
  const [created] = await db.insert(tags).values({ workspaceId, name: clean }).onConflictDoNothing().returning();
  if (created) return created;
  // Lost a race with a concurrent insert: read it back.
  const [again] = await db.select().from(tags).where(and(eq(tags.workspaceId, workspaceId), sql`lower(${tags.name}) = ${clean.toLowerCase()}`));
  return again!;
}

export async function addTagToContact(workspaceId: string, contactId: string, name: string) {
  const tag = await ensureTag(workspaceId, name);
  const db = await getDb();
  await db.insert(contactTags).values({ workspaceId, contactId, tagId: tag.id }).onConflictDoNothing();
  return tag;
}

export async function removeTagFromContact(workspaceId: string, contactId: string, name: string) {
  const db = await getDb();
  await db.execute(sql`
    delete from contact_tags ct using tags t
     where ct.tag_id = t.id and ct.workspace_id = ${workspaceId} and ct.contact_id = ${contactId}
       and lower(t.name) = ${name.trim().toLowerCase()}`);
}

/** Sets a built-in field (first_name, email, …) or a custom field. */
export async function setContactField(workspaceId: string, contactId: string, field: string, value: string) {
  const db = await getDb();
  const where = and(eq(contacts.id, contactId), eq(contacts.workspaceId, workspaceId));
  const v = value.slice(0, 500);
  const map: Record<string, Partial<typeof contacts.$inferInsert>> = {
    first_name: { firstName: v },
    last_name: { lastName: v },
    email: { email: v || null },
    phone: { phone: v || null },
    notes: { notes: v },
  };
  if (field === "lead_status") {
    const allowed = ["new", "engaged", "qualified", "customer", "lost"] as const;
    const status = allowed.find((s) => s === v.toLowerCase());
    if (!status) throw new Error(`"${v}" is not a valid lead status`);
    await db.update(contacts).set({ leadStatus: status, updatedAt: new Date() }).where(where);
    return;
  }
  if (isBuiltinContactField(field)) {
    await db.update(contacts).set({ ...map[field], updatedAt: new Date() }).where(where);
    return;
  }
  await db
    .update(contacts)
    .set({ customFields: sql`${contacts.customFields} || ${JSON.stringify({ [field]: v })}::jsonb`, updatedAt: new Date() })
    .where(where);
}

export async function loadScopeParts(workspaceId: string, contactId: string | null): Promise<Pick<EvalScope, "contact" | "tags">> {
  if (!contactId) {
    return { contact: { first_name: "", last_name: "", email: "", phone: "", lead_status: "new", notes: "", custom: {} }, tags: [] };
  }
  const db = await getDb();
  const [c] = await db.select().from(contacts).where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, workspaceId))).limit(1);
  const tagNames = await getContactTags(workspaceId, contactId);
  return {
    contact: {
      first_name: c?.firstName ?? "",
      last_name: c?.lastName ?? "",
      email: c?.email ?? "",
      phone: c?.phone ?? "",
      lead_status: c?.leadStatus ?? "new",
      notes: c?.notes ?? "",
      custom: (c?.customFields as Record<string, string>) ?? {},
    },
    tags: tagNames,
  };
}

export async function touchContact(workspaceId: string, contactId: string) {
  const db = await getDb();
  await db
    .update(contacts)
    .set({ lastInteractionAt: new Date(), updatedAt: new Date() })
    .where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, workspaceId)));
}
