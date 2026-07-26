/**
 * Vineyard Intelligence P4 — non-soil map-unit classification (spike NEW-1: "Water is a map unit, not
 * a gap"). A block misdrawn over a pond returns `97.8% Water` at 100% coverage with a major component,
 * and `mukind` does NOT distinguish it. So we classify explicitly and surface non-soil distinctly,
 * never as a soil.
 *
 * PURE: no I/O. Primary signal = component-level (misc-area / water components carry no taxonomic class
 * → `taxclname` NULL and no horizons); secondary = a `muname` denylist. A map unit is wholly non-soil
 * ONLY if its MAJOR-component set is exclusively misc/water; a real soil with a minor water inclusion
 * stays soil (`mixed`) and keeps its properties (council C9).
 */
import type { SdaPropertyRow } from "./parse-sda-core";
import type { SoilClass } from "./schema";

const WATER_NAME = /\bwater\b/i;
const NONSOIL_NAME =
  /\b(pits?|rock outcrop|urban land|udorthents|dam(s)?|riverwash|not surveyed|miscellaneous|beaches|dumps|made land|gravel pit|quarr)/i;

/** A component with no taxonomic class is a misc-area / water component (carries no horizons either). */
export function componentIsNonSoil(c: SdaPropertyRow): boolean {
  return c.taxclname == null || c.taxclname.trim() === "";
}

/** The major components of a map unit: those flagged `Yes`, else (no flags) the single highest-percent. */
export function majorComponents(comps: SdaPropertyRow[]): SdaPropertyRow[] {
  const flagged = comps.filter((c) => (c.majcompflag ?? "").toLowerCase() === "yes");
  if (flagged.length > 0) return flagged;
  if (comps.length === 0) return [];
  const top = comps.reduce((a, b) => ((b.comppct ?? 0) > (a.comppct ?? 0) ? b : a));
  return [top];
}

/**
 * Classify a map unit. `comps` are ITS property rows (may be empty if the tabular query returned
 * nothing for this mukey — then fall back to the `muname` denylist).
 */
export function classifyMapUnit(muname: string, comps: SdaPropertyRow[]): SoilClass {
  const majors = majorComponents(comps);
  if (majors.length > 0) {
    const allNonSoil = majors.every(componentIsNonSoil);
    if (allNonSoil) return WATER_NAME.test(muname) ? "water" : "non-soil";
    // A real soil whose major set ALSO carries a misc/water component → keep the soil, mark mixed.
    if (majors.some(componentIsNonSoil)) return "mixed";
    return "soil";
  }
  // No component data — muname denylist fallback (fragile by design; the component test is primary).
  if (WATER_NAME.test(muname)) return "water";
  if (NONSOIL_NAME.test(muname)) return "non-soil";
  return "soil";
}
