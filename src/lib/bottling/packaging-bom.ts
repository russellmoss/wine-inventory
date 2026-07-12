// Plan 056 — packaging bill-of-materials math. PURE + client-safe (no prisma/React), unit-tested
// directly. The consumption model (council D1): crews don't hand-count 2,400 corks — they know
// "100 cases = 1,200 bottles". Each BoM line carries a per-bottle OR per-case FACTOR; theoretical
// consumption is derived from the bottle count, and the crew edits only the variance (breakage).

export type PackagingUnit = "bottle" | "case";

/** A planned packaging BoM line authored on a BOTTLE work-order task. `qty` is the derived planned
 * consumption (in eaches) the reservation holds — computed from `factor` × planned bottles/cases. */
export type PackagingPlanLine = {
  materialId: string;
  per: PackagingUnit;
  factor: number;
  qty?: number;
};

export const BOTTLES_PER_CASE = 12;

/** Cases a bottle count fills (partial case rounds up — you open a fresh box for the 1,201st bottle). */
export function casesFor(bottles: number): number {
  return bottles > 0 ? Math.ceil(bottles / BOTTLES_PER_CASE) : 0;
}

/**
 * Theoretical consumption (eaches) for one BoM line at a given bottle count: bottles × factor for a
 * per-bottle line, cases × factor for a per-case line. Eaches are whole units (rounded). Zero/invalid
 * inputs → 0.
 */
export function theoreticalConsumption(line: { per: PackagingUnit; factor: number }, bottles: number): number {
  if (!(bottles > 0) || !(line.factor > 0)) return 0;
  const base = line.per === "case" ? casesFor(bottles) : bottles;
  return Math.round(base * line.factor);
}

/**
 * Auto-fill the per-line factor from the picked material's name/kind (the adoption lever — a factor is
 * rarely typed). Case boxes/cartons/dividers are per-case (1 each); everything else (glass, cork,
 * capsule, closure, screwcap, label, foil) is per-bottle (1 each). The crew overrides for 2-label runs.
 */
export function guessPackagingFactor(name?: string | null, kind?: string | null): { per: PackagingUnit; factor: number } {
  const s = `${name ?? ""} ${kind ?? ""}`.toLowerCase();
  if (/\b(case|box|carton|shipper|6-?pack|12-?pack|divider|insert|mailer)\b/.test(s)) return { per: "case", factor: 1 };
  return { per: "bottle", factor: 1 };
}
