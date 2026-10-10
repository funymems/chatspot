import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth/session";
import { completeInstagramOAuth } from "@/lib/server/integrations/instagram/oauth";
import { defaultWorkspaceFor } from "@/lib/server/services/workspaces";

/**
 * OAuth redirect target (must exactly match INSTAGRAM_REDIRECT_URI and the
 * "Valid OAuth Redirect URIs" entry in the Meta App Dashboard).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await getSessionUser();
  const outcome = await completeInstagramOAuth({
    currentUserId: user?.id ?? null,
    state: url.searchParams.get("state"),
    code: url.searchParams.get("code"),
    error: url.searchParams.get("error"),
    errorReason: url.searchParams.get("error_reason"),
  });

  if (!user) return NextResponse.redirect(new URL("/login", url));
  let slug = outcome.workspaceSlug;
  if (!slug) slug = (await defaultWorkspaceFor(user))?.slug ?? null;
  if (!slug) return NextResponse.redirect(new URL("/", url));

  const target = new URL(`/w/${slug}/settings`, url);
  if (outcome.ok) {
    target.searchParams.set("instagram", "connected");
    if (!outcome.webhookSubscribed) target.searchParams.set("instagram_warning", "webhook");
  } else {
    target.searchParams.set("instagram_error", outcome.reason);
  }
  target.hash = "integrations";
  return NextResponse.redirect(target);
}
