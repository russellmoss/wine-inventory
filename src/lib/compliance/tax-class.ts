// Unit 3 — the ONE pure function that maps a classified lot/volume to a federal wine tax class
// (+ BF/BP sub-row). Point-in-time by design: it takes the ABV as-of the evaluation moment (not a
// static lot field), so a mid-life reclassification is just a re-evaluation. No DB, no imports from
// @prisma/client — validated in Phase 0 before any migration exists.

import {
  ABV_BAND,
  CIDER_ABV,
  type CarbonationMethod,
  type ProductType,
  type SparklingMethodLike,
  type SparklingSub,
  type WineTaxClass,
} from "./types";

export type DeriveTaxClassInput = {
  /** As-of ABV in percent (v/v). null = unknown → S2 default (class a, keep the volume + flag). */
  abv: number | null;
  productType: ProductType;
  carbonation: CarbonationMethod;
  /** Set when the lot is a sparkling wine; drives column (e) + the BF/BP split. null = still. */
  sparklingMethod: SparklingMethodLike | null;
};

export type DeriveTaxClassResult = {
  taxClass: WineTaxClass;
  sparklingSub: SparklingSub;
  /** Machine-readable reason for the audit trail (why this class was chosen). */
  reason: string;
  /**
   * True when the class rests on a missing/edge ABV and a human should confirm before filing
   * (S2 / OV#6). A `needsAbvReview` lot BLOCKS "Mark Filed" (Unit 12) — never a silent favorable
   * default. It never drops the volume off the form.
   */
  needsAbvReview: boolean;
};

/** Sparkling column (e) sub-row: TANK (Charmat / bulk process) = BP; TRADITIONAL / PETNAT = BF. */
export function sparklingSubFor(method: SparklingMethodLike): Exclude<SparklingSub, null> {
  return method === "TANK" ? "BP" : "BF";
}

/**
 * Derive the tax class. Rules in priority order (the form's classes are mutually exclusive):
 *   1. hard cider  — productType HARD_CIDER within the footnote-1 ABV window → (f)
 *   2. artificial  — CO₂ injected (carbonation ARTIFICIAL) → (d)
 *   3. sparkling   — a sparkling method is set (naturally carbonated) → (e), BF/BP sub
 *   4. still wine  — by ABV band (a ≤16.000 · b >16–≤21 · c >21–≤24), exact boundaries (S2)
 * Missing ABV defaults to class a and flags `needsAbvReview` (S2: never drop the volume).
 */
export function deriveTaxClass(input: DeriveTaxClassInput): DeriveTaxClassResult {
  const { abv, productType, carbonation, sparklingMethod } = input;

  // 1. Hard cider (footnote 1: 0.5% ≤ ABV < 8.5%, CO₂ ≤ 0.64 g/100mL assumed for a cider product).
  if (productType === "HARD_CIDER") {
    if (abv == null) {
      return { taxClass: "F_HARD_CIDER", sparklingSub: null, reason: "cider-product-abv-unknown", needsAbvReview: true };
    }
    if (abv >= CIDER_ABV.MIN && abv < CIDER_ABV.MAX) {
      return { taxClass: "F_HARD_CIDER", sparklingSub: null, reason: "cider-in-band", needsAbvReview: false };
    }
    // A "cider" outside the 0.5–8.5% window is not hard cider for tax purposes → fall through to the
    // ABV bands (it's taxed as wine), and flag it as an oddity for review.
    // (falls through with needsAbvReview forced below)
  }

  // 2. Artificially carbonated wine → (d). Distinct from natural sparkling (e).
  if (carbonation === "ARTIFICIAL") {
    return { taxClass: "D_CARBONATED", sparklingSub: null, reason: "artificially-carbonated", needsAbvReview: false };
  }

  // 3. Sparkling wine (naturally carbonated, a method is recorded) → (e) with BF/BP split.
  if (sparklingMethod) {
    return {
      taxClass: "E_SPARKLING",
      sparklingSub: sparklingSubFor(sparklingMethod),
      reason: `sparkling-${sparklingMethod.toLowerCase()}`,
      needsAbvReview: false,
    };
  }

  // 4. Still wine by ABV band.
  const ciderOutOfBand = productType === "HARD_CIDER"; // reached here only if cider abv was out of band
  if (abv == null) {
    return { taxClass: "A_LE16", sparklingSub: null, reason: "abv-missing-default-a", needsAbvReview: true };
  }
  if (abv <= ABV_BAND.A_MAX) {
    return { taxClass: "A_LE16", sparklingSub: null, reason: "abv-le-16", needsAbvReview: ciderOutOfBand };
  }
  if (abv <= ABV_BAND.B_MAX) {
    return { taxClass: "B_16_21", sparklingSub: null, reason: "abv-16-to-21", needsAbvReview: ciderOutOfBand };
  }
  if (abv <= ABV_BAND.C_MAX) {
    return { taxClass: "C_21_24", sparklingSub: null, reason: "abv-21-to-24", needsAbvReview: ciderOutOfBand };
  }
  // Over 24% is not wine (spirits territory); the form has no column for it. Keep it visible in
  // class c and force review — an auditor must see it, we never silently drop the volume.
  return { taxClass: "C_21_24", sparklingSub: null, reason: "abv-over-24-review", needsAbvReview: true };
}
