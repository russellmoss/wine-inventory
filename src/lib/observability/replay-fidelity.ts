"use server";

import { cookies } from "next/headers";
import { requireReadyUser } from "@/lib/dal";
import { DEVELOPER_HOME_ORG_ID } from "@/lib/access";
import {
  REPLAY_FIDELITY_COOKIE,
  resolveReplayFidelity,
  type ReplayFidelity,
} from "@/lib/observability/sentry-replay";

// Plan 080 Unit 6 — server side of the replay-fidelity hint.
//
// WHY a cookie: the fidelity must be known client-side before React mounts (the diagnostics
// indicator and the interaction trail both read it), and it can only be resolved from the session
// server-side. So the server publishes the resolved value as a non-httpOnly cookie holding ONLY the
// enum (no PII). It no longer configures Sentry — replay body capture was removed entirely — so a
// tampered value can at worst affect our own bounded, redacted trail labels.
//
// WHY NOT proxy.ts: Next 16's proxy runs per-request but only has `getSessionCookie` (presence, no
// DB), so it cannot know role/tenant without a session+member lookup on every request. Instead we
// write the cookie at the points where fidelity can actually CHANGE (login-adjacent app load and
// support-tenant enter/exit), and proxy clears it when there is no session. Absent/garbled cookie
// always resolves to "masked", so every gap fails closed.
//
// This cookie is client-writable, so it is a DEFAULT rather than a guarantee. That used to matter a
// great deal, because it gated Sentry request/response body capture. It no longer does: body capture
// was removed entirely, so the worst a tampered value can do is keep readable element labels in our
// own bounded, redacted trail.

/**
 * Resolve the current session's replay fidelity and publish it as the hint cookie.
 * Safe to call repeatedly (idempotent). Returns the fidelity that was written.
 */
export async function syncReplayFidelity(): Promise<ReplayFidelity> {
  const user = await requireReadyUser();
  const effectiveTenantId = user.supportOrganizationId ?? user.activeOrganizationId ?? null;
  const fidelity = resolveReplayFidelity({
    role: user.role,
    effectiveTenantId,
    sandboxTenantId: DEVELOPER_HOME_ORG_ID,
  });
  (await cookies()).set(REPLAY_FIDELITY_COOKIE, fidelity, {
    // MUST be readable by instrumentation-client at Sentry init — hence not httpOnly.
    // Contains only "full" | "masked": no PII, no tenant id, no session material.
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return fidelity;
}
