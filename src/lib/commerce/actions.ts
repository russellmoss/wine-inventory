"use server";

import { adminAction } from "@/lib/actions";
import { confirmInstall, disconnect } from "@/lib/commerce/connection";

// Phase 16 Unit 3 — mutating Commerce7 actions. Confirm + Disconnect are SERVER ACTIONS (Next's
// built-in origin/CSRF protection + the repo's adminAction gate: admin-only, tenant from the verified
// session, never client-supplied). Connect/install stay routes because the install needs browser
// redirects. Unit 4 extends this file with the mapping actions.

/** Flip the nonce-verified PENDING_CONFIRM connection to CONNECTED and register the webhook. */
export const confirmCommerce7 = adminAction(async (ctx) => {
  await confirmInstall({ tenantId: ctx.actor.tenantId });
  return { ok: true as const };
});

/** Disconnect the tenant's Commerce7 link (stop polling, best-effort delete the webhook). */
export const disconnectCommerce7 = adminAction(async (ctx) => {
  await disconnect({ tenantId: ctx.actor.tenantId });
  return { ok: true as const };
});
