import "server-only";
import type { CostComponent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { requireTenantId } from "@/lib/tenant/context";
import { getValidAccessToken } from "@/lib/accounting/token";
import { QboAdapter } from "@/lib/accounting/qbo/client";
import type { NormalizedAccount, ProviderCallContext } from "@/lib/accounting/adapter";
import { MAPPABLE_COMPONENTS, rankAccountsForRole, type AccountRole } from "@/lib/accounting/components";

// Phase 15 Unit 6 — chart-of-accounts read + the account-mapping model. The winemaker maps each cost
// component to plain-English ACCOUNT ROLES (a "cost / COGS-expense" account and an "inventory asset"
// account) — never raw Debit/Credit (ux + Gemini: ~90% mis-map otherwise). The backend derives
// debit=cost, credit=inventory (matches the seam's buildExportLines) and persists to AccountMapping's
// default row (taxClass='*'), which resolveAccounts falls back to. Tax-class overrides are supported by
// the schema/resolver but v1's UI manages the per-component default.

export { MAPPABLE_COMPONENTS, rankAccountsForRole };
export type { AccountRole };

/** Fetch the connected tenant's chart of accounts (live). Throws if not connected. Tenant-scoped. */
export async function listChartOfAccounts(): Promise<NormalizedAccount[]> {
  const conn = await prisma.accountingConnection.findFirst({
    where: { provider: "QBO", status: "CONNECTED" },
    select: { id: true, externalRealmId: true, environment: true },
  });
  if (!conn || !conn.externalRealmId) {
    throw new Error("Connect QuickBooks first.");
  }
  const accessToken = await getValidAccessToken(conn.id);
  const ctx: ProviderCallContext = {
    accessToken,
    realmId: conn.externalRealmId,
    environment: conn.environment as ProviderCallContext["environment"],
  };
  return new QboAdapter().listAccounts(ctx);
}

export type ComponentMapping = { component: CostComponent; costAccount: string | null; inventoryAccount: string | null };

/** Read the tenant's current per-component default ('*') mappings for the UI. */
export async function getAccountMappings(): Promise<ComponentMapping[]> {
  const rows = await prisma.accountMapping.findMany({
    where: { taxClass: "*" },
    select: { component: true, debitAccount: true, creditAccount: true },
  });
  const byComponent = new Map(rows.map((r) => [r.component, r]));
  return MAPPABLE_COMPONENTS.map(({ component }) => {
    const r = byComponent.get(component);
    return { component, costAccount: r?.debitAccount ?? null, inventoryAccount: r?.creditAccount ?? null };
  });
}

/**
 * Persist per-component default mappings. debit=cost account, credit=inventory account (matches the
 * seam). A row is written only when BOTH accounts are chosen; a fully-cleared row is deleted (so the
 * component reverts to unmapped and export withholds — D14). Atomic batch, tenant-scoped.
 */
export async function saveAccountMappings(
  input: { component: CostComponent; costAccount: string | null; inventoryAccount: string | null }[],
): Promise<void> {
  await runInTenantTx(async (tx) => {
    for (const m of input) {
      const both = m.costAccount && m.inventoryAccount;
      if (both) {
        // The compound-unique `where` needs tenantId literally; runInTenantTx has set the ALS tenant.
        await tx.accountMapping.upsert({
          where: { tenantId_component_taxClass: { tenantId: requireTenantId(), component: m.component, taxClass: "*" } },
          create: { component: m.component, taxClass: "*", debitAccount: m.costAccount!, creditAccount: m.inventoryAccount! },
          update: { debitAccount: m.costAccount!, creditAccount: m.inventoryAccount! },
        });
      } else if (!m.costAccount && !m.inventoryAccount) {
        await tx.accountMapping.deleteMany({ where: { component: m.component, taxClass: "*" } });
      }
      // a half-filled row (one account chosen) is ignored — the UI blocks saving it.
    }
  });
}

export type ApAccounts = { apInventoryAccount: string | null; apPayableAccount: string | null };

/** Read the winery-wide A/P Bill accounts (a supply receipt posts DR inventory / CR A/P). */
export async function getApAccounts(): Promise<ApAccounts> {
  const s = await prisma.appSettings.findFirst({ select: { apInventoryAccount: true, apPayableAccount: true } });
  return { apInventoryAccount: s?.apInventoryAccount ?? null, apPayableAccount: s?.apPayableAccount ?? null };
}

/** Persist the A/P Bill accounts (both set together, or both cleared, to enable/disable AP posting). */
export async function saveApAccounts(input: ApAccounts): Promise<void> {
  await runInTenantTx(async (tx) => {
    const existing = await tx.appSettings.findFirst({ select: { id: true } });
    if (existing) {
      await tx.appSettings.update({ where: { id: existing.id }, data: { apInventoryAccount: input.apInventoryAccount, apPayableAccount: input.apPayableAccount } });
    } else {
      await tx.appSettings.create({ data: { apInventoryAccount: input.apInventoryAccount, apPayableAccount: input.apPayableAccount } });
    }
  });
}
