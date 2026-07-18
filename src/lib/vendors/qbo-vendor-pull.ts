import { prisma } from "@/lib/prisma";
import { runAsTenant, requireTenantId } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { getValidAccessToken } from "@/lib/accounting/token";
import { QboAdapter } from "@/lib/accounting/qbo/client";
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
    const qbo = await new QboAdapter().listVendors(ctx);

    // ALL local vendors (incl. archived) — an archived vendor can still hold an externalVendorId, so it must
    // count as "synced" (else its QBO record re-surfaces forever). findVendorNearMatches skips the Unknown fallback.
    const existing = await prisma.vendor.findMany({ select: { id: true, name: true, externalVendorId: true } });
    const rejected = await prisma.vendorImportCandidate.findMany({
      where: { status: "REJECTED" },
      select: { externalVendorId: true, currencyVariantIds: true },
    });
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

    const syncedIds = existing.map((v) => v.externalVendorId).filter((x): x is string => !!x);

    await runInTenantTx(async (tx) => {
      const tid = requireTenantId();
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
      // Sweep stale PENDING candidates that got linked since the last pull (accepted via another path).
      if (syncedIds.length) {
        await tx.vendorImportCandidate.deleteMany({ where: { status: "PENDING", externalVendorId: { in: syncedIds } } });
      }
    });

    return { ok: true, pulled: qbo.length, candidates: candidates.length, skippedSynced, skippedRejected };
  });
}
