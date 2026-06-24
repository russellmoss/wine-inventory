"use client";

import React from "react";
import { effectiveColor } from "@/lib/vineyard/colors";
import { blockArea, formatArea, type Unit } from "@/lib/vineyard/units";

type LegendBlock = {
  varietyId: string | null;
  variety: { id: string; name: string; color: string | null } | null;
  rowSpacingM: number | null;
  vineSpacingM: number | null;
  vineCount: number | null;
};

export interface MapLegendProps {
  blocks: LegendBlock[];
  unit: Unit;
}

/**
 * Labeled, colorblind-safe key: one row per planted variety with its color
 * swatch, NAME, and total planted area (spacing-based) in the active unit.
 * A text list, not decorative circles — it doubles as the legend for the map.
 */
export function MapLegend({ blocks, unit }: MapLegendProps) {
  const entries = React.useMemo(() => {
    const byVariety = new Map<
      string,
      { name: string; color: string; area: number; hasArea: boolean }
    >();
    for (const b of blocks) {
      const key = b.varietyId ?? "__none__";
      const name = b.variety?.name ?? "Unassigned";
      const color = effectiveColor({ varietyColor: b.variety?.color, varietyId: b.varietyId });
      const area = blockArea(b.rowSpacingM, b.vineSpacingM, b.vineCount, unit);
      const cur = byVariety.get(key) ?? { name, color, area: 0, hasArea: false };
      if (area != null) {
        cur.area += area;
        cur.hasArea = true;
      }
      byVariety.set(key, cur);
    }
    return [...byVariety.values()].sort((a, b) => b.area - a.area || a.name.localeCompare(b.name));
  }, [blocks, unit]);

  if (entries.length === 0) {
    return (
      <p style={{ color: "var(--text-muted)", fontSize: 13.5, margin: 0 }}>
        No varieties planted yet.
      </p>
    );
  }

  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexWrap: "wrap",
        gap: "8px 20px",
      }}
    >
      {entries.map((e) => (
        <li
          key={e.name}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5 }}
        >
          <span
            aria-hidden
            style={{
              width: 14,
              height: 14,
              borderRadius: "var(--radius-xs)",
              background: e.color,
              border: "1px solid var(--border-subtle)",
              flex: "0 0 auto",
            }}
          />
          <span style={{ color: "var(--text-primary)" }}>{e.name}</span>
          <span style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
            {e.hasArea ? formatArea(e.area, unit) : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}
