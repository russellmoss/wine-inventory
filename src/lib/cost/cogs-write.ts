import type { Prisma, CostComponent, CostBasisCompleteness } from "@prisma/client";
import { computeLotCost } from "@/lib/cost/data";
import { buildCogsSnapshot, type CogsSnapshotPayload } from "@/lib/cost/cogs";
import { emitExportForSnapshot } from "@/lib/cost/export-emit";

// Phase 8 (Unit 6 wiring) — write the frozen BottlingCostSnapshot inside the bottling finalize tx.
// Script-safe. MUST be called BEFORE the BOTTLE op reduces the source lots' volumes (it reads their
// pre-op cost-per-L via the SAME tx). Cost is additive (plan MUST): a lot with no cost basis yields an
// UNKNOWN-completeness snapshot at $0, never blocks physical bottling. The cents-rounding residual is
// recorded as an op-level VARIANCE CostLine so nothing is stranded (D9).

const round8 = (n: number) => Math.round(n * 1e8) / 1e8;

function merge(a: CostBasisCompleteness, b: CostBasisCompleteness): CostBasisCompleteness {
  if (a === "PARTIAL" || b === "PARTIAL") return "PARTIAL";
  if (a === b) return a;
  return "PARTIAL";
}

export type ConsumedLiquid = {
  liquidComponents: Partial<Record<CostComponent, number>>;
  completeness: CostBasisCompleteness;
};

/**
 * Cost of the wine a run consumes — call BEFORE the BOTTLE op reduces volumes (reads pre-op cost-per-L
 * of each source lot via the tx). Aggregates the consumed fraction of each source lot's component
 * breakdown; merges completeness (a zero-volume or unknown-cost source taints).
 */
export async function computeConsumedLiquid(
  tx: Prisma.TransactionClient,
  sources: { lotId: string; volumeConsumedL: number }[],
): Promise<ConsumedLiquid> {
  const byLot = new Map<string, number>();
  for (const s of sources) if (s.lotId) byLot.set(s.lotId, round8((byLot.get(s.lotId) ?? 0) + s.volumeConsumedL));

  const liquidComponents: Partial<Record<CostComponent, number>> = {};
  let completeness: CostBasisCompleteness = "KNOWN";
  let sawAny = false;
  for (const [lotId, consumed] of byLot) {
    const lc = await computeLotCost(lotId, tx);
    sawAny = true;
    completeness = merge(completeness, lc.completeness);
    const f = lc.volumeL > 1e-9 ? consumed / lc.volumeL : 0;
    if (lc.volumeL <= 1e-9) completeness = merge(completeness, "UNKNOWN");
    for (const [c, amt] of Object.entries(lc.components)) {
      if (amt == null) continue;
      const key = c as CostComponent;
      liquidComponents[key] = round8((liquidComponents[key] ?? 0) + amt * f);
    }
  }
  if (!sawAny) completeness = "UNKNOWN";
  return { liquidComponents, completeness };
}

export type BottlingSnapshotInput = {
  runId: string;
  skuId: string;
  bottleOpId: number;
  bottledAt: Date;
  goodBottles: number;
  /** the consumed liquid cost, computed via computeConsumedLiquid BEFORE the BOTTLE op. */
  liquid: ConsumedLiquid;
  packagingCost?: number; // PACKAGING SupplyLot draw-down (Plan 056: Σ PACKAGING CostLines on the bottle op)
  /** completeness of the packaging draw (Plan 056): PARTIAL/UNKNOWN when a lot lacked cost basis or stock
   * ran short — taints the snapshot so the COGS reads "packaging cost incomplete — reconcile", never $0. */
  packagingCompleteness?: CostBasisCompleteness;
  taxClass?: string | null;
};

/** Freeze the COGS snapshot (after the BOTTLE op, using the pre-op liquid cost) and record the
 * cents-rounding residual as an op-level VARIANCE line. Returns the payload for verification. */
export async function writeBottlingCostSnapshot(
  tx: Prisma.TransactionClient,
  input: BottlingSnapshotInput,
): Promise<CogsSnapshotPayload> {
  const settings = await tx.appSettings.findFirst({ select: { currency: true, costingPolicyVersion: true } });
  const payload = buildCogsSnapshot({
    runId: input.runId,
    skuId: input.skuId,
    taxClass: input.taxClass ?? null,
    bottledAt: input.bottledAt.toISOString(),
    goodBottles: input.goodBottles,
    liquidComponents: input.liquid.liquidComponents,
    liquidCompleteness: input.liquid.completeness,
    packagingCost: input.packagingCost ?? 0,
    packagingCompleteness: input.packagingCompleteness ?? "KNOWN",
    costBasisAsOfOperationId: input.bottleOpId,
    policyVersion: settings?.costingPolicyVersion ?? 1,
    currency: settings?.currency ?? "USD",
  });

  const snapshot = await tx.bottlingCostSnapshot.create({
    data: {
      runId: payload.runId,
      skuId: payload.skuId,
      taxClass: payload.taxClass,
      bottledAt: input.bottledAt,
      goodBottles: payload.goodBottles,
      totalRunCost: payload.totalRunCost,
      costPerBottle: payload.costPerBottle,
      currency: payload.currency,
      costBasisAsOfOperationId: payload.costBasisAsOfOperationId,
      componentBreakdown: payload.componentBreakdown as Prisma.InputJsonValue,
      basisCompleteness: payload.basisCompleteness,
      policyVersion: payload.policyVersion,
      postingKey: payload.postingKey,
    },
    select: { id: true },
  });

  // Phase 15 Unit 7 — transactional outbox: emit the accounting export lines + PENDING/WITHHELD
  // deliveries INSIDE this same tx, so a crash between freeze and emit can never drop a posting.
  await emitExportForSnapshot(snapshot.id, tx);

  if (Math.abs(payload.varianceResidual) > 0.004) {
    await tx.costLine.create({
      data: {
        operationId: input.bottleOpId,
        component: "VARIANCE",
        amount: payload.varianceResidual,
        currency: payload.currency,
        basisCompleteness: payload.basisCompleteness,
        note: "bottling cost-per-bottle rounding residual",
      },
    });
  }

  return payload;
}
