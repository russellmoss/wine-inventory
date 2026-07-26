// Spray Intelligence S4 — shoot-length formatting.
//
// ⚠️ DOCUMENTED DEVIATION, recorded so it is a decision and not a duplication somebody finds later.
// `src/lib/weather/units-core.ts` owns all unit conversion in this app and says so in its header:
// "No other file may hold an inline × 1.8, / 25.4, or × 9/5." It has no LENGTH formatter — cm→in
// does not exist there — and S4's lane boundary forbids touching src/lib/weather/. So the length
// conversion lands here, and the runbook §4 shared-file map carries a line saying S1 folds it into
// units-core.ts when that lane owns the file. One conversion constant, one place, one owner.

/** Inches per centimetre. The single length constant in this file. */
const IN_PER_CM = 1 / 2.54;

export function cmToInches(cm: number): number {
  return cm * IN_PER_CM;
}

/**
 * A shoot length for display. Metric sites read centimetres; US sites read inches, because a
 * grower comparing against the "shoots ≥ 10 cm" downy rule and a grower who thinks in inches are
 * the same person on different sites.
 */
/**
 * One decimal, with a trailing ".0" stripped. Deliberately NOT a `< 10 ? 1 : 0` decimal rule:
 * 25.4 cm converts to 9.999999999999998 inches, so a threshold on the converted value flips on
 * floating-point noise and renders "10.0 in" for exactly ten inches.
 */
function trim1(v: number): string {
  return v.toFixed(1).replace(/\.0$/, "");
}

export function formatShootLength(cm: number | null, unitSystem: "METRIC" | "IMPERIAL"): string {
  if (cm === null) return "—";
  return unitSystem === "IMPERIAL" ? `${trim1(cmToInches(cm))} in` : `${trim1(cm)} cm`;
}

/**
 * A shoot-length RANGE for display. Bands and band-derived growth rates are ranges, never points
 * (council C8), and the formatter must not quietly collapse one into an average.
 */
export function formatShootLengthRange(
  minCm: number,
  maxCm: number,
  unitSystem: "METRIC" | "IMPERIAL",
): string {
  const unit = unitSystem === "IMPERIAL" ? "in" : "cm";
  const lo = unitSystem === "IMPERIAL" ? cmToInches(minCm) : minCm;
  const hi = unitSystem === "IMPERIAL" ? cmToInches(maxCm) : maxCm;
  return `${trim1(lo)}–${trim1(hi)} ${unit}`;
}
