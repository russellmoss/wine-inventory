"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, Eyebrow, Badge, Input, Button, Checkbox, Modal } from "@/components/ui";
import { type CellarMaterialDTO, materialDisplayName } from "@/lib/cellar/materials-shared";
import {
  MATERIAL_CATEGORIES, CATEGORY_LABELS, categoryOf, familyLabel, BUILTIN_FAMILIES,
  type MaterialCategory,
} from "@/lib/cellar/material-taxonomy";
import { MEASURE_UNITS, dimensionOf, canonicalUnitFor } from "@/lib/units/measure";
import { costPerPackageUnit, deriveOpeningLot } from "@/lib/cost/intake-cost";
import { closestMatch } from "@/lib/inventory/similarity";
import { createStockMaterialAction } from "@/lib/cellar/actions";
import { receiveSupplyAction, setMaterialActiveAction } from "@/lib/cost/actions";
import { useCurrency } from "@/components/money/CurrencyProvider";

// Phase 8/12 → 036: manage the supply catalog. Add via the "Add expendable" MODAL (full purchase record +
// derived cost-per-measure); Receive costed lots via the (unchanged) Receive modal. Grouped by the stored
// main Category → family. All spacing/color via design tokens.

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
const num = { fontVariantNumeric: "tabular-nums" } as const;

function useRunner() {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const run = React.useCallback(
    (fn: () => Promise<unknown>, after?: () => void) => {
      setError(null);
      startTransition(async () => {
        try {
          await fn();
          router.refresh();
          after?.();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Something went wrong.");
        }
      });
    },
    [router],
  );
  return { error, pending, run };
}

/** The stored category for a material (fallback derives from kind for legacy rows). */
const catOf = (m: CellarMaterialDTO): MaterialCategory => (m.category as MaterialCategory) ?? categoryOf(m.kind);

export function ExpendablesClient({ materials }: { materials: CellarMaterialDTO[] }) {
  const { error, pending, run } = useRunner();
  const [receiveFor, setReceiveFor] = React.useState<CellarMaterialDTO | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);

  // Group by stored main Category → family (familyLabel(kind)).
  const byCategory = React.useMemo(() => {
    const m = new Map<MaterialCategory, Map<string, CellarMaterialDTO[]>>();
    for (const mat of materials) {
      const cat = catOf(mat);
      const fam = familyLabel(mat.kind);
      if (!m.has(cat)) m.set(cat, new Map());
      const famMap = m.get(cat)!;
      if (!famMap.has(fam)) famMap.set(fam, []);
      famMap.get(fam)!.push(mat);
    }
    return m;
  }, [materials]);

  const categories = MATERIAL_CATEGORIES.filter((c) => byCategory.has(c));

  // Existing family labels per category — seed the modal's family picker alongside the built-ins.
  const familiesByCategory = React.useMemo(() => {
    const m = new Map<MaterialCategory, Set<string>>();
    for (const mat of materials) {
      const cat = catOf(mat);
      if (!m.has(cat)) m.set(cat, new Set());
      m.get(cat)!.add(familyLabel(mat.kind));
    }
    return m;
  }, [materials]);

  return (
    <div>
      <Eyebrow rule>Setup</Eyebrow>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>Expendables</h1>
          <p style={{ color: "var(--text-secondary)", marginBottom: 20, maxWidth: "60ch" }}>
            Winemaking supplies — yeast, nutrients, SO₂, fining agents, acids, tannins, enzymes, cleaning &amp;
            sanitizing, packaging. Track stock on hand and receive costed lots so additions draw down and
            cost-per-bottle stays accurate. Items in use can&rsquo;t be deleted, only deactivated.
          </p>
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)} style={{ minHeight: 44, marginTop: 10 }}>
          + Add expendable
        </Button>
      </div>

      {error ? <p style={{ color: "var(--danger)", fontSize: 13, margin: "10px 0" }}>{error}</p> : null}

      {materials.length === 0 ? (
        <Card padding="var(--space-5)" style={{ marginTop: 8, textAlign: "center" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: 15, margin: "8px 0 14px" }}>
            No expendables yet. Add your first supply to start tracking stock and cost.
          </p>
          <Button variant="primary" onClick={() => setAddOpen(true)}>+ Add expendable</Button>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 8 }}>
          {categories.map((c) => {
            const famMap = byCategory.get(c)!;
            const fams = [...famMap.keys()].sort((a, b) => a.localeCompare(b));
            return (
              <Card key={c} padding="var(--space-5)">
                <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 20, marginBottom: 10 }}>
                  {CATEGORY_LABELS[c]}
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {fams.map((fam) => (
                    <div key={fam}>
                      <h3 style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)", margin: "6px 0 2px" }}>{fam}</h3>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {famMap.get(fam)!.map((mat) => (
                          <SupplyRow key={mat.id} mat={mat} pending={pending} run={run} onReceive={() => setReceiveFor(mat)} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AddExpendableModal
        key={addOpen ? "add-open" : "add-closed"}
        open={addOpen}
        pending={pending}
        run={run}
        familiesByCategory={familiesByCategory}
        onClose={() => setAddOpen(false)}
      />

      <ReceiveModal
        key={receiveFor?.id ?? "none"}
        material={receiveFor}
        pending={pending}
        run={run}
        onClose={() => setReceiveFor(null)}
      />
    </div>
  );
}

function SupplyRow({
  mat,
  pending,
  run,
  onReceive,
}: {
  mat: CellarMaterialDTO;
  pending: boolean;
  run: (fn: () => Promise<unknown>, after?: () => void) => void;
  onReceive: () => void;
}) {
  const tracked = !!mat.isStockTracked;
  const out = tracked && (mat.onHand ?? 0) <= 0;
  const display = materialDisplayName(mat);
  // Secondary line: the "other" name (generic when showing brand, or brand when showing generic) + vendor.
  const secondary = [
    mat.preferGeneric ? (mat.brandName ?? null) : (mat.genericName ?? null),
    mat.vendor ?? null,
  ].filter((s) => s && s.trim() && s.trim() !== display).join(" · ");
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 0",
        borderTop: "1px solid var(--border-strong)",
        opacity: mat.isActive === false ? 0.55 : 1,
        flexWrap: "wrap",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", flexDirection: "column", minWidth: 0 }}>
          <span style={{ fontSize: 15 }}>{display}</span>
          {secondary ? <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{secondary}</span> : null}
        </span>
        {tracked ? (
          <span style={{ ...num, fontSize: 13.5, color: "var(--text-secondary)" }}>
            {mat.onHand ?? 0} {mat.stockUnit ?? ""} on hand
          </span>
        ) : (
          <Badge tone="neutral" variant="soft">not stock-tracked</Badge>
        )}
        {out ? <Badge tone="red">out of stock</Badge> : null}
        {mat.isActive === false ? <Badge tone="neutral" variant="soft">inactive</Badge> : null}
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Button variant="secondary" size="sm" disabled={pending} onClick={onReceive} style={{ minHeight: 40 }}>
          Receive
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => run(() => setMaterialActiveAction(mat.id, mat.isActive === false))}
          style={{ minHeight: 40 }}
        >
          {mat.isActive === false ? "Reactivate" : "Deactivate"}
        </Button>
      </span>
    </div>
  );
}

function AddExpendableModal({
  open,
  pending,
  run,
  familiesByCategory,
  onClose,
}: {
  open: boolean;
  pending: boolean;
  run: (fn: () => Promise<unknown>, after?: () => void) => void;
  familiesByCategory: Map<MaterialCategory, Set<string>>;
  onClose: () => void;
}) {
  const [genericName, setGenericName] = React.useState("");
  const [brand, setBrand] = React.useState("");
  const [brandName, setBrandName] = React.useState("");
  const [preferGeneric, setPreferGeneric] = React.useState(true);
  const [vendor, setVendor] = React.useState("");
  const [vendorUrl, setVendorUrl] = React.useState("");
  const [category, setCategory] = React.useState<MaterialCategory>("ADDITIVE");
  const [family, setFamily] = React.useState("");
  const [packageAmount, setPackageAmount] = React.useState("");
  const [packageUnit, setPackageUnit] = React.useState("g");
  const [totalCost, setTotalCost] = React.useState("");
  const { symbol } = useCurrency();

  // The canonical stock unit is derived from the package unit's dimension (gal→mL, lb→g, unit→unit).
  const stockUnit = React.useMemo(() => {
    const dim = dimensionOf(packageUnit);
    return dim ? canonicalUnitFor(dim) : "g";
  }, [packageUnit]);

  // Family suggestions: the built-ins for the chosen category + any existing families in it.
  const familyOptions = React.useMemo(() => {
    const opts = new Set<string>(BUILTIN_FAMILIES.filter((f) => f.category === category).map((f) => f.label));
    for (const fam of familiesByCategory.get(category) ?? []) opts.add(fam);
    return [...opts].sort((a, b) => a.localeCompare(b));
  }, [category, familiesByCategory]);

  // Live cost preview from the purchase.
  const amt = packageAmount.trim() !== "" ? Number(packageAmount) : null;
  const cost = totalCost.trim() !== "" ? Number(totalCost) : null;
  const perPackageUnit = costPerPackageUnit(cost, amt);
  const opening = deriveOpeningLot({ packageAmount: amt, packageUnit, totalCost: cost, stockUnit });

  // A near-duplicate family hint so "Fining"/"Finings" don't fragment.
  const famDupe = family.trim() && !familyOptions.some((f) => f.toLowerCase() === family.trim().toLowerCase())
    ? closestMatch(family, familyOptions)
    : null;

  const canSubmit = (genericName.trim() !== "" || brandName.trim() !== "") && !pending;

  function submit() {
    if (!canSubmit) return;
    run(
      () =>
        createStockMaterialAction({
          genericName: genericName.trim() || undefined,
          brand: brand.trim() || undefined,
          brandName: brandName.trim() || undefined,
          preferGeneric,
          vendor: vendor.trim() || undefined,
          vendorUrl: vendorUrl.trim() || undefined,
          category,
          kind: family.trim() || undefined, // family; server coerces built-in vs custom
          stockUnit,
          packageAmount: amt ?? undefined,
          packageUnit: amt != null ? packageUnit : undefined,
          totalCost: cost ?? undefined,
        }),
      onClose,
    );
  }

  const col = { display: "flex", flexDirection: "column", gap: 6 } as const;

  return (
    <Modal open={open} onClose={onClose} title="Add expendable" subtitle="Product, purchase, and how it's tracked" maxWidth="min(620px, 96vw)">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Product */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Input label="Generic name" value={genericName} onChange={(e) => setGenericName(e.target.value)} placeholder="e.g. Bentonite" style={{ flex: "1 1 200px" }} />
          <Input label="Brand (optional)" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Lallemand" style={{ flex: "1 1 160px" }} />
          <Input label="Brand / product name (optional)" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="e.g. EC-1118" style={{ flex: "1 1 200px" }} />
        </div>
        <Checkbox checked={preferGeneric} onChange={(c) => setPreferGeneric(c)} label="Show the generic name in lists (off = show the brand name)" />

        {/* Taxonomy */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label style={{ ...col, flex: "1 1 180px" }}>
            <span style={fieldLabelStyle}>Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value as MaterialCategory)} style={controlStyle}>
              {MATERIAL_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </label>
          <label style={{ ...col, flex: "1 1 200px" }}>
            <span style={fieldLabelStyle}>Family (pick or type to add)</span>
            <input value={family} onChange={(e) => setFamily(e.target.value)} list="expendable-families" placeholder="e.g. Yeast, Fining, Sur Lie" style={controlStyle} />
            <datalist id="expendable-families">
              {familyOptions.map((f) => <option key={f} value={f} />)}
            </datalist>
          </label>
        </div>
        {famDupe ? (
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: 0 }}>
            Did you mean{" "}
            <button type="button" onClick={() => setFamily(famDupe.match)} style={{ border: "none", background: "transparent", color: "var(--wine-primary)", cursor: "pointer", padding: 0, font: "inherit", textDecoration: "underline" }}>{famDupe.match}</button>
            ? Reusing a family keeps the filters tidy.
          </p>
        ) : null}

        {/* Purchase */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Input label="Package size" value={packageAmount} onChange={(e) => setPackageAmount(e.target.value)} inputMode="decimal" placeholder="e.g. 100" style={{ flex: "0 1 120px" }} />
          <label style={{ ...col, flex: "0 1 120px" }}>
            <span style={fieldLabelStyle}>Unit</span>
            <select value={packageUnit} onChange={(e) => setPackageUnit(e.target.value)} style={controlStyle}>
              {MEASURE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
          <Input label="Total cost paid (optional)" value={totalCost} onChange={(e) => setTotalCost(e.target.value)} inputMode="decimal" placeholder="e.g. 500" iconLeft={symbol} style={{ flex: "1 1 160px" }} />
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Input label="Vendor (optional)" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="e.g. Scott Labs" style={{ flex: "1 1 180px" }} />
          <Input label="Vendor URL (optional)" value={vendorUrl} onChange={(e) => setVendorUrl(e.target.value)} placeholder="https://…" style={{ flex: "1 1 220px" }} />
        </div>

        <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: 0 }}>
          Tracked in <strong>{stockUnit}</strong>.{" "}
          {perPackageUnit != null ? `≈ ${symbol}${perPackageUnit}/${packageUnit}. ` : ""}
          {opening.qtyInStockUnit != null && opening.unitCost != null
            ? `Opening stock ${opening.qtyInStockUnit} ${stockUnit} at ~${symbol}${opening.unitCost}/${stockUnit}.`
            : `Leave cost blank to record unknown-cost stock (never ${symbol}0).`}
        </p>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="button" variant="primary" onClick={submit} disabled={!canSubmit}>
            {pending ? "Adding…" : "Add expendable"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ReceiveModal({
  material,
  pending,
  run,
  onClose,
}: {
  material: CellarMaterialDTO | null;
  pending: boolean;
  run: (fn: () => Promise<unknown>, after?: () => void) => void;
  onClose: () => void;
}) {
  const [qty, setQty] = React.useState("");
  const [unitCost, setUnitCost] = React.useState("");
  const [lotCode, setLotCode] = React.useState("");
  const [note, setNote] = React.useState("");
  const [vendorName, setVendorName] = React.useState("");
  const [terms, setTerms] = React.useState("");
  const { symbol } = useCurrency();
  const unit = material?.stockUnit ?? "g";
  const qtyValid = qty.trim() !== "" && Number(qty) > 0;

  function submit() {
    if (!material || !qtyValid) return;
    run(
      () =>
        receiveSupplyAction({
          materialId: material.id,
          qty: Number(qty),
          unitCost: unitCost.trim() !== "" ? Number(unitCost) : undefined,
          lotCode: lotCode.trim() || undefined,
          note: note.trim() || undefined,
          vendorName: vendorName.trim() || undefined,
          terms: terms.trim() || undefined,
        }),
      onClose,
    );
  }

  return (
    <Modal open={!!material} onClose={onClose} title={material ? `Receive · ${materialDisplayName(material)}` : "Receive"} subtitle="Add a costed stock lot" maxWidth="min(460px, 94vw)">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Input label={`Quantity (${unit})`} value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="qty received" autoFocus style={{ flex: "1 1 140px" }} />
          <Input label={`Cost per ${unit} (optional)`} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} inputMode="decimal" placeholder="unit cost" iconLeft={symbol} style={{ flex: "1 1 140px" }} />
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Input label="Lot / PO code (optional)" value={lotCode} onChange={(e) => setLotCode(e.target.value)} placeholder="supplier lot ref" style={{ flex: "1 1 140px" }} />
          <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="supplier, etc." style={{ flex: "1 1 140px" }} />
        </div>
        {/* Phase 15 — a vendor turns this receipt into a QuickBooks A/P bill (needs a cost + A/P accounts mapped). */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Input label="Vendor (optional)" value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="e.g. Scott Labs" style={{ flex: "1 1 140px" }} />
          <Input label="Terms (optional)" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="e.g. Net 30" style={{ flex: "1 1 140px" }} />
        </div>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: 0 }}>
          Leaving cost blank records the stock as unknown-cost until you receive a priced lot. Add a
          vendor (with a cost) to send this as a bill to QuickBooks Accounts Payable.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="button" variant="primary" onClick={submit} disabled={pending || !qtyValid}>
            {pending ? "Receiving…" : "Receive stock"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
