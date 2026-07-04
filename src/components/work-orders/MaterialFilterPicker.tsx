"use client";

import React from "react";
import { categoryOf, builtinSubLabel, type MaterialCategory } from "@/lib/cellar/material-taxonomy";
import { rankMaterials } from "@/lib/inventory/material-search";

// Phase 034: single-select material picker for the work-order additions flow. Replaces a flat <select>
// with (1) FAMILY FILTER BUTTONS (the material KIND family — Yeast, Fining, Nutrient, Acid, Tannin… —
// same pill UX as the vessel Tanks/Barrels filter) and (2) FUZZY search. Chips are the kind FAMILY, not the
// per-material custom subcategory (Egg White / Isinglass / Gelatin are all one "Fining" chip; find the
// specific product via search). Scoped to one main category (default ADDITIVE) so the dose picker only
// shows additives, not cleaning/packaging. Pure client, design-token styled, no new deps.

export type MaterialPickerOption = {
  id: string;
  label: string;
  unit?: string | null;
  kind?: string | null;
  /** STORED main category — the scope authority (matches the server WORKORDER-3 guard). Falls back to
   * categoryOf(kind) so a custom cleaning/packaging family is scoped out, not just built-in kinds. */
  category?: string | null;
  subcategory?: string | null;
  onHand?: number | null;
};

const ALL = "__all__";

const box: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface)" };
const filterBtn = (active: boolean): React.CSSProperties => ({ fontSize: 12, padding: "3px 10px", borderRadius: 999, cursor: "pointer", border: "1px solid var(--border)", background: active ? "var(--wine-primary)" : "transparent", color: active ? "var(--surface-raised)" : "var(--text-secondary)" });
const rowStyle = (active: boolean): React.CSSProperties => ({ display: "flex", alignItems: "center", gap: 8, fontSize: 14, padding: "7px 8px", cursor: "pointer", minHeight: 36, borderRadius: "var(--radius-sm)", background: active ? "var(--surface-raised)" : "transparent", borderLeft: `3px solid ${active ? "var(--wine-primary)" : "transparent"}`, borderTop: "none", borderRight: "none", borderBottom: "none", fontWeight: active ? 600 : 400, textAlign: "left", width: "100%" });

const fmtOnHand = (o: MaterialPickerOption) => (o.onHand == null ? "" : `${Number(o.onHand).toLocaleString()}${o.unit ? ` ${o.unit}` : ""} on hand`);

export function MaterialFilterPicker({
  options,
  value,
  onChange,
  categoryScope,
  placeholder = "Search materials…",
}: {
  options: MaterialPickerOption[];
  value: string;
  onChange: (id: string) => void;
  /** Allowed main categories (derived from kind). Omit to show all. Additions pass Additive+Other;
   * cleaning tasks pass Cleaning+Other — this keeps cleaning/packaging noise out of the dose picker
   * without hiding a generic/uncategorized additive. */
  categoryScope?: MaterialCategory | MaterialCategory[];
  placeholder?: string;
}) {
  const [q, setQ] = React.useState("");
  const [family, setFamily] = React.useState<string>(ALL);

  // Restrict to the scoped main categories, reading the STORED category (fallback categoryOf(kind)) so a
  // custom cleaning/packaging family is scoped out here exactly as the server guard blocks it.
  const scoped = React.useMemo(() => {
    if (!categoryScope) return options;
    const allowed = new Set(Array.isArray(categoryScope) ? categoryScope : [categoryScope]);
    return options.filter((o) => allowed.has((o.category as MaterialCategory) ?? categoryOf(o.kind)));
  }, [options, categoryScope]);

  // Distinct KIND families present in scope → the filter chips (Yeast, Fining, Nutrient…). The custom
  // per-material subcategory is intentionally NOT a chip (too granular); the fuzzy search finds specifics.
  const families = React.useMemo(() => {
    const set = new Set<string>();
    for (const o of scoped) set.add(builtinSubLabel(o.kind));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [scoped]);

  // If the selected family is no longer present (options changed), fall back to ALL — derived at render
  // time so no effect/setState is needed (avoids cascading renders).
  const activeFamily = family !== ALL && families.includes(family) ? family : ALL;

  const byFamily = activeFamily === ALL ? scoped : scoped.filter((o) => builtinSubLabel(o.kind) === activeFamily);
  const filtered = rankMaterials(q, byFamily, (o) => o.label);
  const selected = options.find((o) => o.id === value) ?? null;

  return (
    <div style={{ ...box, padding: 8 }}>
      {/* Current selection */}
      {selected ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 14 }}>
          <span style={{ fontWeight: 600 }}>{selected.label}</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{builtinSubLabel(selected.kind)}</span>
          <button type="button" aria-label="Clear selection" onClick={() => onChange("")} style={{ marginLeft: "auto", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontSize: 12, borderRadius: 999, padding: "2px 10px" }}>Change</button>
        </div>
      ) : null}

      <input
        type="text"
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ width: "100%", fontSize: 14, padding: "6px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface-raised)", marginBottom: 8 }}
      />

      {families.length > 1 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          <button type="button" style={filterBtn(activeFamily === ALL)} onClick={() => setFamily(ALL)}>All</button>
          {families.map((f) => (
            <button key={f} type="button" style={filterBtn(activeFamily === f)} onClick={() => setFamily(f)}>{f}</button>
          ))}
        </div>
      ) : null}

      <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {filtered.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 4px" }}>No matching materials.</div>
        ) : (
          filtered.map((o) => (
            <button key={o.id} type="button" style={rowStyle(o.id === value)} onClick={() => onChange(o.id)}>
              <span>{o.label}</span>
              {activeFamily === ALL ? <span style={{ fontSize: 12, color: "var(--text-muted)" }}>· {builtinSubLabel(o.kind)}</span> : null}
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" }}>{fmtOnHand(o)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
