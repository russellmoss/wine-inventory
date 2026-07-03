import "server-only";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { requireTenantId } from "@/lib/tenant/context";

// Phase 16 Unit 4 — SKU mapping (Commerce7 variant+location ↔ our WineSku+Location) + the winery-wide
// DTC sales-account map (on AppSettings). Both feed the WITHHOLD gate (D14): ingest emits NOTHING for an
// order whose SKU is unmapped or whose required sales account is unset — it never guesses a match or
// posts an unbalanced/miscoded journal. Commerce7 stays the durable source, so a withheld order re-emits
// after the operator maps it. Tenant-scoped (RLS). Pure resolvers are exported for the ingest/poster.

// ── SKU mapping ──

export type SkuMapRow = {
  externalProductId: string;
  externalVariantId: string;
  externalSku: string;
  externalInventoryLocationId: string;
  wineSkuId: string | null;
  locationId: string | null;
  active: boolean;
};

/** Current (variant, location) → (WineSku, Location) mappings for the UI. */
export async function getSkuMap(): Promise<SkuMapRow[]> {
  const rows = await prisma.commerce7SkuMap.findMany({
    select: {
      externalProductId: true,
      externalVariantId: true,
      externalSku: true,
      externalInventoryLocationId: true,
      wineSkuId: true,
      locationId: true,
      active: true,
    },
    orderBy: { externalSku: "asc" },
  });
  return rows;
}

/**
 * Upsert SKU-mapping rows. A row is written when BOTH sides are chosen (WineSku + Location); a row with
 * neither is deleted (→ unmapped → withhold). Match, never silently create a WineSku (respect the NV
 * partial-unique split). A half-filled row is ignored (the UI blocks saving it). Atomic, tenant-scoped.
 */
export async function saveSkuMap(
  rows: {
    externalProductId: string;
    externalVariantId: string;
    externalSku: string;
    externalInventoryLocationId: string;
    wineSkuId: string | null;
    locationId: string | null;
  }[],
): Promise<void> {
  await runInTenantTx(async (tx) => {
    const tenantId = requireTenantId();
    for (const r of rows) {
      const both = r.wineSkuId && r.locationId;
      if (both) {
        await tx.commerce7SkuMap.upsert({
          where: { tenantId_externalVariantId_externalInventoryLocationId: { tenantId, externalVariantId: r.externalVariantId, externalInventoryLocationId: r.externalInventoryLocationId } },
          create: {
            externalProductId: r.externalProductId,
            externalVariantId: r.externalVariantId,
            externalSku: r.externalSku,
            externalInventoryLocationId: r.externalInventoryLocationId,
            wineSkuId: r.wineSkuId,
            locationId: r.locationId,
            active: true,
          },
          update: { externalProductId: r.externalProductId, externalSku: r.externalSku, wineSkuId: r.wineSkuId, locationId: r.locationId, active: true },
        });
      } else if (!r.wineSkuId && !r.locationId) {
        await tx.commerce7SkuMap.deleteMany({ where: { externalVariantId: r.externalVariantId, externalInventoryLocationId: r.externalInventoryLocationId } });
      }
      // half-filled → ignored
    }
  });
}

export type ResolvedSku = { wineSkuId: string; locationId: string };

/** Resolve a (variant, location) to our (WineSku, Location), or null if unmapped/inactive (→ withhold). */
export async function resolveSkuMapping(externalVariantId: string, externalInventoryLocationId: string): Promise<ResolvedSku | null> {
  const row = await prisma.commerce7SkuMap.findFirst({
    where: { externalVariantId, externalInventoryLocationId, active: true },
    select: { wineSkuId: true, locationId: true },
  });
  if (!row || !row.wineSkuId || !row.locationId) return null;
  return { wineSkuId: row.wineSkuId, locationId: row.locationId };
}

// ── Sales-account mapping (winery-wide, on AppSettings) ──

export type SalesAccountMap = {
  dtcRevenueAccount: string | null;
  dtcTaxAccount: string | null;
  dtcShippingAccount: string | null;
  dtcClearingAccount: string | null;
  dtcDiscountAccount: string | null;
};

/** Read the winery-wide DTC sales accounts. */
export async function getSalesAccountMap(): Promise<SalesAccountMap> {
  const s = await prisma.appSettings.findFirst({
    select: { dtcRevenueAccount: true, dtcTaxAccount: true, dtcShippingAccount: true, dtcClearingAccount: true, dtcDiscountAccount: true },
  });
  return {
    dtcRevenueAccount: s?.dtcRevenueAccount ?? null,
    dtcTaxAccount: s?.dtcTaxAccount ?? null,
    dtcShippingAccount: s?.dtcShippingAccount ?? null,
    dtcClearingAccount: s?.dtcClearingAccount ?? null,
    dtcDiscountAccount: s?.dtcDiscountAccount ?? null,
  };
}

/** Persist the winery-wide DTC sales accounts (the AppSettings row is per-tenant). */
export async function saveSalesAccountMap(input: SalesAccountMap): Promise<void> {
  await runInTenantTx(async (tx) => {
    const existing = await tx.appSettings.findFirst({ select: { id: true } });
    const data = {
      dtcRevenueAccount: input.dtcRevenueAccount,
      dtcTaxAccount: input.dtcTaxAccount,
      dtcShippingAccount: input.dtcShippingAccount,
      dtcClearingAccount: input.dtcClearingAccount,
      dtcDiscountAccount: input.dtcDiscountAccount,
    };
    if (existing) await tx.appSettings.update({ where: { id: existing.id }, data });
    else await tx.appSettings.create({ data });
  });
}

/** What a specific revenue delta actually needs an account for (only the non-zero legs). */
export type SaleAccountNeeds = { hasTax: boolean; hasShipping: boolean; hasDiscount: boolean };

export type ResolvedSaleAccounts = {
  revenueAccount: string;
  clearingAccount: string;
  taxAccount: string | null;
  shippingAccount: string | null;
  discountAccount: string | null;
};

/**
 * PURE: resolve the accounts a revenue delta needs, or a withhold reason. Revenue + undeposited-funds
 * clearing are ALWAYS required (every settled sale debits clearing / credits revenue); tax / shipping /
 * discount accounts are required ONLY when that leg is non-zero (else the JE would be unbalanced/
 * miscoded — never post it). Mirrors the AP/cost withhold gate (D14).
 */
export function resolveSaleAccounts(
  map: SalesAccountMap,
  needs: SaleAccountNeeds,
): { ok: true; accounts: ResolvedSaleAccounts } | { ok: false; reason: string } {
  const missing: string[] = [];
  if (!map.dtcRevenueAccount) missing.push("revenue");
  if (!map.dtcClearingAccount) missing.push("undeposited-funds clearing");
  if (needs.hasTax && !map.dtcTaxAccount) missing.push("sales tax");
  if (needs.hasShipping && !map.dtcShippingAccount) missing.push("shipping");
  if (needs.hasDiscount && !map.dtcDiscountAccount) missing.push("discount");
  if (missing.length > 0) return { ok: false, reason: `Unmapped account(s): ${missing.join(", ")}.` };
  return {
    ok: true,
    accounts: {
      revenueAccount: map.dtcRevenueAccount as string,
      clearingAccount: map.dtcClearingAccount as string,
      taxAccount: map.dtcTaxAccount,
      shippingAccount: map.dtcShippingAccount,
      discountAccount: map.dtcDiscountAccount,
    },
  };
}
