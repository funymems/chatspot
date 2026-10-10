"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/lib/action-result";
import { runAction } from "@/lib/server/actions";
import { authorizeWorkspace } from "@/lib/server/auth/guards";
import { startInstagramConnect } from "@/lib/server/integrations/instagram/oauth";
import { disconnectInstagram } from "@/lib/server/integrations/instagram/connections";

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
