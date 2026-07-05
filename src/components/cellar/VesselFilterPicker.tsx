"use client";

import React from "react";
import { rankMaterials } from "@/lib/inventory/material-search";

// Searchable, Tank/Barrel-filterable SINGLE-select vessel picker for the /bulk cellar action forms
// (rack destination, topping source). Mirrors MaterialFilterPicker: current-selection summary + a
// fuzzy search input + an All/Tanks/Barrels chip row + a scrollable list of buttons. Reuses the
// generic rankMaterials ranker over the vessel label. Pure client, design-token styled, no new deps.

export type VesselPickerOption = {
  id: string;
  label: string;
  type: "TANK" | "BARREL";
  totalL: number;
  lotCodes?: string[];
};

type KindFilter = "ALL" | "TANK" | "BARREL";

const box: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface)" };
const filterBtn = (active: boolean): React.CSSProperties => ({ fontSize: 12, padding: "3px 10px", borderRadius: 999, cursor: "pointer", border: "1px solid var(--border)", background: active ? "var(--wine-primary)" : "transparent", color: active ? "var(--surface-raised)" : "var(--text-secondary)" });
const rowStyle = (active: boolean): React.CSSProperties => ({ display: "flex", alignItems: "center", gap: 8, fontSize: 14, padding: "8px 8px", cursor: "pointer", minHeight: 44, borderRadius: "var(--radius-sm)", background: active ? "var(--surface-raised)" : "transparent", borderLeft: `3px solid ${active ? "var(--wine-primary)" : "transparent"}`, borderTop: "none", borderRight: "none", borderBottom: "none", fontWeight: active ? 600 : 400, textAlign: "left", width: "100%" });

export function VesselFilterPicker({
  options,
  value,
  onChange,
  placeholder = "Search vessels…",
  ariaLabel = "Vessel",
  emptyHint = "No matching vessels.",
}: {
  options: VesselPickerOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  emptyHint?: string;
}) {
  const [q, setQ] = React.useState("");
  const [kind, setKind] = React.useState<KindFilter>("ALL");

  const byKind = kind === "ALL" ? options : options.filter((o) => o.type === kind);
  const filtered = rankMaterials(q, byKind, (o) => o.label);
  const selected = options.find((o) => o.id === value) ?? null;

  return (
    <div style={{ ...box, padding: 8, flex: "1 1 260px", minWidth: 220 }} aria-label={ariaLabel}>
      {/* Current selection */}
      {selected ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 14 }}>
          <span style={{ fontWeight: 600 }}>{selected.label}</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{selected.totalL} L</span>
          <button type="button" aria-label="Clear selection" onClick={() => onChange("")} style={{ marginLeft: "auto", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontSize: 12, borderRadius: 999, padding: "2px 10px" }}>Change</button>
        </div>
      ) : null}

      <input
        type="text"
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label={placeholder}
        style={{ width: "100%", fontSize: 14, padding: "6px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface-raised)", marginBottom: 8 }}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
        <button type="button" style={filterBtn(kind === "ALL")} onClick={() => setKind("ALL")}>All</button>
        <button type="button" style={filterBtn(kind === "TANK")} onClick={() => setKind("TANK")}>Tanks</button>
        <button type="button" style={filterBtn(kind === "BARREL")} onClick={() => setKind("BARREL")}>Barrels</button>
      </div>

      <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {filtered.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 4px" }}>{emptyHint}</div>
        ) : (
          filtered.map((o) => (
            <button key={o.id} type="button" style={rowStyle(o.id === value)} onClick={() => onChange(o.id)}>
              <span>{o.label} ({o.totalL} L)</span>
              {o.lotCodes && o.lotCodes.length > 0 ? (
                <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" }}>· holds {o.lotCodes.join(", ")}</span>
              ) : null}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
