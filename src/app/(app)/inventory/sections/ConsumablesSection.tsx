"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, Eyebrow, Badge, Input, Button, Checkbox, Modal, Collapsible, LocalTime, InfoHint } from "@/components/ui";
import { MaterialMovePanel, LocationOnHandList, type MoveMode } from "@/components/inventory/MaterialMovePanel";
import type { LocationOnHand } from "@/lib/cellar/materials";
import { type CellarMaterialDTO, materialDisplayName } from "@/lib/cellar/materials-shared";
import {
  MATERIAL_CATEGORIES, CATEGORY_LABELS, categoryOf, familyLabel,
  type MaterialCategory,
} from "@/lib/cellar/material-taxonomy";
import { rankMaterials } from "@/lib/inventory/material-search";
import {
  MaterialForm, emptyMaterialForm, materialFormToInput, materialFormReady, materialToForm,
  type MaterialFormValue,
} from "@/components/cellar/MaterialForm";
import type { VendorRow } from "@/lib/vendors/vendors-shared";
import type { CustomUnitRow } from "@/lib/units/custom-unit-core";
import { createStockMaterialAction, updateMaterialAction } from "@/lib/cellar/actions";
import { setMaterialActiveAction, listMaterialLotsAction } from "@/lib/cost/actions";
import type { MaterialLotRow } from "@/lib/cellar/materials";
import { summarizeConsumableCost } from "@/lib/cost/cost-display";
import { lotExpiryStatus, expiryLabel, docRoleLabel } from "@/lib/cellar/lot-history";
import { extractAndStageAction, updateIngestedInvoiceAction } from "@/lib/ingest/actions";
import type { IngestDuplicate } from "@/lib/ingest/ingest-invoice-core";
import { useCurrency } from "@/components/money/CurrencyProvider";

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

export function ConsumablesSection({
  materials,
  vendors,
  customUnits = [],
  locations = [],
  onHandByLocation = {},
}: {
  materials: CellarMaterialDTO[];
  vendors: VendorRow[];
  customUnits?: CustomUnitRow[];
  /** Plan 080 U8: active locations for the Receive/Adjust/Transfer pickers. */
  locations?: { id: string; name: string }[];
  /** Plan 080 U8: per-material, per-location on-hand (a plain Record — a Map cannot cross the RSC boundary). */
  onHandByLocation?: Record<string, LocationOnHand[]>;
}) {
  const { error, pending, run } = useRunner();
  const router = useRouter();
  const refreshVendors = React.useCallback(() => router.refresh(), [router]);
  const [addOpen, setAddOpen] = React.useState(false);
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [moveId, setMoveId] = React.useState<string | null>(null); // Plan 080 U8: Receive/Adjust/Transfer
  const [moveMode, setMoveMode] = React.useState<MoveMode>("receive"); // which tab the move panel opens on

  // Plan 080 U15 (#366/#370): "Receive" and "Move stock" both open the ONE location-aware panel, which lets
  // you state the quantity by the pack ("3 rolls of 500") and resolves it server-side. The old grams-only
  // ReceiveModal was removed — it couldn't take a unit or a location and left the reported bug reachable.
  const openMove = React.useCallback((id: string, mode: MoveMode) => {
    setMoveMode(mode);
    setMoveId(id);
    setDetailId(null);
  }, []);

  // Toolbar: fuzzy search + category filter + (when a category is active) a sub-category multi-select +
  // inactive toggle + which categories are unfurled.
  const [query, setQuery] = React.useState("");
  const [catFilter, setCatFilter] = React.useState<MaterialCategory | "ALL">("ALL");
  const [famFilter, setFamFilter] = React.useState<Set<string>>(() => new Set()); // family labels within the active category
  const [showInactive, setShowInactive] = React.useState(true);
  const [openCats, setOpenCats] = React.useState<Set<MaterialCategory>>(() => new Set());

  // Picking a category resets the sub-category selection (a family only makes sense within its category).
  const selectCat = (c: MaterialCategory | "ALL") => { setCatFilter(c); setFamFilter(new Set()); };
  const toggleFam = (fam: string) => setFamFilter((prev) => { const next = new Set(prev); next.has(fam) ? next.delete(fam) : next.add(fam); return next; });

  // Resolve the open modals from the LIVE list each render, so a Deactivate/Edit reflects immediately.
  const byId = React.useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const detail = detailId ? byId.get(detailId) ?? null : null;
  const editMat = editId ? byId.get(editId) ?? null : null;
  const moveMat = moveId ? byId.get(moveId) ?? null : null;

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

  // The sub-categories (families) present in the active category — feeds the sub-category multi-select.
  const familiesInCat = React.useMemo(() => {
    if (catFilter === "ALL") return [];
    const set = new Set<string>();
    for (const m of materials) if (catOf(m) === catFilter) set.add(familyLabel(m.kind));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [materials, catFilter]);

  // Apply inactive → category → sub-category → fuzzy search (name + category + family). Empty query keeps
  // the server's name-asc order.
  const visible = React.useMemo(() => {
    let list = materials;
    if (!showInactive) list = list.filter((m) => m.isActive !== false);
    if (catFilter !== "ALL") list = list.filter((m) => catOf(m) === catFilter);
    if (famFilter.size) list = list.filter((m) => famFilter.has(familyLabel(m.kind)));
    return rankMaterials(query, list, (m) => [materialDisplayName(m), familyLabel(m.kind), CATEGORY_LABELS[catOf(m)]]);
  }, [materials, showInactive, catFilter, famFilter, query]);

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
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>Consumables</h1>
          <p style={{ color: "var(--text-secondary)", marginBottom: 20, maxWidth: "60ch" }}>
            Winemaking supplies — yeast, nutrients, SO₂, fining agents, acids, tannins, enzymes, cleaning &amp;
            sanitizing, packaging. Click an item to view its details, then edit its setup, receive a costed lot,
            or deactivate it. Items in use can&rsquo;t be deleted, only deactivated.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <IngestInvoiceLauncher />
          <Button variant="primary" onClick={() => setAddOpen(true)} style={{ minHeight: 44, marginTop: 10 }}>
            + Add consumable
          </Button>
        </div>
      </div>

      {error ? <p style={{ color: "var(--danger)", fontSize: 13, margin: "10px 0" }}>{error}</p> : null}

      {materials.length === 0 ? (
        <Card padding="var(--space-5)" style={{ marginTop: 8, textAlign: "center" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: 15, margin: "8px 0 14px" }}>
            No consumables yet. Add your first supply to start tracking stock and cost.
          </p>
          <Button variant="primary" onClick={() => setAddOpen(true)}>+ Add consumable</Button>
        </Card>
      ) : (
        <>
          {/* Toolbar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search consumables by name…"
              aria-label="Search consumables"
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button type="button" aria-pressed={catFilter === "ALL"} style={chipStyle(catFilter === "ALL")} onClick={() => selectCat("ALL")}>All</button>
              {MATERIAL_CATEGORIES.map((c) => (
                <button key={c} type="button" aria-pressed={catFilter === c} style={chipStyle(catFilter === c)} onClick={() => selectCat(c)}>
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
              <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <Checkbox checked={showInactive} onChange={(v) => setShowInactive(v)} label="Show inactive" />
                <Button variant="ghost" size="sm" onClick={() => setOpenCats(new Set(MATERIAL_CATEGORIES))} disabled={searching}>Expand all</Button>
                <Button variant="ghost" size="sm" onClick={() => setOpenCats(new Set())} disabled={searching}>Collapse all</Button>
              </span>
            </div>

            {/* Sub-category multi-select — appears once a category is picked; narrows to specific families. */}
            {catFilter !== "ALL" && familiesInCat.length > 1 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{CATEGORY_LABELS[catFilter]} →</span>
                {familiesInCat.map((fam) => (
                  <button key={fam} type="button" aria-pressed={famFilter.has(fam)} style={chipStyle(famFilter.has(fam))} onClick={() => toggleFam(fam)}>
                    {fam}
                  </button>
                ))}
                {famFilter.size > 0 ? (
                  <button type="button" style={{ ...chipStyle(false), border: "none" }} onClick={() => setFamFilter(new Set())}>Clear</button>
                ) : null}
              </div>
            ) : null}
          </div>

          {categories.length === 0 ? (
            <Card padding="var(--space-5)" style={{ textAlign: "center" }}>
              <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: "6px 0" }}>No consumables match your search.</p>
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
        vendors={vendors}
        customUnits={customUnits}
        onVendorCreated={refreshVendors}
        onClose={() => setAddOpen(false)}
      />

      <MaterialDetailModal
        material={detail}
        pending={pending}
        run={run}
        locationOnHand={detail ? onHandByLocation[detail.id] ?? [] : []}
        onEdit={() => { if (detail) { setEditId(detail.id); setDetailId(null); } }}
        onReceive={() => { if (detail) { openMove(detail.id, "receive"); } }}
        onMove={() => { if (detail) { openMove(detail.id, "receive"); } }}
        onClose={() => setDetailId(null)}
      />

      <EditMaterialModal
        key={editMat?.id ?? "edit-none"}
        material={editMat}
        pending={pending}
        run={run}
        familiesByCategory={familiesByCategory}
        vendors={vendors}
        customUnits={customUnits}
        onVendorCreated={refreshVendors}
        onClose={() => setEditId(null)}
      />

      <MaterialMovePanel
        key={moveMat?.id ?? "move-none"}
        material={moveMat}
        initialMode={moveMode}
        locations={locations}
        onHand={moveMat ? onHandByLocation[moveMat.id] ?? [] : []}
        pending={pending}
        run={run}
        customUnits={customUnits}
        vendors={vendors}
        onVendorCreated={refreshVendors}
        onClose={() => setMoveId(null)}
      />
    </div>
  );
}

// Plan 072 Unit 8 — the "+ Ingest invoice" entry: pick a pile of PDFs/images → upload them to the private
// blob route → extract+stage them → land on the per-batch review screen. Degrades gracefully when the
// upload route reports storage isn't configured (503) so the user is pointed to the manual add flow.
function IngestInvoiceLauncher() {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // Plan 076: when staging detects a possible duplicate, hold here and ask before navigating on.
  const [dupPrompt, setDupPrompt] = React.useState<{ batchId: string; items: IngestDuplicate[] } | null>(null);
  const [dupBusy, setDupBusy] = React.useState(false);

  const goToReview = React.useCallback((batchId: string) => {
    router.push(`/setup/expendables/ingest?batch=${encodeURIComponent(batchId)}`);
  }, [router]);

  async function onFiles(fileList: FileList | null) {
    setError(null);
    setStatus(null);
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) return;
    setBusy(true);
    try {
      setStatus(`Uploading ${files.length} document${files.length === 1 ? "" : "s"}…`);
      const form = new FormData();
      for (const f of files) form.append("files", f);
      const res = await fetch("/api/ingest/documents", { method: "POST", body: form });
      if (res.status === 503) {
        setError("Document ingestion isn't available (upload storage isn't configured). Add the item manually with “+ Add consumable”.");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { files?: { blobUrl: string; mimeType: string; fileName: string; fileSha256?: string }[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Upload failed.");
        return;
      }
      const uploaded = data.files ?? [];
      if (uploaded.length === 0) {
        setError("No files were stored.");
        return;
      }
      const batchId = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `batch_${Date.now()}`;
      setStatus(`Reading ${uploaded.length} document${uploaded.length === 1 ? "" : "s"}… this can take a moment.`);
      const staged = await extractAndStageAction({
        batchId,
        files: uploaded.map((u) => ({ blobUrl: u.blobUrl, fileName: u.fileName, mimeType: u.mimeType, fileSha256: u.fileSha256 })),
      });
      // Plan 076: if any staged doc looks like a duplicate, warn before proceeding (the human decides).
      if (staged.duplicates && staged.duplicates.length > 0) {
        setStatus(null);
        setDupPrompt({ batchId, items: staged.duplicates });
        return;
      }
      goToReview(batchId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ingestion failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
      <input ref={inputRef} type="file" accept="application/pdf,image/png,image/jpeg" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy} style={{ minHeight: 44, marginTop: 10 }}>
        {busy ? "Working…" : "+ Ingest invoice"}
      </Button>
      {status ? <span style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 220 }}>{status}</span> : null}
      {error ? <span style={{ fontSize: 12, color: "var(--danger)", maxWidth: 240 }}>{error}</span> : null}

      <Modal
        open={dupPrompt != null}
        onClose={() => { if (!dupBusy) setDupPrompt(null); }}
        title="This looks like a duplicate invoice"
        subtitle="Do you want to continue?"
        maxWidth={520}
      >
        {dupPrompt ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 6 }}>
              {dupPrompt.items.map((d, i) => <li key={i}>{d.label}</li>)}
            </ul>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: 0 }}>
              Continuing keeps {dupPrompt.items.length === 1 ? "it" : "them"} in the review queue — you can still discard {dupPrompt.items.length === 1 ? "it" : "any"} there, and nothing is booked to inventory or QuickBooks until you Confirm.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Button
                variant="ghost"
                disabled={dupBusy}
                onClick={async () => {
                  if (!dupPrompt) return;
                  setDupBusy(true);
                  try {
                    // Discard just the flagged duplicates; the rest of the batch still goes to review.
                    const ids = [...new Set(dupPrompt.items.map((d) => d.ingestedInvoiceId))];
                    await Promise.all(ids.map((id) => updateIngestedInvoiceAction(id, { status: "discarded" }).catch(() => undefined)));
                    const batchId = dupPrompt.batchId;
                    setDupPrompt(null);
                    goToReview(batchId);
                  } finally {
                    setDupBusy(false);
                  }
                }}
              >
                {dupBusy ? "Discarding…" : "Discard duplicate"}
              </Button>
              <Button
                variant="primary"
                disabled={dupBusy}
                onClick={() => { const b = dupPrompt.batchId; setDupPrompt(null); goToReview(b); }}
              >
                Continue to review
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function SupplyRow({ mat, onOpen }: { mat: CellarMaterialDTO; onOpen: () => void }) {
  const { format } = useCurrency();
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
        {/* Plan 080 U16: the cost was already derived and shown in the detail modal, but you had to open
            every item to see it ("why is there no cost data for this expendable?", #374). READ-ONLY and
            still derived from priced receipts — materials carry no price column, and an unpriced item says
            so rather than showing a fabricated $0 (COST-2, COST-3). */}
        {tracked && mat.avgUnitCost != null ? (
          <span style={{ ...num, fontSize: 13.5, color: "var(--text-muted)" }}>
            ≈ {format(mat.avgUnitCost, { per: mat.stockUnit ?? "" })}
          </span>
        ) : null}
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
  locationOnHand,
  onEdit,
  onReceive,
  onMove,
  onClose,
}: {
  material: CellarMaterialDTO | null;
  pending: boolean;
  run: (fn: () => Promise<unknown>, after?: () => void) => void;
  /** Plan 080 U8: where this item physically is. */
  locationOnHand: LocationOnHand[];
  onEdit: () => void;
  onReceive: () => void;
  onMove: () => void;
  onClose: () => void;
}) {
  const { format } = useCurrency();
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
        {/* Plan 080 U8: WHERE it is — the question the old flat total could not answer. */}
        {tracked ? (
          <DetailRow label="By location">
            <LocationOnHandList rows={locationOnHand} unit={unit} />
          </DetailRow>
        ) : null}
        {/* Feedback #372: show the derived cost AND explain the method — it's the weighted average of the
            prices entered across every shipment still in stock, not a single price. Read-only (COST-3); the
            per-shipment prices are surfaced in "Shipments & prices" below. */}
        <DetailRow label="Cost">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {m.avgUnitCost != null ? <span style={num}>≈ {format(m.avgUnitCost, { per: unit })}</span> : <span>Unknown (no priced stock)</span>}
            <InfoHint
              side="bottom"
              ariaLabel="How this cost is calculated"
              label="Weighted average of the prices you entered across every shipment still in stock — weighted by how much of each remains. Shipments received without a price aren't counted (never as $0). This is the cost charged to wine each time it's used; it can't be edited directly. Per-shipment prices are in “Shipments & prices” below."
            />
          </span>
        </DetailRow>
        <DetailRow label="Status">
          {inactive ? <Badge tone="neutral" variant="soft">inactive</Badge> : <Badge tone="green" variant="soft">active</Badge>}
        </DetailRow>

        {tracked ? <div style={{ marginTop: 12 }}><MaterialLotsPanel key={m.id} materialId={m.id} /></div> : null}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 16 }}>
          <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => setMaterialActiveAction(m.id, inactive))}>
            {inactive ? "Reactivate" : "Deactivate"}
          </Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={onMove}>Move stock</Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={onReceive}>Receive</Button>
          <Button type="button" variant="primary" disabled={pending} onClick={onEdit}>Edit</Button>
        </div>
      </div>
    </Modal>
  );
}

// Plan 072 Unit 10 (read side) + feedback #372: per-shipment history — each SupplyLot with the PRICE PAID at
// receipt, expiry (from a matched COA), and links to its source documents. Opens by default so the price the
// operator entered is visible without a click ("I don't see any price data", #372), and leads with a summary
// that names the costing method (weighted average across priced shipments still in stock). Read-only (COST-3).
function MaterialLotsPanel({ materialId }: { materialId: string }) {
  const [lots, setLots] = React.useState<MaterialLotRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const { format } = useCurrency();

  // The parent keys this panel by materialId, so it re-mounts (fresh null state) when the material changes —
  // no synchronous setState reset inside the effect (that triggers a cascading re-render, flagged by lint).
  React.useEffect(() => {
    let live = true;
    listMaterialLotsAction(materialId)
      .then((rows) => { if (live) setLots(rows); })
      .catch(() => { if (live) setError("Couldn't load lot history."); });
    return () => { live = false; };
  }, [materialId]);

  const now = new Date();
  const count = lots?.length ?? 0;
  const title = <span style={{ fontSize: 13.5, fontWeight: 600 }}>Shipments &amp; prices {lots ? `(${count})` : ""}</span>;
  // The SAME weighted average the Cost row shows and the depletion engine draws at — surfaced with its shipment
  // counts so the operator can see it IS a blend of their receipts (#372, COST-1: reuses the engine's math).
  const summary = lots && lots.length ? summarizeConsumableCost(lots) : null;
  const stockUnit = lots?.[0]?.stockUnit ?? "";

  return (
    <Collapsible title={title} defaultOpen>
      {error ? (
        <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "6px 2px" }}>{error}</div>
      ) : lots == null ? (
        <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "6px 2px" }}>Loading…</div>
      ) : count === 0 ? (
        <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "6px 2px" }}>No shipments received yet — the price is captured when you Receive stock.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>
          {summary ? (
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", padding: "2px 2px 6px" }}>
              {summary.weightedAvgUnitCost != null ? (
                <>
                  Cost is the <strong style={{ fontWeight: 600 }}>weighted average</strong> across{" "}
                  {summary.pricedShipmentCount} priced shipment{summary.pricedShipmentCount === 1 ? "" : "s"} in stock:{" "}
                  <span style={num}>≈ {format(summary.weightedAvgUnitCost, { per: stockUnit })}</span>
                  {summary.unpricedShipmentCount > 0
                    ? ` · ${summary.unpricedShipmentCount} in stock with no price entered (not counted).`
                    : "."}
                </>
              ) : (
                "No priced shipments in stock yet, so the unit cost is unknown — receive a priced shipment to set it."
              )}
            </div>
          ) : null}
          {lots.map((l) => {
            const exp = lotExpiryStatus(l.expiresAt, now);
            const received = <LocalTime value={l.receivedAt} mode="date" />;
            return (
              <div key={l.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{l.lotCode || "— (no lot code)"}</span>
                  {exp ? (
                    <Badge tone={exp.status === "expired" ? "red" : exp.status === "soon" ? "gold" : "green"} variant="soft">{expiryLabel(exp)}</Badge>
                  ) : null}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-muted)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span>Received {received}</span>
                  <span><span style={num}>{l.qtyRemaining}</span> / {l.qtyReceived} {l.stockUnit} left</span>
                  <span>{l.unitCost != null ? <>Paid <span style={num}>{l.unitCost}</span> {l.currency}/{l.stockUnit}</> : "No price entered"}</span>
                </div>
                {l.documents.length ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
                    {l.documents.map((d) => (
                      <a
                        key={`${d.ingestedInvoiceId}-${d.role}`}
                        href={`/api/ingest/document?id=${encodeURIComponent(d.ingestedInvoiceId)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={d.fileName}
                        style={{ fontSize: 12, color: "var(--wine-primary)", textDecoration: "underline" }}
                      >
                        {docRoleLabel(d.role)} ↗
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Collapsible>
  );
}

function AddExpendableModal({
  open,
  pending,
  run,
  familiesByCategory,
  vendors,
  customUnits,
  onVendorCreated,
  onClose,
}: {
  open: boolean;
  pending: boolean;
  run: (fn: () => Promise<unknown>, after?: () => void) => void;
  familiesByCategory: Map<MaterialCategory, Set<string>>;
  vendors: VendorRow[];
  customUnits: CustomUnitRow[];
  onVendorCreated: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = React.useState<MaterialFormValue>(emptyMaterialForm);
  const patch = (p: Partial<MaterialFormValue>) => setForm((f) => ({ ...f, ...p }));
  const canSubmit = materialFormReady(form) && !pending;

  function submit() {
    if (!canSubmit) return;
    // Plan 080 U14: setting up the record books NO stock and NO cost — receipt is a separate action.
    run(() => createStockMaterialAction(materialFormToInput(form)), onClose);
  }

  return (
    <Modal open={open} onClose={onClose} title="Add consumable" subtitle="Product, purchase, and how it's tracked" maxWidth="min(620px, 96vw)">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <MaterialForm value={form} onChange={patch} familiesByCategory={familiesByCategory} mode="create" vendors={vendors} customUnits={customUnits} onVendorCreated={(v) => { patch({ vendorId: v.id }); onVendorCreated(); }} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="button" variant="primary" onClick={submit} disabled={!canSubmit}>
            {pending ? "Adding…" : "Add consumable"}
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
  vendors,
  customUnits,
  onVendorCreated,
  onClose,
}: {
  material: CellarMaterialDTO | null;
  pending: boolean;
  run: (fn: () => Promise<unknown>, after?: () => void) => void;
  familiesByCategory: Map<MaterialCategory, Set<string>>;
  vendors: VendorRow[];
  customUnits: CustomUnitRow[];
  onVendorCreated: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = React.useState<MaterialFormValue>(() => (material ? materialToForm(material) : emptyMaterialForm));
  const patch = (p: Partial<MaterialFormValue>) => setForm((f) => ({ ...f, ...p }));
  const hasStock = (material?.onHand ?? 0) > 0;
  const allowCostEdit = !!material?.costCorrectable;
  // The correctable lot the cost field totals over — its qty is the denominator, NOT packageAmount.
  const openingLot =
    material?.openingLotQty != null ? { qty: material.openingLotQty, unit: material.stockUnit ?? "g" } : null;
  const canSubmit = !!material && materialFormReady(form) && !pending;

  function submit() {
    if (!material || !canSubmit) return;
    // Only send totalCost when the cost is correctable here; blank → null (clear to unknown), else undefined (leave cost alone).
    const totalCost = allowCostEdit ? (form.totalCost.trim() !== "" ? Number(form.totalCost) : null) : undefined;
    run(() => updateMaterialAction(material.id, { ...materialFormToInput(form), totalCost }), onClose);
  }

  return (
    <Modal open={!!material} onClose={onClose} title={material ? `Edit · ${materialDisplayName(material)}` : "Edit"} subtitle="Correct the item's setup details" maxWidth="min(620px, 96vw)">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <MaterialForm value={form} onChange={patch} familiesByCategory={familiesByCategory} mode="edit" hasStock={hasStock} allowCostEdit={allowCostEdit} openingLot={openingLot} vendors={vendors} customUnits={customUnits} onVendorCreated={(v) => { patch({ vendorId: v.id }); onVendorCreated(); }} />
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
