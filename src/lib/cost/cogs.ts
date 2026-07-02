// Phase 8 (Unit 6) — the bottling COGS assembly: PURE bill-of-materials composition, unit-tested
// directly. Bottling is an assembly: totalRunCost = liquid (the bulk lot's rolled-up capitalized cost
// consumed into the run) + dry goods (PACKAGING SupplyLot draw-down) + optional labor/overhead;
// costPerBottle = totalRunCost / ACTUAL good bottles (D15 — dry goods count, breakage lowers yield).
// The cents-rounding residual is surfaced for a VARIANCE line so no sub-cent value is stranded (D9).
// The DB write of the immutable BottlingCostSnapshot (in the finalize tx) is the load-bearing wiring —
// this module is the arithmetic + identity it will persist.

import type { CostComponent, CostBasisCompleteness } from "@prisma/client";

const round8 = (n: number) => Math.round(n * 1e8) / 1e8;
const cents = (n: number) => Math.round(n * 100) / 100;

export type CogsInput = {
  runId: string;
  skuId: string;
  taxClass: string | null;
  bottledAt: string; // ISO date (passed in — the pure layer never calls new Date())
  goodBottles: number;
  /** the bottled lot's rolled-up capitalized component breakdown (from getLotCost().components). */
  liquidComponents: Partial<Record<CostComponent, number>>;
  liquidCompleteness: CostBasisCompleteness;
  /** Σ PACKAGING SupplyLot draw-down for the run (glass/cork/capsule/label/case). */
  packagingCost: number;
  packagingCompleteness?: CostBasisCompleteness;
  /** labor/overhead the tenant capitalizes (Phase 11 fills this; 0 for now). */
  otherCapitalized?: number;
  costBasisAsOfOperationId: number;
  policyVersion: number;
  currency: string;
};

export type CogsSnapshotPayload = {
  runId: string;
  skuId: string;
  taxClass: string | null;
  bottledAt: string;
  goodBottles: number;
  totalRunCost: number;
  costPerBottle: number; // cents-rounded (D9)
  currency: string;
  costBasisAsOfOperationId: number;
  componentBreakdown: Partial<Record<CostComponent, number>>;
  basisCompleteness: CostBasisCompleteness;
  policyVersion: number;
  postingKey: string;
  /** totalRunCost − costPerBottle × goodBottles — a VARIANCE line so cents rounding strands nothing. */
  varianceResidual: number;
};

/** Deterministic idempotency key for the accounting export (D18): re-emitting the same run+line+class
 * yields the same key, so a re-post is a no-op rather than a duplicate. */
export function makePostingKey(runId: string, skuId: string, taxClass: string | null): string {
  return `cogs:${runId}:${skuId}:${taxClass ?? "-"}`;
}

// Completeness lattice (mirrors rollup.mergeCompleteness): any UNKNOWN with a KNOWN → PARTIAL.
function merge(a: CostBasisCompleteness, b: CostBasisCompleteness): CostBasisCompleteness {
  if (a === "PARTIAL" || b === "PARTIAL") return "PARTIAL";
  if (a === b) return a;
  return "PARTIAL";
}

/**
 * Assemble the frozen COGS snapshot payload for one bottling run + SKU line. Sums the liquid component
 * breakdown with PACKAGING and any other capitalized cost, divides by ACTUAL good bottles, and reports
 * the cents residual for a VARIANCE line. Zero good bottles ⇒ costPerBottle 0 and the whole run cost is
 * residual (no divide-by-zero).
 */
export function buildCogsSnapshot(input: CogsInput): CogsSnapshotPayload {
  const componentBreakdown: Partial<Record<CostComponent, number>> = {};
  let total = 0;
  for (const [c, amt] of Object.entries(input.liquidComponents)) {
    if (amt == null) continue;
    componentBreakdown[c as CostComponent] = round8((componentBreakdown[c as CostComponent] ?? 0) + amt);
    total = round8(total + amt);
  }
  if (input.packagingCost) {
    componentBreakdown.PACKAGING = round8((componentBreakdown.PACKAGING ?? 0) + input.packagingCost);
    total = round8(total + input.packagingCost);
  }
  const other = input.otherCapitalized ?? 0;
  if (other) {
    componentBreakdown.OVERHEAD = round8((componentBreakdown.OVERHEAD ?? 0) + other);
    total = round8(total + other);
  }

  const totalRunCost = round8(total);
  const costPerBottle = input.goodBottles > 0 ? cents(totalRunCost / input.goodBottles) : 0;
  const varianceResidual = round8(totalRunCost - costPerBottle * input.goodBottles);

  const basisCompleteness = merge(input.liquidCompleteness, input.packagingCompleteness ?? "KNOWN");

  return {
    runId: input.runId,
    skuId: input.skuId,
    taxClass: input.taxClass,
    bottledAt: input.bottledAt,
    goodBottles: input.goodBottles,
    totalRunCost,
    costPerBottle,
    currency: input.currency,
    costBasisAsOfOperationId: input.costBasisAsOfOperationId,
    componentBreakdown,
    basisCompleteness,
    policyVersion: input.policyVersion,
    postingKey: makePostingKey(input.runId, input.skuId, input.taxClass),
    varianceResidual,
  };
}
