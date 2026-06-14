"use client";

import React from "react";
import { Card, Input, Button, Badge, Eyebrow, ConfirmButton } from "@/components/ui";
import type { ItemKind } from "@/lib/stock/movements";
import { createCategory, createWineSku, createGood, moveStock, setOnHand, deleteOnHand } from "@/lib/inventory/actions";

export type Cat = { id: string; name: string };
export type ItemOpt = { kind: ItemKind; id: string; label: string; category: string };
export type LocOpt = { id: string; name: string };
export type OnHandRow = { kind: ItemKind; itemId: string; item: string; category: string; locationId: string; location: string; qty: number; detail: string };

type Mode = "RECEIVE" | "ADJUST" | "TRANSFER";

const sel: React.CSSProperties = {
  height: 44, padding: "0 12px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)", fontFamily: "var(--font-body)", fontSize: 15, color: "var(--text-primary)", width: "100%",
};

export function InventoryClient({ categories, items, locations, onHand }: { categories: Cat[]; items: ItemOpt[]; locations: LocOpt[]; onHand: OnHandRow[] }) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [mode, setMode] = React.useState<Mode>("RECEIVE");
  const [itemRef, setItemRef] = React.useState(""); // "KIND:id"
  const [editKey, setEditKey] = React.useState<string | null>(null);

  function run(fn: () => Promise<void>, form?: HTMLFormElement, after?: () => void) {
    setError(null);
    startTransition(async () => {
      try { await fn(); form?.reset(); after?.(); }
      catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    });
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
        <Card style={{ flex: "1 1 300px" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 20, marginBottom: 12 }}>New wine SKU</h2>
          <form onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; run(() => createWineSku(new FormData(f)), f); }} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Input name="name" placeholder="Ser Kem Marp Reserve" required />
            <div style={{ display: "flex", gap: 8 }}>
              <Input name="vintage" type="number" placeholder="Vintage" required style={{ flex: "0 1 110px" }} />
              <select name="categoryId" style={{ ...sel, height: 44 }} defaultValue="">
                <option value="">Category: Wine (default)</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <Button type="submit" variant="primary" disabled={pending}>Add wine</Button>
          </form>
        </Card>

        <Card style={{ flex: "1 1 300px" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 20, marginBottom: 12 }}>New item &amp; category</h2>
          <form onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; run(() => createCategory(new FormData(f)), f); }} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <Input name="name" placeholder="New category (e.g. Apparel)" style={{ flex: 1 }} required />
            <Button type="submit" variant="secondary" disabled={pending}>Add category</Button>
          </form>
          {categories.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Add a category, then add items to it.</p>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; run(() => createGood(new FormData(f)), f); }} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Input name="name" placeholder="Item (e.g. Logo T-Shirt)" style={{ flex: "1 1 150px" }} required />
              <select name="categoryId" style={{ ...sel, height: 44, flex: "0 1 150px" }} required defaultValue="">
                <option value="" disabled>Category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <Button type="submit" variant="primary" disabled={pending}>Add item</Button>
            </form>
          )}
        </Card>

        {canMove ? (
          <Card style={{ flex: "1 1 360px" }}>
            <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 20, marginBottom: 12 }}>Move stock</h2>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {(["RECEIVE", "ADJUST", "TRANSFER"] as Mode[]).map((m) => (
                <Button key={m} variant={mode === m ? "primary" : "secondary"} size="sm" onClick={() => setMode(m)}>{m[0] + m.slice(1).toLowerCase()}</Button>
              ))}
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; run(() => moveStock(new FormData(f)), f); }}
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

      <Eyebrow rule>On hand</Eyebrow>
      <Card padding="0" style={{ marginTop: 14 }}>
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
            {onHand.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: "20px 16px", color: "var(--text-muted)" }}>Nothing on hand yet.</td></tr>
            ) : (
              onHand.map((r) => {
                const key = `${r.kind}:${r.itemId}:${r.locationId}`;
                const editing = editKey === key;
                return (
                  <tr key={key} style={{ borderTop: "1px solid var(--border-strong)" }}>
                    <td style={{ padding: "12px 16px" }}>{r.item}</td>
                    <td style={{ padding: "12px 16px" }}><Badge tone={r.kind === "BOTTLED_WINE" ? "gold" : "blue"} variant="soft">{r.category}</Badge></td>
                    <td style={{ padding: "12px 16px" }}>{r.location}</td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      {editing ? (
                        <form onSubmit={(e) => { e.preventDefault(); const t = Number(new FormData(e.currentTarget).get("target")); run(() => setOnHand(r.kind, r.itemId, r.locationId, t), undefined, () => setEditKey(null)); }} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          <input name="target" type="number" min="0" defaultValue={r.qty} style={{ ...sel, width: 90, height: 32 }} />
                          <Button type="submit" variant="ghost" size="sm" disabled={pending}>save</Button>
                        </form>
                      ) : (
                        <span>{r.qty}{r.detail ? <span style={{ color: "var(--text-muted)" }}> ({r.detail})</span> : null}</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {!editing ? <Button variant="ghost" size="sm" disabled={pending} onClick={() => setEditKey(key)}>edit</Button> : <Button variant="ghost" size="sm" onClick={() => setEditKey(null)}>cancel</Button>}
                      <ConfirmButton onConfirm={() => run(() => deleteOnHand(r.kind, r.itemId, r.locationId))} disabled={pending}>delete</ConfirmButton>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
