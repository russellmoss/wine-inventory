"use client";

import React from "react";
import { Card, Button, Eyebrow, AnalyteTrendChart } from "@/components/ui";
import { getAnalyte, toDefaultUnit, DEFAULT_TREND_ANALYTES } from "@/lib/chemistry/analytes";
import type { MolecularSO2 } from "@/lib/chemistry/so2";

// Shared, FILTERABLE analyte-trends view. Used on the lot detail AND the per-vessel analyses
// modal (/bulk). Builds one canonical-unit series per analyte from raw readings, with a
// multi-select analyte picklist (chips) so the user can show one or several at once. Each
// series renders a chart (AnalyteTrendChart) + its latest reading. An optional derived
// molecular-SO₂ card sits on top (same-panel free SO₂ + pH; never stored).

export type TrendReading = { analyte: string; value: number; unit: string; date: number }; // date = epoch ms

type Series = {
  key: string;
  label: string;
  unit: string;
  precision: number;
  points: { date: number; value: number }[];
  latest: { value: number; date: number };
};

function buildSeries(readings: TrendReading[]): Series[] {
  const byAnalyte = new Map<string, { date: number; value: number }[]>();
  for (const r of readings) {
    const v = toDefaultUnit(r.analyte, r.value, r.unit);
    if (v == null) continue; // unknown / non-convertible alt unit
    const arr = byAnalyte.get(r.analyte) ?? [];
    arr.push({ date: r.date, value: v });
    byAnalyte.set(r.analyte, arr);
  }
  return [...byAnalyte.entries()].map(([key, ptsRaw]) => {
    const def = getAnalyte(key);
    const points = ptsRaw.sort((a, b) => a.date - b.date);
    return {
      key,
      label: def?.label ?? key,
      unit: def?.defaultUnit ?? "",
      precision: def?.precision ?? 2,
      points,
      latest: points[points.length - 1],
    };
  });
}

const DEFAULT_SET = new Set<string>(DEFAULT_TREND_ANALYTES as readonly string[]);

function fmtDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function AnalyteTrends({
  readings,
  molecular,
  molecularDateLabel,
  emptyHint = "No readings yet — log a pH or SO₂ to start the trend.",
}: {
  readings: TrendReading[];
  molecular?: MolecularSO2 | null;
  molecularDateLabel?: string;
  emptyHint?: string;
}) {
  const series = React.useMemo(() => buildSeries(readings), [readings]);
  const presentKeys = series.map((s) => s.key);

  // Default selection (computed once at mount): the key analytes that have data, else all
  // present. Each surface mounts fresh per dataset — the lot page has one dataset per load,
  // and CellarActions is keyed by vessel id, so a vessel switch remounts this with new data.
  const [selected, setSelected] = React.useState<Set<string>>(() => {
    const defaults = series.filter((s) => DEFAULT_SET.has(s.key)).map((s) => s.key);
    return new Set<string>(defaults.length ? defaults : series.map((s) => s.key));
  });

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const shown = series.filter((s) => selected.has(s.key));

  return (
    <div>
      {molecular ? (
        <Card style={{ marginBottom: 16 }}>
          <Eyebrow tone="ink">Current chemistry</Eyebrow>
          <p style={{ marginTop: 10, fontSize: 15, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
            Molecular SO₂ ≈ {molecular.molecularSO2.toFixed(2)} mg/L
          </p>
          <p style={{ marginTop: 4, fontSize: 13, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
            derived from free {molecular.freeSO2} + pH {molecular.pH.toFixed(2)} · pKa {molecular.pKa}
            {molecularDateLabel ? ` · ${molecularDateLabel}` : ""}
          </p>
        </Card>
      ) : null}

      {series.length === 0 ? (
        <Card>
          <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 14 }}>{emptyHint}</p>
        </Card>
      ) : (
        <>
          {/* Multi-select analyte filter */}
          <div role="group" aria-label="Filter analytes" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14, alignItems: "center" }}>
            {series.map((s) => {
              const on = selected.has(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggle(s.key)}
                  aria-pressed={on}
                  style={{
                    minHeight: 36,
                    padding: "6px 12px",
                    borderRadius: "var(--radius-pill)",
                    border: "1px solid var(--border-strong)",
                    background: on ? "var(--accent)" : "var(--surface-sunken)",
                    color: on ? "var(--accent-on)" : "var(--text-secondary)",
                    fontFamily: "var(--font-body)",
                    fontSize: 13,
                    fontWeight: on ? 500 : 400,
                    cursor: "pointer",
                  }}
                >
                  {s.label}
                </button>
              );
            })}
            <span style={{ marginLeft: 4, display: "inline-flex", gap: 4 }}>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set(presentKeys))} style={{ minHeight: 36 }}>
                All
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} style={{ minHeight: 36 }}>
                Clear
              </Button>
            </span>
          </div>

          {shown.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: 13.5 }}>Pick an analyte above to see its trend.</p>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16 }}>
                {shown.map((s) => (
                  <Card key={s.key}>
                    <AnalyteTrendChart label={s.label} unit={s.unit} points={s.points} precision={s.precision} height={260} />
                    <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                      Latest: {s.latest.value.toFixed(s.precision)} {s.unit} · {fmtDate(s.latest.date)} ({s.points.length} reading{s.points.length === 1 ? "" : "s"})
                    </p>
                  </Card>
                ))}
              </div>
              <ReadingsTable series={shown} />
            </>
          )}
        </>
      )}
    </div>
  );
}

// A chronological raw-values table (newest first) — one row per observation date, one column
// per selected analyte (canonical unit). The values winemakers want to read straight, not
// just as a curve. Scrolls horizontally on narrow screens.
function ReadingsTable({ series }: { series: Series[] }) {
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort((a, b) => b - a);
  const valueAt = (s: Series, date: number): number | null => {
    const hits = s.points.filter((p) => p.date === date);
    return hits.length ? hits[hits.length - 1].value : null;
  };
  const th: React.CSSProperties = { padding: "8px 10px", textAlign: "left", fontWeight: 500, color: "var(--text-muted)", fontSize: 12.5, whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "8px 10px", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  return (
    <div style={{ marginTop: 18 }}>
      <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 18, margin: "0 0 8px" }}>Readings</h3>
      <Card padding="0">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-strong)" }}>
                <th style={th}>Date</th>
                {series.map((s) => (
                  <th key={s.key} style={{ ...th, textAlign: "right" }}>
                    {s.label} <span style={{ color: "var(--text-muted)" }}>({s.unit})</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.map((d) => (
                <tr key={d} style={{ borderTop: "1px solid var(--border-strong)" }}>
                  <td style={{ ...td, color: "var(--text-secondary)" }}>{fmtDate(d)}</td>
                  {series.map((s) => {
                    const v = valueAt(s, d);
                    return (
                      <td key={s.key} style={{ ...td, textAlign: "right", color: v == null ? "var(--text-muted)" : "var(--text-primary)" }}>
                        {v == null ? "—" : v.toFixed(s.precision)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
