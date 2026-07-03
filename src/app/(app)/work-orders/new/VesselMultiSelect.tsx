"use client";

import React from "react";

// Phase 9.1: a searchable, tank/barrel-filterable MULTI-select for vessels on the new-WO form. Selecting
// several vessels fans out to one task per vessel at submit. Pure client component (fuzzy substring search
// + a kind filter + checkboxes); no new deps.

export type VesselOption = { id: string; label: string; kind?: string | null; volumeL?: number | null };

const fmtVol = (v?: number | null) => (v && v > 0 ? `${Number(v).toLocaleString()} L` : "empty");

const box: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface)" };
const chip: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, padding: "2px 8px", borderRadius: 999, background: "var(--wine-primary)", color: "var(--surface-raised)" };
const filterBtn = (active: boolean): React.CSSProperties => ({ fontSize: 12, padding: "3px 10px", borderRadius: 999, cursor: "pointer", border: "1px solid var(--border)", background: active ? "var(--wine-primary)" : "transparent", color: active ? "var(--surface-raised)" : "var(--text-secondary)" });

export function VesselMultiSelect({
  options,
  value,
  onChange,
  // Shown under the list when >1 is selected. Defaults to the new-WO fan-out note; pass null in filter contexts.
  multiHint = "one task will be created per vessel.",
}: {
  options: VesselOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  multiHint?: string | null;
}) {
  const [q, setQ] = React.useState("");
  const [kind, setKind] = React.useState<"ALL" | "TANK" | "BARREL">("ALL");

  const filtered = options.filter((o) => {
    if (kind === "TANK" && o.kind !== "TANK") return false;
    if (kind === "BARREL" && o.kind !== "BARREL") return false;
    const needle = q.trim().toLowerCase();
    return !needle || o.label.toLowerCase().includes(needle);
  });
  const selected = new Set(value);
  const toggle = (id: string) => onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);
  const byId = new Map(options.map((o) => [o.id, o]));

  return (
    <div style={{ ...box, padding: 8 }}>
      {/* Selected chips */}
      {value.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {value.map((id) => (
            <span key={id} style={chip}>
              {byId.get(id)?.label ?? id}
              <button type="button" aria-label="Remove" onClick={() => toggle(id)} style={{ border: "none", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <input
          type="text"
          placeholder="Search vessels…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, fontSize: 14, padding: "6px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface-raised)" }}
        />
        <div style={{ display: "flex", gap: 4 }}>
          <button type="button" style={filterBtn(kind === "ALL")} onClick={() => setKind("ALL")}>All</button>
          <button type="button" style={filterBtn(kind === "TANK")} onClick={() => setKind("TANK")}>Tanks</button>
          <button type="button" style={filterBtn(kind === "BARREL")} onClick={() => setKind("BARREL")}>Barrels</button>
        </div>
      </div>

      <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {filtered.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 4px" }}>No matching vessels.</div>
        ) : (
          filtered.map((o) => (
            <label key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, padding: "5px 4px", cursor: "pointer", minHeight: 32 }}>
              <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} style={{ width: 16, height: 16 }} />
              <span>{o.label}</span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" }}>{fmtVol(o.volumeL)}</span>
            </label>
          ))
        )}
      </div>
      {value.length > 1 && multiHint ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>{value.length} vessels — {multiHint}</div>
      ) : null}
    </div>
  );
}
