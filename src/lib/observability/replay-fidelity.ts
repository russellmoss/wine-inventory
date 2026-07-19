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
// WHY a cookie: Sentry's replayIntegration options (masking / networkDetailAllowUrls) are
// INIT-TIME only, and instrumentation-client.ts boots before auth is known. The server therefore
// publishes the resolved fidelity as a non-httpOnly cookie holding ONLY the enum (no PII) so init
// can read it synchronously.
//
// WHY NOT proxy.ts: Next 16's proxy runs per-request but only has `getSessionCookie` (presence, no
// DB), so it cannot know role/tenant without a session+member lookup on every request. Instead we
// write the cookie at the points where fidelity can actually CHANGE (login-adjacent app load and
// support-tenant enter/exit), and proxy clears it when there is no session. Absent/garbled cookie
// always resolves to "masked", so every gap fails closed.
//
// This cookie is a client-side DEFAULT, never the guarantee: it is client-writable, so the real
// enforcement for real customer tenants is Sentry server-side data scrubbing at ingest.

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
