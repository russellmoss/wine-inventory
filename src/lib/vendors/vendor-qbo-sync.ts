import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { getValidAccessToken } from "@/lib/accounting/token";
import { QboAdapter } from "@/lib/accounting/qbo/client";
import { listAllOrgIds, disconnectEnumerator } from "@/lib/accounting/enumerator";
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

const SWEEP_BATCH = 100; // bounded per-tenant per-run — winery vendor counts are small; a big backlog trickles across runs.

export type VendorSyncSweepSummary = { tenants: number; opted: number; retried: number; synced: number; stillPending: number; conflicts: number; errors: number };

/**
 * Plan 077 Unit 5 — the offline retry sweep. A vendor created while QBO was unreachable is stamped
 * syncStatus='pending'; this pushes it later, unattended. Enumerates every org (least-privilege enumerator, SEC-C3),
 * per-tenant runAsTenant: skip tenants that haven't opted into push OR have no CONNECTED QBO connection, then
 * re-push each pending vendor via the SAME idempotent pushVendorToQboCore (query-before-create → safe to retry; no
 * claim/lease table needed). One vendor's failure stays pending and isolated; one tenant's failure doesn't abort
 * the sweep. Best-effort backstop for the eager create path — the lazy bill-post path is the other backstop.
 */
export async function runVendorSyncSweep(deps?: { orgIds?: string[] }): Promise<VendorSyncSweepSummary> {
  const orgIds = deps?.orgIds ?? (await listAllOrgIds());
  const summary: VendorSyncSweepSummary = { tenants: orgIds.length, opted: 0, retried: 0, synced: 0, stillPending: 0, conflicts: 0, errors: 0 };
  try {
    for (const tenantId of orgIds) {
      try {
        await runAsTenant(tenantId, async () => {
          const settings = await prisma.appSettings.findFirst({ select: { pushVendorsToQbo: true } });
          if (!settings?.pushVendorsToQbo) return; // not opted in — leave pending vendors alone
          const conn = await buildQboCtx();
          if (!conn) return; // QBO offline for this tenant — try again next run
          summary.opted++;
          const pending = await prisma.vendor.findMany({
            where: { syncStatus: "pending", externalVendorId: null },
            select: { id: true },
            take: SWEEP_BATCH,
          });
          for (const v of pending) {
            summary.retried++;
            const status = await pushVendorToQboCore(v.id); // already inside runAsTenant — no nested tenantId
            if (status === "synced") summary.synced++;
            else if (status === "conflict") summary.conflicts++;
            else summary.stillPending++;
          }
        });
      } catch { summary.errors++; }
    }
  } finally {
    if (!deps?.orgIds) await disconnectEnumerator();
  }
  return summary;
}
