"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { parseInput, runAction } from "@/lib/server/actions";
import { authorizeWorkspace } from "@/lib/server/auth/guards";
import {
  activateAutomation,
  createAutomation,
  deactivateAutomation,
  deleteAutomation,
  duplicateAutomation,
  updateAutomationDetails,
} from "@/lib/server/services/automations";
import { createAutomationFromTemplate } from "@/lib/server/services/templates";
import { automationDetailsSchema, createAutomationSchema, idSchema } from "@/lib/validation/automation";

export async function createAutomationAction(slug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction("automation.create", async () => {
    const ctx = await authorizeWorkspace(slug);
    const data = parseInput(createAutomationSchema, input);
    const row =
      data.mode === "scratch"
        ? await createAutomation(ctx, { name: data.name, description: data.description, origin: "scratch" })
        : await createAutomationFromTemplate(ctx, data.templateId, data.name);
    return { ok: true, data: { id: row.id }, message: `“${row.name}” created as a draft` };
  });
}

export async function updateAutomationDetailsAction(slug: string, id: string, input: unknown): Promise<ActionResult<null>> {
  return runAction("automation.update", async () => {
    const ctx = await authorizeWorkspace(slug);
    const data = parseInput(automationDetailsSchema, input);
    await updateAutomationDetails(ctx, idSchema.parse(id), data);
    refresh();
    return { ok: true, data: null, message: "Details saved" };
  });
}

export async function duplicateAutomationAction(slug: string, id: string): Promise<ActionResult<{ id: string }>> {
  return runAction("automation.duplicate", async () => {
    const ctx = await authorizeWorkspace(slug);
    const copy = await duplicateAutomation(ctx, idSchema.parse(id));
    refresh();
    return { ok: true, data: { id: copy.id }, message: `Duplicated as “${copy.name}”` };
  });
}

export async function deleteAutomationAction(slug: string, id: string): Promise<ActionResult<null>> {
  return runAction("automation.delete", async () => {
    const ctx = await authorizeWorkspace(slug);
    await deleteAutomation(ctx, idSchema.parse(id));
    refresh();
    return { ok: true, data: null, message: "Automation deleted" };
  });
}

export async function setAutomationActiveAction(slug: string, id: string, active: boolean): Promise<ActionResult<null>> {
  return runAction("automation.setActive", async () => {
    const ctx = await authorizeWorkspace(slug);
    const automationId = idSchema.parse(id);
    let message: string;
    if (active) {
      const version = await activateAutomation(ctx, automationId);
      message = `Activated · version ${version.version} is live`;
    } else {
      await deactivateAutomation(ctx, automationId);
      message = "Automation deactivated";
    }
    refresh();
    return { ok: true, data: null, message };
  });
}
