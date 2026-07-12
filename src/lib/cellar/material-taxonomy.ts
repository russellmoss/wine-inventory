import { MATERIAL_KINDS, type MaterialKind } from "@/lib/cellar/additions-math";

// Material taxonomy (Phase 034 → 036). PURE + client-safe — no prisma / server imports —
// so 'use client' pickers and the management page can import it directly (like materials-shared.ts).
//
// CATEGORY (main) — the 4 controlled values below. It is the cost-safety authority: ADDITIVE vs
//   CLEANING_SANITIZING/PACKAGING decides wine COGS vs OVERHEAD/non-dose (WORKORDER-3). Phase 036 STORES
//   it on the material (was derived from `kind`), so a user-invented family is still routed correctly —
//   `isDoseableCategory` reads the stored category. `categoryOf(kind)` remains a backfill/fallback only.
// FAMILY — the user-facing grouping (Yeast, Fining, Nutrient, …), stored in the `kind` column. Built-ins
//   are seeded (BUILTIN_FAMILIES); Phase 036 lets the user "+ add" a custom family (any non-empty string,
//   normalized by `coerceFamily`, displayed by `familyLabel`). The picker's filter chips are the family.
//   (The old free-text `subcategory` finer level is retired from the UI; the column stays dormant.)

export const MATERIAL_CATEGORIES = [
  "ADDITIVE",
  "CLEANING_SANITIZING",
  "PACKAGING",
  "OTHER",
] as const;
export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<MaterialCategory, string> = {
  ADDITIVE: "Additives",
  CLEANING_SANITIZING: "Cleaning & Sanitizing",
  PACKAGING: "Packaging",
  OTHER: "Other",
};

/** The main category a material kind belongs to. Exhaustive over MATERIAL_KINDS. */
const KIND_TO_CATEGORY: Record<MaterialKind, MaterialCategory> = {
  YEAST: "ADDITIVE",
  MLF: "ADDITIVE",
  SO2: "ADDITIVE",
  NUTRIENT: "ADDITIVE",
  ACID: "ADDITIVE",
  SUGAR: "ADDITIVE",
  TANNIN: "ADDITIVE",
  FINING: "ADDITIVE",
  BENTONITE: "ADDITIVE",
  CHITOSAN: "ADDITIVE",
  ENZYME: "ADDITIVE",
  CLEANING: "CLEANING_SANITIZING",
  SANITIZER: "CLEANING_SANITIZING",
  PACKAGING: "PACKAGING",
  OTHER: "OTHER",
};

/** Built-in (curated) subcategory label for a kind — used when a material has no custom subcategory. */
const KIND_TO_SUBLABEL: Record<MaterialKind, string> = {
  YEAST: "Yeast",
  MLF: "Bacteria (MLF)",
  SO2: "SO₂",
  NUTRIENT: "Nutrient",
  ACID: "Acid",
  SUGAR: "Sugar",
  TANNIN: "Tannin",
  FINING: "Fining",
  BENTONITE: "Bentonite",
  CHITOSAN: "Chitosan",
  ENZYME: "Enzyme",
  CLEANING: "Cleaning",
  SANITIZER: "Sanitizer",
  PACKAGING: "Packaging",
  OTHER: "Other",
};

/** Main category for a kind. Unknown kind → OTHER (mirrors coerceMaterialKind's fallback). */
export function categoryOf(kind: string | null | undefined): MaterialCategory {
  const k = String(kind ?? "").trim().toUpperCase();
  return (KIND_TO_CATEGORY as Record<string, MaterialCategory>)[k] ?? "OTHER";
}

/** Title-case a raw family key for display ("SUR LIE" → "Sur Lie"). */
function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Display label for a material FAMILY (the `kind` column). A built-in kind uses its curated label
 * ("MLF" → "Bacteria (MLF)"); a user-added custom family displays its own title-cased name (not "Other").
 * Empty → "Other".
 */
export function familyLabel(kind: string | null | undefined): string {
  const raw = String(kind ?? "").trim();
  if (!raw) return "Other";
  const up = raw.toUpperCase();
  if (up in KIND_TO_SUBLABEL) return (KIND_TO_SUBLABEL as Record<string, string>)[up];
  return titleCase(raw);
}

/** @deprecated Phase 036 renamed this to `familyLabel` (custom families now display their own name). */
export const builtinSubLabel = familyLabel;

/** Built-in families for the "family" dropdown: the seed list a winery starts from before adding custom ones. */
export const BUILTIN_FAMILIES: { value: MaterialKind; label: string; category: MaterialCategory }[] =
  (MATERIAL_KINDS as readonly MaterialKind[])
    .filter((k) => k !== "OTHER")
    .map((k) => ({ value: k, label: KIND_TO_SUBLABEL[k], category: KIND_TO_CATEGORY[k] }));

/**
 * Normalize a family selection/typed value into the stored `kind` value. A built-in (matched by code OR
 * by its label, case-insensitively) maps back to its canonical code (YEAST, MLF, SO2, …); a custom family
 * is stored as its uppercased trimmed key so "Sur Lie" and "sur lie" collapse to one family. Empty → OTHER.
 */
export function coerceFamily(raw: unknown): string {
  // Cap length: a custom family is stored in `kind`, which is part of @@unique([tenantId, kind, normalizedKey]).
  const s = String(raw ?? "").trim().slice(0, 60);
  if (!s) return "OTHER";
  const up = s.toUpperCase();
  if ((MATERIAL_KINDS as readonly string[]).includes(up)) return up;
  const byLabel = (Object.keys(KIND_TO_SUBLABEL) as MaterialKind[]).find(
    (k) => KIND_TO_SUBLABEL[k].toUpperCase() === up,
  );
  if (byLabel) return byLabel;
  return up;
}

/**
 * Effective subcategory (grouping key) for a material: its custom free-text `subcategory` when set,
 * otherwise the built-in label for its kind. This is what the filter chips + management grouping use.
 */
export function effectiveSubcategory(material: { kind?: string | null; subcategory?: string | null }): string {
  const custom = (material.subcategory ?? "").trim();
  return custom.length > 0 ? custom : builtinSubLabel(material.kind);
}

/**
 * May a material of this CATEGORY be DOSED into wine (an ADDITION/FINING op)? False for cleaning/sanitizing
 * and packaging — dosing those would wrongly capitalize a non-additive into wine COGS (WORKORDER-3). This is
 * the server-side authority; it reads the STORED category so a user-invented family is routed correctly.
 */
export function isDoseableCategory(category: MaterialCategory): boolean {
  return category !== "CLEANING_SANITIZING" && category !== "PACKAGING";
}

/** Legacy convenience: doseability from a `kind` when the stored category isn't at hand (derives it). */
export function isDoseableKind(kind: string | null | undefined): boolean {
  return isDoseableCategory(categoryOf(kind));
}

/** The kinds that make up a category — used to filter material queries by category. */
export function kindsForCategory(category: MaterialCategory): MaterialKind[] {
  return (MATERIAL_KINDS as readonly MaterialKind[]).filter((k) => KIND_TO_CATEGORY[k] === category);
}

/** Validate arbitrary input to a known category; unknown/empty → OTHER. */
export function coerceMaterialCategory(raw: unknown): MaterialCategory {
  const up = String(raw ?? "").trim().toUpperCase();
  return (MATERIAL_CATEGORIES as readonly string[]).includes(up) ? (up as MaterialCategory) : "OTHER";
}

/**
 * Which main categories the material picker shows for a given work-order task (single source of truth,
 * used by both the plan + execute flows). Additions dose additives (+ generic OTHER); cleaning/sanitizing
 * tasks draw cleaning supplies (+ OTHER); anything else (e.g. GAS) shows all.
 *
 * This scopes the PICKER; the server-side WORKORDER-3 guard at the execute seam enforces it for real via
 * the material's stored category (`isDoseableCategory`), so a crafted request can't dose a non-additive.
 */
export function materialScopeForTask(def: { opType?: string | null; activityType?: string | null }): MaterialCategory[] | undefined {
  if (def.opType === "ADDITION" || def.opType === "FINING") return ["ADDITIVE", "OTHER"];
  // Plan 056: a BOTTLE task's packaging bill-of-materials draws dry goods (glass/cork/capsule/label/case).
  if (def.opType === "BOTTLE") return ["PACKAGING", "OTHER"];
  if (def.activityType === "CLEAN" || def.activityType === "SANITIZE") return ["CLEANING_SANITIZING", "OTHER"];
  // Plan 044: SO₂ strips/discs and citric+KMBS storage reagents can live under either taxonomy depending on
  // how the winery categorized them — union both (still overhead-only, never dosed into wine, WORKORDER-3).
  if (def.activityType === "SO2" || def.activityType === "WET_STORAGE") return ["ADDITIVE", "CLEANING_SANITIZING", "OTHER"];
  return undefined;
}
