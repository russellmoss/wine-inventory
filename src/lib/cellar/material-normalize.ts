import { cleanInputName, normalizeInputKey } from "@/lib/fieldnotes/sanitize";
import { MATERIAL_KINDS, RATE_BASES, type MaterialKind, type RateBasis } from "@/lib/cellar/additions-math";

// Pure, prisma-free normalizers for the CellarMaterial catalog (Phase 3). Reuses the
// field-input sanitizers so "KMBS" / "kmbs" / "K M B S" collapse to one dedup key, and
// the catalog dedupes the same way the spray/fertilizer master list does. Unit-tested in
// test/cellar-materials.test.ts without touching the DB.

/** Canonical DISPLAY name for a material ("Potassium Metabisulfite" → "POTASSIUM METABISULFITE"). */
export function cleanMaterialName(raw: unknown): string {
  return cleanInputName(raw);
}

/** DEDUP key for a material (strip non-alphanumeric, UPPERCASE). "KMBS" === "kmbs". */
export function normalizeMaterialKey(raw: unknown): string {
  return normalizeInputKey(raw);
}

/** Coerce arbitrary input to a known material kind; unknown/empty → OTHER. */
export function coerceMaterialKind(raw: unknown): MaterialKind {
  const up = String(raw ?? "").trim().toUpperCase();
  return (MATERIAL_KINDS as readonly string[]).includes(up) ? (up as MaterialKind) : "OTHER";
}

/** Validate a dose basis; unknown/empty → null (a material need not declare a basis). */
export function coerceRateBasis(raw: unknown): RateBasis | null {
  const up = String(raw ?? "").trim().toUpperCase();
  return (RATE_BASES as readonly string[]).includes(up) ? (up as RateBasis) : null;
}
