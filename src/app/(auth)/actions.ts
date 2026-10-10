"use server";

import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/action-result";
import { parseInput, runAction } from "@/lib/server/actions";
import { createSession, destroySession } from "@/lib/server/auth/session";
import { authenticate, getProfile, registerUser } from "@/lib/server/services/accounts";
import { defaultWorkspaceFor } from "@/lib/server/services/workspaces";
import { signInSchema, signUpSchema } from "@/lib/validation/auth";
import { logger } from "@/lib/server/logger";

export type AuthFormState = ActionResult<null> | null;

export async function signUpAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  let target = "/";
  const result = await runAction("auth.signUp", async () => {
    const input = parseInput(signUpSchema, formData);
    const { userId, workspace } = await registerUser(input);
    await createSession(userId);
    logger.info("auth.signed_up", { userId });
    target = `/w/${workspace.slug}/dashboard`;
    return { ok: true, data: null };
  });
  if (result.ok) redirect(target);
  return result;
}

export async function signInAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  let target = "/";
  const result = await runAction("auth.signIn", async () => {
    const input = parseInput(signInSchema, formData);
    const userId = await authenticate(input);
    if (!userId) return { ok: false, error: "Неверная эл. почта или пароль" };
    await createSession(userId);
    const profile = await getProfile(userId);
    const ws = await defaultWorkspaceFor({ id: userId, lastWorkspaceId: profile?.lastWorkspaceId ?? null });
    target = ws ? `/w/${ws.slug}/dashboard` : "/";
    return { ok: true, data: null };
  });
  if (result.ok) redirect(target);
  return result;
}

export async function signOutAction() {
  await destroySession();
  redirect("/login");
}
