"use client";

import React from "react";
import { Button } from "@/components/ui";
import { ANALYTES, ANALYTE_CATEGORIES, getAnalyte, type AnalyteCategory } from "@/lib/chemistry/analytes";
import { molecularSO2 } from "@/lib/chemistry/so2";

// Shared analyte reading-rows sub-form (Phase 4, addendum item 9). Consumed by the vessel-first
// AnalysisForm (CellarActions) AND the /samples attach-results surface — extract-once so both
// capture paths validate + render identically. Controlled: the parent owns the rows. Renders a
// live molecular-SO₂ read when free SO₂ + pH are both entered in this panel (same-panel only).

export type ReadingRow = { analyte: string; value: string; unit: string };

const CATEGORY_LABELS: Record<AnalyteCategory, string> = {
  acidity: "Acidity",
  so2: "SO₂",
  sugar: "Sugar",
  temperature: "Temperature",
  alcohol: "Alcohol",
  other: "Other",
};

const fieldStyle: React.CSSProperties = {
  height: 44,
  padding: "0 10px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  color: "var(--text-primary)",
};

export function emptyReadingRow(analyte = "PH"): ReadingRow {
  return { analyte, value: "", unit: getAnalyte(analyte)?.defaultUnit ?? "" };
}

/** Parse the rows into validated-shape inputs (numeric value, non-blank), for the action call. */
export function toReadingInputs(rows: ReadingRow[]): { analyte: string; value: number; unit: string }[] {
  return rows
    .filter((r) => r.analyte && r.value.trim() !== "")
    .map((r) => ({ analyte: r.analyte, value: Number(r.value), unit: r.unit || getAnalyte(r.analyte)?.defaultUnit || "" }));
}

/** True when every non-blank row parses to a finite number. */
export function readingsValid(rows: ReadingRow[]): boolean {
  const filled = rows.filter((r) => r.value.trim() !== "");
  return filled.length > 0 && filled.every((r) => Number.isFinite(Number(r.value)));
}

function num(rows: ReadingRow[], analyte: string): number | null {
  const r = rows.find((x) => x.analyte === analyte);
  if (!r || r.value.trim() === "") return null;
  const n = Number(r.value);
  return Number.isFinite(n) ? n : null;
}

export function ReadingRows({
  rows,
  onChange,
  showMolecular = true,
}: {
  rows: ReadingRow[];
  onChange: (rows: ReadingRow[]) => void;
  showMolecular?: boolean;
}) {
  const groups = ANALYTE_CATEGORIES.map((cat) => ({
    cat,
    items: Object.values(ANALYTES).filter((a) => a.category === cat && !a.deprecated),
  })).filter((g) => g.items.length > 0);

  function setRow(i: number, patch: Partial<ReadingRow>) {
    const next = rows.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }
  function onAnalyteChange(i: number, analyte: string) {
    setRow(i, { analyte, unit: getAnalyte(analyte)?.defaultUnit ?? "" });
  }
  function addRow() {
    // Default a second row to free SO₂ so the SO₂ + pH molecular pairing is one tap away.
    const used = new Set(rows.map((r) => r.analyte));
    const next = !used.has("FREE_SO2") ? "FREE_SO2" : !used.has("TA") ? "TA" : "PH";
    onChange([...rows, emptyReadingRow(next)]);
  }
  function removeRow(i: number) {
    onChange(rows.filter((_, j) => j !== i));
  }

  const free = num(rows, "FREE_SO2");
  const pH = num(rows, "PH");
  const mol = showMolecular ? molecularSO2({ freeSO2: free, pH }) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((row, i) => {
        const def = getAnalyte(row.analyte);
        const units = def?.units ?? [];
        return (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={row.analyte}
              onChange={(e) => onAnalyteChange(i, e.target.value)}
              style={{ ...fieldStyle, flex: "1 1 160px" }}
              aria-label="Analyte"
            >
              {groups.map((g) => (
                <optgroup key={g.cat} label={CATEGORY_LABELS[g.cat]}>
                  {g.items.map((a) => (
                    <option key={a.key} value={a.key}>
                      {a.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <input
              value={row.value}
              onChange={(e) => setRow(i, { value: e.target.value })}
              inputMode="decimal"
              placeholder="Value"
              style={{ ...fieldStyle, width: 96 }}
              aria-label={`${def?.label ?? row.analyte} value`}
            />
            {units.length > 1 ? (
              <select value={row.unit} onChange={(e) => setRow(i, { unit: e.target.value })} style={{ ...fieldStyle, width: 130 }} aria-label="Unit">
                {units.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            ) : (
              <span style={{ fontSize: 13, color: "var(--text-muted)", minWidth: 60 }}>{row.unit}</span>
            )}
            {rows.length > 1 ? (
              <Button variant="ghost" size="sm" onClick={() => removeRow(i)} style={{ minHeight: 44 }} aria-label="Remove reading">
                ×
              </Button>
            ) : null}
          </div>
        );
      })}

      <div>
        <Button variant="secondary" size="sm" onClick={addRow} style={{ minHeight: 44 }}>
          Add another analyte
        </Button>
      </div>

      {showMolecular ? (
        <div
          aria-live="polite"
          style={{ fontSize: 13, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums", minHeight: 18 }}
        >
          {mol
            ? `Molecular SO₂ ≈ ${mol.molecularSO2.toFixed(2)} mg/L · from free ${mol.freeSO2} + pH ${mol.pH.toFixed(2)} · pKa ${mol.pKa}`
            : ""}
        </div>
      ) : null}
    </div>
  );
}
