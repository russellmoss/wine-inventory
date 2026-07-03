"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, Badge, Button } from "@/components/ui";
import { loadCommerce7Mapping, saveCommerce7SkuMap, saveCommerce7SalesAccounts, type Commerce7MappingData } from "@/lib/commerce/actions";
import type { NormalizedAccount } from "@/lib/accounting/adapter";

// Phase 16 Unit 4 — the Commerce7 mapping card (mirrors AccountMappingCard). Two parts: (1) winery-wide
// DTC sales accounts (revenue / sales tax / shipping / undeposited-funds clearing / discount), gated on
// a QuickBooks connection; (2) SKU-match rows — each Commerce7 (variant, location) matched to a WineSku
// + our Location (match, never silently create). Half-filled rows are blocked; the unmapped count is
// surfaced (an unmapped SKU holds its sales — D14). Domain language; DESIGN.md tokens; 44px targets.

const selectStyle: React.CSSProperties = {
  height: 44,
  width: "100%",
  padding: "0 10px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  color: "var(--text-primary)",
};

function AccountSelect({ id, label, value, accounts, onChange }: { id: string; label: string; value: string | null; accounts: NormalizedAccount[]; onChange: (v: string | null) => void }) {
  return (
    <label htmlFor={id} style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px", minWidth: 0 }}>
      <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{label}</span>
      <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} style={selectStyle}>
        <option value="">— not mapped —</option>
        {accounts.map((a) => (
          <option key={a.accountKey} value={a.accountKey}>
            {a.number ? `${a.number} · ` : ""}
            {a.name}
            {a.type ? ` (${a.type})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

type SkuRow = Commerce7MappingData["skuMap"][number];

export function Commerce7MappingCard({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [data, setData] = React.useState<Commerce7MappingData | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [rows, setRows] = React.useState<SkuRow[]>([]);
  const [accounts, setAccounts] = React.useState<Commerce7MappingData["salesAccounts"] | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const fetchData = React.useCallback(() => {
    startTransition(async () => {
      // setState inside the transition (not synchronously) — this fn runs from an effect, and a
      // synchronous setState in an effect trips react-hooks' cascading-render rule.
      setLoading(true);
      setLoadError(null);
      try {
        const d = await loadCommerce7Mapping();
        setData(d);
        setAccounts(d.salesAccounts);
        // Seed a row per C7 (variant, location), pre-filled from the saved map.
        const byKey = new Map(d.skuMap.map((m) => [`${m.externalVariantId}:${m.externalInventoryLocationId}`, m]));
        setRows(
          d.variants.map((v) => {
            const k = `${v.variantId}:${v.inventoryLocationId}`;
            const saved = byKey.get(k);
            return {
              externalProductId: v.productId,
              externalVariantId: v.variantId,
              externalSku: v.sku,
              externalInventoryLocationId: v.inventoryLocationId,
              wineSkuId: saved?.wineSkuId ?? null,
              locationId: saved?.locationId ?? null,
              active: true,
            };
          }),
        );
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Couldn't load your Commerce7 catalog.");
      } finally {
        setLoading(false);
      }
    });
  }, []);

  React.useEffect(() => {
    if (connected) fetchData();
  }, [connected, fetchData]);

  function setRow(variantId: string, locationId: string, patch: Partial<SkuRow>) {
    setRows((prev) => prev.map((r) => (r.externalVariantId === variantId && r.externalInventoryLocationId === locationId ? { ...r, ...patch } : r)));
    setMsg(null);
  }

  const halfFilled = rows.filter((r) => Boolean(r.wineSkuId) !== Boolean(r.locationId));
  const unmappedCount = rows.filter((r) => !r.wineSkuId && !r.locationId).length;

  function saveRows() {
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      try {
        await saveCommerce7SkuMap(rows.map(({ externalProductId, externalVariantId, externalSku, externalInventoryLocationId, wineSkuId, locationId }) => ({ externalProductId, externalVariantId, externalSku, externalInventoryLocationId, wineSkuId, locationId })));
        setMsg("Saved.");
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't save the SKU map.");
      }
    });
  }

  function saveAccounts() {
    if (!accounts) return;
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      try {
        await saveCommerce7SalesAccounts(accounts);
        setMsg("Saved.");
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn't save the sales accounts.");
      }
    });
  }

  const accountsHalf = accounts ? Boolean(accounts.dtcRevenueAccount) !== Boolean(accounts.dtcClearingAccount) : false;

  return (
    <Card id="commerce7-mapping" style={{ maxWidth: 560, marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 18, margin: 0 }}>Commerce7 mapping</h2>
        {connected && unmappedCount > 0 && <Badge tone="gold">{unmappedCount} need a wine</Badge>}
      </div>
      <p style={{ color: "var(--text-secondary)", margin: "6px 0 16px", fontSize: 14.5, maxWidth: "52ch" }}>
        Match each Commerce7 product to the wine it depletes, and tell QuickBooks where DTC revenue lands.
        A product with no match holds its sales until you map it — we never guess.
      </p>

      {!connected ? (
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Connect Commerce7 first to map your catalog.</p>
      ) : loading || (!data && !loadError) ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ height: 44, borderRadius: "var(--radius-md)", background: "var(--surface-sunken)" }} />
          ))}
        </div>
      ) : loadError ? (
        <div>
          <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 10 }}>{loadError}</p>
          <Button variant="secondary" size="sm" onClick={fetchData} disabled={pending}>Try again</Button>
        </div>
      ) : (
        <>
          {/* DTC sales accounts */}
          <div style={{ fontSize: 14.5, fontWeight: 500, marginBottom: 4 }}>DTC sales accounts</div>
          {!data?.qboConnected || !data?.coa ? (
            <p style={{ color: "var(--text-muted)", fontSize: 13.5, marginBottom: 8 }}>Connect QuickBooks to choose sales accounts.</p>
          ) : accounts ? (
            <>
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 10, maxWidth: "52ch" }}>
                A settled sale posts money received (undeposited-funds clearing) against revenue, sales tax,
                and shipping. Revenue and clearing are required to post; the rest apply only when present.
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <AccountSelect id="dtc-revenue" label="Revenue account" value={accounts.dtcRevenueAccount} accounts={data.coa.revenue} onChange={(v) => setAccounts((a) => a && { ...a, dtcRevenueAccount: v })} />
                <AccountSelect id="dtc-clearing" label="Undeposited-funds clearing" value={accounts.dtcClearingAccount} accounts={data.coa.clearing} onChange={(v) => setAccounts((a) => a && { ...a, dtcClearingAccount: v })} />
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
                <AccountSelect id="dtc-tax" label="Sales tax payable" value={accounts.dtcTaxAccount} accounts={data.coa.salesTax} onChange={(v) => setAccounts((a) => a && { ...a, dtcTaxAccount: v })} />
                <AccountSelect id="dtc-shipping" label="Shipping income" value={accounts.dtcShippingAccount} accounts={data.coa.shipping} onChange={(v) => setAccounts((a) => a && { ...a, dtcShippingAccount: v })} />
                <AccountSelect id="dtc-discount" label="Discounts (contra)" value={accounts.dtcDiscountAccount} accounts={data.coa.discount} onChange={(v) => setAccounts((a) => a && { ...a, dtcDiscountAccount: v })} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
                <Button variant="secondary" onClick={saveAccounts} disabled={pending || accountsHalf}>{pending ? "Saving…" : "Save sales accounts"}</Button>
                {accountsHalf && <span style={{ color: "var(--danger)", fontSize: 13 }}>Set both revenue and clearing (or clear both).</span>}
              </div>
            </>
          ) : null}

          {/* SKU match rows */}
          <div style={{ borderTop: "1px solid var(--border)", marginTop: 20, paddingTop: 16 }}>
            <div style={{ fontSize: 14.5, fontWeight: 500, marginBottom: 8 }}>Product → wine matches</div>
            {rows.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No Commerce7 products found yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {rows.map((r) => {
                  const mapped = Boolean(r.wineSkuId && r.locationId);
                  const half = Boolean(r.wineSkuId) !== Boolean(r.locationId);
                  return (
                    <div key={`${r.externalVariantId}:${r.externalInventoryLocationId}`} style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 14.5, fontWeight: 500 }}>{r.externalSku || r.externalVariantId}</span>
                        <Badge tone={mapped ? "green" : half ? "red" : "neutral"}>{mapped ? "Matched" : half ? "Finish this row" : "Not matched yet"}</Badge>
                      </div>
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px", minWidth: 0 }}>
                          <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>Wine (SKU)</span>
                          <select value={r.wineSkuId ?? ""} onChange={(e) => setRow(r.externalVariantId, r.externalInventoryLocationId, { wineSkuId: e.target.value || null })} style={selectStyle}>
                            <option value="">— not matched —</option>
                            {data?.wineSkus.map((w) => (<option key={w.id} value={w.id}>{w.label}</option>))}
                          </select>
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px", minWidth: 0 }}>
                          <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>Depletes from location</span>
                          <select value={r.locationId ?? ""} onChange={(e) => setRow(r.externalVariantId, r.externalInventoryLocationId, { locationId: e.target.value || null })} style={selectStyle}>
                            <option value="">— pick a location —</option>
                            {data?.locations.map((l) => (<option key={l.id} value={l.id}>{l.name}</option>))}
                          </select>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
              <Button variant="primary" onClick={saveRows} disabled={pending || halfFilled.length > 0}>{pending ? "Saving…" : "Save matches"}</Button>
              {halfFilled.length > 0 && <span style={{ color: "var(--danger)", fontSize: 13 }}>Finish or clear both fields on {halfFilled.length} row(s) first.</span>}
              {msg && <span style={{ color: "var(--positive)", fontSize: 14 }}>{msg}</span>}
              {err && <span style={{ color: "var(--danger)", fontSize: 14 }}>{err}</span>}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
