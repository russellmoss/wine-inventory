"use client";

import React from "react";
import { MaterialFilterPicker, type MaterialPickerOption } from "@/components/work-orders/MaterialFilterPicker";
import { type PackagingPlanLine, guessPackagingFactor, theoreticalConsumption } from "@/lib/bottling/packaging-bom";

// Plan 056 (Unit 6) — the PLANNED packaging bill-of-materials editor on a BOTTLE work-order task. The
// winemaker picks dry goods (glass/cork/capsule/label/case) and a per-bottle/per-case FACTOR (auto-filled
// from the material — a factor is rarely typed, council D1 + design-review). A "planned bottles" figure
// sizes the advisory reservation and prefills the run; each line's planned qty (eaches) is derived, never
// hand-counted. Design tokens only, ≥44px targets, integer numeric inputs.

const box: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface)", padding: 12 };
const lbl: React.CSSProperties = { fontSize: 13, color: "var(--text-muted)", display: "block", marginBottom: 4 };
const numInput: React.CSSProperties = { fontSize: 15, padding: "10px 10px", minHeight: 44, borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface-raised)", width: "100%" };
const chip: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface-raised)" };
const smallBtn: React.CSSProperties = { border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontSize: 12, borderRadius: 999, padding: "4px 12px", minHeight: 32 };

export function PackagingBoMEditor({
  options,
  lines,
  bottles,
  onChange,
}: {
  options: MaterialPickerOption[];
  lines: PackagingPlanLine[];
  bottles: number;
  onChange: (lines: PackagingPlanLine[], bottles: number) => void;
}) {
  const optById = React.useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

  // Recompute every line's derived planned qty from the current planned-bottles figure, then emit.
  const emit = (nextLines: PackagingPlanLine[], nextBottles: number) => {
    const withQty = nextLines.map((l) => ({ ...l, qty: theoreticalConsumption(l, nextBottles) }));
    onChange(withQty, nextBottles);
  };

  const setBottles = (n: number) => emit(lines, n);
  const addLine = () => emit([...lines, { materialId: "", per: "bottle", factor: 1 }], bottles);
  const removeLine = (i: number) => emit(lines.filter((_, idx) => idx !== i), bottles);
  const patchLine = (i: number, patch: Partial<PackagingPlanLine>) =>
    emit(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)), bottles);

  const pickMaterial = (i: number, id: string) => {
    const opt = id ? optById.get(id) : undefined;
    // Auto-fill per/factor from the picked material (design-review: a factor is rarely typed).
    const guess = opt ? guessPackagingFactor(opt.label, opt.kind) : { per: "bottle" as const, factor: 1 };
    patchLine(i, { materialId: id, per: guess.per, factor: guess.factor });
  };

  return (
    <div style={{ gridColumn: "1 / -1", ...box }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Packaging (dry goods)</div>
      <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 10 }}>
        Pick the glass, cork, capsule, labels and case boxes. Quantities are derived from the bottle count × a per-bottle or per-case factor — you only adjust for breakage at completion.
      </div>

      <label style={{ ...lbl, maxWidth: 260 }}>Planned bottles (sizes the reservation)
        <input
          type="number" inputMode="numeric" step="1" min="0"
          value={bottles > 0 ? String(bottles) : ""}
          onChange={(e) => setBottles(e.target.value === "" ? 0 : Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          placeholder="e.g. 1200"
          style={numInput}
        />
      </label>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        {lines.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No packaging lines yet.</div>
        ) : null}
        {lines.map((line, i) => {
          const opt = line.materialId ? optById.get(line.materialId) : undefined;
          const derived = theoreticalConsumption(line, bottles);
          if (!line.materialId || !opt) {
            // Row without a material yet → show the picker.
            return (
              <div key={i} style={box}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Packaging item {i + 1}</span>
                  <button type="button" style={smallBtn} onClick={() => removeLine(i)}>Remove</button>
                </div>
                <MaterialFilterPicker options={options} value={line.materialId} onChange={(id) => pickMaterial(i, id)} categoryScope={["PACKAGING", "OTHER"]} placeholder="Search packaging…" />
              </div>
            );
          }
          return (
            <div key={i} style={chip}>
              <span style={{ fontWeight: 600, fontSize: 14, flex: "1 1 160px", minWidth: 0 }}>
                {opt.label}
                {opt.onHand != null ? <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: 12 }}> · {Number(opt.onHand).toLocaleString()}{opt.unit ? ` ${opt.unit}` : ""} on hand</span> : null}
              </span>
              <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
                per{" "}
                <select value={line.per} onChange={(e) => patchLine(i, { per: e.target.value === "case" ? "case" : "bottle" })} style={{ fontSize: 14, padding: "6px 8px", minHeight: 40, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)" }}>
                  <option value="bottle">bottle</option>
                  <option value="case">case</option>
                </select>
              </label>
              <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
                ×{" "}
                <input type="number" inputMode="decimal" step="any" min="0" value={String(line.factor)} onChange={(e) => patchLine(i, { factor: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 68, fontSize: 14, padding: "6px 8px", minHeight: 40, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)" }} />
              </label>
              <span style={{ fontSize: 12.5, color: "var(--text-muted)", minWidth: 90 }}>
                ≈ {derived.toLocaleString()}{opt.unit ? ` ${opt.unit}` : " ea"}
              </span>
              <button type="button" style={smallBtn} onClick={() => removeLine(i)}>Remove</button>
            </div>
          );
        })}
      </div>

      <button type="button" onClick={addLine} style={{ ...smallBtn, marginTop: 12, minHeight: 40, padding: "8px 14px", color: "var(--wine-primary)", borderColor: "var(--wine-primary)" }}>
        + Add packaging line
      </button>
    </div>
  );
}
