import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { listAllOrgIds, disconnectEnumerator } from "@/lib/accounting/enumerator";
import { Commerce7Adapter, commerce7CallContext } from "@/lib/commerce/commerce7";
import type { CommerceAdapter } from "@/lib/commerce/adapter";

// Phase 16 Unit 6 — the read-only drift detector. Compares ERP on-hand (BottledInventory) against
// Commerce7 available-for-sale per mapped (variant, location) and writes a SUMMARY to the connection for
// the dashboard to surface. It NEVER writes inventory — a Commerce7-operator hand-edit shows up here as
// drift for a human to reconcile, never a silent auto-correct.

export type Commerce7DriftDeps = { adapterFactory?: () => CommerceAdapter; orgIds?: string[] };

export type DriftRow = { externalVariantId: string; externalInventoryLocationId: string; erpOnHand: number; c7Available: number | null; drift: number };
export type DriftSummary = { checked: number; drifting: number; rows: DriftRow[] };

/** PURE: drift = ERP on-hand − C7 available. hasDrift when they differ (C7 unknown counts as drift). */
export function computeDrift(erpOnHand: number, c7Available: number | null): { drift: number; hasDrift: boolean } {
  if (c7Available == null) return { drift: erpOnHand, hasDrift: true };
  return { drift: erpOnHand - c7Available, hasDrift: erpOnHand !== c7Available };
}

const MAX_ROWS = Number(process.env.COMMERCE7_DRIFT_MAX_ROWS) || 50;

export async function runCommerce7DriftCheck(deps?: Commerce7DriftDeps): Promise<{ orgs: number; connected: number; totalDrifting: number }> {
  const orgIds = deps?.orgIds ?? (await listAllOrgIds());
  const out = { orgs: orgIds.length, connected: 0, totalDrifting: 0 };

  try {
    for (const tenantId of orgIds) {
      await runAsTenant(tenantId, async () => {
        const conn = await prisma.commerce7Connection.findFirst({ where: { provider: "COMMERCE7", status: "CONNECTED" }, select: { externalTenantId: true } });
        if (!conn || !conn.externalTenantId) return;
        out.connected++;
        const adapter = deps?.adapterFactory ? deps.adapterFactory() : new Commerce7Adapter();
        const ctx = commerce7CallContext(conn.externalTenantId);

        const maps = await prisma.commerce7SkuMap.findMany({
          where: { active: true, wineSkuId: { not: null }, locationId: { not: null } },
          select: { externalVariantId: true, externalInventoryLocationId: true, wineSkuId: true, locationId: true },
          take: MAX_ROWS,
        });

        const rows: DriftRow[] = [];
        let checked = 0;
        for (const m of maps) {
          const inv = await prisma.bottledInventory.findFirst({ where: { wineSkuId: m.wineSkuId as string, locationId: m.locationId as string }, select: { totalBottles: true } });
          const erpOnHand = inv?.totalBottles ?? 0;
          let c7Available: number | null = null;
          try {
            c7Available = await adapter.getVariantInventory(ctx, m.externalVariantId, m.externalInventoryLocationId);
          } catch {
            c7Available = null; // a read error is itself drift-unknown; surfaced, not written
          }
          checked++;
          const { drift, hasDrift } = computeDrift(erpOnHand, c7Available);
          if (hasDrift) rows.push({ externalVariantId: m.externalVariantId, externalInventoryLocationId: m.externalInventoryLocationId, erpOnHand, c7Available, drift });
        }
        out.totalDrifting += rows.length;

        const summary: DriftSummary = { checked, drifting: rows.length, rows: rows.slice(0, MAX_ROWS) };
        await runInTenantTx((tx) =>
          tx.commerce7Connection.updateMany({
            where: { provider: "COMMERCE7", status: "CONNECTED" },
            data: { driftSummary: summary as unknown as Prisma.InputJsonValue, driftCheckedAt: new Date() },
          }),
        );
      });
    }
  } finally {
    await disconnectEnumerator();
  }
  return out;
}
