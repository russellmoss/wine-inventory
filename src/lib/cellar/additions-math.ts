import { round2 } from "@/lib/bottling/draw";
import type { OperationType } from "@/lib/ledger/vocabulary";

// Pure cellar-additions math + volume-effect classification (Phase 3). No prisma, no
// server imports — unit-tested directly (test/additions-math.test.ts). A dose is a RATE
// against the vessel's CURRENT volume; the computed total + the volume snapshot are
// STORED, never recomputed on read (recompute-on-read corrupts history — VISION D14, the
// plan's Key Decisions). All figures go through round2 (centi-granularity, matches
// Decimal(10,2)) so sums are exact.

/**
 * Dose bases. A rate is "amount per volume"; the basis says which.
 *   G_HL  grams per hectoLITRE   → total g  = rate * V / 100
 *   MG_L  milligrams per litre (= ppm) → total g  = rate * V / 1000
 *   G_L   grams per litre        → total g  = rate * V
 *   ML_L  millilitres per litre  → total mL = rate * V
 * Domain identity: 1 g/hL = 10 mg/L = 10 ppm. `%` is a material property (percentActive),
 * never a dose basis, so it is intentionally absent.
 */
export const RATE_BASES = ["G_HL", "MG_L", "G_L", "ML_L"] as const;
export type RateBasis = (typeof RATE_BASES)[number];

/** Material families for the light catalog (controlled, D4). `OTHER` is the fallback. */
export const MATERIAL_KINDS = [
  "YEAST", // Phase 6: yeast inoculation at AF start (e.g. a measured g/hL pitch)
  "MLF", // Phase 6: malolactic culture (Oenococcus oeni), co-inoc or post-AF
  "SO2",
  "NUTRIENT",
  "ACID",
  "SUGAR", // Phase 034: chaptalization / RCGJ sugar addition — an additive dose, capitalizes like other additions
  "TANNIN",
  "FINING",
  "BENTONITE", // Phase 9.1: protein-stability fining clay (a rate against volume, like FINING)
  "CHITOSAN", // Phase 9.1: fungal/shellfish clarifier + Brett reduction (a dosing material)
  "ENZYME",
  "CLEANING", // Phase 9.1: cleaning chemical (proxycarb, caustic) — overhead, consumed by maintenance, never a wine COGS
  "SANITIZER", // Phase 9.1: sanitizer (PAA, ozone) — overhead, consumed by maintenance, never a wine COGS
  "PACKAGING", // Phase 034: dry goods (corks, capsules, bottles, labels) — organized in the catalog, NEVER dosed into wine
  "EQUIPMENT", // Plan 072: spare parts / fittings (e.g. stainless clamps, gaskets) — a stock/supply home, NEVER dosed into wine or hit wine COGS
  "OTHER",
] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

/** Human labels for the basis picker (Design Spec: "g/hL · ppm (mg/L) · g/L · mL/L"). */
export const RATE_BASIS_LABELS: Record<RateBasis, string> = {
  G_HL: "g/hL",
  MG_L: "ppm (mg/L)",
  G_L: "g/L",
  ML_L: "mL/L",
};

export type AdditionTotal = { total: number; unit: "g" | "mL" };

// Phase 9.1 (dose UX): ONE unified "Units" dropdown covering BOTH per-volume rates AND absolute totals.
// The unit tells the engine which: a rate unit (g/hL…) multiplies by the vessel volume to get the total;
// an absolute unit (g, kg…) IS the total. So the form is just "Amount" + "Units" — no separate rate field.
// Phase 036: absolute imperial units (oz/lb → grams, fl oz/gal → millilitres) join the metric absolutes so
// a work-order dose can be entered as e.g. "2 oz" and still resolves to a canonical g/mL total.
export const DOSE_UNIT_LABELS = ["g/hL", "mg/L", "g/L", "mL/L", "g", "kg", "mL", "L", "oz", "lb", "fl oz", "gal"] as const;
export type DoseUnitLabel = (typeof DOSE_UNIT_LABELS)[number];

export type ResolvedDoseUnit =
  | { kind: "rate"; basis: RateBasis }
  | { kind: "abs"; doseUnit: "g" | "mL"; perUnit: number }; // perUnit = doseUnits per 1 chosen unit

/** Classify a dose unit: a per-volume rate (needs volume) or an absolute total (used as-is). null = unknown. */
export function resolveDoseUnit(u: string | null | undefined): ResolvedDoseUnit | null {
  switch ((u ?? "").trim()) {
    case "g/hL": return { kind: "rate", basis: "G_HL" };
    case "mg/L": case "ppm": return { kind: "rate", basis: "MG_L" };
    case "g/L": return { kind: "rate", basis: "G_L" };
    case "mL/L": return { kind: "rate", basis: "ML_L" };
    case "g": return { kind: "abs", doseUnit: "g", perUnit: 1 };
    case "kg": return { kind: "abs", doseUnit: "g", perUnit: 1000 };
    case "oz": return { kind: "abs", doseUnit: "g", perUnit: 28.349523125 }; // avoirdupois ounce (mass)
    case "lb": return { kind: "abs", doseUnit: "g", perUnit: 453.59237 };
    case "mL": return { kind: "abs", doseUnit: "mL", perUnit: 1 };
    case "L": return { kind: "abs", doseUnit: "mL", perUnit: 1000 };
    case "fl oz": return { kind: "abs", doseUnit: "mL", perUnit: 29.5735295625 }; // US fluid ounce (volume)
    case "gal": return { kind: "abs", doseUnit: "mL", perUnit: 3785.411784 }; // US gallon
    default: return null;
  }
}

export function isRateUnit(u: string | null | undefined): boolean {
  return resolveDoseUnit(u)?.kind === "rate";
}

/**
 * Convert a computed dose total (g|mL) to a material's stock unit for reservation/cost. Shared by the
 * NL resolver (stamps plannedAmount/plannedUnit into the task) AND the readiness engine (cost + ATP) so
 * the displayed planned dose and the cost basis can never silently diverge. Six-decimal rounding.
 */
export function convertDoseToStock(total: AdditionTotal | null, stockUnit: string | null | undefined): { qty: number; unit: string } | null {
  if (!total || !stockUnit) return null;
  const round6 = (n: number) => Math.round(n * 1_000_000) / 1_000_000;
  if (total.unit === "g") {
    if (stockUnit === "g") return { qty: total.total, unit: "g" };
    if (stockUnit === "kg") return { qty: round6(total.total / 1000), unit: "kg" };
    if (stockUnit === "mg") return { qty: round6(total.total * 1000), unit: "mg" };
  }
  if (total.unit === "mL") {
    if (stockUnit === "mL") return { qty: total.total, unit: "mL" };
    if (stockUnit === "L") return { qty: round6(total.total / 1000), unit: "L" };
  }
  return null;
}

/** The total (g/mL) a given Amount + Units resolves to against a volume. Rate → amount×volume; abs → amount. */
export function computeDoseTotal(amount: number, unit: string, volumeL: number): AdditionTotal | null {
  const r = resolveDoseUnit(unit);
  if (!r || !Number.isFinite(amount) || amount < 0) return null;
  if (r.kind === "abs") return { total: round2(amount * r.perUnit), unit: r.doseUnit };
  if (!(volumeL > 0)) return null;
  return computeAdditionTotal(amount, r.basis, volumeL);
}

/**
 * Turn a dictated rate into a computed total from the vessel's current volume.
 * Mass bases (G_HL, MG_L, G_L) yield grams; ML_L yields millilitres. Throws on a
 * negative rate, a non-positive volume, or an unknown basis (controlled vocabulary).
 */
export function computeAdditionTotal(rateValue: number, basis: RateBasis, volumeL: number): AdditionTotal {
  if (!Number.isFinite(rateValue) || rateValue < 0) {
    throw new Error("Addition rate must be a non-negative number.");
  }
  if (!Number.isFinite(volumeL) || volumeL <= 0) {
    throw new Error("Vessel volume must be greater than 0 to compute an addition.");
  }
  switch (basis) {
    case "G_HL":
      return { total: round2((rateValue * volumeL) / 100), unit: "g" };
    case "MG_L":
      return { total: round2((rateValue * volumeL) / 1000), unit: "g" };
    case "G_L":
      return { total: round2(rateValue * volumeL), unit: "g" };
    case "ML_L":
      return { total: round2(rateValue * volumeL), unit: "mL" };
    default:
      throw new Error(`Unknown rate basis: ${String(basis)}`);
  }
}

/** How an operation type changes the vessel's volume (drives form copy + line building). */
export type VolumeEffect = "neutral" | "adds" | "removes";

export const VOLUME_EFFECT: Partial<Record<OperationType, VolumeEffect>> = {
  ADDITION: "neutral",
  FINING: "neutral",
  CAP_MGMT: "neutral",
  TOPPING: "adds",
  FILTRATION: "removes",
  LOSS: "removes",
};
