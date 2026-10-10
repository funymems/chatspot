"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { runAction } from "@/lib/server/actions";
import { authorizeWorkspace } from "@/lib/server/auth/guards";
import { startInstagramConnect } from "@/lib/server/integrations/instagram/oauth";
import { disconnectInstagram, setInstagramAutoReply } from "@/lib/server/integrations/instagram/connections";
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
    return { ok: true, data: null, message: "Instagram disconnected. Remove the app in Instagram settings to revoke access completely." };
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
      message: enabled ? "Auto-replies on: active automations now answer Instagram DMs" : "Auto-replies off: Instagram messages only arrive in the inbox",
    };
  });
}
