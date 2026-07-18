import { round8 } from "@/lib/cost/rollup";

// Phase 036: pure unit-of-measure + same-dimension conversion. No prisma, no React — unit-tested directly.
// The app's canonical storage stays METRIC (g for mass, mL for volume, unit for count); this layer converts
// imperial/metric INPUT units into the canonical unit at the intake + dose boundary so the cost engine
// (SupplyLot.unitCost per canonical stock unit) is unchanged. Mass↔volume is NOT convertible without a
// per-material density, so a cross-dimension (or count) conversion returns null — callers degrade to
// UNKNOWN cost (D14), never a fabricated $0.

export type MeasureDimension = "mass" | "volume" | "count";

/** A unit definition: its dimension + how many CANONICAL base units (g/mL/count) one of it is worth. */
export type UnitDef = { dimension: MeasureDimension; perCanonical: number };

/**
 * Plan 075: a per-tenant map of USER-DEFINED units, keyed by lowercased name, merged in AFTER the built-ins.
 * Built-ins always win (a custom unit can never shadow `kg` — the create core also rejects such names), so a
 * missing/omitted registry degrades to today's exact behavior. Kept as a plain param, not a module global, so
 * the engine stays pure/DB-less: callers with a tenant tx load it (see src/lib/units/custom-units.ts) and pass
 * it in; a call site that forgets fails SAFE (unknown unit → null → UNKNOWN cost, D14), never a wrong number.
 */
export type ExtraUnits = Record<string, UnitDef>;

// Factor = how many CANONICAL units one of this unit is worth (g for mass, mL for volume, 1 for count).
// Imperial factors are exact (international definitions): 1 lb = 453.59237 g, 1 oz = 1/16 lb,
// 1 US gallon = 3785.411784 mL, 1 US fl oz = 1/128 gallon.
const UNITS: Record<string, { dimension: MeasureDimension; perCanonical: number }> = {
  // mass → canonical grams
  mg: { dimension: "mass", perCanonical: 0.001 },
  g: { dimension: "mass", perCanonical: 1 },
  kg: { dimension: "mass", perCanonical: 1000 },
  oz: { dimension: "mass", perCanonical: 28.349523125 },
  lb: { dimension: "mass", perCanonical: 453.59237 },
  // US short ton = 2000 lb (consistent with the US-customary oz/lb/gal factors above). NOT the metric
  // tonne (1,000,000 g) — the two differ by ~10%, so "tonne"/"mt" are intentionally left unresolved
  // (→ null → UNKNOWN cost, never a silent 10% money error) rather than aliased onto this.
  ton: { dimension: "mass", perCanonical: 907184.74 },
  // volume → canonical millilitres
  mL: { dimension: "volume", perCanonical: 1 },
  L: { dimension: "volume", perCanonical: 1000 },
  "fl oz": { dimension: "volume", perCanonical: 29.5735295625 },
  gal: { dimension: "volume", perCanonical: 3785.411784 },
  // count → canonical unit
  unit: { dimension: "count", perCanonical: 1 },
};

/** Every unit this engine knows, for building unit dropdowns. */
export const MEASURE_UNITS = Object.keys(UNITS) as readonly string[];

/** Aliases so common spellings resolve to the canonical key ("ml"→"mL", "gallon"→"gal", "floz"→"fl oz"). */
const ALIASES: Record<string, string> = {
  ml: "mL", milliliter: "mL", milliliters: "mL", millilitre: "mL", millilitres: "mL",
  l: "L", liter: "L", liters: "L", litre: "L", litres: "L",
  gallon: "gal", gallons: "gal", gals: "gal",
  floz: "fl oz", "fluid ounce": "fl oz", "fluid ounces": "fl oz",
  ounce: "oz", ounces: "oz",
  pound: "lb", pounds: "lb", lbs: "lb",
  gram: "g", grams: "g", gramme: "g", grammes: "g",
  kilogram: "kg", kilograms: "kg", kilo: "kg", kilos: "kg",
  milligram: "mg", milligrams: "mg",
  tons: "ton", // US short ton; "tonne"/"mt"/bare "t" deliberately NOT mapped (metric ≠ short)
  units: "unit", ea: "unit", each: "unit", count: "unit",
};

/**
 * Internal: resolve a unit string to its {dimension, perCanonical} def, checking built-ins (+ aliases) FIRST,
 * then any tenant `extra` registry. Returns null if unknown. Everything else in this module is built on this.
 */
function lookupDef(u: string | null | undefined, extra?: ExtraUnits): UnitDef | null {
  const raw = String(u ?? "").trim();
  if (!raw) return null;
  if (raw in UNITS) return UNITS[raw];
  const lc = raw.toLowerCase();
  if (lc in UNITS) return UNITS[lc];
  if (lc in ALIASES) return UNITS[ALIASES[lc]];
  if (extra) {
    if (raw in extra) return extra[raw];
    if (lc in extra) return extra[lc];
  }
  return null;
}

/** Resolve a possibly-aliased/cased unit string to a stable key (built-in canonical key or custom name), or null. */
export function resolveUnit(u: string | null | undefined, extra?: ExtraUnits): string | null {
  const raw = String(u ?? "").trim();
  if (!raw) return null;
  if (raw in UNITS) return raw;
  const lc = raw.toLowerCase();
  if (lc in UNITS) return lc;
  if (lc in ALIASES) return ALIASES[lc];
  if (extra) {
    if (raw in extra) return raw;
    if (lc in extra) return lc;
  }
  return null;
}

/** The dimension of a unit (mass | volume | count), or null if the unit is unknown. */
export function dimensionOf(u: string | null | undefined, extra?: ExtraUnits): MeasureDimension | null {
  const d = lookupDef(u, extra);
  return d ? d.dimension : null;
}

/** The canonical unit for a dimension: g (mass), mL (volume), unit (count). */
export function canonicalUnitFor(dim: MeasureDimension): "g" | "mL" | "unit" {
  return dim === "mass" ? "g" : dim === "volume" ? "mL" : "unit";
}

/**
 * Convert `amount` from unit `from` to unit `to`, same-dimension only. Returns null when either unit is
 * unknown, the dimensions differ (e.g. mass↔volume — needs density), or a non-finite/negative amount.
 * Count (`unit`) only converts to itself.
 */
export function convert(amount: number, from: string | null | undefined, to: string | null | undefined, extra?: ExtraUnits): number | null {
  const uf = lookupDef(from, extra);
  const ut = lookupDef(to, extra);
  if (!uf || !ut) return null;
  if (!Number.isFinite(amount) || amount < 0) return null;
  if (uf.dimension !== ut.dimension) return null;
  // amount → canonical → target
  return round8((amount * uf.perCanonical) / ut.perCanonical);
}

/** Convert `amount` of `unit` into that unit's canonical unit (g/mL/unit). Null if the unit is unknown. */
export function toCanonical(amount: number, unit: string | null | undefined, extra?: ExtraUnits): { amount: number; unit: "g" | "mL" | "unit" } | null {
  const dim = dimensionOf(unit, extra);
  if (!dim) return null;
  const canonical = canonicalUnitFor(dim);
  const converted = convert(amount, unit, canonical, extra);
  return converted == null ? null : { amount: converted, unit: canonical };
}
