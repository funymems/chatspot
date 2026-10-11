import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth/session";
import { defaultWorkspaceFor } from "@/lib/server/services/workspaces";

/**
 * TikTok OAuth redirect target (registered as the app's redirect URL).
 * Placeholder until the TikTok integration ships: nothing is exchanged or
 * stored; the visitor is sent back to Settings with a "coming soon" notice.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", url));
  const slug = (await defaultWorkspaceFor(user))?.slug;
  if (!slug) return NextResponse.redirect(new URL("/", url));
  const target = new URL(`/w/${slug}/settings`, url);
  target.searchParams.set("tiktok", "soon");
  target.hash = "integrations";
  return NextResponse.redirect(target);
}
