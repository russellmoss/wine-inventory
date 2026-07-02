import type { Prisma } from "@prisma/client";
import { barrelFillDepreciation, accruedBarrelCost, daysBetween } from "@/lib/cost/barrel";

// Phase 8b (Unit 8, D7) — the barrel-fill projection: the cost domain's fold at the ledger chokepoint
// (the plan's "fourth deterministic fold"). Called from writeLotOperation AFTER the VesselLot diff, once
// per op, with the before/after volume of every affected (vessel, lot) pair. It is a NO-OP unless an
// affected vessel is a barrel that has a BarrelAsset — the common (tank) path pays one indexed lookup
// and returns. When wine ENTERS an empty barrel a fill OPENS (bump the barrel's fill counter, snapshot
// the accelerated cost slice); when it LEAVES the fill CLOSES and an immutable BARREL CostLine is
// materialized on the close op (days × volume × slice), so the roll-up's accrue-to-date derivation
// (cost/data.ts) stops counting it and the bottling snapshot can freeze it. Script-safe (no
// "server-only"): the same chokepoint drives verify scripts.

const EPS = 1e-6;

export type BarrelAffected = {
  vesselId: string;
  lotId: string;
  beforeL: number;
  afterL: number;
};

/** Open/close barrel fills for the affected (vessel, lot) pairs on this op. Returns a small summary. */
export async function foldBarrelFills(
  tx: Prisma.TransactionClient,
  params: { affected: BarrelAffected[]; opId: number; observedAt: Date },
): Promise<{ opened: number; closed: number; materializedCost: number }> {
  const { affected, opId, observedAt } = params;
  const vesselIds = [...new Set(affected.map((a) => a.vesselId))];
  if (vesselIds.length === 0) return { opened: 0, closed: 0, materializedCost: 0 };

  // Fast path: no barrel assets among the affected vessels → nothing to do (tanks, un-costed barrels).
  const assets = await tx.barrelAsset.findMany({
    where: { vesselId: { in: vesselIds } },
    select: { id: true, vesselId: true, purchaseCost: true, currency: true, usefulLifeFills: true, currentFillNumber: true, vessel: { select: { capacityL: true } } },
  });
  if (assets.length === 0) return { opened: 0, closed: 0, materializedCost: 0 };
  const assetByVessel = new Map(assets.map((a) => [a.vesselId, a]));

  const settings = await tx.appSettings.findFirst({ select: { costingPolicyVersion: true } });
  const policyVersion = settings?.costingPolicyVersion ?? 1;

  let opened = 0;
  let closed = 0;
  let materializedCost = 0;

  for (const a of affected) {
    const asset = assetByVessel.get(a.vesselId);
    if (!asset) continue;
    const capacityL = Number(asset.vessel.capacityL);
    const entered = a.beforeL <= EPS && a.afterL > EPS;
    const left = a.beforeL > EPS && a.afterL <= EPS;

    if (entered) {
      const fillNumber = asset.currentFillNumber + 1;
      const purchaseCost = Number(asset.purchaseCost);
      const fillDepreciation = barrelFillDepreciation(purchaseCost, fillNumber, asset.usefulLifeFills);
      await tx.barrelFill.create({
        data: {
          barrelAssetId: asset.id,
          lotId: a.lotId,
          fillNumber,
          volumeL: a.afterL,
          capacityL,
          purchaseCostSnapshot: purchaseCost,
          fillDepreciation,
          startedAt: observedAt,
          openOpId: opId,
          policyVersion,
        },
      });
      await tx.barrelAsset.update({ where: { id: asset.id }, data: { currentFillNumber: fillNumber } });
      opened++;
    } else if (left) {
      // Close the open fill for this (barrel, lot) and materialize its accrued BARREL cost.
      const fill = await tx.barrelFill.findFirst({
        where: { barrelAssetId: asset.id, lotId: a.lotId, endedAt: null },
        orderBy: { startedAt: "desc" },
      });
      if (!fill) continue;
      const days = daysBetween(fill.startedAt.getTime(), observedAt.getTime());
      const cost = accruedBarrelCost({
        fillDepreciation: Number(fill.fillDepreciation),
        days,
        residentVolumeL: Number(fill.volumeL),
        capacityL: Number(fill.capacityL),
      });
      let materializedCostLineId: string | null = null;
      if (cost > 0) {
        const line = await tx.costLine.create({
          data: {
            operationId: opId,
            lotId: a.lotId,
            component: "BARREL",
            amount: cost,
            currency: asset.currency,
            basisCompleteness: "KNOWN",
            policyVersion: fill.policyVersion,
            note: `barrel aging (fill ${fill.fillNumber}, ${Math.round(days)}d)`,
          },
          select: { id: true },
        });
        materializedCostLineId = line.id;
        materializedCost += cost;
      }
      await tx.barrelFill.update({
        where: { id: fill.id },
        data: { endedAt: observedAt, closeOpId: opId, materializedCostLineId },
      });
      closed++;
    }
  }

  return { opened, closed, materializedCost };
}
