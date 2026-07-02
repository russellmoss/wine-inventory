"use client";

import React from "react";
import { Card } from "@/components/ui";
import type { ExciseComputed } from "@/lib/compliance/excise";

// plan-026 Unit 10 (D3/D4/D5) — presentational excise worksheet: the tax-class table (gallons · rate ·
// pre-credit tax · CBMA credit · net), the CBMA credit-ladder strip, and the Pay.gov data-entry panel
// (the PRIMARY deliverable). Light-only per DESIGN.md, real <table>/<th scope>, tabular currency.

const CLASS_LABEL: Record<string, string> = {
  A_LE16: "a · ≤16% ABV",
  B_16_21: "b · 16–21%",
  C_21_24: "c · 21–24%",
  D_CARBONATED: "d · carbonated",
  E_SPARKLING: "e · sparkling",
  F_HARD_CIDER: "f · hard cider",
};

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const gal = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const rightNum: React.CSSProperties = { padding: "7px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" };
const th: React.CSSProperties = { padding: "8px 12px", textAlign: "right", fontWeight: 500, color: "var(--text-muted)" };

export function ExciseWorksheet({ computed }: { computed: ExciseComputed }) {
  const rows = computed.classRows;
  return (
    <>
      {/* D3 — the worksheet table */}
      <Card padding="0" style={{ marginBottom: 16, overflowX: "auto" }}>
        <div style={{ padding: "12px 14px", fontWeight: 600, borderBottom: "1px solid var(--border-subtle)" }}>
          Tax computation worksheet
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, minWidth: 640 }}>
          <thead>
            <tr style={{ background: "var(--surface-sunken)" }}>
              <th scope="col" style={{ padding: "8px 12px", textAlign: "left", color: "var(--text-muted)", position: "sticky", left: 0, background: "var(--surface-sunken)", minWidth: 150 }}>
                Tax class
              </th>
              <th scope="col" style={th}>Gallons removed</th>
              <th scope="col" style={th}>Rate</th>
              <th scope="col" style={th}>Pre-credit tax</th>
              <th scope="col" style={th}>CBMA credit</th>
              <th scope="col" style={th}>Net tax</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "16px 12px", color: "var(--text-muted)", textAlign: "center" }}>
                  No taxpaid removals in this period.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.taxClass} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <th scope="row" style={{ padding: "7px 12px", textAlign: "left", fontWeight: 400, position: "sticky", left: 0, background: "var(--surface-raised)" }}>
                    {CLASS_LABEL[r.taxClass] ?? r.taxClass}
                  </th>
                  <td style={rightNum}>{gal(r.gallons)}</td>
                  <td style={rightNum}>{usd(r.rate)}</td>
                  <td style={rightNum}>{usd(r.grossTax)}</td>
                  <td style={{ ...rightNum, color: r.cbmaCredit > 0 ? "var(--positive)" : "var(--text-muted)" }}>
                    {r.cbmaCredit > 0 ? `−${usd(r.cbmaCredit)}` : "—"}
                  </td>
                  <td style={{ ...rightNum, fontWeight: 500 }}>{usd(r.netTax)}</td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 ? (
            <tfoot>
              <tr style={{ background: "var(--surface-sunken)", fontWeight: 600, borderTop: "2px solid var(--border-strong)" }}>
                <th scope="row" style={{ padding: "9px 12px", textAlign: "left", position: "sticky", left: 0, background: "var(--surface-sunken)" }}>
                  Total
                </th>
                <td style={rightNum} />
                <td style={rightNum} />
                <td style={rightNum}>{usd(computed.grossTax)}</td>
                <td style={{ ...rightNum, color: computed.cbmaCredit > 0 ? "var(--positive)" : undefined }}>
                  {computed.cbmaCredit > 0 ? `−${usd(computed.cbmaCredit)}` : "—"}
                </td>
                <td style={rightNum}>{usd(computed.netTax)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </Card>

      {/* D4 — the CBMA credit-ladder strip */}
      <CbmaLadderStrip computed={computed} />

      {/* D5 — the Pay.gov data-entry panel (PRIMARY deliverable) */}
      <PayGovPanel computed={computed} />
    </>
  );
}

function CbmaLadderStrip({ computed }: { computed: ExciseComputed }) {
  const { ladder } = computed;
  const pct = Math.min(100, (ladder.ytdRemovedEnd / ladder.annualCap) * 100);
  const tierLabels: Record<number, string> = { 1: "$1.00 (first 30k)", 2: "$0.90 (30k–130k)", 3: "$0.535 (130k–750k)" };
  return (
    <Card style={{ marginBottom: 16, padding: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>CBMA credit ladder (this calendar year)</div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>
        {gal(ladder.ytdRemovedEnd)} of 750,000 wine gallons removed year-to-date
        {ladder.over750k ? <span style={{ color: "var(--warning)" }}> · past the 750k cap — credit is limited</span> : null}
      </div>
      <div aria-hidden style={{ height: 10, borderRadius: 999, background: "var(--surface-sunken)", overflow: "hidden", marginBottom: 12 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent, var(--positive))" }} />
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {ladder.tiers.map((t) => (
          <div key={t.tier} style={{ flex: "1 1 160px", padding: "8px 10px", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Tier {t.tier} · {tierLabels[t.tier]}</div>
            <div style={{ fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
              {gal(t.remaining)} of {t.limit.toLocaleString("en-US")} gal left
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--border-subtle)" }}>
      <div style={{ flex: "1 1 auto" }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</div>
        <div style={{ fontSize: 15, fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{value}</div>
      </div>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          });
        }}
        style={{ minHeight: 44, minWidth: 64, padding: "0 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)", background: "var(--surface-raised)", cursor: "pointer", fontSize: 13, color: "var(--text-primary)" }}
        aria-label={`Copy ${label}`}
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}

function PayGovPanel({ computed }: { computed: ExciseComputed }) {
  const usdPlain = (n: number) => n.toFixed(2);
  return (
    <Card style={{ marginBottom: 16, padding: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Enter into Pay.gov</div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 6, maxWidth: "70ch" }}>
        The exact values to type into the TTB 5000.24 form on Pay.gov. This is the primary way small
        wineries file; the filled PDF below is for your records. Nothing here is auto-submitted.
      </p>
      <CopyRow label="Line 10 — WINE (gross tax)" value={usdPlain(computed.grossTax)} />
      <CopyRow label="Schedule B — CBMA small-producer credit" value={usdPlain(computed.cbmaCredit)} />
      <CopyRow label="Line 21 — Amount to be paid (net)" value={usdPlain(computed.netTax)} />
    </Card>
  );
}
