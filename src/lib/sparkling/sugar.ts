import type { DosageStyle } from "@prisma/client";

// Phase 7 Unit 3: PURE winemaking math for sparkling — tirage sugar ↔ bottle pressure, the
// secondary-ferment ABV bump, dosage → residual sugar, and the EU sweetness classifier. All
// advisory: the cores STORE measured actuals and use these to SUGGEST (D14). Constants are the
// cited domain defaults and are overridable.

/** ~4 g/L of fermentable sugar per 1 atm of bottle pressure (varies 4.0–4.3 with temp). */
export const G_PER_L_PER_ATM = 4;
/** ~16.8 g/L of fermented sugar per 1 % ABV (grape-sugar rule). */
export const SUGAR_G_PER_L_PER_ABV = 16.8;
/** Champagne target ≈ 6 atm. */
export const DEFAULT_TARGET_ATM = 6;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Tirage sugar (g/L) needed to reach a target bottle pressure. */
export function tirageSugarForPressure(atm: number, gPerLPerAtm = G_PER_L_PER_ATM): number {
  if (!(atm >= 0)) throw new Error("Target pressure (atm) can't be negative.");
  if (!(gPerLPerAtm > 0)) throw new Error("g/L per atm must be greater than 0.");
  return round2(atm * gPerLPerAtm);
}

/** Bottle pressure (atm) a given tirage sugar (g/L) will build once fully fermented. */
export function pressureForSugar(gPerL: number, gPerLPerAtm = G_PER_L_PER_ATM): number {
  if (!(gPerL >= 0)) throw new Error("Sugar (g/L) can't be negative.");
  if (!(gPerLPerAtm > 0)) throw new Error("g/L per atm must be greater than 0.");
  return round2(gPerL / gPerLPerAtm);
}

/** Advisory ABV bump (% v/v) from fermenting `gPerL` of sugar (≈ g/L ÷ 16.8). */
export function abvBumpForSugar(gPerL: number, sugarPerAbv = SUGAR_G_PER_L_PER_ABV): number {
  if (!(gPerL >= 0)) throw new Error("Sugar (g/L) can't be negative.");
  return round2(gPerL / sugarPerAbv);
}

/** The g/L of residual sugar a dosage of `doseMl` at `liqueurGPerL` adds to a `bottleMl` bottle. */
export function dosageSugarGpl(doseMl: number, liqueurGPerL: number, bottleMl = 750): number {
  if (doseMl < 0 || liqueurGPerL < 0) throw new Error("Dose and liqueur strength can't be negative.");
  if (!(bottleMl > 0)) throw new Error("Bottle size (mL) must be greater than 0.");
  return round2((doseMl * liqueurGPerL) / bottleMl);
}

export type FinalRSInput = {
  baseRS: number; // measured base-wine residual sugar (g/L) before tirage
  tirageSugar?: number; // liqueur de tirage sugar added (g/L)
  fermentedSugar?: number; // sugar consumed by the secondary ferment (g/L)
  doseMl?: number; // dosage volume per bottle (mL)
  liqueurGPerL?: number; // liqueur d'expédition strength (g/L)
  bottleMl?: number; // bottle size (default 750)
};

/**
 * Final residual sugar (g/L) after the whole arc: measured base RS + leftover tirage sugar
 * (added − fermented) + dosage contribution. Computing off a MEASURED pre-dosage RS (not an
 * assumed ~0) is the point (K10): tirage sugar rarely ferments to exactly zero.
 */
export function finalRS(input: FinalRSInput): number {
  const { baseRS, tirageSugar = 0, fermentedSugar = 0, doseMl = 0, liqueurGPerL = 0, bottleMl = 750 } = input;
  const leftoverTirage = tirageSugar - fermentedSugar;
  return round2(baseRS + leftoverTirage + dosageSugarGpl(doseMl, liqueurGPerL, bottleMl));
}

export type DoseTargetInput = {
  targetRS: number; // desired final RS (g/L)
  baseRS: number; // measured pre-dosage RS (g/L)
  tirageSugar?: number;
  fermentedSugar?: number;
  liqueurGPerL: number; // liqueur d'expédition strength (g/L)
  bottleMl?: number;
};

/** Dose (mL/bottle) needed to hit `targetRS`, given the measured pre-dosage RS. Clamped ≥ 0. */
export function doseMlForTargetRS(input: DoseTargetInput): number {
  const { targetRS, baseRS, tirageSugar = 0, fermentedSugar = 0, liqueurGPerL, bottleMl = 750 } = input;
  if (!(liqueurGPerL > 0)) throw new Error("Liqueur strength (g/L) must be greater than 0.");
  const preDosageRS = baseRS + (tirageSugar - fermentedSugar);
  const deltaRS = targetRS - preDosageRS;
  if (deltaRS <= 0) return 0;
  return round2((deltaRS * bottleMl) / liqueurGPerL);
}

// EU sweetness band UPPER edges (g/L). Brut Nature is handled by the dosage==0 rule, not RS.
const EXTRA_BRUT_MAX = 6;
const BRUT_MAX = 12;
const EXTRA_DRY_MAX = 17;
const SEC_MAX = 32;
const DEMI_SEC_MAX = 50;

/**
 * Classify the EU sweetness style. Brut Nature ⇔ NO sugar dosage (`dosageGramsPerL === 0`) — a
 * dry / SO₂-only top-up still counts as Brut Nature; the rule is about *sugar*, not the existence
 * of a dosage step (K10). Otherwise band by final residual sugar. Edges land on the higher band
 * (RS = 12 → EXTRA_DRY, not BRUT).
 */
export function classifyStyle(rsGPerL: number, dosageGramsPerL: number): DosageStyle {
  if (dosageGramsPerL === 0) return "BRUT_NATURE";
  if (rsGPerL < EXTRA_BRUT_MAX) return "EXTRA_BRUT";
  if (rsGPerL < BRUT_MAX) return "BRUT";
  if (rsGPerL < EXTRA_DRY_MAX) return "EXTRA_DRY";
  if (rsGPerL < SEC_MAX) return "SEC";
  if (rsGPerL < DEMI_SEC_MAX) return "DEMI_SEC";
  return "DOUX";
}

/** True when `rsGPerL` sits within `tol` g/L of any style band edge (UI caution ±3 g/L). */
export function nearStyleBandEdge(rsGPerL: number, tol = 3): boolean {
  return [EXTRA_BRUT_MAX, BRUT_MAX, EXTRA_DRY_MAX, SEC_MAX, DEMI_SEC_MAX].some((edge) => Math.abs(rsGPerL - edge) <= tol);
}
