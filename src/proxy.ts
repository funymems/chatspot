import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate only: redirects visitors without a session cookie away from
 * the app. The real check (session validity + workspace membership) happens in
 * the data access layer — see src/lib/server/auth/guards.ts.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("cs_session")) {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/w/:path*", "/onboarding"],
};
