import { cleanMaterialName, coerceRateBasis, normalizeMaterialKey } from "@/lib/cellar/material-normalize";
import { coerceFamily, categoryOf, coerceMaterialCategory, type MaterialCategory } from "@/lib/cellar/material-taxonomy";
import { coerceStockUnit, type StockUnit } from "@/lib/cellar/materials-shared";
import { dimensionOf, canonicalUnitFor } from "@/lib/units/measure";
import { ActionError } from "@/lib/action-error";

// Phase 037: PURE, client-safe material field derivation + update planning. NO prisma / server imports
// (mirrors materials-shared.ts + material-taxonomy.ts) so both the server cores in materials.ts AND the
// unit tests can import it directly without dragging prisma into the bundle. `materials.ts` re-exports
// `MaterialIntakeInput` + `deriveMaterialFields` for its existing call sites.

/** Fields common to the intake inputs (upsert + create-stock + update). All optional; the display/purchase metadata. */
export type MaterialIntakeInput = {
  name?: string;
  genericName?: string | null;
  brand?: string | null;
  brandName?: string | null;
  preferGeneric?: boolean | null;
  kind?: string; // family
  category?: string | null; // stored main category; falls back to categoryOf(kind)
  subcategory?: string | null;
  defaultBasis?: string | null;
  percentActive?: number | null;
  vendor?: string | null;
  vendorUrl?: string | null;
  packageAmount?: number | null;
  packageUnit?: string | null;
};

// Trim + length-cap a free-text field server-side (never trust the client). 200 chars is generous for a
// product/brand/vendor label; capping matters because a runaway value would bloat rows (family feeds the
// unique index). Blank → null.
export const trimOrNull = (v: unknown, max = 200): string | null => {
  const s = String(v ?? "").trim().slice(0, max);
  return s.length > 0 ? s : null;
};

/** Keep a vendor URL only if it's http(s); a bare domain gets https://; any other scheme (javascript:,
 * data:, …) is dropped — defense-in-depth in case it's ever rendered as an href. */
export function normalizeVendorUrl(v: unknown): string | null {
  const s = trimOrNull(v, 300);
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null; // some other scheme → reject
  return `https://${s}`.slice(0, 300); // bare domain → assume https
}

/** Trim + length-cap a free-text subcategory to a stored value; blank → null (falls back to the built-in
 * kind label). The 80-char cap is server-side (not just the client input) so a huge paste can't bloat the
 * TEXT column or degrade the picker's chip render. */
export function normalizeSubcategory(raw: unknown): string | null {
  const s = String(raw ?? "").trim().slice(0, 80).trimEnd();
  return s.length > 0 ? s : null;
}

/** Resolve the persisted CellarMaterial fields from an intake input. `name` (identity/snapshot) derives from
 * brand name → generic name → the explicit `name`. Family + category are normalized (category stored, falling
 * back to the family's category). Throws (via cleanMaterialName) when identity is empty. */
export function deriveMaterialFields(input: MaterialIntakeInput) {
  const genericName = trimOrNull(input.genericName);
  const brand = trimOrNull(input.brand);
  const brandName = trimOrNull(input.brandName);
  const rawName = brandName ?? genericName ?? input.name ?? "";
  const name = cleanMaterialName(rawName); // throws on empty
  const normalizedKey = normalizeMaterialKey(rawName);
  const kind = coerceFamily(input.kind);
  const category = input.category != null ? coerceMaterialCategory(input.category) : categoryOf(kind);
  const packageAmount =
    input.packageAmount != null && Number.isFinite(input.packageAmount) && input.packageAmount > 0 ? input.packageAmount : null;
  return {
    name,
    normalizedKey,
    kind,
    category,
    genericName,
    brand,
    brandName,
    preferGeneric: !!input.preferGeneric,
    vendor: trimOrNull(input.vendor),
    vendorUrl: normalizeVendorUrl(input.vendorUrl),
    packageAmount,
    packageUnit: packageAmount != null ? trimOrNull(input.packageUnit) : null,
    subcategory: normalizeSubcategory(input.subcategory),
    defaultBasis: coerceRateBasis(input.defaultBasis),
    percentActive: input.percentActive == null || !Number.isFinite(input.percentActive) ? null : input.percentActive,
  };
}

// ── Phase 037: editing the base data of an EXISTING material ──

export type UpdateMaterialInput = MaterialIntakeInput & { stockUnit?: string | null };

/** The existing row's identity + stock-unit — the minimum the update planner needs to decide safety. */
export type ExistingMaterialForUpdate = { kind: string; normalizedKey: string; stockUnit: string | null };

/** The only base-data columns an edit may write (identity + taxonomy + supplier + purchase + stock unit).
 * Deliberately EXCLUDES defaultBasis / percentActive / subcategory / isStockTracked so an edit can never
 * silently wipe a field the edit form doesn't manage. */
export type MaterialUpdateFields = {
  name: string;
  normalizedKey: string;
  kind: string;
  category: MaterialCategory;
  genericName: string | null;
  brand: string | null;
  brandName: string | null;
  preferGeneric: boolean;
  vendor: string | null;
  vendorUrl: string | null;
  packageAmount: number | null;
  packageUnit: string | null;
  stockUnit: StockUnit;
};

export type MaterialUpdatePlan = {
  fields: MaterialUpdateFields;
  /** kind or normalizedKey changed → the (tenantId, kind, normalizedKey) unique must be re-checked. */
  identityChanged: boolean;
};

/**
 * The canonical stock unit an edit should persist. Once a material has SupplyLots, its stock is denominated
 * in the existing unit and can't be restated (on-hand is summed raw across lots, and recorded costs are
 * immutable, D17) — so we PIN it. With no stock, it re-derives from the package unit's dimension exactly
 * like the create flow (gal→mL, lb→g, unit→unit), falling back to the requested/current unit.
 */
export function resolveUpdateStockUnit(opts: {
  hasLots: boolean;
  currentStockUnit: string | null;
  packageUnit: string | null;
  requestedStockUnit?: string | null;
}): StockUnit {
  if (opts.hasLots) return coerceStockUnit(opts.currentStockUnit);
  const dim = opts.packageUnit ? dimensionOf(opts.packageUnit) : null;
  if (dim) return canonicalUnitFor(dim);
  return coerceStockUnit(opts.requestedStockUnit ?? opts.currentStockUnit);
}

/**
 * Plan an edit of an existing material's base data. Sanitizes the input to the persisted field set (reusing
 * `deriveMaterialFields`), pins/derives the stock unit, and flags whether identity (kind/normalizedKey)
 * changed so the caller re-checks the unique. Throws CONFLICT if the package unit's dimension would change
 * while stock is on hand (a cross-dimension conversion is undefined — measure.ts is same-dimension only).
 */
export function planMaterialUpdate(
  existing: ExistingMaterialForUpdate,
  input: UpdateMaterialInput,
  hasLots: boolean,
): MaterialUpdatePlan {
  const f = deriveMaterialFields(input); // throws on empty identity
  if (hasLots && f.packageUnit) {
    const newDim = dimensionOf(f.packageUnit);
    const curDim = dimensionOf(existing.stockUnit);
    if (newDim && curDim && newDim !== curDim) {
      throw new ActionError(
        "Can't change this item's unit of measure to a different kind (mass ↔ volume ↔ count) while it has stock on hand. Deplete or deactivate it first.",
        "CONFLICT",
      );
    }
  }
  const stockUnit = resolveUpdateStockUnit({
    hasLots,
    currentStockUnit: existing.stockUnit,
    packageUnit: f.packageUnit,
    requestedStockUnit: input.stockUnit,
  });
  const identityChanged = existing.kind !== f.kind || existing.normalizedKey !== f.normalizedKey;
  return {
    fields: {
      name: f.name,
      normalizedKey: f.normalizedKey,
      kind: f.kind,
      category: f.category,
      genericName: f.genericName,
      brand: f.brand,
      brandName: f.brandName,
      preferGeneric: f.preferGeneric,
      vendor: f.vendor,
      vendorUrl: f.vendorUrl,
      packageAmount: f.packageAmount,
      packageUnit: f.packageUnit,
      stockUnit,
    },
    identityChanged,
  };
}
