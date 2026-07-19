import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { REPLAY_FIDELITY_COOKIE } from "@/lib/observability/sentry-replay";

// OPTIMISTIC redirect only. proxy.ts is NOT a security boundary in Next 16
// (CVE-2025-29927). Authoritative checks live in the DAL + every server action.
const PUBLIC_PREFIXES = ["/login", "/forgot-password", "/reset-password", "/api/auth", "/styleguide", "/manifest.webmanifest", "/vendor"];

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("from", pathname);
    const response = NextResponse.redirect(url);
    // Fail closed: no session means no basis for full-fidelity replay capture, so drop the hint
    // rather than letting a stale "full" survive a logout / session switch (Plan 080 Unit 6).
    // Cheap + DB-free; the authoritative value is re-written by syncReplayFidelity() after login.
    response.cookies.delete(REPLAY_FIDELITY_COOKIE);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|assets/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|otf|woff|woff2)$).*)",
  ],
};
