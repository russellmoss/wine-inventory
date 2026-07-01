import { round2 } from "@/lib/bottling/draw";
import { FUNCTIONAL_ZERO_L, type LedgerBucket } from "@/lib/ledger/vocabulary";
import type { LedgerLine } from "@/lib/ledger/math";

// Phase 7 Unit 4: the PURE bottled-lot fold, mirroring the projection the writeLotOperation
// chokepoint materializes into BottledLotState. Keeping it pure lets a test fold a synthetic
// ledger sequence and assert the materialized state equals this independent fold (D2 —
// projection == deterministic fold of the ledger). Only BOTTLE_STORAGE legs participate; the
// vessel projection already ignores them (it folds only vesselId-bearing legs).

export type BottledStateProjection = { lotId: string; bottleCount: number; volumeL: number };

/** Resolve a line's ledger bucket, defaulting to VESSEL (vesselId set) or EXTERNAL. */
export function resolveBucket(line: Pick<LedgerLine, "bucket" | "vesselId">): LedgerBucket {
  return line.bucket ?? (line.vesselId ? "VESSEL" : "EXTERNAL");
}

/**
 * Fold the BOTTLE_STORAGE legs for ONE lot onto its current state. Returns null when the lot
 * folds to functional zero on BOTH dimensions (FINISH drains it → the projection row is deleted,
 * like a VesselLot at zero). Throws if either dimension would go negative.
 */
export function foldBottledLot(
  current: BottledStateProjection | null,
  lines: LedgerLine[],
  lotId: string,
): BottledStateProjection | null {
  const legs = lines.filter((l) => resolveBucket(l) === "BOTTLE_STORAGE" && l.lotId === lotId);
  if (legs.length === 0) return current;
  let volumeL = current?.volumeL ?? 0;
  let bottleCount = current?.bottleCount ?? 0;
  for (const l of legs) {
    volumeL = round2(volumeL + l.deltaL);
    bottleCount += l.bottleDelta ?? 0;
  }
  if (bottleCount < 0 || volumeL < -FUNCTIONAL_ZERO_L) {
    throw new Error(`Bottled-lot fold for ${lotId} would go negative (count ${bottleCount}, volume ${volumeL} L).`);
  }
  if (bottleCount <= 0 && volumeL <= FUNCTIONAL_ZERO_L) return null; // functional zero → delete the row
  return { lotId, bottleCount, volumeL };
}

/**
 * K6 relaxed homogeneity: the implied per-bottle fill (volumeL / bottleCount) must sit within
 * ±`tol` of nominal. The band accommodates disgorgement loss before the dosage top-up and
 * sacrificial-bottle topping (exact equality is false — council); it exists to catch a gross
 * count↔volume desync, not to enforce physical fill accuracy. A lot at functional zero on both
 * dimensions is consistent by definition.
 */
export function isCountVolumeConsistent(state: BottledStateProjection, nominalFillMl: number, tol = 0.25): boolean {
  if (state.bottleCount <= 0) return state.volumeL <= FUNCTIONAL_ZERO_L;
  const impliedFillMl = (state.volumeL * 1000) / state.bottleCount;
  return impliedFillMl >= nominalFillMl * (1 - tol) && impliedFillMl <= nominalFillMl * (1 + tol);
}

export function assertCountVolumeConsistent(state: BottledStateProjection, nominalFillMl: number, tol = 0.25): void {
  if (!isCountVolumeConsistent(state, nominalFillMl, tol)) {
    const impliedFillMl = state.bottleCount > 0 ? Math.round((state.volumeL * 1000) / state.bottleCount) : 0;
    throw new Error(
      `Bottle count/volume out of tolerance for ${state.lotId}: ${state.bottleCount} bottles ≈ ${impliedFillMl} mL each vs nominal ${nominalFillMl} mL.`,
    );
  }
}
