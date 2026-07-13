// The controlled analyte set for cellar chemistry (Phase 4), as CONFIG, not schema.
// Adding an analyte is a one-line edit here — `LotMeasurement`/`AnalysisReading.analyte`
// is a validated string, NOT a Prisma enum (mirrors `LotTreatment.rateBasis`, VISION D4
// for the closed sets that ARE enums). Keys are STABLE + APPEND-ONLY: never rename or
// remove a key (history stores the raw key); deprecate with `deprecated: true` instead.
// The renderer must fall back gracefully for an unknown stored key (show key + value).
//
// No prisma, no server imports — pure, unit-tested in test/chemistry-analytes.test.ts.

/** Analyte families, for grouping the picker + trend sections (Design Spec). */
export const ANALYTE_CATEGORIES = ["acidity", "so2", "sugar", "temperature", "alcohol", "other"] as const;
export type AnalyteCategory = (typeof ANALYTE_CATEGORIES)[number];

export type AnalyteDef = {
  /** Stable key (append-only). Stored verbatim on every reading. */
  key: string;
  label: string;
  category: AnalyteCategory;
  /** Allowed unit codes; the first is canonical for charts/derivations. */
  units: string[];
  defaultUnit: string;
  /** Optional sanity range, expressed in `defaultUnit`. */
  min?: number;
  max?: number;
  /** Display precision (decimal places). */
  precision: number;
  /** Deprecated analytes still render for history but are hidden from the picker. */
  deprecated?: boolean;
  /**
   * Convert a value FROM `fromUnit` into `defaultUnit`. Returns the value unchanged when
   * `fromUnit` is already the default, or `null` when no conversion is defined (caller
   * then plots a separate series / skips the range check). Only defined where a clean
   * conversion exists within a single analyte (°C↔°F; TA tartaric↔H₂SO₄).
   */
  convertToDefault?: (value: number, fromUnit: string) => number | null;
};

// TA: 1 g/L as H₂SO₄ = 1.5306 g/L as tartaric (molar-mass ratio). Tartaric is canonical (US).
const TA_H2SO4_TO_TARTARIC = 1.5306;

/**
 * The registry. Keyed by analyte key. Units / ranges / precision from UC Davis, AWRI,
 * WineMaker references (see the Phase 4 plan's external research).
 */
export const ANALYTES: Record<string, AnalyteDef> = {
  PH: { key: "PH", label: "pH", category: "acidity", units: ["pH"], defaultUnit: "pH", min: 2.5, max: 4.5, precision: 2 },
  TA: {
    key: "TA",
    label: "Titratable acidity",
    category: "acidity",
    units: ["g/L tartaric", "g/L H2SO4"],
    defaultUnit: "g/L tartaric",
    min: 0,
    max: 20,
    precision: 1,
    convertToDefault: (v, u) =>
      u === "g/L tartaric" ? v : u === "g/L H2SO4" ? v * TA_H2SO4_TO_TARTARIC : null,
  },
  VA: { key: "VA", label: "Volatile acidity", category: "acidity", units: ["g/L acetic"], defaultUnit: "g/L acetic", min: 0, max: 3, precision: 2 },
  FREE_SO2: { key: "FREE_SO2", label: "Free SO₂", category: "so2", units: ["mg/L"], defaultUnit: "mg/L", min: 0, max: 200, precision: 0 },
  TOTAL_SO2: { key: "TOTAL_SO2", label: "Total SO₂", category: "so2", units: ["mg/L"], defaultUnit: "mg/L", min: 0, max: 500, precision: 0 },
  RS: { key: "RS", label: "Residual sugar", category: "sugar", units: ["g/L"], defaultUnit: "g/L", min: 0, max: 400, precision: 1 },
  BRIX: { key: "BRIX", label: "Brix", category: "sugar", units: ["°Bx"], defaultUnit: "°Bx", min: -5, max: 40, precision: 1 },
  SG: { key: "SG", label: "Specific gravity", category: "sugar", units: ["SG"], defaultUnit: "SG", min: 0.9, max: 1.2, precision: 3 },
  BAUME: { key: "BAUME", label: "Baumé", category: "sugar", units: ["°Bé"], defaultUnit: "°Bé", min: -5, max: 25, precision: 1 },
  TEMP: {
    key: "TEMP",
    label: "Temperature",
    category: "temperature",
    units: ["°C", "°F"],
    defaultUnit: "°C",
    min: -5,
    max: 45,
    precision: 1,
    convertToDefault: (v, u) => (u === "°C" ? v : u === "°F" ? ((v - 32) * 5) / 9 : null),
  },
  MALIC: { key: "MALIC", label: "Malic acid", category: "acidity", units: ["g/L"], defaultUnit: "g/L", min: 0, max: 10, precision: 2 },
  LACTIC: { key: "LACTIC", label: "Lactic acid", category: "acidity", units: ["g/L"], defaultUnit: "g/L", min: 0, max: 10, precision: 2 },
  ALCOHOL: { key: "ALCOHOL", label: "Alcohol", category: "alcohol", units: ["% ABV"], defaultUnit: "% ABV", min: 0, max: 20, precision: 1 },
  // NICE-to-have analytes (still first-class; just less common).
  ACETALDEHYDE: { key: "ACETALDEHYDE", label: "Acetaldehyde", category: "other", units: ["mg/L"], defaultUnit: "mg/L", min: 0, max: 400, precision: 0 },
  YAN: { key: "YAN", label: "Yeast assimilable nitrogen", category: "other", units: ["mg/L"], defaultUnit: "mg/L", min: 0, max: 600, precision: 0 },
};

/** The canonical key tuple (stable order for pickers). */
export const ANALYTE_KEYS = Object.keys(ANALYTES) as readonly string[];

/** Analytes shown by default in the lot trend section; the rest sit behind "show all". */
export const DEFAULT_TREND_ANALYTES = ["PH", "TA", "FREE_SO2", "BRIX"] as const;

/** Type guard: is `x` a known analyte key? */
export function isAnalyteKey(x: unknown): x is string {
  return typeof x === "string" && Object.prototype.hasOwnProperty.call(ANALYTES, x);
}

/** Look up a definition; `undefined` for an unknown key (renderer falls back). */
export function getAnalyte(key: string): AnalyteDef | undefined {
  return ANALYTES[key];
}

/**
 * Resolve a free-form analyte name to its canonical registry KEY, or null if unknown.
 * Accepts the exact key ("BRIX"), a differently-cased key ("brix", "Temp" → "TEMP"), or the
 * display label ("Brix", "Temperature", "Free SO₂"). Used to normalize assistant/import input so a
 * label never reaches the strict-key write validator (the "Unknown analyte" class of bug).
 */
export function resolveAnalyteKey(input: string): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  if (ANALYTES[raw]) return raw; // exact key
  const upper = raw.toUpperCase();
  if (ANALYTES[upper]) return upper; // case-insensitive key (brix → BRIX, temp → TEMP)
  const lc = raw.toLowerCase();
  for (const def of Object.values(ANALYTES)) {
    if (def.label.toLowerCase() === lc) return def.key; // display label ("Temperature" → TEMP)
  }
  return null;
}

export type ValidationResult = { ok: true } | { ok: false; error: string };

/**
 * Validate a single reading: known key, finite value, unit membership, and (where a range
 * is defined) the value within range — converted to the default unit first when a converter
 * exists. Unknown-unit ranges are not enforced (the range is unit-specific).
 */
export function validateMeasurement(key: string, value: number, unit: string): ValidationResult {
  const def = ANALYTES[key];
  if (!def) return { ok: false, error: `Unknown analyte "${key}".` };
  if (!Number.isFinite(value)) return { ok: false, error: `${def.label} needs a numeric value.` };
  if (!def.units.includes(unit)) {
    return { ok: false, error: `${def.label} must be one of: ${def.units.join(", ")} (got "${unit}").` };
  }
  if (def.min != null || def.max != null) {
    const inDefault = unit === def.defaultUnit ? value : (def.convertToDefault?.(value, unit) ?? null);
    if (inDefault != null) {
      if (def.min != null && inDefault < def.min) {
        return { ok: false, error: `${def.label} ${value} ${unit} is below the expected ${def.min} ${def.defaultUnit}.` };
      }
      if (def.max != null && inDefault > def.max) {
        return { ok: false, error: `${def.label} ${value} ${unit} is above the expected ${def.max} ${def.defaultUnit}.` };
      }
    }
  }
  return { ok: true };
}

/** Convert a reading into the analyte's canonical unit for charting; `null` if not convertible. */
export function toDefaultUnit(key: string, value: number, unit: string): number | null {
  const def = ANALYTES[key];
  if (!def) return null;
  if (unit === def.defaultUnit) return value;
  return def.convertToDefault?.(value, unit) ?? null;
}
