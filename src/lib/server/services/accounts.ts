import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { profiles, users } from "@/lib/server/db/schema";
import { hashPassword, verifyPassword } from "@/lib/server/auth/password";
import { conflict } from "@/lib/server/errors";
import type { SignInInput, SignUpInput } from "@/lib/validation/auth";
import { createWorkspace, type WorkspaceSummary } from "./workspaces";

export async function registerUser(
  input: SignUpInput,
  opts: { workspaceName?: string; isDemo?: boolean } = {},
): Promise<{ userId: string; workspace: WorkspaceSummary }> {
  const db = await getDb();
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${input.email.toLowerCase()}`)
      .limit(1);
    if (existing) throw conflict("Аккаунт с такой эл. почтой уже существует");

    const [user] = await tx.insert(users).values({ email: input.email, passwordHash }).returning({ id: users.id });
    if (!user) throw new Error("Не удалось создать пользователя");
    const firstName = input.fullName.split(/\s+/)[0] ?? input.fullName;
    const workspace = await createWorkspace(user.id, opts.workspaceName ?? `Пространство ${firstName}`, {
      tx,
      isDemo: opts.isDemo,
    });
    await tx.insert(profiles).values({ userId: user.id, fullName: input.fullName, lastWorkspaceId: workspace.id });
    return { userId: user.id, workspace };
  });
}

// Pre-computed hash used to keep timing similar when the email doesn't exist.
let dummyHash: Promise<string> | undefined;

export async function authenticate(input: SignInInput): Promise<string | null> {
  const db = await getDb();
  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(sql`lower(${users.email}) = ${input.email.toLowerCase()}`)
    .limit(1);
  if (!user) {
    dummyHash ??= hashPassword("not-a-real-password");
    await verifyPassword(input.password, await dummyHash);
    return null;
  }
  return (await verifyPassword(input.password, user.passwordHash)) ? user.id : null;
}

export async function updateProfileName(userId: string, fullName: string) {
  const db = await getDb();
  await db.update(profiles).set({ fullName, updatedAt: new Date() }).where(eq(profiles.userId, userId));
}

export async function getProfile(userId: string) {
  const db = await getDb();
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  return profile ?? null;
}
