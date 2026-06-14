"use client";

import React from "react";
import { Card, Input, Button, Badge, Eyebrow } from "@/components/ui";
import { createSku, receiveBottled, adjustBottled, transferBottled } from "@/lib/bottled/actions";

export type SkuOpt = { id: string; name: string; vintage: number; isActive: boolean };
export type LocOpt = { id: string; name: string };
export type BalanceRow = { sku: string; location: string; totalBottles: number; cases: number; loose: number };

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

export function BottledClient({ skus, locations, balances }: { skus: SkuOpt[]; locations: LocOpt[]; balances: BalanceRow[] }) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [mode, setMode] = React.useState<Mode>("RECEIVE");

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

  const canMove = skus.length > 0 && locations.length > 0;

  return (
    <div>
      <Eyebrow rule>Finished wine</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>Bottled inventory</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24, maxWidth: "64ch" }}>
        Cases (12 bottles) and loose bottles per SKU per location. Every change is a logged
        movement, so balances always reconcile.
      </p>

      {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 16 }}>{error}</p> : null}

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 28 }}>
        <Card style={{ flex: "1 1 320px" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 20, marginBottom: 12 }}>Define a SKU</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              run(() => createSku(new FormData(form)), form);
            }}
            style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}
          >
            <Input label="Wine name" name="name" placeholder="Ser Kem Marp Reserve" required style={{ flex: "1 1 180px" }} />
            <Input label="Vintage" name="vintage" type="number" placeholder="2025" required style={{ flex: "0 1 110px" }} />
            <Button type="submit" variant="primary" disabled={pending}>Add SKU</Button>
          </form>
          <div style={{ marginTop: 12, fontSize: 13, color: "var(--text-muted)" }}>
            {skus.length === 0 ? "No SKUs yet." : skus.map((s) => `${s.name} ${s.vintage}`).join(" · ")}
          </div>
        </Card>

        {canMove ? (
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
                const form = e.currentTarget;
                const fd = new FormData(form);
                run(() => (mode === "RECEIVE" ? receiveBottled(fd) : mode === "ADJUST" ? adjustBottled(fd) : transferBottled(fd)), form);
              }}
              style={{ display: "flex", flexDirection: "column", gap: 10 }}
            >
              <select name="skuId" style={selectStyle} required defaultValue="">
                <option value="" disabled>Choose SKU</option>
                {skus.map((s) => <option key={s.id} value={s.id}>{s.name} {s.vintage}</option>)}
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
                <Input
                  name={mode === "ADJUST" ? "delta" : "qty"}
                  type="number"
                  placeholder={mode === "ADJUST" ? "Change (+/- bottles)" : "Bottles"}
                  required
                  style={{ flex: 1 }}
                />
                <Input name="reason" placeholder={mode === "ADJUST" ? "Reason (required)" : "Reason (optional)"} required={mode === "ADJUST"} style={{ flex: 1 }} />
              </div>
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? "Working..." : mode === "RECEIVE" ? "Receive" : mode === "ADJUST" ? "Adjust" : "Transfer"}
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
              <th style={{ padding: "12px 16px", fontWeight: 500 }}>SKU</th>
              <th style={{ padding: "12px 16px", fontWeight: 500 }}>Location</th>
              <th style={{ padding: "12px 16px", fontWeight: 500, textAlign: "right" }}>Cases + loose</th>
              <th style={{ padding: "12px 16px", fontWeight: 500, textAlign: "right" }}>Total bottles</th>
            </tr>
          </thead>
          <tbody>
            {balances.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: "20px 16px", color: "var(--text-muted)" }}>No bottled stock yet. Bottle a vessel or receive stock.</td></tr>
            ) : (
              balances.map((b, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--border-strong)" }}>
                  <td style={{ padding: "12px 16px" }}>{b.sku}</td>
                  <td style={{ padding: "12px 16px" }}>{b.location}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <Badge tone="gold" variant="soft">{b.cases}c + {b.loose}</Badge>
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>{b.totalBottles}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
