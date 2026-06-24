"use client";

import React from "react";
import { Badge } from "@/components/ui";
import {
  blockArea,
  formatArea,
  formatSpacing,
  vinesPerRow,
  spacingUnitLabel,
  type Unit,
} from "@/lib/vineyard/units";
import type { SerializedBlock } from "@/lib/vineyard/data";

function ReadField({ label, value }: { label: string; value: React.ReactNode }) {
  const empty = value == null || value === "";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ fontSize: 14.5, color: empty ? "var(--text-muted)" : "var(--text-primary)" }}>
        {empty ? "—" : value}
      </span>
    </div>
  );
}

/**
 * Read-only summary of every block field. Shared by the vineyard summary view
 * and the Setup editor so a block always reads the same way. The color picker
 * is intentionally omitted (it's an edit-only control).
 */
export function BlockDetails({ block, unit }: { block: SerializedBlock; unit: Unit }) {
  const spLabel = spacingUnitLabel(unit);
  const area = blockArea(block.rowSpacingM, block.vineSpacingM, block.vineCount, unit);
  const vpr = vinesPerRow(block.vineCount, block.numRows);
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <ReadField label="Block #" value={block.blockLabel} />
        <ReadField label="# of rows" value={block.numRows} />
        <ReadField label={`Row spacing (${spLabel})`} value={block.rowSpacingM != null ? formatSpacing(block.rowSpacingM, unit) : null} />
        <ReadField label={`Vine spacing (${spLabel})`} value={block.vineSpacingM != null ? formatSpacing(block.vineSpacingM, unit) : null} />
        <ReadField label="Variety" value={block.variety?.name} />
        <ReadField label="Clone" value={block.clone} />
        <ReadField label="Rootstock" value={block.rootstock} />
        <ReadField label="# of vines" value={block.vineCount} />
        <ReadField label="Year planted" value={block.yearPlanted} />
        <ReadField label="Irrigation" value={block.irrigated == null ? null : block.irrigated ? "Yes" : "No"} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13.5 }}>
          Planted area (spacing-based):{" "}
          <strong style={{ fontVariantNumeric: "tabular-nums" }}>
            {area != null ? formatArea(area, unit) : "—"}
          </strong>
        </span>
        {vpr != null ? (
          <Badge tone="neutral" variant="soft">
            ~{Math.round(vpr)} vines/row
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
