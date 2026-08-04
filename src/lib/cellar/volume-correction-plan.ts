/**
 * What should "correct the recorded volume" on a vessel actually DO?
 *
 * The gap this closes (feedback cms8a9nau0005i8045l65vomp): barrel B3 was SEEDed at 100 L when the
 * wine in it was really 225 L. Every existing path is a claim about PHYSICS — Top and Add move wine
 * in, Dump and Long-tail move it out, Rack moves it somewhere else, and racking in from a different
 * variety silently mints a blend. None of them is available to a winemaker whose only problem is
 * that a number was typed wrong. The /bulk composition row could nominally be re-typed, but it is
 * hydrated with the lineage PROJECTION and refuses on any blend share (see component-adjust.ts), so
 * it is neither discoverable as "fix the number" nor dependable.
 *
 * So this is a first-class DATA CORRECTION on the vessel total, with a mandatory reason. It is still
 * an EVENT, never a silent overwrite of `vessel_lot` (the moat: correction-as-event, append-only) —
 * the core emits one ADJUST whose legs move the difference, exactly the op type the ledger already
 * defines as "correct a vessel's volume to a measured actual". The TTB fold needs no new surface: an
 * `adjust` external leg lands in the same period reconciliation as any other book-vs-physical
 * difference (inventory gain §A9 / loss §A30).
 *
 * Pure — no Prisma — so the decision is unit-tested without a DB (test/volume-correction-plan.test.ts).
 */

import { round2 } from "@/lib/bottling/draw";

/** Below the 0.01 L (centiliter) storage grid: differences smaller than this are float noise,
 *  never a real edit. Matches UNTOUCHED_EPS_L in component-adjust.ts. */
export const CORRECTION_NOISE_L = 0.005;

/** A reason is the entire point of this path — it is what separates a correction from a fudge.
 *  Long enough to be a sentence, short enough to sit in an op note. */
export const MAX_REASON_CHARS = 500;

export type RecordedVolumeCorrectionPlan =
  /** The submitted number is the number already on the books. Never write. */
  | { kind: "NO_OP"; currentL: number }
  /** Nothing is in the vessel: there is no lot to attribute the volume to. Fill it instead. */
  | { kind: "BLOCKED_EMPTY" }
  /** The correction would put more wine in the vessel than it can hold. */
  | { kind: "BLOCKED_OVER_CAPACITY"; targetL: number; capacityL: number }
  /** Correct by `deltaL` (signed) to land the vessel on `toL`. */
  | { kind: "CORRECT"; fromL: number; toL: number; deltaL: number };

/**
 * Decide a recorded-volume correction from the three numbers that matter. Deliberately NOT a
 * capacity-free "just set it": every other write path in the cellar is capacity-guarded at the
 * ledger chokepoint, and a correction that could only be entered by going around that guard would
 * be a hole, not a feature.
 *
 * Emptying a vessel is NOT expressible here (target must be > 0) — that is a Dump or a Deplete, and
 * routing it through a "typo" affordance would let real wine disappear with no disposition.
 */
export function planRecordedVolumeCorrection(args: {
  /** What `vessel_lot` currently sums to for this vessel. */
  currentL: number;
  /** What the winemaker says it should be. */
  targetL: number;
  /** The vessel's capacity — the same ceiling the ledger chokepoint enforces. */
  capacityL: number;
}): RecordedVolumeCorrectionPlan {
  const currentL = round2(args.currentL);
  const targetL = round2(args.targetL);
  const capacityL = round2(args.capacityL);

  if (currentL <= 0) return { kind: "BLOCKED_EMPTY" };
  if (Math.abs(targetL - currentL) < CORRECTION_NOISE_L) return { kind: "NO_OP", currentL };
  if (targetL > capacityL + CORRECTION_NOISE_L) return { kind: "BLOCKED_OVER_CAPACITY", targetL, capacityL };

  return { kind: "CORRECT", fromL: currentL, toL: targetL, deltaL: round2(targetL - currentL) };
}

export type ProportionalShare = { id: string; addL: number };

/**
 * Split `addL` across positions in proportion to what they already hold.
 *
 * This exists because `computeProportionalDraw` — the helper every volumetric core reaches for —
 * is a DRAW: it throws "draw exceeds available volume" the moment the amount is larger than the
 * position it is splitting over. That is right for taking wine out and WRONG for an upward
 * correction, where +125 L onto a 100 L barrel is the ordinary case, not an overdraw. It is also
 * the live defect behind this feature request: the /bulk composition editor routes both directions
 * through the draw helper, so B3's 100 → 225 threw a raw Error (redacted in production), which is
 * exactly the "the field would not accept the change" the winemaker reported.
 *
 * Same exactness contract as the draw: integer centiliters with largest-remainder distribution, so
 * the shares sum to `addL` EXACTLY and the ledger op stays balanced.
 */
export function allocateProportionalIncrease(positions: { id: string; volumeL: number }[], addL: number): ProportionalShare[] {
  if (addL < 0) throw new Error("increase must be >= 0");
  const cl = (l: number) => Math.round(l * 100);

  const units = positions.map((p) => cl(p.volumeL));
  const totalUnits = units.reduce((a, u) => a + u, 0);
  const addUnits = cl(addL);
  if (positions.length === 0 || addUnits === 0) return positions.map((p) => ({ id: p.id, addL: 0 }));
  if (totalUnits <= 0) throw new Error("cannot allocate proportionally across empty positions");

  const base = units.map((u) => Math.floor((u * addUnits) / totalUnits));
  const rem = units.map((u) => (u * addUnits) % totalUnits);
  let leftover = addUnits - base.reduce((a, b) => a + b, 0);

  // Largest fractional remainder first — no per-position ceiling here, unlike the draw: growing a
  // position has no upper bound of its own (the vessel's capacity is the real ceiling, and the
  // ledger chokepoint enforces that).
  const order = base.map((_, i) => i).sort((a, b) => rem[b] - rem[a]);
  for (let k = 0; k < order.length && leftover > 0; k++) {
    base[order[k]] += 1;
    leftover -= 1;
  }

  const sum = base.reduce((a, b) => a + b, 0);
  if (sum !== addUnits) throw new Error(`proportional increase invariant broken: ${sum} != ${addUnits}`);
  return positions.map((p, i) => ({ id: p.id, addL: base[i] / 100 }));
}

/**
 * Trim + bound the operator's stated reason. Returns null when there isn't one — the caller
 * rejects that, rather than inventing a reason, because an unexplained volume change on a
 * correctness-critical ledger is exactly what this feature exists to prevent.
 */
export function normalizeCorrectionReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_REASON_CHARS);
}
