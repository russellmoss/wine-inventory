"use client";

import React from "react";
import { Card, Badge, Metric } from "@/components/ui";
import type { CostComponent } from "@prisma/client";
import type { LotCostView } from "@/lib/cost/data";
import { useCurrency } from "@/components/money/CurrencyProvider";

// Phase 8 (Unit 15): the cost-per-bottle/L TRUST surface (D14, G7). A decomposed capitalized stack with
// $/L and % of total, an as-of date, an incomplete-basis warning (red, never a silent number), the
// recorded-but-not-capitalized components shown muted, and a keyboard-openable drill-down to the cost
// lines + transfer chain. Read-only. All spacing/color via design tokens.

const COMPONENT_LABELS: Record<CostComponent, string> = {
  MATERIAL: "Materials / additions",
  FRUIT: "Fruit / grapes",
  BARREL: "Barrel",
  LABOR: "Labor",
  OVERHEAD: "Overhead",
  DOSAGE_LIQUEUR: "Dosage liqueur",
  PACKAGING: "Packaging / dry goods",
  VARIANCE: "Variance",
};

const num = { fontVariantNumeric: "tabular-nums" } as const;

export function CostPanel({ cost }: { cost: LotCostView }) {
  const { symbol } = useCurrency();
  // Currency-aware money/perL (Phase 037): the tenant symbol prefixes every amount. perL keeps 4 max
  // fraction digits (a per-litre unit cost is small) — formatMoney's fixed 2 is for whole amounts.
  const money = (n: number): string => `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const perL = (n: number | null): string => (n == null ? "—" : `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}/L`);
  const [open, setOpen] = React.useState(false);
  const complete = cost.completeness === "KNOWN";
  const billable = cost.ownership === "CUSTOM_CRUSH_CLIENT";
  const hasCost = cost.totalCost > 0 || cost.capitalized.length > 0;

  return (
    <Card padding="var(--space-5)" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 20, margin: 0 }}>Cost</h2>
        {billable ? (
          <Badge tone="maroon" variant="soft">Client-owned</Badge>
        ) : !hasCost ? null : complete ? (
          <Badge tone="green" variant="soft">Matches snapshot</Badge>
        ) : (
          <Badge tone="red">Estimated — incomplete cost basis</Badge>
        )}
      </div>

      {billable ? (
        <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: "6px 0 0", maxWidth: "52ch" }}>
          This lot is owned by a custom-crush client. Its fruit, wine, and supply cost is billed back to
          the client — not capitalized to the winery&rsquo;s inventory. Estate cost-per-bottle excludes it.
        </p>
      ) : !hasCost ? (
        <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: "6px 0 0", maxWidth: "52ch" }}>
          Cost basis accrues as operations are recorded — fruit at crush, additions, packaging at
          bottling. Nothing has landed on this lot yet.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-end", margin: "10px 0 6px" }}>
            <Metric size="sm" caption="Cost / litre" value={perL(cost.costPerL)} />
            <Metric size="sm" caption="Total capitalized" value={money(cost.totalCost)} />
            <Metric size="sm" caption="Volume" value={`${cost.volumeL.toLocaleString()} L`} />
          </div>
          {cost.asOf ? (
            <p style={{ ...num, color: "var(--text-muted)", fontSize: 12.5, margin: "0 0 12px" }}>
              As of {cost.asOf.type.toLowerCase().replace(/_/g, " ")} on{" "}
              {new Date(cost.asOf.observedAt).toLocaleDateString()} · policy v{cost.policyVersion}
            </p>
          ) : null}

          {/* Capitalized component stack */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {cost.capitalized.map((s) => (
              <div key={s.component} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "7px 0", borderTop: "1px solid var(--border-strong)" }}>
                <span style={{ fontSize: 14 }}>{COMPONENT_LABELS[s.component]}</span>
                <span style={{ ...num, display: "inline-flex", gap: 14, color: "var(--text-secondary)", fontSize: 13.5 }}>
                  <span>{perL(s.perL)}</span>
                  <span style={{ minWidth: 44, textAlign: "right", color: "var(--text-muted)" }}>{s.pct}%</span>
                  <span style={{ minWidth: 80, textAlign: "right", color: "var(--text-primary)" }}>{money(s.amount)}</span>
                </span>
              </div>
            ))}
          </div>

          {/* Recorded but not capitalized (policy toggles) */}
          {cost.notCapitalized.length > 0 ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", marginBottom: 2 }}>
                Recorded, not capitalized
              </div>
              {cost.notCapitalized.map((s) => (
                <div key={s.component} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "5px 0", color: "var(--text-muted)" }}>
                  <span style={{ fontSize: 13.5 }}>
                    {COMPONENT_LABELS[s.component]} <span style={{ fontSize: 12 }}>· not capitalized</span>
                  </span>
                  <span style={{ ...num, fontSize: 13 }}>{money(s.amount)}</span>
                </div>
              ))}
            </div>
          ) : null}

          {/* Drill-down: cost lines + transfer chain (G7) */}
          {cost.lines.length > 0 || cost.transfers.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                style={{ border: "none", background: "transparent", color: "var(--text-accent)", cursor: "pointer", fontSize: 13.5, padding: 0 }}
              >
                {open ? "Hide" : "Show"} cost lines &amp; transfers ({cost.lines.length + cost.transfers.length})
              </button>
              {open ? (
                <div style={{ marginTop: 8, borderTop: "1px solid var(--border-strong)", paddingTop: 8 }}>
                  {cost.lines.map((l, i) => (
                    <div key={`l${i}`} style={{ ...num, display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5, color: "var(--text-secondary)", padding: "3px 0" }}>
                      <span>
                        op #{l.operationId} · {COMPONENT_LABELS[l.component]}
                        {!l.capitalized ? " · not capitalized" : ""}
                        {l.completeness !== "KNOWN" ? ` · ${l.completeness.toLowerCase()} cost` : ""}
                      </span>
                      <span>{money(l.amount)}</span>
                    </div>
                  ))}
                  {cost.transfers.map((t, i) => (
                    <div key={`t${i}`} style={{ ...num, display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5, color: "var(--text-muted)", padding: "3px 0" }}>
                      <span>op #{t.operationId} · transfer {t.transferredVolumeL} L</span>
                      <span>{money(t.transferredCost)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}
