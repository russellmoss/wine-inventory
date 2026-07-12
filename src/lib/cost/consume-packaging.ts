import type { Prisma, CostBasisCompleteness } from "@prisma/client";
import { round8, mergeCompleteness } from "@/lib/cost/rollup";
import { depleteSupplyLotsTx } from "@/lib/cost/consume";
import { ActionError } from "@/lib/action-error";

// Plan 056 Unit 1 — the PACKAGING consumer: bottling's dry-goods (glass/cork/capsule/label/case)
// draw-down + capitalization, a thin sibling of consumeMaterialCore built on the shared
// `depleteSupplyLotsTx`. Called from INSIDE runBottlingTx (WORKORDER-1: the only path that writes these)
// AFTER the BOTTLE op exists, so the cost lands on the bottle op. Unlike an addition, packaging is
// counted stock consumed in EACHES — the actual-consumed qty is already in the material's stock unit, so
// there is NO dose→stock conversion here (the pack→each display conversion is a UI concern, D4).
//
// Cost bucket is PACKAGING, capitalized into the FINISHED-GOODS COGS snapshot (NOT wine-lot COGS, NOT
// WORKORDER-3 overhead). One `CostLine{ component:"PACKAGING", lotId:null, operationId:bottleOpId }` per
// BoM line; `SupplyConsumption` is the authoritative lot-level cost provenance, the run-level PACKAGING
// CostLine is the aggregate the snapshot reads. Below-stock draws to zero + taints completeness
// (PARTIAL/UNKNOWN) so the COGS snapshot is flagged "packaging cost incomplete — reconcile", never a
// silent $0 (council D2). When `capitalize` is false (AppSettings.capitalizePackaging=false) stock still
// depletes but NO CostLine is written and the run capitalizes $0 of packaging.

export type PackagingLine = { materialId: string; qty: number };

export type ConsumePackagingInput = {
  packaging: PackagingLine[];
  bottleOpId: number;
  /** false ⇒ deplete stock but do NOT capitalize into finished-goods COGS (AppSettings.capitalizePackaging). */
  capitalize: boolean;
};

export type ConsumePackagingResult = {
  /** Σ of the PACKAGING CostLines written (0 when nothing capitalizes) — the snapshot's packagingCost. */
  packagingCost: number;
  /** merged completeness across the drawn lines; taints the snapshot's PACKAGING basis when capitalizing. */
  completeness: CostBasisCompleteness;
  /** number of BoM lines consumed. */
  lineCount: number;
  /** total quantity that could NOT be sourced across all lines (>0 ⇒ short stock → incomplete cost). */
  shortfall: number;
};

/**
 * Consume the actual packaging BoM for a bottling run, inside the run's tx. Draws each line's stock down
 * FIFO/WA via the shared `depleteSupplyLotsTx`, then (when capitalizing) writes one PACKAGING CostLine on
 * the bottle op carrying that line's depletion cost. Returns the aggregate cost + completeness + shortfall
 * for the COGS snapshot. An empty BoM is a no-op (cost 0, KNOWN).
 */
export async function consumePackagingTx(tx: Prisma.TransactionClient, input: ConsumePackagingInput): Promise<ConsumePackagingResult> {
  const lines = (input.packaging ?? []).filter((l) => l && l.materialId && l.qty > 0);
  if (lines.length === 0) return { packagingCost: 0, completeness: "KNOWN", lineCount: 0, shortfall: 0 };

  // No-duplicate-material guard (council fold): the same material twice in one BoM would double-deplete
  // that stock in a single op. The picker is scoped to PACKAGING; this is the server-side backstop.
  const seen = new Set<string>();
  for (const l of lines) {
    if (seen.has(l.materialId)) throw new ActionError("A packaging material appears twice in the bill of materials — combine the lines into one quantity.");
    seen.add(l.materialId);
  }

  const settings = await tx.appSettings.findFirst({ select: { costingMethod: true, costingPolicyVersion: true, currency: true } });
  const method = settings?.costingMethod ?? "WEIGHTED_AVG";
  const policyVersion = settings?.costingPolicyVersion ?? 1;
  const currency = settings?.currency ?? "USD";

  let packagingCost = 0;
  let completeness: CostBasisCompleteness = "KNOWN";
  let shortfall = 0;

  for (const line of lines) {
    const plan = await depleteSupplyLotsTx(tx, {
      operationId: input.bottleOpId,
      materialId: line.materialId,
      qtyInStock: line.qty,
      method,
      policyVersion,
    });
    shortfall = round8(shortfall + plan.shortfall);
    completeness = mergeCompleteness(completeness, plan.completeness);

    if (input.capitalize) {
      await tx.costLine.create({
        data: {
          operationId: input.bottleOpId,
          lotId: null, // run-level packaging line resolved via the op (schema: CostLine.lotId nullable)
          component: "PACKAGING",
          amount: plan.totalCost,
          currency,
          basisCompleteness: plan.completeness,
          policyVersion,
        },
      });
      packagingCost = round8(packagingCost + plan.totalCost);
    }
  }

  // Single-source assertion (council fold): the returned packagingCost MUST equal the sum of the
  // PACKAGING CostLines we just wrote on the bottle op — never a parallel calc that could drift. (Skip
  // when not capitalizing, since no lines were written.)
  if (input.capitalize) {
    const agg = await tx.costLine.aggregate({
      where: { operationId: input.bottleOpId, component: "PACKAGING", reversalOfCostLineId: null },
      _sum: { amount: true },
    });
    const fromLines = round8(Number(agg._sum.amount ?? 0));
    if (Math.abs(fromLines - packagingCost) > 1e-6) {
      throw new ActionError(`Packaging cost mismatch: inserted CostLines sum to ${fromLines} but computed ${packagingCost}.`, "CONFLICT");
    }
    packagingCost = fromLines;
  }

  return { packagingCost, completeness, lineCount: lines.length, shortfall };
}
