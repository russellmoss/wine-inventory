import { KG_PER_LB, KG_PER_TONNE, LB_PER_SHORT_TON } from "@/lib/harvest/units";

// Deterministic weight-unit resolution for the assistant's fruit-intake / crush flow (issue #311).
//
// WHY THIS EXISTS: the model was doing the unit math in its head — "2 tons" came out as 1000 kg (wrong;
// a US short ton is 907.18 kg, a metric tonne is 1000 kg, so 2 tons is 1,814 kg or 2,000 kg, never 1,000).
// That is a stochastic model failure a prompt nudge can only mitigate. The fix is to REMOVE the mental
// math: the weigh-in / crush tools accept the value in the unit the user actually said, and THIS pure,
// unit-tested function converts it to canonical kg. One conversion, one source of truth, no guessing.
//
// Domain convention (mirrors src/lib/units/measure.ts): a bare "ton"/"tons" is the US short ton (US
// wineries weigh fruit in short tons). Metric is only reached by an explicit "tonne"/"metric ton"/"t"/"mt".
// The caller surfaces the resolved interpretation in the confirm preview so a human catches a wrong guess.

/** kg per one US short ton (2000 lb). Derived, not magic — keeps a single lb factor. */
export const KG_PER_SHORT_TON = LB_PER_SHORT_TON * KG_PER_LB; // 907.18474

type UnitDef = { kgPer: number; singular: string; plural: string };

// Canonical unit keys → their kg factor + display labels. Imperial factors are exact intl. definitions.
const UNITS: Record<string, UnitDef> = {
  mg: { kgPer: 0.000001, singular: "mg", plural: "mg" },
  g: { kgPer: 0.001, singular: "g", plural: "g" },
  kg: { kgPer: 1, singular: "kg", plural: "kg" },
  oz: { kgPer: KG_PER_LB / 16, singular: "oz", plural: "oz" },
  lb: { kgPer: KG_PER_LB, singular: "lb", plural: "lb" },
  "short ton": { kgPer: KG_PER_SHORT_TON, singular: "short ton", plural: "short tons" },
  tonne: { kgPer: KG_PER_TONNE, singular: "tonne", plural: "tonnes" },
};

// Free-text spellings → canonical key. A bare "ton"/"tons" is the US SHORT ton (domain default); metric
// is reached only by an explicit metric word ("tonne"/"metric ton"/"t"/"mt") so we never silently
// straddle the ~10% short-vs-metric gap.
const ALIASES: Record<string, string> = {
  // metric mass
  milligram: "mg", milligrams: "mg",
  gram: "g", grams: "g", gramme: "g", grammes: "g",
  kilogram: "kg", kilograms: "kg", kilo: "kg", kilos: "kg", kgs: "kg", metric: "kg",
  // imperial mass
  ounce: "oz", ounces: "oz",
  pound: "lb", pounds: "lb", lbs: "lb", imperial: "lb",
  // US short ton (the bare "ton")
  ton: "short ton", tons: "short ton", "short tons": "short ton", "us ton": "short ton", "us tons": "short ton",
  // metric tonne (must be explicit)
  tonnes: "tonne", t: "tonne", mt: "tonne", "metric ton": "tonne", "metric tons": "tonne", "metric tonne": "tonne", "metric tonnes": "tonne",
};

/** The resolution of a (value, unit) pair to canonical kg, plus display bits for the confirm preview. */
export type WeightResolution = {
  /** Canonical kilograms (what the ledger stores). */
  kg: number;
  /** The canonical unit key the input resolved to (e.g. "short ton"). */
  unitKey: string;
  /** How the resolved unit reads back, e.g. "2 short tons". */
  display: string;
};

/** Resolve a possibly-aliased/cased unit string to its canonical key, or null if unknown. */
export function resolveWeightUnit(unit: string | null | undefined): string | null {
  const raw = String(unit ?? "").trim();
  if (!raw) return null;
  if (raw in UNITS) return raw;
  const lc = raw.toLowerCase();
  if (lc in UNITS) return lc;
  if (lc in ALIASES) return ALIASES[lc];
  return null;
}

function fmtKg(kg: number): string {
  // Trim to at most 2 dp, drop trailing zeros, and group thousands for readability.
  const rounded = Math.round(kg * 100) / 100;
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/**
 * Convert `value` given in `unit` to canonical kg. `unit` defaults to kg (the canonical) when omitted.
 * Returns null when the unit is unknown or the value is non-finite / negative — the caller then refuses
 * with a clear message rather than writing a fabricated number. NEVER guesses a unit it doesn't know.
 */
export function resolveWeightKg(value: number, unit?: string | null): WeightResolution | null {
  if (!Number.isFinite(value) || value < 0) return null;
  const key = unit == null || String(unit).trim() === "" ? "kg" : resolveWeightUnit(unit);
  if (!key) return null;
  const def = UNITS[key];
  const kg = Math.round(value * def.kgPer * 1e6) / 1e6; // canonical kg, guard fp dust
  const label = value === 1 ? def.singular : def.plural;
  return { kg, unitKey: key, display: `${value} ${label}` };
}

/**
 * A one-line, human-auditable statement of how a weight was interpreted, for the confirm preview:
 * "2 short tons (1,814.37 kg)". When the input was already kg, there is nothing to disambiguate, so it
 * collapses to just "1,200 kg". This is the confirm-gate surface: the human sees the assumption and can
 * catch a short-vs-metric or unit slip before applying.
 */
export function describeWeight(res: WeightResolution): string {
  if (res.unitKey === "kg") return `${fmtKg(res.kg)} kg`;
  return `${res.display} (${fmtKg(res.kg)} kg)`;
}
