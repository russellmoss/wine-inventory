"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, Eyebrow, Badge, Input, Button, Checkbox, Modal, Collapsible } from "@/components/ui";
import { type CellarMaterialDTO, materialDisplayName } from "@/lib/cellar/materials-shared";
import {
  MATERIAL_CATEGORIES, CATEGORY_LABELS, categoryOf, familyLabel,
  type MaterialCategory,
} from "@/lib/cellar/material-taxonomy";
import { rankMaterials } from "@/lib/inventory/material-search";
import {
  MaterialForm, emptyMaterialForm, materialFormToInput, materialFormHasIdentity, materialToForm,
  type MaterialFormValue,
} from "@/components/cellar/MaterialForm";
import { createStockMaterialAction, updateMaterialAction } from "@/lib/cellar/actions";
import { receiveSupplyAction, setMaterialActiveAction } from "@/lib/cost/actions";

// Phase 8/12 → 036 → 037: manage the supply catalog. Categories are collapsible + searchable; clicking a
// card opens a detail modal where you View the base setup data and then Edit / Receive / Deactivate it. Add
// via the "Add expendable" MODAL (full purchase record + derived cost-per-measure). All spacing/color via tokens.

const num = { fontVariantNumeric: "tabular-nums" } as const;

const chipStyle = (active: boolean): React.CSSProperties => ({
  fontSize: 13, padding: "5px 12px", borderRadius: 999, cursor: "pointer",
  border: "1px solid var(--border-strong)",
  background: active ? "var(--wine-primary)" : "transparent",
  color: active ? "var(--surface-raised)" : "var(--text-secondary)",
});

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
  const [addOpen, setAddOpen] = React.useState(false);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [receiveId, setReceiveId] = React.useState<string | null>(null);

  // Toolbar: fuzzy search + category filter + inactive toggle + which categories are unfurled.
  const [query, setQuery] = React.useState("");
  const [catFilter, setCatFilter] = React.useState<MaterialCategory | "ALL">("ALL");
  const [showInactive, setShowInactive] = React.useState(true);
  const [openCats, setOpenCats] = React.useState<Set<MaterialCategory>>(() => new Set());

  // Resolve the open modals from the LIVE list each render, so a Deactivate/Edit reflects immediately.
  const byId = React.useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const detail = detailId ? byId.get(detailId) ?? null : null;
  const editMat = editId ? byId.get(editId) ?? null : null;
  const receiveMat = receiveId ? byId.get(receiveId) ?? null : null;

  // Existing family labels per category — seed the form's family picker alongside the built-ins.
  const familiesByCategory = React.useMemo(() => {
    const m = new Map<MaterialCategory, Set<string>>();
    for (const mat of materials) {
      const cat = catOf(mat);
      if (!m.has(cat)) m.set(cat, new Set());
      m.get(cat)!.add(familyLabel(mat.kind));
    }
    return m;
  }, [materials]);

  // Apply inactive filter → category filter → fuzzy search (empty query keeps the server's name-asc order).
  const visible = React.useMemo(() => {
    let list = materials;
    if (!showInactive) list = list.filter((m) => m.isActive !== false);
    if (catFilter !== "ALL") list = list.filter((m) => catOf(m) === catFilter);
    return rankMaterials(query, list, (m) => materialDisplayName(m));
  }, [materials, showInactive, catFilter, query]);

  // Group the visible set by stored Category → family.
  const byCategory = React.useMemo(() => {
    const m = new Map<MaterialCategory, Map<string, CellarMaterialDTO[]>>();
    for (const mat of visible) {
      const cat = catOf(mat);
      const fam = familyLabel(mat.kind);
      if (!m.has(cat)) m.set(cat, new Map());
      const famMap = m.get(cat)!;
      if (!famMap.has(fam)) famMap.set(fam, []);
      famMap.get(fam)!.push(mat);
    }
    return m;
  }, [visible]);

  const categories = MATERIAL_CATEGORIES.filter((c) => byCategory.has(c));
  const searching = query.trim() !== "";
  const countFor = (c: MaterialCategory) => [...byCategory.get(c)!.values()].reduce((n, arr) => n + arr.length, 0);

  const setCatOpen = (c: MaterialCategory, open: boolean) =>
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (open) next.add(c);
      else next.delete(c);
      return next;
    });

  return (
    <div>
      <Eyebrow rule>Setup</Eyebrow>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>Expendables</h1>
          <p style={{ color: "var(--text-secondary)", marginBottom: 20, maxWidth: "60ch" }}>
            Winemaking supplies — yeast, nutrients, SO₂, fining agents, acids, tannins, enzymes, cleaning &amp;
            sanitizing, packaging. Click an item to view its details, then edit its setup, receive a costed lot,
            or deactivate it. Items in use can&rsquo;t be deleted, only deactivated.
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
        <>
          {/* Toolbar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search expendables by name…"
              aria-label="Search expendables"
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button type="button" aria-pressed={catFilter === "ALL"} style={chipStyle(catFilter === "ALL")} onClick={() => setCatFilter("ALL")}>All</button>
              {MATERIAL_CATEGORIES.map((c) => (
                <button key={c} type="button" aria-pressed={catFilter === c} style={chipStyle(catFilter === c)} onClick={() => setCatFilter(c)}>
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
              <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Checkbox checked={showInactive} onChange={(v) => setShowInactive(v)} label="Show inactive" />
                <Button variant="ghost" size="sm" onClick={() => setOpenCats(new Set(MATERIAL_CATEGORIES))} disabled={searching}>Expand all</Button>
                <Button variant="ghost" size="sm" onClick={() => setOpenCats(new Set())} disabled={searching}>Collapse all</Button>
              </span>
            </div>
          </div>

          {categories.length === 0 ? (
            <Card padding="var(--space-5)" style={{ textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: "6px 0" }}>No expendables match your search.</p>
            </Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {categories.map((c) => {
                const famMap = byCategory.get(c)!;
                const fams = [...famMap.keys()].sort((a, b) => a.localeCompare(b));
                const open = searching || openCats.has(c);
                return (
                  <Card key={c} padding="var(--space-5)">
                    <Collapsible
                      level="section"
                      open={open}
                      onOpenChange={searching ? undefined : (next) => setCatOpen(c, next)}
                      title={CATEGORY_LABELS[c]}
                      right={<span style={{ ...num, fontSize: 13, color: "var(--text-muted)" }}>{countFor(c)}</span>}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                        {fams.map((fam) => (
                          <Collapsible key={fam} level="sub" defaultOpen title={fam}>
                            <div style={{ display: "flex", flexDirection: "column" }}>
                              {famMap.get(fam)!.map((mat) => (
                                <SupplyRow key={mat.id} mat={mat} onOpen={() => setDetailId(mat.id)} />
                              ))}
                            </div>
                          </Collapsible>
                        ))}
                      </div>
                    </Collapsible>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <AddExpendableModal
        key={addOpen ? "add-open" : "add-closed"}
        open={addOpen}
        pending={pending}
        run={run}
        familiesByCategory={familiesByCategory}
        onClose={() => setAddOpen(false)}
      />

      <MaterialDetailModal
        material={detail}
        pending={pending}
        run={run}
        onEdit={() => { if (detail) { setEditId(detail.id); setDetailId(null); } }}
        onReceive={() => { if (detail) { setReceiveId(detail.id); setDetailId(null); } }}
        onClose={() => setDetailId(null)}
      />

      <EditMaterialModal
        key={editMat?.id ?? "edit-none"}
        material={editMat}
        pending={pending}
        run={run}
        familiesByCategory={familiesByCategory}
        onClose={() => setEditId(null)}
      />

      <ReceiveModal
        key={receiveMat?.id ?? "receive-none"}
        material={receiveMat}
        pending={pending}
        run={run}
        onClose={() => setReceiveId(null)}
      />
    </div>
  );
}

function SupplyRow({ mat, onOpen }: { mat: CellarMaterialDTO; onOpen: () => void }) {
  const tracked = !!mat.isStockTracked;
  const out = tracked && (mat.onHand ?? 0) <= 0;
  const display = materialDisplayName(mat);
  const secondary = [
    mat.preferGeneric ? (mat.brandName ?? null) : (mat.genericName ?? null),
    mat.vendor ?? null,
  ].filter((s) => s && s.trim() && s.trim() !== display).join(" · ");
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View ${display}`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 4px",
        borderTop: "1px solid var(--border-strong)",
        borderLeft: "none", borderRight: "none", borderBottom: "none",
        background: "transparent",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        opacity: mat.isActive === false ? 0.55 : 1,
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", flexDirection: "column", minWidth: 0 }}>
          <span style={{ fontSize: 15, color: "var(--text-primary)" }}>{display}</span>
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
      <span aria-hidden="true" style={{ color: "var(--text-muted)", fontSize: 18, flex: "none" }}>›</span>
    </button>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "7px 0", borderTop: "1px solid var(--border-strong)" }}>
      <span style={{ flex: "0 0 140px", fontSize: 13, color: "var(--text-muted)" }}>{label}</span>
      <span style={{ flex: 1, fontSize: 14, color: "var(--text-primary)", minWidth: 0, wordBreak: "break-word" }}>{children}</span>
    </div>
  );
}

function MaterialDetailModal({
  material,
  pending,
  run,
  onEdit,
  onReceive,
  onClose,
}: {
  material: CellarMaterialDTO | null;
  pending: boolean;
  run: (fn: () => Promise<unknown>, after?: () => void) => void;
  onEdit: () => void;
  onReceive: () => void;
  onClose: () => void;
}) {
  if (!material) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;

  const m = material;
  const display = materialDisplayName(m);
  const unit = m.stockUnit ?? "g";
  const tracked = !!m.isStockTracked;
  const inactive = m.isActive === false;

  return (
    <Modal open onClose={onClose} title={display} subtitle="Item details" maxWidth="min(560px, 96vw)">
      <div style={{ display: "flex", flexDirection: "column" }}>
        <DetailRow label="Category">{CATEGORY_LABELS[catOf(m)]}</DetailRow>
        <DetailRow label="Family">{familyLabel(m.kind)}</DetailRow>
        {m.genericName ? <DetailRow label="Generic name">{m.genericName}</DetailRow> : null}
        {m.brand ? <DetailRow label="Brand">{m.brand}</DetailRow> : null}
        {m.brandName ? <DetailRow label="Product name">{m.brandName}</DetailRow> : null}
        <DetailRow label="Shown in lists as">{m.preferGeneric ? "Generic name" : "Brand / product name"}</DetailRow>
        {m.vendor ? <DetailRow label="Vendor">{m.vendor}</DetailRow> : null}
        {m.vendorUrl ? (
          <DetailRow label="Vendor URL">
            <a href={m.vendorUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--wine-primary)", textDecoration: "underline" }}>
              {m.vendorUrl}
            </a>
          </DetailRow>
        ) : null}
        {m.packageAmount != null ? (
          <DetailRow label="Package size">{m.packageAmount} {m.packageUnit ?? ""}</DetailRow>
        ) : null}
        <DetailRow label="Tracked in">{tracked ? unit : "Not stock-tracked"}</DetailRow>
        {tracked ? (
          <DetailRow label="On hand"><span style={num}>{m.onHand ?? 0}</span> {unit}</DetailRow>
        ) : null}
        <DetailRow label="Cost">
          {m.avgUnitCost != null ? <span style={num}>≈ ${m.avgUnitCost} / {unit}</span> : "Unknown (no priced stock)"}
        </DetailRow>
        <DetailRow label="Status">
          {inactive ? <Badge tone="neutral" variant="soft">inactive</Badge> : <Badge tone="green" variant="soft">active</Badge>}
        </DetailRow>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 16 }}>
          <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => setMaterialActiveAction(m.id, inactive))}>
            {inactive ? "Reactivate" : "Deactivate"}
          </Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={onReceive}>Receive</Button>
          <Button type="button" variant="primary" disabled={pending} onClick={onEdit}>Edit</Button>
        </div>
      </div>
    </Modal>
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
  const [form, setForm] = React.useState<MaterialFormValue>(emptyMaterialForm);
  const patch = (p: Partial<MaterialFormValue>) => setForm((f) => ({ ...f, ...p }));
  const canSubmit = materialFormHasIdentity(form) && !pending;

  function submit() {
    if (!canSubmit) return;
    const cost = form.totalCost.trim() !== "" ? Number(form.totalCost) : undefined;
    run(() => createStockMaterialAction({ ...materialFormToInput(form), totalCost: cost }), onClose);
  }

  return (
    <Modal open={open} onClose={onClose} title="Add expendable" subtitle="Product, purchase, and how it's tracked" maxWidth="min(620px, 96vw)">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <MaterialForm value={form} onChange={patch} familiesByCategory={familiesByCategory} mode="create" />
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

function EditMaterialModal({
  material,
  pending,
  run,
  familiesByCategory,
  onClose,
}: {
  material: CellarMaterialDTO | null;
  pending: boolean;
  run: (fn: () => Promise<unknown>, after?: () => void) => void;
  familiesByCategory: Map<MaterialCategory, Set<string>>;
  onClose: () => void;
}) {
  const [form, setForm] = React.useState<MaterialFormValue>(() => (material ? materialToForm(material) : emptyMaterialForm));
  const patch = (p: Partial<MaterialFormValue>) => setForm((f) => ({ ...f, ...p }));
  const hasStock = (material?.onHand ?? 0) > 0;
  const canSubmit = !!material && materialFormHasIdentity(form) && !pending;

  function submit() {
    if (!material || !canSubmit) return;
    run(() => updateMaterialAction(material.id, materialFormToInput(form)), onClose);
  }

  return (
    <Modal open={!!material} onClose={onClose} title={material ? `Edit · ${materialDisplayName(material)}` : "Edit"} subtitle="Correct the item's setup details" maxWidth="min(620px, 96vw)">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <MaterialForm value={form} onChange={patch} familiesByCategory={familiesByCategory} mode="edit" hasStock={hasStock} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="button" variant="primary" onClick={submit} disabled={!canSubmit}>
            {pending ? "Saving…" : "Save changes"}
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
