import { prisma } from "@/lib/prisma";
import { runAsTenant, requireTenantId } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { getValidAccessToken } from "@/lib/accounting/token";
import { QboAdapter } from "@/lib/accounting/qbo/client";
import { listAllOrgIds, disconnectEnumerator } from "@/lib/accounting/enumerator";
import type { ProviderCallContext } from "@/lib/accounting/adapter";
import { reconcileQboVendors } from "@/lib/vendors/qbo-vendor-pull-shared";

// Plan 075 (QBO vendor sync, Slice 1) — the I/O wrapper for the vendor pull. Reads the tenant's CONNECTED QBO
// connection + token, pulls ALL vendors (paginated), and reconciles them into the vendor_import_candidate review
// queue via the pure reconcileQboVendors. The pure decision logic + its tests live in qbo-vendor-pull-shared.ts.
// Tenant-scoped: everything runs inside runAsTenant (a cron has no session; an action already has one — nested
// runAsTenant with the same tenant is a no-op-ish re-set). Reads go through the RLS-scoped extended prisma.

export type VendorPullResult =
  | { ok: true; pulled: number; candidates: number; skippedSynced: number; skippedRejected: number }
  | { ok: false; reason: "no-connection" };

/**
 * Pull QBO vendors for one tenant and reconcile them into the review queue. Idempotent (the pure reconcile is
 * deterministic; upserts are keyed on (tenantId, externalVendorId); rejected tombstones suppress). Stale PENDING
 * candidates that have since been linked (accepted elsewhere) are swept. Returns counts, or a no-connection sentinel.
 */
export async function pullQboVendorsForTenant(tenantId: string): Promise<VendorPullResult> {
  return runAsTenant(tenantId, async () => {
    const conn = await prisma.accountingConnection.findFirst({
      where: { provider: "QBO", status: "CONNECTED" },
      select: { id: true, externalRealmId: true, environment: true, homeCurrency: true, multiCurrencyEnabled: true },
    });
    if (!conn || !conn.externalRealmId) return { ok: false, reason: "no-connection" };

    const accessToken = await getValidAccessToken(conn.id);
    const ctx: ProviderCallContext = {
      accessToken,
      realmId: conn.externalRealmId,
      environment: conn.environment as ProviderCallContext["environment"],
      homeCurrency: conn.homeCurrency ?? "USD",
      multiCurrencyEnabled: conn.multiCurrencyEnabled,
    };
    const qbo = await new QboAdapter().listVendors(ctx); // network — OUTSIDE the tx

    // Read → reconcile → upsert → sweep all inside ONE tx, against a consistent snapshot: a concurrent
    // accept/merge (which deletes the candidate + links the vendor) is then either fully seen or fully unseen,
    // so it can't transiently resurface an already-resolved candidate (review finding).
    const result = await runInTenantTx(async (tx) => {
      const tid = requireTenantId();
      // ALL local vendors (incl. archived) — an archived vendor can still hold an externalVendorId, so it must
      // count as "synced" (else its QBO record re-surfaces forever). findVendorNearMatches skips the Unknown fallback.
      const existing = await tx.vendor.findMany({ select: { id: true, name: true, externalVendorId: true } });
      const rejected = await tx.vendorImportCandidate.findMany({ where: { status: "REJECTED" }, select: { externalVendorId: true, currencyVariantIds: true } });
      const rejectedIds = new Set<string>();
      for (const r of rejected) {
        rejectedIds.add(r.externalVendorId);
        for (const v of r.currencyVariantIds) rejectedIds.add(v);
      }

      const { candidates, skippedSynced, skippedRejected } = reconcileQboVendors(
        qbo.map((v) => ({ externalId: v.externalId, name: v.name, active: v.active })),
        existing,
        rejectedIds,
      );

      const currentKeys = candidates.map((c) => c.externalVendorId);
      for (const c of candidates) {
        await tx.vendorImportCandidate.upsert({
          where: { tenantId_externalVendorId: { tenantId: tid, externalVendorId: c.externalVendorId } },
          update: { name: c.name, suggestedVendorId: c.suggestedVendorId, currencyVariantIds: c.currencyVariantIds },
          create: {
            tenantId: tid,
            externalVendorId: c.externalVendorId,
            name: c.name,
            suggestedVendorId: c.suggestedVendorId,
            currencyVariantIds: c.currencyVariantIds,
          },
        });
      }
      // FULL reconcile: the PENDING queue after a pull == exactly this pull's candidates. Deleting PENDING rows
      // not in `currentKeys` drops the stale ones a "delete-synced-only" sweep would orphan — a canonical-id
      // flip when a base vendor appears after its "(CUR)" variant, a QBO rename/delete, or a now-synced supplier.
      await tx.vendorImportCandidate.deleteMany({ where: { status: "PENDING", externalVendorId: { notIn: currentKeys } } });

      return { pulled: qbo.length, candidates: candidates.length, skippedSynced, skippedRejected };
    });

    return { ok: true, ...result };
  });
}

export type VendorPullSweepSummary = { tenants: number; connected: number; pulled: number; candidates: number; errors: number };

/**
 * Plan 075 Unit 7 (optional): the scheduled poll sweep. Enumerates every org (via the least-privilege
 * enumerator role — it only reads `organization`, never the connection, SEC-C3), then pulls per tenant through
 * `pullQboVendorsForTenant` (which reads the connection + token inside its own `runAsTenant`). A tenant with no
 * CONNECTED QBO connection is silently skipped. One tenant's failure doesn't abort the sweep. The manual pull
 * button (Units 5-6) is the primary path; this just keeps bookkeeper-added vendors trickling in.
 */
export async function runQboVendorPullSweep(deps?: { orgIds?: string[] }): Promise<VendorPullSweepSummary> {
  const orgIds = deps?.orgIds ?? (await listAllOrgIds());
  const summary: VendorPullSweepSummary = { tenants: orgIds.length, connected: 0, pulled: 0, candidates: 0, errors: 0 };
  try {
    for (const tenantId of orgIds) {
      try {
        const res = await pullQboVendorsForTenant(tenantId);
        if (res.ok) { summary.connected++; summary.pulled += res.pulled; summary.candidates += res.candidates; }
      } catch { summary.errors++; }
    }
  } finally {
    if (!deps?.orgIds) await disconnectEnumerator();
  }
  return summary;
}
