"use server";

import { adminAction } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { confirmInstall, disconnect } from "@/lib/commerce/connection";
import { getSkuMap, saveSkuMap, getSalesAccountMap, saveSalesAccountMap, type SalesAccountMap, type SkuMapRow } from "@/lib/commerce/mapping";
import { Commerce7Adapter, commerce7CallContext } from "@/lib/commerce/commerce7";
import { listChartOfAccounts } from "@/lib/accounting/coa";
import { rankAccountsForRole } from "@/lib/accounting/components";
import type { NormalizedAccount } from "@/lib/accounting/adapter";
import type { ProviderVariant } from "@/lib/commerce/adapter";

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

export type SalesAccountsRanked = {
  revenue: NormalizedAccount[];
  salesTax: NormalizedAccount[];
  shipping: NormalizedAccount[];
  clearing: NormalizedAccount[];
  discount: NormalizedAccount[];
};

export type Commerce7MappingData = {
  variants: ProviderVariant[]; // C7 variant × location rows to map
  wineSkus: { id: string; label: string }[];
  locations: { id: string; name: string }[];
  skuMap: SkuMapRow[];
  salesAccounts: SalesAccountMap;
  coa: SalesAccountsRanked | null; // null when QuickBooks isn't connected (accounts can't be picked yet)
  qboConnected: boolean;
};

const PRODUCT_PAGE_CAP = 40; // bounded backfill of the catalog for the mapping picker

/** Load everything the mapping card needs: C7 variants (via the adapter), our WineSkus + Locations, the
 *  current maps, and the QBO chart of accounts pre-ranked for the DTC roles. Admin + tenant-scoped. */
export const loadCommerce7Mapping = adminAction(async (): Promise<Commerce7MappingData> => {
  const conn = await prisma.commerce7Connection.findFirst({ where: { provider: "COMMERCE7", status: "CONNECTED" }, select: { externalTenantId: true } });
  if (!conn || !conn.externalTenantId) throw new Error("Connect Commerce7 first.");

  // C7 catalog (bounded).
  const adapter = new Commerce7Adapter();
  const ctx = commerce7CallContext(conn.externalTenantId);
  const variants: ProviderVariant[] = [];
  let cursor = null as Awaited<ReturnType<typeof adapter.listProducts>>["nextCursor"];
  for (let i = 0; i < PRODUCT_PAGE_CAP; i++) {
    const { products, nextCursor } = await adapter.listProducts(ctx, cursor);
    for (const p of products) variants.push(...p.variants);
    if (!nextCursor) break;
    cursor = nextCursor;
  }

  const [wineSkuRows, locationRows, skuMap, salesAccounts, qbo] = await Promise.all([
    prisma.wineSku.findMany({ where: { isActive: true }, select: { id: true, name: true, vintage: true }, orderBy: [{ name: "asc" }, { vintage: "desc" }] }),
    prisma.location.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getSkuMap(),
    getSalesAccountMap(),
    prisma.accountingConnection.findFirst({ where: { provider: "QBO", status: "CONNECTED" }, select: { id: true } }),
  ]);

  let coa: SalesAccountsRanked | null = null;
  if (qbo) {
    const accounts = await listChartOfAccounts();
    coa = {
      revenue: rankAccountsForRole(accounts, "revenue"),
      salesTax: rankAccountsForRole(accounts, "salesTax"),
      shipping: rankAccountsForRole(accounts, "shipping"),
      clearing: rankAccountsForRole(accounts, "clearing"),
      discount: rankAccountsForRole(accounts, "discount"),
    };
  }

  return {
    variants,
    wineSkus: wineSkuRows.map((w) => ({ id: w.id, label: w.vintage ? `${w.name} ${w.vintage}` : `${w.name} (NV)` })),
    locations: locationRows,
    skuMap,
    salesAccounts,
    coa,
    qboConnected: !!qbo,
  };
});

/** Persist the (variant, location) → (WineSku, Location) mappings. */
export const saveCommerce7SkuMap = adminAction(async (_ctx, rows: Parameters<typeof saveSkuMap>[0]) => {
  await saveSkuMap(rows);
  return { ok: true as const };
});

/** Persist the winery-wide DTC sales accounts. */
export const saveCommerce7SalesAccounts = adminAction(async (_ctx, input: SalesAccountMap) => {
  await saveSalesAccountMap(input);
  return { ok: true as const };
});
