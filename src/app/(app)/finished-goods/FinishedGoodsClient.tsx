"use client";

import React from "react";
import { Card, Input, Button, Badge, Eyebrow } from "@/components/ui";
import {
  createCategory,
  createGood,
  receiveGood,
  adjustGood,
  transferGood,
} from "@/lib/finished-goods/actions";

export type Cat = { id: string; name: string };
export type Good = { id: string; name: string; category: string };
export type LocOpt = { id: string; name: string };
export type GoodBalance = { good: string; category: string; location: string; quantity: number };

type Mode = "RECEIVE" | "ADJUST" | "TRANSFER";

const selectStyle: React.CSSProperties = {
  height: 44,
  padding: "0 12px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)",
  fontFamily: "var(--font-body)",
  fontSize: 15,
  color: "var(--text-primary)",
  width: "100%",
};

export function FinishedGoodsClient({
  categories,
  goods,
  locations,
  balances,
}: {
  categories: Cat[];
  goods: Good[];
  locations: LocOpt[];
  balances: GoodBalance[];
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [mode, setMode] = React.useState<Mode>("RECEIVE");
  const goodOpts = React.useMemo(() => goods.map((g) => ({ id: g.id, label: `${g.name} (${g.category})` })), [goods]);

  function run(fn: () => Promise<void>, form?: HTMLFormElement) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        form?.reset();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <div>
      <Eyebrow rule>Merchandise</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>Finished goods</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24, maxWidth: "64ch" }}>
        Non-wine items (glasses, corkscrews, apparel) tracked by quantity per location, organized
        into categories you define.
      </p>

      {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 16 }}>{error}</p> : null}

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 28 }}>
        <Card style={{ flex: "1 1 280px" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 20, marginBottom: 12 }}>Categories</h2>
          <form onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; run(() => createCategory(new FormData(f)), f); }} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <Input name="name" placeholder="e.g. Apparel" size="sm" style={{ flex: 1 }} required />
            <Button type="submit" variant="primary" size="sm" disabled={pending}>Add</Button>
          </form>
          <div style={{ marginTop: 12, fontSize: 13, color: "var(--text-muted)" }}>
            {categories.length === 0 ? "No categories yet." : categories.map((c) => c.name).join(" · ")}
          </div>
        </Card>

        <Card style={{ flex: "1 1 320px" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 20, marginBottom: 12 }}>Items</h2>
          {categories.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Add a category first.</p>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; run(() => createGood(new FormData(f)), f); }} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <Input name="name" placeholder="e.g. Logo T-Shirt" size="sm" style={{ flex: "1 1 150px" }} required />
              <select name="categoryId" style={{ ...selectStyle, height: 36, flex: "0 1 140px" }} required defaultValue="">
                <option value="" disabled>Category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <Button type="submit" variant="primary" size="sm" disabled={pending}>Add</Button>
            </form>
          )}
        </Card>

        {goods.length > 0 && locations.length > 0 ? (
          <Card style={{ flex: "1 1 360px" }}>
            <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 20, marginBottom: 12 }}>Move stock</h2>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              {(["RECEIVE", "ADJUST", "TRANSFER"] as Mode[]).map((m) => (
                <Button key={m} variant={mode === m ? "primary" : "secondary"} size="sm" onClick={() => setMode(m)}>
                  {m[0] + m.slice(1).toLowerCase()}
                </Button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = e.currentTarget;
                const fd = new FormData(f);
                run(() => (mode === "RECEIVE" ? receiveGood(fd) : mode === "ADJUST" ? adjustGood(fd) : transferGood(fd)), f);
              }}
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <select name="goodId" style={selectStyle} required defaultValue="">
                <option value="" disabled>Choose item</option>
                {goodOpts.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
              {mode === "TRANSFER" ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <select name="fromLocationId" style={selectStyle} required defaultValue=""><option value="" disabled>From</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
                  <select name="toLocationId" style={selectStyle} required defaultValue=""><option value="" disabled>To</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
                </div>
              ) : (
                <select name="locationId" style={selectStyle} required defaultValue=""><option value="" disabled>Location</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <Input name={mode === "ADJUST" ? "delta" : "qty"} type="number" placeholder={mode === "ADJUST" ? "Change (+/-)" : "Quantity"} required style={{ flex: 1 }} />
                <Input name="reason" placeholder={mode === "ADJUST" ? "Reason (required)" : "Reason (optional)"} required={mode === "ADJUST"} style={{ flex: 1 }} />
              </div>
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? "Working..." : mode[0] + mode.slice(1).toLowerCase()}
              </Button>
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
            </tr>
          </thead>
          <tbody>
            {balances.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: "20px 16px", color: "var(--text-muted)" }}>No stock yet.</td></tr>
            ) : (
              balances.map((b, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--border-strong)" }}>
                  <td style={{ padding: "12px 16px" }}>{b.good}</td>
                  <td style={{ padding: "12px 16px" }}><Badge tone="blue" variant="soft">{b.category}</Badge></td>
                  <td style={{ padding: "12px 16px" }}>{b.location}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>{b.quantity}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
