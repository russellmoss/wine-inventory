/**
 * What should a /bulk composition-editor volume save actually DO?
 *
 * The editor's input is hydrated with `vessel_component.volumeL` — the lineage-attributed
 * PROJECTION of one (variety, vineyard, vintage) tuple (composeLeaves). The ledger, though, can
 * only adjust LOTS, and `updateComponentVolume` resolves the tuple to its backing `vessel_lot`
 * rows. On a blend those two numbers diverge: a Syrah-origin lot that absorbed 625 L of Cabernet
 * holds 6,995 L in the tuple while the Syrah component projects 6,370 L. Treating the submitted
 * number as a target for the TUPLE total then turns "save the value I was shown" into a real
 * −625 L ADJUST (reproduced on Demo Winery T5, lot 2026-SY-2).
 *
 * Pure — no Prisma — so the decision is unit-tested without a DB (test/bulk-component-adjust.test.ts).
 * Three rules:
 *
 * 1. Re-submitting the displayed number is "I changed nothing" and must never write.
 * 2. When projection ≠ tuple total beyond rounding noise, the row is a lineage-derived SHARE of a
 *    blend. A proportional draw on the lots cannot set the share to an exact number (drawing from
 *    a homogeneous blend moves every component together), so an edit has no faithful ledger
 *    translation — refuse with an explanation rather than write an approximation.
 * 3. Otherwise projection ≈ tuple total (the single-origin case) and the submitted number is an
 *    honest target for the tuple: adjust by the difference.
 */

import { round2 } from "@/lib/bottling/draw";

/** Below the 0.01 L (centiliter) storage grid: differences smaller than this are float noise,
 *  never a real edit. */
export const UNTOUCHED_EPS_L = 0.005;

/** Above this, projection-vs-tuple divergence is a real blend share, not rounding noise.
 *  Matches the EPS_L noise floor in src/lib/vessel/composition.ts (Decimal(6,5) fractions). */
export const BLEND_MISMATCH_EPS_L = 0.05;

export type ComponentVolumePlan =
  | { kind: "NO_OP" }
  | { kind: "BLOCKED_BLEND_SHARE"; projectionL: number; tupleTotalL: number }
  | { kind: "ADJUST"; deltaL: number };

export function planComponentVolumeUpdate(args: {
  /** What the user submitted, already in canonical litres. */
  targetL: number;
  /** vessel_component.volumeL — the number the editor displayed and hydrated its input with. */
  projectionL: number;
  /** Sum of the vessel_lot rows backing the tuple — what an ADJUST actually moves. */
  tupleTotalL: number;
}): ComponentVolumePlan {
  const targetL = round2(args.targetL);
  const projectionL = round2(args.projectionL);
  const tupleTotalL = round2(args.tupleTotalL);

  if (Math.abs(targetL - projectionL) < UNTOUCHED_EPS_L) return { kind: "NO_OP" };

  if (Math.abs(projectionL - tupleTotalL) > BLEND_MISMATCH_EPS_L) {
    return { kind: "BLOCKED_BLEND_SHARE", projectionL, tupleTotalL };
  }

  const deltaL = round2(targetL - tupleTotalL);
  if (Math.abs(deltaL) < UNTOUCHED_EPS_L) return { kind: "NO_OP" };
  return { kind: "ADJUST", deltaL };
}
