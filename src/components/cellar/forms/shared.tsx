"use client";

import React from "react";

// Shared primitives + types for the extracted cellar action sub-forms. Behavior-preserving
// extraction from CellarActions.tsx (Phase 3, Unit 9 → plan 045 Unit 5) so BOTH the /bulk popover
// AND the vessel-workspace Actions tab can import the same forms. Token-driven, light-only,
// sentence-case; ≥44px targets; inputMode="decimal" + aria-live math preserved verbatim.

export type ResidentLot = { lotId: string; code: string; varietyName: string | null };
export type CellarActionsVessel = {
  id: string;
  code: string;
  type: "BARREL" | "TANK";
  capacityL: number;
  totalL: number;
  /** Lots currently resident in this vessel — drives the D2 lot picker for chemistry records. */
  residentLots: ResidentLot[];
};
export type KegOption = { id: string; label: string; type: "BARREL" | "TANK"; totalL: number; lotCodes?: string[] };

export const fieldStyle: React.CSSProperties = {
  height: 44,
  padding: "0 10px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  color: "var(--text-primary)",
};

export function FormShell({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{children}</div>;
}

/** Column layout for the record forms (ReadingRows + fields stack vertically). */
export function ColumnShell({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>{children}</div>;
}

// ── Submit callback contracts (owned by the host; a form only knows its shape) ──

export type OpSubmit = (fn: () => Promise<{ operationId: number }>, label: string) => void;
export type RecordSubmit = (fn: () => Promise<{ undo: () => Promise<unknown> }>, label: string) => void;

/** A stable idempotency key per form mount (a double-submit/retry is a server no-op). */
export function useRequestId(): string {
  return React.useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
  )[0];
}

/** D2 lot picker: auto for 1 resident (static label), required select for >1, message when empty. */
export function LotField({ residentLots, value, onChange }: { residentLots: ResidentLot[]; value: string; onChange: (v: string) => void }) {
  if (residentLots.length === 0) {
    return <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>This vessel is empty — nothing to record against.</p>;
  }
  if (residentLots.length === 1) {
    const l = residentLots[0];
    return (
      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
        Lot: <strong style={{ color: "var(--text-primary)" }}>{l.code}</strong>
        {l.varietyName ? ` · ${l.varietyName}` : ""}
      </div>
    );
  }
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...fieldStyle, flex: "1 1 220px" }} aria-label="Lot" required>
      <option value="" disabled>
        This vessel holds {residentLots.length} lots — pick one…
      </option>
      {residentLots.map((l) => (
        <option key={l.lotId} value={l.lotId}>
          {l.code}
          {l.varietyName ? ` · ${l.varietyName}` : ""}
        </option>
      ))}
    </select>
  );
}

export function useLotPick(vessel: CellarActionsVessel) {
  const [lotId, setLotId] = React.useState(vessel.residentLots.length === 1 ? vessel.residentLots[0].lotId : "");
  const ready = vessel.residentLots.length > 0 && (vessel.residentLots.length === 1 || !!lotId);
  return { lotId, setLotId, ready };
}

export const READINESS_OPTIONS: { value: string; label: string }[] = [
  { value: "NEEDS_MORE_TIME", label: "Needs more time" },
  { value: "READY_TO_BLEND", label: "Ready to blend" },
  { value: "READY_TO_BOTTLE", label: "Ready to bottle" },
  { value: "HOLD", label: "Hold" },
  { value: "DECLINING", label: "Declining" },
];

export function Segmented({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 13, color: "var(--text-muted)", minWidth: 64 }}>{label}</span>
      <div style={{ display: "flex", gap: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(on ? null : n)}
              aria-pressed={on}
              aria-label={`${label} ${n} of 5`}
              style={{
                minWidth: 44,
                minHeight: 44,
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-strong)",
                background: on ? "var(--accent)" : "var(--surface-raised)",
                color: on ? "var(--accent-on)" : "var(--text-primary)",
                cursor: "pointer",
                fontFamily: "var(--font-body)",
                fontSize: 14,
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}
