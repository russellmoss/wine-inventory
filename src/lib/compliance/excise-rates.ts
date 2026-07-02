// plan-026 Unit 2 — the ONE date-stamped authority for the federal wine excise tax RATES (per wine
// gallon), 27 CFR 24.270 / 26 USC 5041(b). Pure, DB-free, no imports from @prisma/client — the same
// discipline as tax-class.ts, so the rate math is unit-tested with no migration. The CBMA
// small-producer CREDIT rates are a separate concern and live in cbma.ts (a credit is subtracted from
// the tax computed here). Both are date-stamped and carry a re-verify note (risk R5).

import type { WineTaxClass } from "./types";

/**
 * Effective date of the rates below. The CBMA rates were made PERMANENT by the Taxpayer Certainty and
 * Disaster Tax Relief Act of 2020 (no sunset), and the base per-gallon rates in 26 USC 5041(b) have
 * not changed since. RE-VERIFY against https://www.ttb.gov/wine/wine-tax-and-fee-rates before each
 * form-version bump — if TTB changes a rate, bump this date and the value together (single authority).
 */
export const RATES_EFFECTIVE_DATE = "2020-01-01";

/**
 * Per-wine-gallon excise tax by federal wine tax class (26 USC 5041(b), before any CBMA credit):
 *   a  not over 16% ABV .............. $1.07
 *   b  over 16% to 21% .............. $1.57
 *   c  over 21% to 24% .............. $3.15
 *   d  artificially carbonated ...... $3.30
 *   e  sparkling ..................... $3.40
 *   f  hard cider ................... $0.226
 * Wine over 24% ABV is DISTILLED SPIRITS, not wine — it has no wine rate and must not be filed here
 * (anomaly S2 blocks it upstream). Every class in `WineTaxClass` has exactly one rate below.
 */
export const RATE_BY_CLASS: Record<WineTaxClass, number> = {
  A_LE16: 1.07,
  B_16_21: 1.57,
  C_21_24: 3.15,
  D_CARBONATED: 3.30,
  E_SPARKLING: 3.40,
  F_HARD_CIDER: 0.226,
};

/** The per-gallon excise rate for a tax class. Total-safety: every WineTaxClass is keyed above. */
export function rateForClass(taxClass: WineTaxClass): number {
  return RATE_BY_CLASS[taxClass];
}

/** True when a class has a defined wine rate (guards the anomaly "class with no rate" check). */
export function hasRate(taxClass: string): taxClass is WineTaxClass {
  return Object.prototype.hasOwnProperty.call(RATE_BY_CLASS, taxClass);
}
