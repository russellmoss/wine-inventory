import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { getValidAccessToken } from "@/lib/accounting/token";
import { QboAdapter } from "@/lib/accounting/qbo/client";
import type { ProviderCallContext } from "@/lib/accounting/adapter";
import { findVendorNearMatches } from "@/lib/vendors/vendors-shared";

// Plan 077 (QBO vendor sync, Slice 2) — eager create-into-QBO. When a Cellarhand vendor is created (opt-in
// tenants), push the HOME-currency QBO vendor and stamp externalVendorId, AFTER the local commit (never a DB tx
// across the multi-second QBO HTTP call — Neon P2028). Idempotent (skip if already linked; findOrCreateVendor
// query-before-creates). QBO offline → syncStatus='pending' (the retry sweep, Unit 5, catches it). A P2002 on
// the (tenantId, externalVendorId) unique (another vendor already holds that QBO id) → syncStatus='conflict'.
// Foreign currency-scoped vendors ("Acme (EUR)", Plan 073) stay LAZY at bill-post — never pre-created here.

const isP2002 = (e: unknown) => !!e && typeof e === "object" && (e as { code?: string }).code === "P2002";

/** Build a QBO call context for the current tenant, or null when there's no usable connection (not connected,
 *  or the token can't be refreshed). Callers treat null as "can't reach QBO now" — pre-check returns empty,
 *  push marks pending, the sweep skips. Mirrors post-sweep.ts's connection/token/ctx build. */
async function buildQboCtx(): Promise<{ ctx: ProviderCallContext; adapter: QboAdapter } | null> {
  const conn = await prisma.accountingConnection.findFirst({
    where: { provider: "QBO", status: "CONNECTED" },
    select: { id: true, externalRealmId: true, environment: true, homeCurrency: true, multiCurrencyEnabled: true },
  });
  if (!conn || !conn.externalRealmId) return null;
  let accessToken: string;
  try {
    accessToken = await getValidAccessToken(conn.id);
  } catch {
    return null; // NeedsReauth / refresh failure → treat as offline
  }
  const ctx: ProviderCallContext = {
    accessToken,
    realmId: conn.externalRealmId,
    environment: conn.environment as ProviderCallContext["environment"],
    homeCurrency: conn.homeCurrency ?? "USD",
    multiCurrencyEnabled: conn.multiCurrencyEnabled,
  };
  return { ctx, adapter: new QboAdapter() };
}

export type VendorPushStatus = "synced" | "pending" | "conflict";

/** Stamp externalVendorId + syncStatus=synced on a vendor. P2002 (another vendor already holds that QBO id) →
 *  mark conflict instead of 500. Its own small tx (no network held). */
async function applyLink(vendorId: string, externalVendorId: string): Promise<VendorPushStatus> {
  try {
    await runInTenantTx((tx) => tx.vendor.update({ where: { id: vendorId }, data: { externalVendorId, syncStatus: "synced" } }));
    return "synced";
  } catch (e) {
    if (isP2002(e)) {
      await runInTenantTx((tx) => tx.vendor.update({ where: { id: vendorId }, data: { syncStatus: "conflict" } }));
      return "conflict";
    }
    throw e;
  }
}

async function markPending(vendorId: string): Promise<VendorPushStatus> {
  await runInTenantTx((tx) => tx.vendor.update({ where: { id: vendorId }, data: { syncStatus: "pending" } }));
  return "pending";
}

/**
 * Push one vendor to QBO. With `linkExternalId` (the user picked an existing QBO vendor in the pre-check), just
 * link — no QBO create. Otherwise: skip if already linked (idempotent); no connection/offline → pending;
 * else findOrCreateVendor (home currency, no suffix) → stamp externalVendorId. Fault → pending; P2002 → conflict.
 * Runs OUTSIDE any create tx. Pass opts.tenantId to wrap in runAsTenant (post-commit callers / the sweep).
 */
export async function pushVendorToQboCore(vendorId: string, opts?: { tenantId?: string; linkExternalId?: string }): Promise<VendorPushStatus> {
  const run = async (): Promise<VendorPushStatus> => {
    if (opts?.linkExternalId) return applyLink(vendorId, opts.linkExternalId);

    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { id: true, name: true, externalVendorId: true } });
    if (!vendor) return "conflict"; // gone — nothing to push
    if (vendor.externalVendorId) return "synced"; // already linked — idempotent

    const conn = await buildQboCtx();
    if (!conn) return markPending(vendorId); // no connection / offline → retry later

    let externalVendorId: string;
    try {
      externalVendorId = await conn.adapter.findOrCreateVendor(conn.ctx, vendor.name); // home currency (no suffix)
    } catch {
      return markPending(vendorId); // network/auth/transient → retry sweep (a vendor create has no period_closed)
    }
    return applyLink(vendorId, externalVendorId);
  };
  return opts?.tenantId ? runAsTenant(opts.tenantId, run) : run();
}

/**
 * Fuzzy-match a candidate name against QBO's vendors BEFORE creating one, so the eager push can offer "link to
 * the existing QBO vendor" instead of creating a duplicate. Reuses Slice-1 listVendors + Plan-074
 * findVendorNearMatches (so QBO-side and local-side dedup behave identically). Empty on no-connection / offline /
 * blank name — never blocks a create. Read-only.
 */
export async function getQboVendorMatchesCore(name: string, opts?: { tenantId?: string }): Promise<{ high: { externalId: string; name: string }[] }> {
  const run = async () => {
    const ref = (name ?? "").trim();
    if (!ref) return { high: [] };
    const conn = await buildQboCtx();
    if (!conn) return { high: [] };
    let qbo: Awaited<ReturnType<QboAdapter["listVendors"]>>;
    try {
      qbo = await conn.adapter.listVendors(conn.ctx);
    } catch {
      return { high: [] };
    }
    const { high } = findVendorNearMatches(ref, qbo.map((v) => ({ id: v.externalId, name: v.name })));
    return { high: high.map((v) => ({ externalId: v.id, name: v.name })) };
  };
  return opts?.tenantId ? runAsTenant(opts.tenantId, run) : run();
}
