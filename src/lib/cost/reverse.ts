import type { Prisma } from "@prisma/client";
import { detectBottlingVariances } from "@/lib/cost/variance-detect";
import { emitExportForVariance } from "@/lib/cost/export-emit";

// Phase 8 (Unit 11) — identity-negation of an op's cost artifacts on reversal (D3). Runs INSIDE the
// family reversal's tx, keyed off the ORIGINAL op id, writing compensating rows on the CORRECTION op.
// Append-only: originals are never mutated/deleted; a negating SupplyConsumption (−qty) + a restored
// SupplyLot qty + a negating CostLine (−amount) net the reversed op's cost + stock back to zero. This
// restores the EXACT recorded amounts by identity — never recomputed from current ancestry (so a
// later backdated edit can't change what an undo restores, council C3). Idempotent: a second call is
// a no-op (guards on an existing reversal row). Cores don't COMPUTE cost; they just call this.

/** Negate every not-yet-reversed cost artifact on `reversedOpId`, on `correctionOpId`. */
export async function negateCostForReversedOp(
  tx: Prisma.TransactionClient,
  reversedOpId: number,
  correctionOpId: number,
): Promise<{ consumptions: number; costLines: number; costTransfers: number; variances: number }> {
  // Restore stock + write a negating consumption for each original depletion row.
  const consumptions = await tx.supplyConsumption.findMany({
    where: { operationId: reversedOpId, reversalOfConsumptionId: null },
  });
  let negatedConsumptions = 0;
  for (const c of consumptions) {
    const already = await tx.supplyConsumption.findFirst({ where: { reversalOfConsumptionId: c.id }, select: { id: true } });
    if (already) continue;
    await tx.supplyLot.update({ where: { id: c.supplyLotId }, data: { qtyRemaining: { increment: Number(c.qty) } } });
    await tx.supplyConsumption.create({
      data: {
        operationId: correctionOpId,
        supplyLotId: c.supplyLotId,
        qty: -Number(c.qty),
        unitCost: c.unitCost,
        extendedCost: c.extendedCost == null ? null : -Number(c.extendedCost),
        methodUsed: c.methodUsed,
        basisCompleteness: c.basisCompleteness,
        policyVersion: c.policyVersion,
        reversalOfConsumptionId: c.id,
      },
    });
    negatedConsumptions++;
  }

  // Write a negating CostLine for each original absorbed-cost row.
  const costLines = await tx.costLine.findMany({
    where: { operationId: reversedOpId, reversalOfCostLineId: null },
  });
  let negatedCostLines = 0;
  const changedLotIds = new Set<string>();
  for (const cl of costLines) {
    const already = await tx.costLine.findFirst({ where: { reversalOfCostLineId: cl.id }, select: { id: true } });
    if (already) continue;
    await tx.costLine.create({
      data: {
        operationId: correctionOpId,
        lotId: cl.lotId,
        component: cl.component,
        amount: -Number(cl.amount),
        currency: cl.currency,
        basisCompleteness: cl.basisCompleteness,
        policyVersion: cl.policyVersion,
        reversalOfCostLineId: cl.id,
      },
    });
    if (cl.lotId) changedLotIds.add(cl.lotId);
    negatedCostLines++;
  }

  // Reverse inherited-cost transfer artifacts by writing the inverse edge. The rollup ignores
  // transferredCost for math and uses the volume basis, so use a 100% child->parent basis here:
  // the paired correction drains the split/blend child back to the source.
  const transfers = await tx.operationCostTransfer.findMany({
    where: { operationId: reversedOpId, reversalOfTransferId: null },
  });
  let negatedTransfers = 0;
  for (const t of transfers) {
    const already = await tx.operationCostTransfer.findFirst({ where: { reversalOfTransferId: t.id }, select: { id: true } });
    if (already) continue;
    await tx.operationCostTransfer.create({
      data: {
        operationId: correctionOpId,
        fromLotId: t.toLotId,
        toLotId: t.fromLotId,
        transferredVolumeL: t.transferredVolumeL,
        parentPreOpVolumeL: t.transferredVolumeL,
        transferredCost: t.transferredCost,
        currency: t.currency,
        policyVersion: t.policyVersion,
        reversalOfTransferId: t.id,
      },
    });
    changedLotIds.add(t.fromLotId);
    changedLotIds.add(t.toLotId);
    negatedTransfers++;
  }

  // Phase 8b (Unit 13, D12): negating an op's cost changes the basis of any lot it touched. If a
  // changed lot (or a downstream descendant) was already bottled, emit an explicit variance event —
  // the frozen COGS snapshot stays immutable; the delta is split sold vs on-hand. Idempotent.
  const varianceIds = changedLotIds.size > 0
    ? await detectBottlingVariances(tx, { changedLotIds: [...changedLotIds], triggeringOpId: correctionOpId })
    : [];
  // Phase 15 Unit 7 — emit an accounting export (+ delivery) per variance, in THIS same tx (outbox).
  for (const id of varianceIds) await emitExportForVariance(id, tx);

  return { consumptions: negatedConsumptions, costLines: negatedCostLines, costTransfers: negatedTransfers, variances: varianceIds.length };
}
