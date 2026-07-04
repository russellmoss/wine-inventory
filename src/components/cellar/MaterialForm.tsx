"use client";

import React from "react";
import { Input, Checkbox } from "@/components/ui";
import {
  MATERIAL_CATEGORIES, CATEGORY_LABELS, BUILTIN_FAMILIES, familyLabel, categoryOf,
  type MaterialCategory,
} from "@/lib/cellar/material-taxonomy";
import { MEASURE_UNITS, dimensionOf, canonicalUnitFor } from "@/lib/units/measure";
import { costPerPackageUnit, deriveOpeningLot } from "@/lib/cost/intake-cost";
import { closestMatch } from "@/lib/inventory/similarity";
import { useCurrency } from "@/components/money/CurrencyProvider";
import type { CellarMaterialDTO } from "@/lib/cellar/materials-shared";

// Phase 037: the base-data field block shared by the "Add expendable" and "Edit" modals — one definition so
// the two can't drift. Controlled: the parent owns a MaterialFormValue and gets patches via onChange. Cost
// (totalCost) is create-only — an edit never re-costs existing stock (D17); prices are corrected via Receive.

const controlStyle: React.CSSProperties = {
  height: 44,
  padding: "0 10px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  color: "var(--text-primary)",
};
const fieldLabelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" };
const col = { display: "flex", flexDirection: "column", gap: 6 } as const;

export type MaterialFormValue = {
  genericName: string;
  brand: string;
  brandName: string;
  preferGeneric: boolean;
  vendor: string;
  vendorUrl: string;
  category: MaterialCategory;
  family: string; // free-text display label; coerced to a kind server-side
  packageAmount: string;
  packageUnit: string;
  totalCost: string; // create-only
};

export const emptyMaterialForm: MaterialFormValue = {
  genericName: "", brand: "", brandName: "", preferGeneric: true, vendor: "", vendorUrl: "",
  category: "ADDITIVE", family: "", packageAmount: "", packageUnit: "g", totalCost: "",
};

/** The canonical stock unit implied by a package unit's dimension (gal→mL, lb→g, unit→unit; default g). */
export function stockUnitFor(packageUnit: string): string {
  const dim = dimensionOf(packageUnit);
  return dim ? canonicalUnitFor(dim) : "g";
}

/** Seed the form from an existing material (edit mode). Family shows its label so it round-trips via coerceFamily. */
export function materialToForm(m: CellarMaterialDTO): MaterialFormValue {
  return {
    genericName: m.genericName ?? "",
    brand: m.brand ?? "",
    brandName: m.brandName ?? "",
    preferGeneric: !!m.preferGeneric,
    vendor: m.vendor ?? "",
    vendorUrl: m.vendorUrl ?? "",
    category: (m.category as MaterialCategory) ?? categoryOf(m.kind),
    family: familyLabel(m.kind),
    packageAmount: m.packageAmount != null ? String(m.packageAmount) : "",
    packageUnit: m.packageUnit ?? m.stockUnit ?? "g",
    totalCost: "",
  };
}

/** Shared action payload (identity/taxonomy/supplier/purchase/stock unit). Create adds `totalCost` on top. */
export function materialFormToInput(v: MaterialFormValue) {
  const amt = v.packageAmount.trim() !== "" ? Number(v.packageAmount) : null;
  return {
    genericName: v.genericName.trim() || undefined,
    brand: v.brand.trim() || undefined,
    brandName: v.brandName.trim() || undefined,
    preferGeneric: v.preferGeneric,
    vendor: v.vendor.trim() || undefined,
    vendorUrl: v.vendorUrl.trim() || undefined,
    category: v.category,
    kind: v.family.trim() || undefined, // family; server coerces built-in vs custom
    stockUnit: stockUnitFor(v.packageUnit),
    packageAmount: amt ?? undefined,
    packageUnit: amt != null ? v.packageUnit : undefined,
  };
}

/** Is the identity (product name) present? Add requires it to enable submit. */
export function materialFormHasIdentity(v: MaterialFormValue): boolean {
  return v.genericName.trim() !== "" || v.brandName.trim() !== "";
}

export function MaterialForm({
  value,
  onChange,
  familiesByCategory,
  mode,
  hasStock = false,
}: {
  value: MaterialFormValue;
  onChange: (patch: Partial<MaterialFormValue>) => void;
  familiesByCategory: Map<MaterialCategory, Set<string>>;
  mode: "create" | "edit";
  /** Edit mode: whether the material has stock on hand (drives the unit-change caution). */
  hasStock?: boolean;
}) {
  const stockUnit = stockUnitFor(value.packageUnit);
  const familyListId = React.useId(); // unique per instance so Add + Edit datalists never collide
  const { symbol } = useCurrency();

  // Family suggestions: the built-ins for the chosen category + any existing families in it.
  const familyOptions = React.useMemo(() => {
    const opts = new Set<string>(BUILTIN_FAMILIES.filter((f) => f.category === value.category).map((f) => f.label));
    for (const fam of familiesByCategory.get(value.category) ?? []) opts.add(fam);
    return [...opts].sort((a, b) => a.localeCompare(b));
  }, [value.category, familiesByCategory]);

  const amt = value.packageAmount.trim() !== "" ? Number(value.packageAmount) : null;
  const cost = value.totalCost.trim() !== "" ? Number(value.totalCost) : null;
  const perPackageUnit = costPerPackageUnit(cost, amt);
  const opening = deriveOpeningLot({ packageAmount: amt, packageUnit: value.packageUnit, totalCost: cost, stockUnit });

  // A near-duplicate family hint so "Fining"/"Finings" don't fragment.
  const famDupe = value.family.trim() && !familyOptions.some((f) => f.toLowerCase() === value.family.trim().toLowerCase())
    ? closestMatch(value.family, familyOptions)
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Product */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Input label="Generic name" value={value.genericName} onChange={(e) => onChange({ genericName: e.target.value })} placeholder="e.g. Bentonite" style={{ flex: "1 1 200px" }} />
        <Input label="Brand (optional)" value={value.brand} onChange={(e) => onChange({ brand: e.target.value })} placeholder="e.g. Lallemand" style={{ flex: "1 1 160px" }} />
        <Input label="Brand / product name (optional)" value={value.brandName} onChange={(e) => onChange({ brandName: e.target.value })} placeholder="e.g. EC-1118" style={{ flex: "1 1 200px" }} />
      </div>
      <Checkbox checked={value.preferGeneric} onChange={(c) => onChange({ preferGeneric: c })} label="Show the generic name in lists (off = show the brand name)" />

      {/* Taxonomy */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label style={{ ...col, flex: "1 1 180px" }}>
          <span style={fieldLabelStyle}>Category</span>
          <select value={value.category} onChange={(e) => onChange({ category: e.target.value as MaterialCategory })} style={controlStyle}>
            {MATERIAL_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </label>
        <label style={{ ...col, flex: "1 1 200px" }}>
          <span style={fieldLabelStyle}>Family (pick or type to add)</span>
          <input value={value.family} onChange={(e) => onChange({ family: e.target.value })} list={familyListId} placeholder="e.g. Yeast, Fining, Sur Lie" style={controlStyle} />
          <datalist id={familyListId}>
            {familyOptions.map((f) => <option key={f} value={f} />)}
          </datalist>
        </label>
      </div>
      {famDupe ? (
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: 0 }}>
          Did you mean{" "}
          <button type="button" onClick={() => onChange({ family: famDupe.match })} style={{ border: "none", background: "transparent", color: "var(--wine-primary)", cursor: "pointer", padding: 0, font: "inherit", textDecoration: "underline" }}>{famDupe.match}</button>
          ? Reusing a family keeps the filters tidy.
        </p>
      ) : null}

      {/* Purchase */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <Input label="Package size" value={value.packageAmount} onChange={(e) => onChange({ packageAmount: e.target.value })} inputMode="decimal" placeholder="e.g. 100" style={{ flex: "0 1 120px" }} />
        <label style={{ ...col, flex: "0 1 120px" }}>
          <span style={fieldLabelStyle}>Unit</span>
          <select value={value.packageUnit} onChange={(e) => onChange({ packageUnit: e.target.value })} style={controlStyle}>
            {MEASURE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        {mode === "create" ? (
          <Input label="Total cost paid (optional)" value={value.totalCost} onChange={(e) => onChange({ totalCost: e.target.value })} inputMode="decimal" placeholder="e.g. 500" iconLeft={symbol} style={{ flex: "1 1 160px" }} />
        ) : null}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Input label="Vendor (optional)" value={value.vendor} onChange={(e) => onChange({ vendor: e.target.value })} placeholder="e.g. Scott Labs" style={{ flex: "1 1 180px" }} />
        <Input label="Vendor URL (optional)" value={value.vendorUrl} onChange={(e) => onChange({ vendorUrl: e.target.value })} placeholder="https://…" style={{ flex: "1 1 220px" }} />
      </div>

      {mode === "create" ? (
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: 0 }}>
          Tracked in <strong>{stockUnit}</strong>.{" "}
          {perPackageUnit != null ? `≈ ${symbol}${perPackageUnit}/${value.packageUnit}. ` : ""}
          {opening.qtyInStockUnit != null && opening.unitCost != null
            ? `Opening stock ${opening.qtyInStockUnit} ${stockUnit} at ~${symbol}${opening.unitCost}/${stockUnit}.`
            : `Leave cost blank to record unknown-cost stock (never ${symbol}0).`}
        </p>
      ) : (
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: 0 }}>
          Tracked in <strong>{stockUnit}</strong>.{" "}
          {hasStock
            ? "This item has stock on hand — you can't switch its unit to a different kind (mass ↔ volume ↔ count). To correct a recorded price, use Receive to add a corrected lot (recorded costs are immutable)."
            : "Editing here changes the item's base record only; it doesn't re-cost stock you've already received."}
        </p>
      )}
    </div>
  );
}
