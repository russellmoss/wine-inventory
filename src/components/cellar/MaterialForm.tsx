"use client";

import React from "react";
import { Input, Checkbox, InfoHint } from "@/components/ui";
import { UNIT_HINT } from "@/lib/units/field-hints";
import {
  MATERIAL_CATEGORIES, CATEGORY_LABELS, BUILTIN_FAMILIES, familyLabel, categoryOf,
  type MaterialCategory,
} from "@/lib/cellar/material-taxonomy";
import { MEASURE_UNITS, dimensionOf, canonicalUnitFor, type ExtraUnits } from "@/lib/units/measure";
import { toExtraUnits } from "@/lib/units/custom-units";
import { CreateUnitModal } from "@/components/units/CreateUnitModal";
import type { CustomUnitRow } from "@/lib/units/custom-unit-core";
import { costPerPackageUnit, deriveOpeningLot } from "@/lib/cost/intake-cost";
import { closestMatch } from "@/lib/inventory/similarity";
import { useCurrency } from "@/components/money/CurrencyProvider";
import type { CellarMaterialDTO } from "@/lib/cellar/materials-shared";
import { VendorPicker } from "@/components/vendors/VendorPicker";
import type { VendorRow } from "@/lib/vendors/vendors-shared";

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
  vendorId: string | null; // Plan 069: the managed vendor (mandatory in the UI). URL autofills from it.
  category: MaterialCategory;
  family: string; // free-text display label; coerced to a kind server-side
  packageAmount: string;
  packageUnit: string;
  totalCost: string; // create-only
};

export const emptyMaterialForm: MaterialFormValue = {
  genericName: "", brand: "", brandName: "", preferGeneric: true, vendorId: null,
  category: "ADDITIVE", family: "", packageAmount: "", packageUnit: "g", totalCost: "",
};

/** The canonical stock unit implied by a package unit's dimension (gal→mL, lb→g, unit→unit; default g).
 *  A custom package unit resolves its dimension via the tenant registry (plan 075). */
export function stockUnitFor(packageUnit: string, extraUnits?: ExtraUnits): string {
  const dim = dimensionOf(packageUnit, extraUnits);
  return dim ? canonicalUnitFor(dim) : "g";
}

/** Seed the form from an existing material (edit mode). Family shows its label so it round-trips via coerceFamily. */
export function materialToForm(m: CellarMaterialDTO): MaterialFormValue {
  return {
    genericName: m.genericName ?? "",
    brand: m.brand ?? "",
    brandName: m.brandName ?? "",
    preferGeneric: !!m.preferGeneric,
    vendorId: m.vendorId ?? null,
    category: (m.category as MaterialCategory) ?? categoryOf(m.kind),
    family: familyLabel(m.kind),
    packageAmount: m.packageAmount != null ? String(m.packageAmount) : "",
    packageUnit: m.packageUnit ?? m.stockUnit ?? "g",
    totalCost: m.openingLotCost != null ? String(m.openingLotCost) : "", // prefill the correctable opening-lot cost
  };
}

/** Shared action payload (identity/taxonomy/vendor/purchase/stock unit). Create adds `totalCost` on top.
 *  Vendor is now the managed vendorId; the core mirrors its name/url into the legacy columns (Plan 069). */
export function materialFormToInput(v: MaterialFormValue) {
  const amt = v.packageAmount.trim() !== "" ? Number(v.packageAmount) : null;
  return {
    genericName: v.genericName.trim() || undefined,
    brand: v.brand.trim() || undefined,
    brandName: v.brandName.trim() || undefined,
    preferGeneric: v.preferGeneric,
    vendorId: v.vendorId ?? undefined,
    category: v.category,
    kind: v.family.trim() || undefined, // family; server coerces built-in vs custom
    stockUnit: stockUnitFor(v.packageUnit),
    packageAmount: amt ?? undefined,
    packageUnit: amt != null ? v.packageUnit : undefined,
  };
}

/** Is the identity (product name) present? */
export function materialFormHasIdentity(v: MaterialFormValue): boolean {
  return v.genericName.trim() !== "" || v.brandName.trim() !== "";
}

/** Ready to submit? Identity present AND a vendor is chosen (Plan 069: vendor is mandatory in the UI). */
export function materialFormReady(v: MaterialFormValue): boolean {
  return materialFormHasIdentity(v) && !!v.vendorId;
}

export function MaterialForm({
  value,
  onChange,
  familiesByCategory,
  mode,
  vendors,
  onVendorCreated,
  hasStock = false,
  allowCostEdit = false,
  customUnits: initialCustomUnits = [],
}: {
  value: MaterialFormValue;
  onChange: (patch: Partial<MaterialFormValue>) => void;
  familiesByCategory: Map<MaterialCategory, Set<string>>;
  mode: "create" | "edit";
  /** Plan 069: the tenant's vendors for the mandatory vendor picker. */
  vendors: VendorRow[];
  /** Called after an inline vendor create so the page can refresh its vendor list. */
  onVendorCreated?: (vendor: { id: string; name: string }) => void;
  /** Edit mode: whether the material has stock on hand (drives the unit-change caution). */
  hasStock?: boolean;
  /** Edit mode: whether the opening-lot cost can be corrected here (single fully-unused lot). Shows the cost field. */
  allowCostEdit?: boolean;
  /** Plan 075: the tenant's user-defined units, selectable alongside the built-ins. */
  customUnits?: CustomUnitRow[];
}) {
  const showCost = mode === "create" || allowCostEdit;
  // Plan 075: custom units are selectable as package units; a newly created one is appended locally.
  const [customUnits, setCustomUnits] = React.useState<CustomUnitRow[]>(initialCustomUnits);
  const [unitModalOpen, setUnitModalOpen] = React.useState(false);
  const extraUnits = React.useMemo(() => toExtraUnits(customUnits), [customUnits]);
  const stockUnit = stockUnitFor(value.packageUnit, extraUnits);
  const familyListId = React.useId(); // unique per instance so Add + Edit datalists never collide
  const { symbol } = useCurrency();
  const selectedVendor = React.useMemo(() => vendors.find((v) => v.id === value.vendorId) ?? null, [vendors, value.vendorId]);

  // Family suggestions: the built-ins for the chosen category + any existing families in it.
  const familyOptions = React.useMemo(() => {
    const opts = new Set<string>(BUILTIN_FAMILIES.filter((f) => f.category === value.category).map((f) => f.label));
    for (const fam of familiesByCategory.get(value.category) ?? []) opts.add(fam);
    return [...opts].sort((a, b) => a.localeCompare(b));
  }, [value.category, familiesByCategory]);

  const amt = value.packageAmount.trim() !== "" ? Number(value.packageAmount) : null;
  const cost = value.totalCost.trim() !== "" ? Number(value.totalCost) : null;
  const perPackageUnit = costPerPackageUnit(cost, amt);
  const opening = deriveOpeningLot({ packageAmount: amt, packageUnit: value.packageUnit, totalCost: cost, stockUnit, extraUnits });

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
          <span style={{ ...fieldLabelStyle, display: "inline-flex", alignItems: "center", gap: 4 }}>Unit <InfoHint label={UNIT_HINT} ariaLabel="What is the unit?" /></span>
          <select
            value={value.packageUnit}
            onChange={(e) => {
              if (e.target.value === "__create__") { setUnitModalOpen(true); return; }
              onChange({ packageUnit: e.target.value });
            }}
            style={controlStyle}
          >
            {MEASURE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            {customUnits.length > 0 ? (
              <optgroup label="Your units">
                {customUnits.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
              </optgroup>
            ) : null}
            <option value="__create__">+ Create unit…</option>
          </select>
        </label>
        {showCost ? (
          <Input label={mode === "create" ? "Total cost paid (optional)" : "Total cost paid"} value={value.totalCost} onChange={(e) => onChange({ totalCost: e.target.value })} inputMode="decimal" placeholder="e.g. 500" iconLeft={symbol} style={{ flex: "1 1 160px" }} />
        ) : null}
      </div>
      {/* Vendor (mandatory) — fuzzy picker with inline create; URL autofills from the selected vendor. */}
      <div style={{ ...col }}>
        <span style={fieldLabelStyle}>Vendor</span>
        <VendorPicker
          vendors={vendors}
          value={value.vendorId}
          onSelect={(v) => onChange({ vendorId: v?.id ?? null })}
          onVendorCreated={onVendorCreated}
        />
        {selectedVendor?.url ? (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            URL:{" "}
            <a href={selectedVendor.url} target="_blank" rel="noreferrer" style={{ color: "var(--wine-primary)" }}>{selectedVendor.url}</a>
          </span>
        ) : value.vendorId ? (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>No URL on file for this vendor.</span>
        ) : (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Pick a vendor, or create a new one. Required.</span>
        )}
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
          {allowCostEdit
            ? "Total cost paid sets the price of your current unused stock. Leave it blank for unknown cost."
            : "This item's stock has been received or used, so its price is locked here — correct a price by receiving a new lot (recorded costs are immutable)."}
          {hasStock ? " You can't switch its unit to a different kind (mass ↔ volume ↔ count) while it has stock." : ""}
        </p>
      )}

      <CreateUnitModal
        open={unitModalOpen}
        onClose={() => setUnitModalOpen(false)}
        onCreated={(unit) => {
          setCustomUnits((prev) => (prev.some((u) => u.id === unit.id) ? prev : [...prev, unit]));
          onChange({ packageUnit: unit.name });
          setUnitModalOpen(false);
        }}
      />
    </div>
  );
}
