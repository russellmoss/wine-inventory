"use client";

import React from "react";

// A compact map layer-stack control: per-layer visibility toggle + up/down reordering. Rows are shown
// TOP-of-map first (like image-editor layers). Pure presentation — the parent owns the layer state and
// resolves the ordered overlays for the map. Used on the NDVI map to stack NDVI + soil.

export type LayerRow = {
  id: string;
  label: string;
  visible: boolean;
  available: boolean; // false → shown greyed with a note, toggle disabled
  swatch?: string; // optional color chip
  note?: string;
};

export function MapLayerControl({
  layers,
  onToggle,
  onMove,
  title = "Layers",
}: {
  layers: LayerRow[];
  onToggle: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  title?: string;
}) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", background: "var(--surface-raised)", minWidth: 210 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {layers.map((l, i) => (
          <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", color: l.available ? undefined : "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={l.visible && l.available}
              disabled={!l.available}
              onChange={() => onToggle(l.id)}
              aria-label={`Toggle ${l.label} layer`}
            />
            {l.swatch ? <span aria-hidden style={{ width: 11, height: 11, borderRadius: 3, background: l.swatch, border: "1px solid var(--border-subtle)", flex: "0 0 auto" }} /> : null}
            <span style={{ flex: 1, fontSize: 13, color: "var(--text-primary)" }}>
              {l.label}
              {l.note ? <span style={{ color: "var(--text-muted)", fontSize: 11.5 }}> · {l.note}</span> : null}
            </span>
            <button
              type="button"
              onClick={() => onMove(l.id, -1)}
              disabled={i === 0}
              aria-label={`Move ${l.label} up`}
              title="Move up"
              style={arrowBtn(i === 0)}
            >
              ▲
            </button>
            <button
              type="button"
              onClick={() => onMove(l.id, 1)}
              disabled={i === layers.length - 1}
              aria-label={`Move ${l.label} down`}
              title="Move down"
              style={arrowBtn(i === layers.length - 1)}
            >
              ▼
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function arrowBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "1px 6px",
    fontSize: 11,
    lineHeight: 1.4,
    borderRadius: 5,
    border: "1px solid var(--border)",
    background: "transparent",
    color: disabled ? "var(--text-muted)" : "var(--text-secondary)",
    cursor: disabled ? "default" : "pointer",
  };
}
