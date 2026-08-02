// The path allow-list the optimistic auth proxy lets through WITHOUT a session cookie.
//
// Pure (no next/server import) so the list is unit-testable — proxy.ts is the only consumer.
//
// `/monitoring` is load-bearing and non-obvious: it is Sentry's `tunnelRoute` (next.config.ts),
// the same-origin endpoint the BROWSER posts error envelopes to so ad-blockers don't eat them.
// It is not a user surface. When it was missing from this list the proxy 307'd every envelope to
// `/login?from=/monitoring?o=…`, and the browser re-POSTed to the login page → 405. Net effect:
// the app reported ZERO client-side errors from any session-less page — which is exactly the
// login page, where we most need them. Sentry authenticates each envelope against the DSN it
// carries, so the route is safe to expose (that is the design of a tunnel).
export const PUBLIC_PREFIXES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/api/auth",
  "/monitoring",
  "/styleguide",
  "/manifest.webmanifest",
  "/vendor",
] as const;

/** True when `pathname` is the public prefix itself or a path nested under it. */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
