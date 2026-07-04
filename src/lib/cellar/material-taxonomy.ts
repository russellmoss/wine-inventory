import { MATERIAL_KINDS, type MaterialKind } from "@/lib/cellar/additions-math";

// Two-level material taxonomy (Phase 034). PURE + client-safe — no prisma / server imports —
// so 'use client' pickers and the management page can import it directly (like materials-shared.ts).
//
// LEVEL 1 — main category — is CONTROLLED and DERIVED from the load-bearing `kind` (never stored):
//   ADDITIVE vs CLEANING_SANITIZING is the same split the cost roll-up uses to decide wine COGS vs
//   OVERHEAD (invariant WORKORDER-3), so it must stay authoritative and cannot be free-text.
// LEVEL 2 — subcategory — is the user-facing grouping. Built-ins come from `kind`; a material may
//   also carry a free-text `subcategory` (customizable) that OVERRIDES the built-in label for display
//   and filtering. Effective subcategory = free-text if set, else the built-in label for its kind.

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

/** Built-in subcategory label for a kind. Unknown kind → "Other". */
export function builtinSubLabel(kind: string | null | undefined): string {
  const k = String(kind ?? "").trim().toUpperCase();
  return (KIND_TO_SUBLABEL as Record<string, string>)[k] ?? "Other";
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
 * May a material of this kind be DOSED into wine (an ADDITION/FINING op)? False for cleaning/sanitizing
 * and packaging — dosing those would wrongly capitalize a non-additive into wine COGS (WORKORDER-3). This
 * is the server-side counterpart to the picker's `materialScopeForTask` scoping.
 */
export function isDoseableKind(kind: string | null | undefined): boolean {
  const cat = categoryOf(kind);
  return cat !== "CLEANING_SANITIZING" && cat !== "PACKAGING";
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
 * NOTE: this is a UI CONVENIENCE / first line of defense, NOT a server-enforced guard. The dose path
 * (resolveDoseMaterial → consumeMaterialCore) does not inspect kind, so a crafted request could still pass
 * a cleaning/packaging materialId into an ADDITION. If server-side enforcement of WORKORDER-3 for the
 * addition path is wanted, add a `categoryOf(kind)` check at the execute seam (see plan 034 follow-up).
 */
export function materialScopeForTask(def: { opType?: string | null; activityType?: string | null }): MaterialCategory[] | undefined {
  if (def.opType === "ADDITION" || def.opType === "FINING") return ["ADDITIVE", "OTHER"];
  if (def.activityType === "CLEAN" || def.activityType === "SANITIZE") return ["CLEANING_SANITIZING", "OTHER"];
  return undefined;
}
