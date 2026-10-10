import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb, type Executor } from "@/lib/server/db/client";
import { profiles, users, workspaceMembers, workspaces } from "@/lib/server/db/schema";
import { hasRole, type Role, type WorkspaceContext } from "@/lib/server/auth/context";
import { forbidden } from "@/lib/server/errors";
import { recordActivity } from "./activity";

export type WorkspaceSummary = { id: string; name: string; slug: string; role: Role; isDemo: boolean };

export function slugify(name: string) {
  const base = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return `${base || "workspace"}-${randomBytes(3).toString("hex")}`;
}

/**
 * The single authorisation gate for workspace-scoped work: returns a
 * WorkspaceContext only if `userId` is a member of the workspace with `slug`.
 */
export async function resolveWorkspaceAccess(userId: string, slug: string): Promise<WorkspaceContext | null> {
  const db = await getDb();
  const [row] = await db
    .select({ id: workspaces.id, slug: workspaces.slug, name: workspaces.name, role: workspaceMembers.role })
    .from(workspaces)
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(and(eq(workspaces.slug, slug), eq(workspaceMembers.userId, userId)))
    .limit(1);
  if (!row) return null;
  return { workspaceId: row.id, workspaceSlug: row.slug, workspaceName: row.name, userId, role: row.role };
}

export function assertRole(ctx: WorkspaceContext, min: Role) {
  if (!hasRole(ctx.role, min)) throw forbidden(`Для этого действия нужна роль «${({ owner: "владелец", admin: "администратор", member: "участник" } as Record<string, string>)[min] ?? min}»`);
}

export async function listWorkspacesForUser(userId: string): Promise<WorkspaceSummary[]> {
  const db = await getDb();
  return db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      role: workspaceMembers.role,
      isDemo: workspaces.isDemo,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(asc(workspaces.createdAt));
}

export async function createWorkspace(
  userId: string,
  name: string,
  opts: { isDemo?: boolean; tx?: Executor } = {},
): Promise<WorkspaceSummary> {
  const run = async (tx: Executor) => {
    const [ws] = await tx
      .insert(workspaces)
      .values({ name, slug: slugify(name), createdBy: userId, isDemo: opts.isDemo ?? false })
      .returning();
    if (!ws) throw new Error("Не удалось создать рабочее пространство");
    await tx.insert(workspaceMembers).values({ workspaceId: ws.id, userId, role: "owner" });
    await recordActivity(
      { workspaceId: ws.id, userId },
      { type: "workspace.created", summary: `Создано рабочее пространство «${name}»`, entityType: "workspace", entityId: ws.id },
      tx,
    );
    return { id: ws.id, name: ws.name, slug: ws.slug, role: "owner" as const, isDemo: ws.isDemo };
  };
  if (opts.tx) return run(opts.tx);
  const db = await getDb();
  return db.transaction(run);
}

export async function renameWorkspace(ctx: WorkspaceContext, name: string) {
  assertRole(ctx, "admin");
  const db = await getDb();
  await db.update(workspaces).set({ name, updatedAt: new Date() }).where(eq(workspaces.id, ctx.workspaceId));
  await recordActivity(ctx, { type: "workspace.renamed", summary: `Рабочее пространство переименовано в «${name}»` });
}

export async function listMembers(ctx: WorkspaceContext) {
  const db = await getDb();
  return db
    .select({
      userId: users.id,
      email: users.email,
      fullName: profiles.fullName,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.createdAt,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, ctx.workspaceId))
    .orderBy(asc(workspaceMembers.createdAt));
}

export async function rememberLastWorkspace(ctx: WorkspaceContext) {
  const db = await getDb();
  await db
    .update(profiles)
    .set({ lastWorkspaceId: ctx.workspaceId, updatedAt: sql`now()` })
    .where(eq(profiles.userId, ctx.userId));
}

/** Workspace to open after sign-in: the last one used, else the oldest membership. */
export async function defaultWorkspaceFor(user: { id: string; lastWorkspaceId: string | null }) {
  const all = await listWorkspacesForUser(user.id);
  return all.find((w) => w.id === user.lastWorkspaceId) ?? all[0] ?? null;
}
