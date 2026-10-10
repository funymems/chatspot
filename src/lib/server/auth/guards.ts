import "server-only";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { getSessionUser, type SessionUser } from "./session";
import type { WorkspaceContext } from "./context";
import { resolveWorkspaceAccess } from "@/lib/server/services/workspaces";
import { AppError } from "@/lib/server/errors";

/**
 * For pages/layouts: the signed-in user or null.
 *
 * PGlite runs in-process, so its queries can complete during prerendering
 * (like synchronous drivers). `connection()` marks everything after it as
 * request-time, which all session-dependent rendering must be.
 */
export async function getOptionalUser(): Promise<SessionUser | null> {
  await connection();
  return getSessionUser();
}

/** For pages/layouts: the signed-in user, or a redirect to /login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getOptionalUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * For pages/layouts: authorises access to the workspace in the URL.
 * Non-members get a 404 so workspace slugs don't leak.
 */
export const requireWorkspace = cache(async (slug: string): Promise<WorkspaceContext> => {
  const user = await requireUser();
  const ctx = await resolveWorkspaceAccess(user.id, slug);
  if (!ctx) notFound();
  return ctx;
});

/** For Server Actions / Route Handlers: same checks, but throws AppErrors. */
export async function authorizeWorkspace(slug: unknown): Promise<WorkspaceContext> {
  const user = await getSessionUser();
  if (!user) throw new AppError("Your session has expired. Sign in again.", "unauthenticated");
  if (typeof slug !== "string" || !slug) throw new AppError("Workspace not found", "not_found");
  const ctx = await resolveWorkspaceAccess(user.id, slug);
  if (!ctx) throw new AppError("Workspace not found", "not_found");
  return ctx;
}
