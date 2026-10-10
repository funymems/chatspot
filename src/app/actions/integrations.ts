"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import type { ActionResult } from "@/lib/action-result";
import { runAction } from "@/lib/server/actions";
import { authorizeWorkspace } from "@/lib/server/auth/guards";
import { startInstagramConnect } from "@/lib/server/integrations/instagram/oauth";
import { disconnectInstagram, setInstagramAutoReply } from "@/lib/server/integrations/instagram/connections";
import { InstagramApiError } from "@/lib/server/integrations/instagram/api";
import { pullInstagramMessages } from "@/lib/server/integrations/instagram/pull";
import { processDueJobs } from "@/lib/server/jobs/worker";
import { z } from "zod";

/** Returns the Instagram authorize URL; the browser then navigates there. */
export async function startInstagramConnectAction(slug: string): Promise<ActionResult<{ url: string }>> {
  return runAction("instagram.connect", async () => {
    const ctx = await authorizeWorkspace(slug);
    return { ok: true, data: { url: await startInstagramConnect(ctx) } };
  });
}

export async function disconnectInstagramAction(slug: string): Promise<ActionResult<null>> {
  return runAction("instagram.disconnect", async () => {
    const ctx = await authorizeWorkspace(slug);
    await disconnectInstagram(ctx);
    refresh();
    return { ok: true, data: null, message: "Instagram отключён. Чтобы полностью отозвать доступ, удалите приложение в настройках Instagram." };
  });
}

export async function setInstagramAutoReplyAction(slug: string, enabled: boolean): Promise<ActionResult<null>> {
  return runAction("instagram.autoreply", async () => {
    const ctx = await authorizeWorkspace(slug);
    await setInstagramAutoReply(ctx, z.boolean().parse(enabled));
    refresh();
    return {
      ok: true,
      data: null,
      message: enabled ? "Автоответы включены: активные автоматизации теперь отвечают на сообщения в Instagram" : "Автоответы выключены: сообщения из Instagram только попадают во входящие",
    };
  });
}

/** Fetches recent DMs via the Conversations API (works without webhooks) and processes them. */
export async function pullInstagramMessagesAction(slug: string): Promise<ActionResult<{ candidates: number; stored: number; dispatched: number }>> {
  return runAction("instagram.pull", async () => {
    const ctx = await authorizeWorkspace(slug);
    try {
      const r = await pullInstagramMessages(ctx);
      // Run the started automation steps (e.g. the Instagram reply) right away, as the webhook route does.
      if (r.dispatched) after(() => processDueJobs());
      refresh();
      const message = !r.candidates
        ? `За последние 24 часа новых входящих сообщений нет (проверено переписок: ${r.threads})`
        : `Новых сообщений сохранено: ${r.stored}, запущено автоматизаций: ${r.dispatched}`;
      return { ok: true, data: { candidates: r.candidates, stored: r.stored, dispatched: r.dispatched }, message };
    } catch (err) {
      // Meta's error text never contains tokens (see api.ts) and is the useful part here.
      if (err instanceof InstagramApiError) return { ok: false, error: err.message };
      throw err;
    }
  });
}
