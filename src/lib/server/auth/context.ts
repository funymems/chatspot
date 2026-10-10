import type { memberRole } from "@/lib/server/db/schema";

export type Role = (typeof memberRole.enumValues)[number];

/**
 * Proof that `userId` is a member of `workspaceId`. Only produced by
 * `resolveWorkspaceAccess` — never construct one from client input.
 */
export type WorkspaceContext = {
  readonly workspaceId: string;
  readonly workspaceSlug: string;
  readonly workspaceName: string;
  readonly userId: string;
  readonly role: Role;
};

const rank: Record<Role, number> = { member: 1, admin: 2, owner: 3 };
export const hasRole = (role: Role, min: Role) => rank[role] >= rank[min];
