"use client";

import React from "react";
import { Card, Input, Button, Badge, Eyebrow, ConfirmButton, ExportCsvButton } from "@/components/ui";
import type { ItemKind } from "@/lib/stock/movements";
import { moveStock, updateOnHand, deleteOnHand } from "@/lib/inventory/actions";
import { unwrap } from "@/lib/action-result";
import { ImportCsvModal } from "../ImportCsvModal";
import { AddFinishedGoodModal } from "@/components/inventory/AddFinishedGoodModal";

export type Cat = { id: string; name: string };
export type ItemOpt = { kind: ItemKind; id: string; label: string; category: string };
export type LocOpt = { id: string; name: string };
export type OnHandRow = { kind: ItemKind; itemId: string; item: string; name: string; vintage: number | null; categoryId: string | null; category: string; locationId: string; location: string; qty: number; cases: number; loose: number; detail: string };

type Draft = { name: string; vintage: string; categoryId: string; locationId: string; qty: string };

type Mode = "RECEIVE" | "ADJUST" | "TRANSFER";

const sel: React.CSSProperties = {
  height: 44, padding: "0 12px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)", fontFamily: "var(--font-body)", fontSize: 15, color: "var(--text-primary)", width: "100%",
};

export function FinishedGoodsSection({ categories, items, locations, onHand }: { categories: Cat[]; items: ItemOpt[]; locations: LocOpt[]; onHand: OnHandRow[] }) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [mode, setMode] = React.useState<Mode>("RECEIVE");
  const [itemRef, setItemRef] = React.useState(""); // "KIND:id"
  const [editKey, setEditKey] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [fCategory, setFCategory] = React.useState("all");
  const [fLocation, setFLocation] = React.useState("all");
  // Plan 080 U7: Wine / Merchandise sub-tabs. Finished goods are two genuinely different things — a
  // vintage-dated wine SKU and a merch item — and the add form differs, so the tab drives BOTH the table
  // filter and which "+ Add" the button opens.
  const [subTab, setSubTab] = React.useState<"all" | "BOTTLED_WINE" | "FINISHED_GOOD">("all");
  const [addOpen, setAddOpen] = React.useState(false);

  // Filter options: union of registry names and anything currently on hand (stays
  // dynamic as categories/locations are added, edited, or removed).
  const catOptions = React.useMemo(
    () => [...new Set([...categories.map((c) => c.name), ...onHand.map((r) => r.category)])].sort((a, b) => a.localeCompare(b)),
    [categories, onHand],
  );
  const locOptions = React.useMemo(
    () => [...new Set([...locations.map((l) => l.name), ...onHand.map((r) => r.location)])].sort((a, b) => a.localeCompare(b)),
    [locations, onHand],
  );
  const subTabs: { key: "all" | "BOTTLED_WINE" | "FINISHED_GOOD"; label: string }[] = [
    { key: "all", label: "All" },
    { key: "BOTTLED_WINE", label: "Wine" },
    { key: "FINISHED_GOOD", label: "Merchandise" },
  ];
  const subSeg = (active: boolean): React.CSSProperties => ({
    padding: "6px 14px", fontFamily: "var(--font-body)", fontSize: 14, fontWeight: active ? 600 : 500,
    color: active ? "var(--surface-raised)" : "var(--text-secondary)",
    background: active ? "var(--wine-primary)" : "transparent",
    border: "none", borderRadius: "calc(var(--radius-md) - 2px)", cursor: "pointer", minHeight: 34,
  });

  const filtered = onHand.filter(
    (r) =>
      (fCategory === "all" || r.category === fCategory) &&
      (fLocation === "all" || r.location === fLocation) &&
      (subTab === "all" || r.kind === subTab),
  );

  function run(fn: () => Promise<void>, form?: HTMLFormElement, after?: () => void) {
    setError(null);
    startTransition(async () => {
      try { await fn(); form?.reset(); after?.(); }
      catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    });
  }

  function startEdit(r: OnHandRow) {
    setError(null);
    setEditKey(`${r.kind}:${r.itemId}:${r.locationId}`);
    setDraft({ name: r.name, vintage: r.vintage != null ? String(r.vintage) : "", categoryId: r.categoryId ?? "", locationId: r.locationId, qty: String(r.qty) });
  }
  function cancelEdit() {
    setEditKey(null);
    setDraft(null);
  }
  function saveEdit(r: OnHandRow) {
    if (!draft) return;
    run(
      () =>
        updateOnHand({
          kind: r.kind,
          itemId: r.itemId,
          fromLocationId: r.locationId,
          name: draft.name,
          vintage: r.kind === "BOTTLED_WINE" ? Number(draft.vintage) : undefined,
          categoryId: draft.categoryId,
          toLocationId: draft.locationId,
          qty: Number(draft.qty),
        }),
      undefined,
      cancelEdit,
    );
  }

  const [selKind, selId] = itemRef ? (itemRef.split(":") as [ItemKind, string]) : ["", ""];
  const canMove = items.length > 0 && locations.length > 0;

  return (
    <div>
      <Eyebrow rule>Stock</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>Inventory</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24, maxWidth: "66ch" }}>
        Bottled wine and merchandise in one place. Define wines and items (every item has a
        category), move stock between locations, and correct or remove anything on hand.
      </p>

      {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 16 }}>{error}</p> : null}

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 28 }}>
        {/* Plan 080 U7: the legacy inline "New wine SKU" and "New item & category" forms are GONE — the
            "+ Add wine" / "+ Add merchandise" modal beside the sub-tabs supersedes them and is a strict
            superset (it also captures MSRP and opening stock). Keeping both left four competing ways to add
            an item on one screen. */}
        {canMove ? (
          <Card style={{ flex: "1 1 360px" }}>
            <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 20, marginBottom: 12 }}>Move stock</h2>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {(["RECEIVE", "ADJUST", "TRANSFER"] as Mode[]).map((m) => (
                <Button key={m} variant={mode === m ? "primary" : "secondary"} size="sm" onClick={() => setMode(m)}>{m[0] + m.slice(1).toLowerCase()}</Button>
              ))}
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; run(async () => { unwrap(await moveStock(new FormData(f))); }, f); }}
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <input type="hidden" name="kind" value={selKind} />
              <input type="hidden" name="itemId" value={selId} />
              <input type="hidden" name="mode" value={mode} />
              <select value={itemRef} onChange={(e) => setItemRef(e.target.value)} style={sel} required>
                <option value="" disabled>Choose item</option>
                {items.map((it) => <option key={`${it.kind}:${it.id}`} value={`${it.kind}:${it.id}`}>{it.label} — {it.category}</option>)}
              </select>
              {mode === "TRANSFER" ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <select name="fromLocationId" style={sel} required defaultValue=""><option value="" disabled>From</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
                  <select name="toLocationId" style={sel} required defaultValue=""><option value="" disabled>To</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
                </div>
              ) : (
                <select name="locationId" style={sel} required defaultValue=""><option value="" disabled>Location</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <Input name={mode === "ADJUST" ? "delta" : "qty"} type="number" placeholder={mode === "ADJUST" ? "Change (+/-)" : "Quantity"} required style={{ flex: 1 }} />
                <Input name="reason" placeholder={mode === "ADJUST" ? "Reason (required)" : "Reason (optional)"} required={mode === "ADJUST"} style={{ flex: 1 }} />
              </div>
              <Button type="submit" variant="primary" disabled={pending}>{pending ? "Working..." : mode[0] + mode.slice(1).toLowerCase()}</Button>
            </form>
          </Card>
        ) : null}
      </div>

      {/* Plan 080 U7: Wine / Merchandise sub-tabs. Drives the table filter AND which "+ Add" opens. */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        <div role="tablist" aria-label="Finished goods type" style={{ display: "inline-flex", gap: 2, padding: 3, background: "var(--paper-100)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
          {subTabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={subTab === t.key} style={subSeg(subTab === t.key)} onClick={() => setSubTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <Button type="button" variant="primary" onClick={() => setAddOpen(true)}>
          {subTab === "FINISHED_GOOD" ? "+ Add merchandise" : "+ Add wine"}
        </Button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <Eyebrow rule>On hand</Eyebrow>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <ImportCsvModal categories={categories} locations={locations} />
          <ExportCsvButton
            filename="inventory-on-hand.csv"
            columns={[{ key: "name", label: "Item" }, { key: "vintage", label: "Vintage" }, { key: "category", label: "Category" }, { key: "location", label: "Location" }, { key: "fullCases", label: "Full cases" }, { key: "remainingBottles", label: "Remaining bottles" }, { key: "totalBottles", label: "Total bottles" }, { key: "kind", label: "Kind" }]}
            rows={filtered.map((r) => ({ name: r.name, vintage: r.vintage ?? "", category: r.category, location: r.location, fullCases: r.cases, remainingBottles: r.loose, totalBottles: r.qty, kind: r.kind === "BOTTLED_WINE" ? "Wine" : "Merch" }))}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", margin: "12px 0" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
          Category
          <select value={fCategory} onChange={(e) => setFCategory(e.target.value)} style={{ ...sel, height: 38, width: "auto" }}>
            <option value="all">All categories</option>
            {catOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
          Location
          <select value={fLocation} onChange={(e) => setFLocation(e.target.value)} style={{ ...sel, height: 38, width: "auto" }}>
            <option value="all">All locations</option>
            {locOptions.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        {fCategory !== "all" || fLocation !== "all" ? (
          <>
            <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{filtered.length} of {onHand.length}</span>
            <Button variant="ghost" size="sm" onClick={() => { setFCategory("all"); setFLocation("all"); }}>Clear</Button>
          </>
        ) : null}
      </div>

      <Card padding="0">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14.5 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
              <th style={{ padding: "12px 16px", fontWeight: 500 }}>Item</th>
              <th style={{ padding: "12px 16px", fontWeight: 500 }}>Category</th>
              <th style={{ padding: "12px 16px", fontWeight: 500 }}>Location</th>
              <th style={{ padding: "12px 16px", fontWeight: 500, textAlign: "right" }}>Quantity</th>
              <th style={{ padding: "12px 16px", fontWeight: 500, textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: "20px 16px", color: "var(--text-muted)" }}>{onHand.length === 0 ? "Nothing on hand yet." : "Nothing matches these filters."}</td></tr>
            ) : (
              filtered.map((r) => {
                const key = `${r.kind}:${r.itemId}:${r.locationId}`;
                const editing = editKey === key;
                if (editing && draft) {
                  const edSel = { ...sel, height: 34, fontSize: 14 };
                  return (
                    <tr key={key} style={{ borderTop: "1px solid var(--border-strong)", background: "var(--surface-sunken, rgba(0,0,0,0.02))" }}>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Name" style={{ ...edSel, flex: 1, minWidth: 120 }} />
                          {r.kind === "BOTTLED_WINE" ? (
                            <input value={draft.vintage} onChange={(e) => setDraft({ ...draft, vintage: e.target.value })} type="number" placeholder="Vintage" style={{ ...edSel, width: 90 }} />
                          ) : null}
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <select value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })} style={edSel}>
                          {r.kind === "BOTTLED_WINE" ? <option value="">— none —</option> : <option value="" disabled>Category</option>}
                          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <select value={draft.locationId} onChange={(e) => setDraft({ ...draft, locationId: e.target.value })} style={edSel}>
                          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <input value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: e.target.value })} type="number" min="0" style={{ ...edSel, width: 90, textAlign: "right" }} />
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <Button variant="ghost" size="sm" disabled={pending} onClick={() => saveEdit(r)}>save</Button>
                        <Button variant="ghost" size="sm" disabled={pending} onClick={cancelEdit}>cancel</Button>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={key} style={{ borderTop: "1px solid var(--border-strong)" }}>
                    <td style={{ padding: "12px 16px" }}>{r.item}</td>
                    <td style={{ padding: "12px 16px" }}><Badge tone={r.kind === "BOTTLED_WINE" ? "gold" : "blue"} variant="soft">{r.category}</Badge></td>
                    <td style={{ padding: "12px 16px" }}>{r.location}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <span>{r.qty}{r.detail ? <span style={{ color: "var(--text-muted)" }}> ({r.detail})</span> : null}</span>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => startEdit(r)}>edit</Button>
                      <ConfirmButton onConfirm={() => run(() => deleteOnHand(r.kind, r.itemId, r.locationId))} disabled={pending}>delete</ConfirmButton>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>

      <AddFinishedGoodModal
        open={addOpen}
        kind={subTab === "FINISHED_GOOD" ? "FINISHED_GOOD" : "BOTTLED_WINE"}
        categories={categories}
        locations={locations}
        onClose={() => setAddOpen(false)}
        onSaved={() => setAddOpen(false)}
      />
    </div>
  );
}
