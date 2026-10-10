"use server";

import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { parseInput, runAction } from "@/lib/server/actions";
import { authorizeWorkspace } from "@/lib/server/auth/guards";
import {
  getTestSession,
  resetTestSession,
  retryTestOrLiveExecution,
  sendTestMessage,
  type TestSendResult,
} from "@/lib/server/services/test-runs";
import { idSchema } from "@/lib/validation/automation";
import { getContactTags } from "@/lib/server/services/contact-data";

const sendSchema = z.object({
  text: z.string().max(2000, "Messages are limited to 2000 characters"),
  eventId: z.uuid(),
});

export async function sendTestMessageAction(slug: string, automationId: string, input: unknown): Promise<ActionResult<TestSendResult>> {
  return runAction("test.send", async () => {
    const ctx = await authorizeWorkspace(slug);
    const data = parseInput(sendSchema, input);
    const result = await sendTestMessage(ctx, idSchema.parse(automationId), data);
    return { ok: true, data: result };
  });
}

/** Serializable snapshot of the test conversation + latest run for the builder's test panel. */
export async function getTestSessionAction(slug: string, automationId: string) {
  return runAction("test.session", async () => {
    const ctx = await authorizeWorkspace(slug);
    const s = await getTestSession(ctx, idSchema.parse(automationId));
    const tags = await getContactTags(ctx.workspaceId, s.contact.id);
    return {
      ok: true as const,
      data: {
        contact: { name: `${s.contact.firstName} ${s.contact.lastName}`.trim(), tags, email: s.contact.email, phone: s.contact.phone, customFields: s.contact.customFields, leadStatus: s.contact.leadStatus },
        conversationStatus: s.conversation.status,
        messages: s.messages.map((m) => ({
          id: m.id,
          kind: m.kind,
          source: m.source,
          body: m.body,
          deliveryStatus: m.deliveryStatus,
          payload: m.payload as { quickReplies?: { id: string; label: string }[]; linkButtons?: { id: string; label: string; url: string }[] },
          createdAt: m.createdAt.toISOString(),
        })),
        execution: s.execution
          ? {
              id: s.execution.id,
              status: s.execution.status,
              error: s.execution.error,
              errorNodeId: s.execution.errorNodeId,
              result: s.execution.result as Record<string, unknown> | null,
              stepCount: s.execution.stepCount,
              wait: (s.execution.state as { wait?: { kind: string; nodeId: string; resumeAt?: string } }).wait ?? null,
              createdAt: s.execution.createdAt.toISOString(),
              finishedAt: s.execution.finishedAt?.toISOString() ?? null,
            }
          : null,
        logs: s.logs.map((l) => ({
          id: l.id,
          seq: l.seq,
          nodeId: l.nodeId,
          nodeType: l.nodeType,
          status: l.status,
          branch: l.branch,
          error: l.error,
          input: l.input,
          output: l.output,
          durationMs: l.durationMs,
          startedAt: l.startedAt.toISOString(),
        })),
      },
    };
  });
}
export type TestSessionData = Extract<Awaited<ReturnType<typeof getTestSessionAction>>, { ok: true }>["data"];

export async function resetTestSessionAction(slug: string): Promise<ActionResult<null>> {
  return runAction("test.reset", async () => {
    const ctx = await authorizeWorkspace(slug);
    await resetTestSession(ctx);
    return { ok: true, data: null, message: "Test conversation reset" };
  });
}

export async function retryExecutionAction(slug: string, executionId: string): Promise<ActionResult<{ id: string; status: string }>> {
  return runAction("execution.retry", async () => {
    const ctx = await authorizeWorkspace(slug);
    const exec = await retryTestOrLiveExecution(ctx, idSchema.parse(executionId));
    return { ok: true, data: { id: exec.id, status: exec.status }, message: "Run retried" };
  });
}
