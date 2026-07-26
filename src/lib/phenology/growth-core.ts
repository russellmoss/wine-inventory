// Spray Intelligence S4 — the growth model.
//
// Growth dilution is the residual-decay channel that dominates May–June: brief §5.1 puts 30–40 %
// of leaf area unprotected by Friday after a perfect Monday spray, WITH ZERO RAIN. S6's protection
// budget consumes what this file emits. S5b's downy 3-10 rule consumes `shootsAtLeast10cm`.
//
// The base model during linear extension is
//     newFraction = clamp((L_now − L_then) / L_now, 0, 1)
// and four things break it. All four are closed here, and the first is a correction the council
// forced onto a v1 plan that had it backwards.
//
// ⚠️ 1. GROWTH DILUTION DOES NOT STOP WHEN THE SHOOT TIP STOPS (council C6).
//    `FieldNote.shootTip: STAGNANT` records that INTERNODE ELONGATION has ceased. Individual
//    leaves keep expanding for roughly 14–21 days afterwards, and laterals keep going after the
//    primary tip stops. Expanding leaf surface keeps diluting deposited residue. The v1 rule
//    (STAGNANT ⇒ cmPerWeek ≈ 0 ⇒ no dilution) would report a canopy FULLY PROTECTED while it is
//    materially diluted, and a grower would skip a spray on the strength of it. That fails toward
//    "protected" — the one direction the program's honesty rules exist to prevent, and the one
//    that costs a grower a crop. So STAGNANT gets a DECAYING LEAF-EXPANSION TAIL, not a zero.
//
//  2. HEDGING REMOVES TISSUE (council C7). L_now < L_then after a hedge and the naive formula goes
//     negative. A span containing a hedge returns `unknown` — never a negative, never a zero,
//     because a zero reads as "no new tissue since the spray", i.e. MORE protection than reality.
//     Hedging is an event, not a state, so only the span containing it refuses; the next week
//     starts a fresh baseline for the lateral-growth flush that a hedge actually triggers.
//
//  3. BANDS NEVER PRODUCE A POINT RATE (council C8). Band midpoints read CM_10_30 → CM_30_60 as
//     55 % unprotected when the truth may be 29 → 31 cm, i.e. ~6 %. That is fiction with a decimal
//     point on it. Band-only input yields an explicit {min,max} RANGE or `unknown`. The
//     `shootsAtLeast10cm` threshold answer stays EXACT from a band, which was the band's purpose.
//
//  4. DEGENERATE LENGTH (council C5). `L_now <= 0` returns `unknown`, never 0 and never 1 —
//     clamping afterwards does not rescue a NaN.
//
// Pure. No Prisma, no React, no weather imports — the caller supplies dated observations.

import type { ShootTip } from "@/lib/fieldnotes/types";
import type { ShootLengthBand } from "@/lib/phenology/observation-types";

// ───────────────────────── S4 constants ─────────────────────────

/**
 * How long leaf-area expansion keeps diluting residue after internode elongation stops.
 * Council C6 puts it at "roughly 14–21 days"; 14 is the conservative end of that window in the
 * sense that matters (a shorter tail claims LESS ongoing dilution, so we are not inflating the
 * risk), and it is roughly 200 GDD base 10 at a typical 14 GDD/day mid-season.
 *
 * ⚠️ This is a literature-shaped estimate with NO local validation. It is the weakest constant in
 * the phase and the plan says so. A GDD-denominated formulation (self-calibrating to the site,
 * like the interpolator) is the documented follow-up; it needs the same weather curve threading
 * through and buys nothing until S5a has a NEWA oracle to check either version against.
 */
export const LEAF_EXPANSION_TAIL_DAYS = 14;

/** The documented GDD equivalent of the tail, recorded for the follow-up. Not used in the math. */
export const LEAF_EXPANSION_TAIL_GDD = 200;

/**
 * Leaf-area expansion rate at the MOMENT the tip stops, as a fraction of standing leaf area per
 * day, decaying linearly to zero across the tail. 1 %/day over 14 days integrates to ~7 % of leaf
 * area added after the tip stops — consistent with leaves being mostly, but not fully, expanded
 * at stagnation.
 */
export const LEAF_EXPANSION_ONSET_RATE_PER_DAY = 0.01;

/**
 * Centimetre edges of each one-tap band. `GT_60` needs a finite upper edge to produce a range at
 * all; 150 cm is a generous hedged-canopy ceiling, and it is deliberately WIDE — a wide range is
 * an honest "we do not know precisely", which is exactly what a band is.
 */
export const BAND_EDGES_CM: Record<ShootLengthBand, { min: number; max: number }> = {
  LT_10: { min: 0, max: 10 },
  CM_10_30: { min: 10, max: 30 },
  CM_30_60: { min: 30, max: 60 },
  GT_60: { min: 60, max: 150 },
};

/** The downy-mildew 3-10 rule's threshold (brief §7.2). The band answers this EXACTLY. */
export const SHOOT_THRESHOLD_CM = 10;

// ───────────────────────── Shapes ─────────────────────────

export type Range = { min: number; max: number };

/** One week's growth-relevant readings for a block. */
export type GrowthObservation = {
  date: string; // ISO YYYY-MM-DD
  shootLengthCm: number | null;
  shootLengthBand: ShootLengthBand | null;
  shootTip: ShootTip | null;
  hedgedThisWeek: boolean | null;
};

export type GrowthBasis =
  | "MEASURED" // two exact lengths — a point rate is legitimate
  | "BAND_RANGE" // at least one endpoint is a band — a range, never a point
  | "LEAF_EXPANSION_TAIL" // the tip has stopped; dilution is the post-stagnation tail
  | "UNKNOWN";

export type GrowthRefusalCode =
  | "HEDGE_IN_SPAN"
  | "NO_OBSERVATIONS"
  | "SINGLE_OBSERVATION"
  | "DEGENERATE_LENGTH"
  | "NO_SPAN";

export type GrowthEstimate = {
  /** A point rate ONLY from two exact measurements. Never derived from bands. */
  cmPerWeek: number | null;
  /** The band-derived rate. Mutually exclusive with `cmPerWeek`. */
  cmPerWeekRange: Range | null;
  /** Fraction of current leaf area laid down since `sinceDate` — i.e. never covered by a spray then. */
  unprotectedNewLeafFraction: number | null;
  /** The band-derived fraction. Mutually exclusive with the point value. */
  unprotectedNewLeafRange: Range | null;
  /** Exact whenever ANY length reading exists, measured or banded. `null` only when nothing does. */
  shootsAtLeast10cm: boolean | null;
  basis: GrowthBasis;
  confidence: "HIGH" | "MEDIUM" | "LOW" | null;
  spanDays: number | null;
  fromDate: string | null;
  toDate: string | null;
  reasonCode: GrowthRefusalCode | null;
  reason: string | null;
};

export type GrowthInput = {
  /** Weekly observations for ONE block. Any order. */
  observations: GrowthObservation[];
  /** The date protection was laid down — usually a spray date. */
  sinceDate: string;
  /** The date the question is about. */
  targetDate: string;
};

// ───────────────────────── Helpers ─────────────────────────

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
const round4 = (v: number) => Math.round(v * 10000) / 10000;

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00.000Z`).getTime();
  const b = new Date(`${toIso}T00:00:00.000Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** The cm bounds implied by an observation: a measurement is a point, a band is an interval. */
function boundsOf(o: GrowthObservation): Range | null {
  if (o.shootLengthCm !== null) return { min: o.shootLengthCm, max: o.shootLengthCm };
  if (o.shootLengthBand !== null) return { ...BAND_EDGES_CM[o.shootLengthBand] };
  return null;
}

/** Does this observation answer the ≥ 10 cm threshold, and how? Bands answer it exactly. */
function thresholdOf(o: GrowthObservation): boolean | null {
  if (o.shootLengthCm !== null) return o.shootLengthCm >= SHOOT_THRESHOLD_CM;
  if (o.shootLengthBand !== null) return o.shootLengthBand !== "LT_10";
  return null;
}

/**
 * Integrated leaf-area expansion over [d0, d1] days since stagnation onset, as a multiple of the
 * leaf area standing at onset. The rate decays linearly to zero across the tail.
 */
function tailIntegral(d0: number, d1: number): number {
  const T = LEAF_EXPANSION_TAIL_DAYS;
  const R = LEAF_EXPANSION_ONSET_RATE_PER_DAY;
  const f = (d: number) => {
    const x = Math.min(Math.max(d, 0), T);
    return R * (x - (x * x) / (2 * T)); // ∫ R(1 − d/T) dd
  };
  return Math.max(f(d1) - f(d0), 0);
}

function refuseGrowth(
  code: GrowthRefusalCode,
  reason: string,
  partial: Partial<GrowthEstimate> = {},
): GrowthEstimate {
  return {
    cmPerWeek: null,
    cmPerWeekRange: null,
    unprotectedNewLeafFraction: null,
    unprotectedNewLeafRange: null,
    shootsAtLeast10cm: null,
    basis: "UNKNOWN",
    confidence: null,
    spanDays: null,
    fromDate: null,
    toDate: null,
    reasonCode: code,
    reason,
    ...partial,
  };
}

// ───────────────────────── The core ─────────────────────────

/**
 * Growth rate and unprotected new leaf area for one block between `sinceDate` and `targetDate`.
 *
 * The threshold answer (`shootsAtLeast10cm`) is deliberately computed and returned even on most
 * refusal paths: a single observation cannot give a rate, but it absolutely can answer "are the
 * shoots over 10 cm?", and that is the question S5b's downy rule actually asks.
 */
export function estimateGrowthCore(input: GrowthInput): GrowthEstimate {
  const inWindow = [...input.observations]
    .filter((o) => o.date <= input.targetDate)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (inWindow.length === 0) {
    return refuseGrowth(
      "NO_OBSERVATIONS",
      "No field observations for this block on or before the date asked about, so growth since the spray cannot be estimated.",
    );
  }

  const latest = inWindow[inWindow.length - 1];
  const threshold = thresholdOf(latest);

  // ── Hedge in the span (council C7) ──────────────────────────────────────────────────────────
  // Checked BEFORE anything else that reads a length, because after a hedge the two endpoints
  // measure different canopies and every derived number is meaningless.
  const hedge = inWindow.find((o) => o.date > input.sinceDate && o.hedgedThisWeek === true);
  if (hedge) {
    return refuseGrowth(
      "HEDGE_IN_SPAN",
      `The canopy was hedged on ${hedge.date}, so shoot length before and after are not comparable and growth since ${input.sinceDate} cannot be measured. Record a length after the hedge and the estimate resumes — hedging triggers a flush of lateral growth, so treat this block as growing, not static.`,
      { shootsAtLeast10cm: threshold },
    );
  }

  // The baseline: the last observation at or before the protection date. If the grower recorded
  // nothing that early, fall back to the earliest observation we do have inside the window.
  const baseline =
    [...inWindow].reverse().find((o) => o.date <= input.sinceDate && boundsOf(o) !== null) ??
    inWindow.find((o) => boundsOf(o) !== null && o.date < latest.date) ??
    null;

  const nowBounds = boundsOf(latest);
  if (!nowBounds) {
    return refuseGrowth(
      "SINGLE_OBSERVATION",
      "No shoot length or band recorded on the most recent observation, so growth cannot be estimated.",
      { shootsAtLeast10cm: threshold },
    );
  }

  // ── Degenerate length (council C5) ──────────────────────────────────────────────────────────
  // The formula divides by L_now. Zero or negative is not "a very small shoot", it is a number
  // the model cannot use, and clamping afterwards does not rescue a NaN.
  if (nowBounds.max <= 0) {
    return refuseGrowth(
      "DEGENERATE_LENGTH",
      "The most recent shoot length is zero, so the share of new growth cannot be computed. It is not zero new growth — it is unknown.",
      { shootsAtLeast10cm: threshold },
    );
  }

  const spanDays = baseline ? daysBetween(baseline.date, latest.date) : null;

  // ── The leaf-expansion tail (council C6) ────────────────────────────────────────────────────
  // Computed for EVERY path, then max'd with whatever the length difference says. A stagnant tip
  // never yields zero dilution while the tail is still running.
  const tailFraction = stagnationTail(inWindow, input.sinceDate, input.targetDate);

  // ── Not enough to compare ───────────────────────────────────────────────────────────────────
  if (!baseline || spanDays === null || spanDays <= 0) {
    // A single observation still answers the threshold exactly — which was the band's whole point.
    if (tailFraction > 0) {
      return {
        cmPerWeek: null,
        cmPerWeekRange: null,
        unprotectedNewLeafFraction: round4(tailFraction / (1 + tailFraction)),
        unprotectedNewLeafRange: null,
        shootsAtLeast10cm: threshold,
        basis: "LEAF_EXPANSION_TAIL",
        confidence: "LOW",
        spanDays,
        fromDate: baseline?.date ?? null,
        toDate: latest.date,
        reasonCode: null,
        reason: null,
      };
    }
    return refuseGrowth(
      spanDays === null ? "SINGLE_OBSERVATION" : "NO_SPAN",
      "Only one observation with a shoot length exists in this window, so a growth RATE cannot be computed. The shoot-length threshold is still answered exactly.",
      { shootsAtLeast10cm: threshold, toDate: latest.date },
    );
  }

  const thenBounds = boundsOf(baseline)!;
  const exact = baseline.shootLengthCm !== null && latest.shootLengthCm !== null;
  const weeks = spanDays / 7;

  if (exact) {
    const lThen = thenBounds.min;
    const lNow = nowBounds.min;
    if (lNow <= 0) {
      return refuseGrowth(
        "DEGENERATE_LENGTH",
        "The most recent shoot length is zero, so the share of new growth cannot be computed.",
        { shootsAtLeast10cm: threshold },
      );
    }
    const lengthFraction = clamp01((lNow - lThen) / lNow);
    // The tail and the length difference are two views of the same canopy; take the larger so a
    // stagnant tip can never report LESS dilution than the tail alone implies.
    const combined = Math.max(lengthFraction, tailFraction / (1 + tailFraction));
    return {
      cmPerWeek: round4((lNow - lThen) / weeks),
      cmPerWeekRange: null,
      unprotectedNewLeafFraction: round4(combined),
      unprotectedNewLeafRange: null,
      shootsAtLeast10cm: threshold,
      basis: combined > lengthFraction ? "LEAF_EXPANSION_TAIL" : "MEASURED",
      confidence: combined > lengthFraction ? "LOW" : "HIGH",
      spanDays,
      fromDate: baseline.date,
      toDate: latest.date,
      reasonCode: null,
      reason: null,
    };
  }

  // ── Band-derived: a RANGE, never a point (council C8) ───────────────────────────────────────
  // Smallest plausible growth = smallest "now" against largest "then"; largest = the reverse.
  const rateMin = Math.max(nowBounds.min - thenBounds.max, 0) / weeks;
  const rateMax = Math.max(nowBounds.max - thenBounds.min, 0) / weeks;
  const fracMin = nowBounds.min > 0 ? clamp01((nowBounds.min - thenBounds.max) / nowBounds.min) : 0;
  const fracMax = nowBounds.max > 0 ? clamp01((nowBounds.max - thenBounds.min) / nowBounds.max) : 1;
  const tailPoint = tailFraction / (1 + tailFraction);
  return {
    cmPerWeek: null, // ← the whole point of C8: bands do not get a single number
    cmPerWeekRange: { min: round4(rateMin), max: round4(rateMax) },
    unprotectedNewLeafFraction: null,
    unprotectedNewLeafRange: {
      min: round4(Math.max(fracMin, tailPoint)),
      max: round4(Math.max(fracMax, tailPoint)),
    },
    shootsAtLeast10cm: threshold,
    basis: "BAND_RANGE",
    confidence: "MEDIUM",
    spanDays,
    fromDate: baseline.date,
    toDate: latest.date,
    reasonCode: null,
    reason: null,
  };
}

/**
 * The post-stagnation leaf-expansion contribution over [sinceDate, targetDate], as a multiple of
 * the leaf area standing when the tip stopped.
 *
 * Onset is the START of the unbroken run of STAGNANT readings ending at the latest observation —
 * so a block that went stagnant, was recorded ACTIVE again (a lateral flush), and then stagnant
 * once more restarts its tail rather than inheriting the first one's exhausted clock.
 * Returns 0 when the tip is still ACTIVE (the length difference already carries that growth) or
 * when the tail has run out.
 */
function stagnationTail(sorted: GrowthObservation[], sinceDate: string, targetDate: string): number {
  const withTip = sorted.filter((o) => o.shootTip !== null);
  if (withTip.length === 0) return 0;
  if (withTip[withTip.length - 1].shootTip !== "STAGNANT") return 0;
  let onset = withTip[withTip.length - 1].date;
  for (let i = withTip.length - 1; i >= 0; i--) {
    if (withTip[i].shootTip !== "STAGNANT") break;
    onset = withTip[i].date;
  }
  const d0 = Math.max(daysBetween(onset, sinceDate), 0);
  const d1 = Math.max(daysBetween(onset, targetDate), 0);
  if (d1 <= d0) return 0;
  return tailIntegral(d0, d1);
}
