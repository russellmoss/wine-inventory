"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, Eyebrow, Badge, Input, Button, Modal } from "@/components/ui";
import { type MaterialKind } from "@/lib/cellar/additions-math";
import { STOCK_UNITS, type CellarMaterialDTO } from "@/lib/cellar/materials-shared";
import { MATERIAL_CATEGORIES, CATEGORY_LABELS, categoryOf, kindsForCategory, effectiveSubcategory, type MaterialCategory } from "@/lib/cellar/material-taxonomy";
import { closestMatch } from "@/lib/inventory/similarity";
import { createStockMaterialAction } from "@/lib/cellar/actions";
import { receiveSupplyAction, setMaterialActiveAction } from "@/lib/cost/actions";

// Phase 8 (Unit 12): manage the supply catalog + receive/adjust stock by kind. Emulates ReferenceClient
// (list + add + active toggle) with per-kind sections, on-hand in tabular-nums, an out-of-stock badge,
// a receive-with-cost modal, and a warm empty state. All spacing/color via design tokens.

const KIND_LABELS: Record<MaterialKind, string> = {
  YEAST: "Yeast",
  MLF: "Malolactic culture",
  SO2: "SO₂",
  NUTRIENT: "Nutrient",
  ACID: "Acid",
  SUGAR: "Sugar",
  TANNIN: "Tannin",
  FINING: "Fining",
  BENTONITE: "Bentonite",
  CHITOSAN: "Chitosan",
  ENZYME: "Enzyme",
  CLEANING: "Cleaning agent",
  SANITIZER: "Sanitizer",
  PACKAGING: "Packaging",
  OTHER: "Other",
};

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

export function ExpendablesClient({ materials }: { materials: CellarMaterialDTO[] }) {
  const { error, pending, run } = useRunner();
  const [receiveFor, setReceiveFor] = React.useState<CellarMaterialDTO | null>(null);

  // Phase 034: group by main category → (effective) subcategory. Built-in subcategories come from the
  // material's kind; a custom `subcategory` overrides the label.
  const byCategory = React.useMemo(() => {
    const m = new Map<MaterialCategory, Map<string, CellarMaterialDTO[]>>();
    for (const mat of materials) {
      const cat = categoryOf(mat.kind);
      const sub = effectiveSubcategory(mat);
      if (!m.has(cat)) m.set(cat, new Map());
      const subMap = m.get(cat)!;
      if (!subMap.has(sub)) subMap.set(sub, []);
      subMap.get(sub)!.push(mat);
    }
    return m;
  }, [materials]);

  const categories = MATERIAL_CATEGORIES.filter((c) => byCategory.has(c));

  // Distinct existing subcategory labels — feed the add form's datalist + dupe-suggest.
  const existingSubcategories = React.useMemo(() => {
    const s = new Set<string>();
    for (const mat of materials) s.add(effectiveSubcategory(mat));
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [materials]);

  return (
    <div>
      <Eyebrow rule>Setup</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>Expendables</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24, maxWidth: "60ch" }}>
        Winemaking supplies — yeast, nutrients, SO₂, fining agents, acids, tannins, enzymes. Track stock
        on hand and receive costed lots so additions draw down and cost-per-bottle stays accurate. Items
        in use can&rsquo;t be deleted, only deactivated, so history stays intact.
      </p>

      <AddSupplyForm pending={pending} run={run} existingSubcategories={existingSubcategories} />
      {error ? <p style={{ color: "var(--danger)", fontSize: 13, margin: "10px 0" }}>{error}</p> : null}

      {materials.length === 0 ? (
        <Card padding="var(--space-5)" style={{ marginTop: 20, textAlign: "center" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: 15, margin: "8px 0 14px" }}>
            No expendables yet. Add your first supply above to start tracking stock and cost.
          </p>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 20 }}>
          {categories.map((c) => {
            const subMap = byCategory.get(c)!;
            const subs = [...subMap.keys()].sort((a, b) => a.localeCompare(b));
            return (
              <Card key={c} padding="var(--space-5)">
                <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 20, marginBottom: 10 }}>
                  {CATEGORY_LABELS[c]}
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {subs.map((s) => (
                    <div key={s}>
                      <h3 style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)", margin: "6px 0 2px" }}>{s}</h3>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {subMap.get(s)!.map((mat) => (
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
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span style={{ fontSize: 15 }}>{mat.name}</span>
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

function AddSupplyForm({
  pending,
  run,
  existingSubcategories,
}: {
  pending: boolean;
  run: (fn: () => Promise<unknown>, after?: () => void) => void;
  existingSubcategories: string[];
}) {
  const [name, setName] = React.useState("");
  // Phase 034: pick the main CATEGORY first (it scopes the Kind options + drives cost routing), then an
  // optional custom SUBCATEGORY. Kind stays the load-bearing field (cost/dosing).
  const [category, setCategory] = React.useState<MaterialCategory>("ADDITIVE");
  const kindsInCategory = React.useMemo(() => kindsForCategory(category), [category]);
  const [kind, setKind] = React.useState<MaterialKind>("YEAST");
  const [subcategory, setSubcategory] = React.useState("");
  const [stockUnit, setStockUnit] = React.useState("g");
  const [openingQty, setOpeningQty] = React.useState("");
  const [unitCost, setUnitCost] = React.useState("");

  // Effective kind: keep the chosen one while it's valid for the category, else snap to the category's
  // first kind. Derived at render (no effect/setState → no cascading renders).
  const activeKind = kindsInCategory.includes(kind) ? kind : (kindsInCategory[0] ?? "OTHER");

  // Suggest an existing near-match so "Fining agent" / "Fining agents" don't fragment into two chips.
  const dupe = subcategory.trim() ? closestMatch(subcategory, existingSubcategories) : null;

  function submit() {
    if (!name.trim()) return;
    run(
      () =>
        createStockMaterialAction({
          name: name.trim(),
          kind: activeKind,
          subcategory: subcategory.trim() || undefined,
          stockUnit,
          openingQty: openingQty.trim() !== "" ? Number(openingQty) : undefined,
          unitCost: unitCost.trim() !== "" ? Number(unitCost) : undefined,
        }),
      () => {
        setName("");
        setSubcategory("");
        setOpeningQty("");
        setUnitCost("");
      },
    );
  }

  return (
    <Card padding="var(--space-5)">
      <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 18, marginBottom: 12 }}>Add a supply</h2>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. KMBS, DAP, bentonite" style={{ flex: "2 1 200px" }} />
        <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 150px" }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as MaterialCategory)} style={controlStyle}>
            {MATERIAL_CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 140px" }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Kind</span>
          <select value={activeKind} onChange={(e) => setKind(e.target.value as MaterialKind)} style={controlStyle}>
            {kindsInCategory.map((k) => (
              <option key={k} value={k}>{KIND_LABELS[k]}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 160px" }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Subcategory (opt.)</span>
          <input value={subcategory} onChange={(e) => setSubcategory(e.target.value)} list="expendable-subcategories" placeholder="e.g. Egg white, Corks" style={controlStyle} />
          <datalist id="expendable-subcategories">
            {existingSubcategories.map((s) => <option key={s} value={s} />)}
          </datalist>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "0 1 100px" }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Unit</span>
          <select value={stockUnit} onChange={(e) => setStockUnit(e.target.value)} style={controlStyle}>
            {STOCK_UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </label>
        <Input label="Opening (opt.)" value={openingQty} onChange={(e) => setOpeningQty(e.target.value)} inputMode="decimal" placeholder="qty" style={{ flex: "0 1 110px" }} />
        <Input label={`Cost/${stockUnit} (opt.)`} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} inputMode="decimal" placeholder="cost" style={{ flex: "0 1 120px" }} />
        <Button variant="primary" disabled={pending || !name.trim()} onClick={submit} style={{ minHeight: 44 }}>
          {pending ? "Adding…" : "Add supply"}
        </Button>
      </div>
      {dupe ? (
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "10px 0 0" }}>
          Did you mean{" "}
          <button type="button" onClick={() => setSubcategory(dupe.match)} style={{ border: "none", background: "transparent", color: "var(--wine-primary)", cursor: "pointer", padding: 0, font: "inherit", textDecoration: "underline" }}>
            {dupe.match}
          </button>
          ? Reusing an existing subcategory keeps the filters tidy.
        </p>
      ) : null}
    </Card>
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
    <Modal open={!!material} onClose={onClose} title={material ? `Receive · ${material.name}` : "Receive"} subtitle="Add a costed stock lot" maxWidth="min(460px, 94vw)">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Input label={`Quantity (${unit})`} value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="qty received" autoFocus style={{ flex: "1 1 140px" }} />
          <Input label={`Cost per ${unit} (optional)`} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} inputMode="decimal" placeholder="unit cost" style={{ flex: "1 1 140px" }} />
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
