import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type * as schemaNs from "./schema";
import { templates } from "./schema";
import { builtInTemplates } from "@/lib/domain/templates";

/**
 * Upserts built-in templates (workspace_id = null). Runs after migrations on
 * every boot, so editing a template definition in code updates the DB copy.
 */
export async function syncSystemTemplates(db: PgliteDatabase<typeof schemaNs>) {
  for (const t of builtInTemplates) {
    const graph = t.build();
    const [existing] = await db
      .select({ id: templates.id })
      .from(templates)
      .where(and(isNull(templates.workspaceId), eq(templates.slug, t.slug)))
      .limit(1);
    if (existing) {
      await db
        .update(templates)
        .set({ name: t.name, description: t.description, category: t.category, graph, updatedAt: new Date() })
        .where(eq(templates.id, existing.id));
    } else {
      await db.insert(templates).values({
        slug: t.slug,
        name: t.name,
        description: t.description,
        category: t.category,
        graph,
        isSystem: true,
      });
    }
  }
}
