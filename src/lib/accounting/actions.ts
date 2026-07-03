"use server";

import { adminAction } from "@/lib/actions";
import { disconnect } from "@/lib/accounting/connection";
import { loadQboConfig } from "@/lib/accounting/qbo/config";

// Phase 15 Unit 4 — mutating accounting actions. Disconnect is a SERVER ACTION (not a raw POST route)
// so it inherits Next's built-in origin/CSRF protection and the repo's adminAction gate (SEC-S6:
// admin-only, tenant derived from the verified session, never client-supplied). Connect/callback stay
// routes because OAuth needs real browser redirects.

/** Zeroize + disconnect the tenant's QuickBooks connection, then best-effort revoke (SEC-S5). */
export const disconnectQuickBooks = adminAction(async (ctx) => {
  const cfg = loadQboConfig();
  await disconnect({ tenantId: ctx.actor.tenantId, environment: cfg.environment });
  return { ok: true as const };
});
