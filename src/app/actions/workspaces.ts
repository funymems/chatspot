"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { parseInput, runAction } from "@/lib/server/actions";
import { authorizeWorkspace } from "@/lib/server/auth/guards";
import { getSessionUser } from "@/lib/server/auth/session";
import { AppError } from "@/lib/server/errors";
import { createWorkspace, renameWorkspace } from "@/lib/server/services/workspaces";
import { updateProfileName } from "@/lib/server/services/accounts";
import { createWorkspaceSchema, renameWorkspaceSchema } from "@/lib/validation/workspace";
import { z } from "zod";

export async function createWorkspaceAction(input: unknown): Promise<ActionResult<{ slug: string }>> {
  return runAction("workspace.create", async () => {
    const user = await getSessionUser();
    if (!user) throw new AppError("Сессия истекла. Войдите снова.", "unauthenticated");
    const { name } = parseInput(createWorkspaceSchema, input);
    const ws = await createWorkspace(user.id, name);
    return { ok: true, data: { slug: ws.slug }, message: `Рабочее пространство «${ws.name}» создано` };
  });
}

export async function renameWorkspaceAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  return runAction("workspace.rename", async () => {
    const ctx = await authorizeWorkspace(slug);
    const { name } = parseInput(renameWorkspaceSchema, input);
    await renameWorkspace(ctx, name);
    refresh();
    return { ok: true, data: null, message: "Рабочее пространство переименовано" };
  });
}

const profileSchema = z.object({ fullName: z.string().trim().min(1, "Введите имя").max(100) });

export async function updateProfileAction(input: unknown): Promise<ActionResult<null>> {
  return runAction("profile.update", async () => {
    const user = await getSessionUser();
    if (!user) throw new AppError("Сессия истекла. Войдите снова.", "unauthenticated");
    const { fullName } = parseInput(profileSchema, input);
    await updateProfileName(user.id, fullName);
    refresh();
    return { ok: true, data: null, message: "Профиль обновлён" };
  });
}
