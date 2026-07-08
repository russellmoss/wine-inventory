import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

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
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|assets/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|otf|woff|woff2)$).*)",
  ],
};
