"use client";

import React from "react";
import { Card, Eyebrow, Badge } from "@/components/ui";
import { getVineyardHarvest } from "@/lib/harvest/actions";
import { formatWeightFromKg, type Unit } from "@/lib/harvest/units";
import type { VintageGroup } from "@/lib/harvest/aggregate";

type Props = { vineyards: { id: string; name: string }[] };

const selectStyle: React.CSSProperties = {
  height: 44,
  padding: "0 12px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)",
  fontFamily: "var(--font-body)",
  fontSize: 15,
  color: "var(--text-primary)",
};

const th: React.CSSProperties = { padding: "10px 14px", fontWeight: 500, textAlign: "right" };
const thLeft: React.CSSProperties = { ...th, textAlign: "left" };
const td: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};
const tdLeft: React.CSSProperties = { ...td, textAlign: "left" };

// Admin reviews historic yields; metric is the canonical review unit.
const REVIEW_UNIT: Unit = "metric";

function fmtVariance(v: number | null): string {
  if (v == null) return "N/A";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function varianceColor(v: number | null): string {
  if (v == null) return "var(--text-muted)";
  if (v >= 0) return "var(--positive)";
  return "var(--danger)";
}

function YieldCells({
  estimateKg,
  actualKg,
  variancePct,
}: {
  estimateKg: number | null;
  actualKg: number;
  variancePct: number | null;
}) {
  return (
    <>
      <td style={td}>{estimateKg == null ? "—" : formatWeightFromKg(estimateKg, REVIEW_UNIT)}</td>
      <td style={td}>{formatWeightFromKg(actualKg, REVIEW_UNIT)}</td>
      <td style={{ ...td, color: varianceColor(variancePct) }}>{fmtVariance(variancePct)}</td>
    </>
  );
}

function VintageTable({ group }: { group: VintageGroup }) {
  return (
    <Card padding="0" style={{ marginBottom: "var(--space-4)", overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
          padding: "14px 16px",
          borderBottom: "1px solid var(--border-strong)",
        }}
      >
        <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 24, margin: 0 }}>
          {group.vintageYear}
        </h2>
        <Badge tone="gold" variant="soft">
          Season total {formatWeightFromKg(group.actualKg, REVIEW_UNIT)}
        </Badge>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-strong)" }}>
            <th style={thLeft}>Block / variety</th>
            <th style={th}>Estimate</th>
            <th style={th}>Actual</th>
            <th style={th}>Variance</th>
          </tr>
        </thead>
        <tbody>
          {/* Per-block rows */}
          {group.blocks.map((b) => (
            <tr key={b.blockId} style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <td style={tdLeft}>
                {b.label}
                {b.varietyName ? (
                  <span style={{ color: "var(--text-muted)" }}> · {b.varietyName}</span>
                ) : null}
              </td>
              <YieldCells estimateKg={b.estimateKg} actualKg={b.actualKg} variancePct={b.variancePct} />
            </tr>
          ))}

          {/* Per-variety subtotals */}
          {group.varieties.length > 0 ? (
            <tr>
              <td colSpan={4} style={{ ...tdLeft, paddingTop: 14, paddingBottom: 4, color: "var(--text-muted)", fontSize: 12, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                By variety
              </td>
            </tr>
          ) : null}
          {group.varieties.map((v) => (
            <tr key={v.varietyName ?? "—"} style={{ borderTop: "1px solid var(--border-subtle)", background: "var(--surface-sunken)" }}>
              <td style={{ ...tdLeft, fontWeight: 500 }}>{v.varietyName ?? "Unassigned"}</td>
              <YieldCells estimateKg={v.estimateKg} actualKg={v.actualKg} variancePct={v.variancePct} />
            </tr>
          ))}

          {/* Season total */}
          <tr style={{ borderTop: "1.5px solid var(--border-strong)" }}>
            <td style={{ ...tdLeft, fontWeight: 600 }}>Season total</td>
            <YieldCells estimateKg={group.estimateKg} actualKg={group.actualKg} variancePct={group.variancePct} />
          </tr>
        </tbody>
      </table>
    </Card>
  );
}

export function HarvestYieldsView({ vineyards }: Props) {
  const [selectedId, setSelectedId] = React.useState<string>(vineyards[0]?.id ?? "");
  // Result/error are tagged with the vineyard id they belong to, so `pending`,
  // `groups`, and `error` are all DERIVED — no setState runs synchronously in the
  // effect (which the codebase's lint rules forbid), and a stale response for a
  // since-changed selection is simply ignored at render time.
  const [result, setResult] = React.useState<{ id: string; groups: VintageGroup[] } | null>(null);
  const [errorState, setErrorState] = React.useState<{ id: string; msg: string } | null>(null);

  React.useEffect(() => {
    if (!selectedId) return; // nothing selected (no vineyards) — render shows the empty state
    let cancelled = false;
    getVineyardHarvest(selectedId)
      .then((res) => {
        if (!cancelled) setResult({ id: selectedId, groups: res.groups });
      })
      .catch((e) => {
        if (!cancelled) {
          setErrorState({ id: selectedId, msg: e instanceof Error ? e.message : "Something went wrong." });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const groups = result?.id === selectedId ? result.groups : null;
  const error = errorState?.id === selectedId ? errorState.msg : null;
  const pending = !!selectedId && groups == null && error == null;

  return (
    <div>
      <Eyebrow rule>Admin · Harvest</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>
        Yields by vintage
      </h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 20, maxWidth: "64ch" }}>
        Historic harvest yields grouped by vintage year, with per-block and per-variety subtotals
        against the pre-harvest estimate. Weights shown in metric.
      </p>

      <label style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 360, marginBottom: 24 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Vineyard</span>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          style={selectStyle}
          disabled={vineyards.length === 0}
        >
          {vineyards.length === 0 ? <option value="">No active vineyards</option> : null}
          {vineyards.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>

      {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 16 }}>{error}</p> : null}

      {pending && groups == null ? (
        <p style={{ color: "var(--text-muted)", fontSize: 14.5 }}>Loading…</p>
      ) : groups && groups.length > 0 ? (
        <div style={{ opacity: pending ? 0.6 : 1, transition: "opacity var(--duration-fast) var(--ease-standard)" }}>
          {groups.map((g) => (
            <VintageTable key={g.vintageYear} group={g} />
          ))}
        </div>
      ) : selectedId ? (
        <Card>
          <p style={{ color: "var(--text-muted)", fontSize: 14.5, margin: 0 }}>
            No harvest records logged for this vineyard yet.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
