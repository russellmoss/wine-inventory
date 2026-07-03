"use server";

import type { CostComponent } from "@prisma/client";
import { adminAction } from "@/lib/actions";
import { disconnect } from "@/lib/accounting/connection";
import { loadQboConfig } from "@/lib/accounting/qbo/config";
import { listChartOfAccounts, saveAccountMappings, saveApAccounts, rankAccountsForRole, type AccountRole, type ApAccounts } from "@/lib/accounting/coa";
import type { NormalizedAccount } from "@/lib/accounting/adapter";

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

/** Load the connected company's chart of accounts, pre-ranked per role for the mapping pickers. */
export const loadChartOfAccounts = adminAction(
  async (): Promise<{ cost: NormalizedAccount[]; inventory: NormalizedAccount[]; payable: NormalizedAccount[] }> => {
    const accounts = await listChartOfAccounts();
    return {
      cost: rankAccountsForRole(accounts, "cost" satisfies AccountRole),
      inventory: rankAccountsForRole(accounts, "inventory" satisfies AccountRole),
      payable: rankAccountsForRole(accounts, "payable" satisfies AccountRole),
    };
  },
);

/** Persist the winery-wide A/P Bill accounts (supply receipts → QBO Bill: DR inventory / CR A/P). */
export const saveApBillAccounts = adminAction(async (_ctx, input: ApAccounts) => {
  await saveApAccounts(input);
  return { ok: true as const };
});

/** Persist the per-component account mappings (business roles → debit=cost, credit=inventory). The
 * client sends component as a plain string; cast to the enum at this trusted boundary. */
export const saveComponentMappings = adminAction(
  async (_ctx, mappings: { component: string; costAccount: string | null; inventoryAccount: string | null }[]) => {
    await saveAccountMappings(mappings as { component: CostComponent; costAccount: string | null; inventoryAccount: string | null }[]);
    return { ok: true as const };
  },
);
