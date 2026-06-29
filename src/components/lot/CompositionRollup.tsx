"use client";

import { Eyebrow } from "@/components/ui";
import type { CompositionRollup as Rollup, RollupSlice } from "@/lib/lot/lineage";

// "What's in this wine" — the flat composition rollup (the DEFAULT lineage view). Weighted %
// by variety / vineyard / vintage from the lineage fractions. Token-styled bars (no new
// palette). A vintage-eligibility note surfaces the TTB threshold winemakers blend toward.

function Bars({ title, slices }: { title: string; slices: RollupSlice[] }) {
  if (slices.length === 0) return null;
  return (
    <div style={{ flex: "1 1 180px", minWidth: 160 }}>
      <div
        style={{
          fontSize: 11.5,
          color: "var(--text-muted)",
          marginBottom: 8,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {slices.map((s) => (
          <div key={s.key}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text-primary)" }}>
              <span>{s.label}</span>
              <span style={{ color: "var(--text-secondary)" }}>{s.pct}%</span>
            </div>
            <div
              style={{
                height: 6,
                background: "var(--surface-sunken)",
                borderRadius: "var(--radius-pill)",
                overflow: "hidden",
                marginTop: 3,
              }}
            >
              <div style={{ width: `${Math.min(100, s.pct)}%`, height: "100%", background: "var(--accent)" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CompositionRollup({ rollup }: { rollup: Rollup }) {
  const empty = !rollup.byVariety.length && !rollup.byVineyard.length && !rollup.byVintage.length;
  if (empty) return null;

  // Vintage-eligibility flag (council S7): TTB needs ≥95% (AVA) / ≥85% (state) from one year.
  const topVintage = rollup.byVintage[0];
  const eligibility =
    topVintage != null
      ? topVintage.pct >= 85
        ? `${topVintage.label} eligible (${topVintage.pct}%)`
        : `No single-vintage eligibility (top year ${topVintage.label} at ${topVintage.pct}%)`
      : null;

  return (
    <div>
      <Eyebrow rule>Composition</Eyebrow>
      {!rollup.complete ? (
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 6 }}>
          Approximate — some parent provenance is incomplete.
        </p>
      ) : null}
      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginTop: 12 }}>
        <Bars title="Variety" slices={rollup.byVariety} />
        <Bars title="Vineyard" slices={rollup.byVineyard} />
        <Bars title="Vintage" slices={rollup.byVintage} />
      </div>
      {eligibility ? (
        <p style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 14 }}>{eligibility}</p>
      ) : null}
    </div>
  );
}
