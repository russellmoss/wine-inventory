// Shared TS types for the TTB F 5120.17 compliance engine (Phase 14 v1).
//
// These TS unions MIRROR the Prisma enums added in Unit 1 (WineTaxClass, ProductType,
// CarbonationMethod) — keep them in sync, exactly like src/lib/ledger/vocabulary.ts mirrors
// the ledger enums. Defining them as TS types first lets the GATE-critical pure math
// (deriveTaxClass, mapLineToForm, the fold arithmetic) be written + validated in Phase 0
// with no DB migration (Execution Sequencing: math-first).

/**
 * The six federal wine tax classes on TTB F 5120.17 Part I, columns (a)–(f). Derived, never
 * hand-picked (Decision #1). The stored enum values are verbose so a raw DB value is readable.
 *   a — not over 16% ABV
 *   b — over 16 to 21% (inclusive)
 *   c — over 21 to 24% (inclusive)
 *   d — artificially carbonated wine
 *   e — sparkling wine (split BF/BP via `SparklingSub`, footnotes 2/3)
 *   f — hard cider (footnote 1)
 */
export const WINE_TAX_CLASSES = [
  "A_LE16",
  "B_16_21",
  "C_21_24",
  "D_CARBONATED",
  "E_SPARKLING",
  "F_HARD_CIDER",
] as const;
export type WineTaxClass = (typeof WINE_TAX_CLASSES)[number];

/** Product type (Fork 2A). WINE is the grape-first default; HARD_CIDER reaches class (f). */
export const PRODUCT_TYPES = ["WINE", "HARD_CIDER"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

/**
 * How a wine is carbonated (Fork 2A). NONE (still) is the default; NATURAL is fermentation
 * (→ sparkling class e when a method is set); ARTIFICIAL is injected CO₂ (→ class d).
 */
export const CARBONATION_METHODS = ["NONE", "NATURAL", "ARTIFICIAL"] as const;
export type CarbonationMethod = (typeof CARBONATION_METHODS)[number];

/**
 * Sparkling sub-row for column (e) (footnotes 2/3): BF = produced by fermentation IN BOTTLE
 * (traditional / pét-nat), BP = produced by BULK process (tank / Charmat). null for the five
 * non-sparkling classes.
 */
export type SparklingSub = "BF" | "BP" | null;

/** The mirror of the Prisma `SparklingMethod` enum (schema.prisma:922) — kept local so the pure
 * derivation doesn't import from @prisma/client (Phase-0 has no generated client for the new enums,
 * and this module must stay DB-free). */
export type SparklingMethodLike = "TRADITIONAL" | "TANK" | "PETNAT";

/** Exact ABV band boundaries (percent). S2: inclusive upper bounds. */
export const ABV_BAND = {
  A_MAX: 16.0, // a: ≤ 16.000
  B_MAX: 21.0, // b: > 16.000 and ≤ 21.000
  C_MAX: 24.0, // c: > 21.000 and ≤ 24.000
} as const;

/** Hard-cider ABV window (footnote 1): at least 0.5% and less than 8.5%. */
export const CIDER_ABV = { MIN: 0.5, MAX: 8.5 } as const;

/**
 * The taxonomy of ways wine leaves / is used out of bond (Decision #4). One `REMOVE_TAXPAID` op
 * carries one disposition; it maps to the §A / §B removal lines. The enum VALUES + human labels
 * live in `removal-reasons.ts` (Unit 4); the disposition→form-line mapping lives ONLY in
 * `form-map.ts` (Unit 5) — one mapping authority (eng-review E4). Defined here so both the pure
 * Phase-0 mapping and the Unit-4 op can share the type with no DB dependency.
 */
export const REMOVAL_DISPOSITIONS = [
  "TAXPAID", // A14 (bulk) / B8 (bottled) — the tax-determination event
  "EXPORT", // B12 — removed for export (bottled)
  "FAMILY_USE", // B13 — removed for family use (bottled)
  "TESTING", // A23 (bulk) / B14 (bottled) — used for testing
  "TASTING", // B11 — used for tasting (bottled)
  "DISTILLING_MATERIAL", // A16 — removed for distilling material (bulk)
  "VINEGAR", // A17 — removed to vinegar plant (bulk)
  "SWEETENING", // A18 — used for sweetening (bulk)
  "SPIRITS", // A19 — used for addition of wine spirits (bulk)
  "AMELIORATION", // A21 — used for amelioration (bulk)
  "EFFERVESCENT", // A22 — used for effervescent wine (bulk)
] as const;
export type RemovalDisposition = (typeof REMOVAL_DISPOSITIONS)[number];

/** A form section: A = bulk wines, B = bottled wines. */
export type FormSection = "A" | "B";

/**
 * The two TTB compliance forms (mirror of the Prisma `ComplianceFormType` enum). One generalized
 * `compliance_report` table backs both (plan-026 Fork 1A); `formType` scopes every report query so
 * the filing chains never cross (council C4). The where-fragment helper lives in `form-type.ts`.
 */
export const COMPLIANCE_FORM_TYPES = ["TTB_5120_17", "TTB_5000_24"] as const;
export type ComplianceFormTypeValue = (typeof COMPLIANCE_FORM_TYPES)[number];

/**
 * Filing cadences, split by form. The 5120.17 operations report uses MONTHLY/QUARTERLY/ANNUAL; the
 * 5000.24 excise RETURN uses SEMIMONTHLY/QUARTERLY/ANNUAL (27 CFR 24.271 — a $-liability test, never
 * MONTHLY). Both are subsets of the Prisma `ReportCadence` enum (which is the union of the two).
 */
export const OPS_CADENCES = ["MONTHLY", "QUARTERLY", "ANNUAL"] as const;
export type OpsCadence = (typeof OPS_CADENCES)[number];
export const RETURN_CADENCES = ["SEMIMONTHLY", "QUARTERLY", "ANNUAL"] as const;
export type ReturnCadence = (typeof RETURN_CADENCES)[number];

/** Narrow a stored `ReportCadence` to an ops cadence (a 5120.17 row never carries SEMIMONTHLY). */
export function asOpsCadence(c: string): OpsCadence {
  return (OPS_CADENCES as readonly string[]).includes(c) ? (c as OpsCadence) : "MONTHLY";
}

/** Narrow a stored `ReportCadence` to a return cadence (falls back to SEMIMONTHLY, the safe default). */
export function asReturnCadence(c: string): ReturnCadence {
  return (RETURN_CADENCES as readonly string[]).includes(c) ? (c as ReturnCadence) : "SEMIMONTHLY";
}

/** A resolved target cell on the form: a section, a line number, and an optional BF/BP sub-row. */
export type FormLine = { section: FormSection; line: number; sub: SparklingSub };
