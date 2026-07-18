"use client";

import { useState } from "react";
import { Modal, Button, Input } from "@/components/ui";
import { convert, canonicalUnitFor, type MeasureDimension } from "@/lib/units/measure";
import { createCustomUnitAction } from "@/lib/units/actions";
import type { CustomUnitRow } from "@/lib/units/custom-unit-core";

// Plan 075: create a user-defined unit inline. The user names it, picks what it measures (weight/volume/count),
// and says how big one is in a familiar reference unit. We convert that to the engine's canonical `perCanonical`
// (g / mL / base-count) via the SAME convert() the cost engine uses, so the stored factor is money-consistent.

const REFERENCE_UNITS: Record<Exclude<MeasureDimension, "count">, readonly string[]> = {
  mass: ["kg", "g", "lb", "oz", "ton"],
  volume: ["L", "mL", "gal", "fl oz"],
};

const DIMENSION_LABELS: { value: MeasureDimension; label: string; hint: string }[] = [
  { value: "mass", label: "Weight", hint: "e.g. a drum = 200 kg" },
  { value: "volume", label: "Volume", hint: "e.g. a tote = 1000 L" },
  { value: "count", label: "Count", hint: "e.g. a roll = 500 labels" },
];

export interface CreateUnitModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with the created unit so the caller can add it to its dropdown + select it. */
  onCreated: (unit: CustomUnitRow) => void;
  /** Prefill the name (e.g. the free-text the user just typed in a dropdown). */
  initialName?: string;
}

export function CreateUnitModal({ open, onClose, onCreated, initialName = "" }: CreateUnitModalProps) {
  const [name, setName] = useState(initialName);
  const [dimension, setDimension] = useState<MeasureDimension>("mass");
  const [amount, setAmount] = useState("1");
  const [refUnit, setRefUnit] = useState<string>("kg");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // No reset effect needed: Modal unmounts its children when closed, so this body remounts fresh (state
  // re-initialized from props) on every open.

  function pickDimension(d: MeasureDimension) {
    setDimension(d);
    setRefUnit(d === "mass" ? "kg" : d === "volume" ? "L" : "");
  }

  async function submit() {
    setError(null);
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Enter how big one of this unit is (a positive number).");
      return;
    }
    // Convert the "1 <name> = amt <refUnit>" statement to canonical base units. For count, the amount IS the
    // base-item count (no reference unit).
    const perCanonical = dimension === "count" ? amt : convert(amt, refUnit, canonicalUnitFor(dimension));
    if (perCanonical == null || !(perCanonical > 0)) {
      setError("Couldn't work out the size — check the reference unit.");
      return;
    }
    setBusy(true);
    const res = await createCustomUnitAction({ name: name.trim(), dimension, perCanonical });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onCreated(res.unit);
    onClose();
  }

  const canonical = canonicalUnitFor(dimension);
  const unitName = name.trim() || "unit";

  return (
    <Modal open={open} onClose={onClose} title="Create a unit" subtitle="Define a unit you can pick when receiving stock." maxWidth={460}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. roll, drum, tote" autoFocus />

        <div>
          <div style={{ fontSize: "var(--text-body-sm)", color: "var(--text-secondary)", marginBottom: 6 }}>What does it measure?</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {DIMENSION_LABELS.map((d) => {
              const active = dimension === d.value;
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => pickDimension(d.value)}
                  style={{
                    flex: "1 1 100px",
                    padding: "8px 10px",
                    borderRadius: "var(--radius-md)",
                    border: `var(--border-width${active ? "-strong" : ""}) solid ${active ? "var(--accent)" : "var(--border-default)"}`,
                    background: active ? "var(--accent-soft)" : "transparent",
                    color: active ? "var(--text-accent)" : "var(--text-body)",
                    cursor: "pointer",
                    fontFamily: "var(--font-body)",
                    fontSize: "var(--text-body-sm)",
                    textAlign: "left",
                  }}
                >
                  <div style={{ fontWeight: 500 }}>{d.label}</div>
                  <div style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)" }}>{d.hint}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div style={{ fontSize: "var(--text-body-sm)", color: "var(--text-secondary)", marginBottom: 6 }}>How big is one?</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: "var(--text-body-sm)", color: "var(--text-muted)", paddingBottom: 10 }}>1 {unitName} =</span>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" style={{ flex: "0 1 90px" }} />
            {dimension === "count" ? (
              <span style={{ fontSize: "var(--text-body-sm)", color: "var(--text-muted)", paddingBottom: 10 }}>base items (leave 1 to count the {unitName} itself)</span>
            ) : (
              <select
                value={refUnit}
                onChange={(e) => setRefUnit(e.target.value)}
                style={{ height: 42, borderRadius: "var(--radius-md)", border: "var(--border-width) solid var(--border-default)", background: "var(--surface-raised)", padding: "0 10px", fontFamily: "var(--font-body)", fontSize: "var(--text-body)" }}
              >
                {REFERENCE_UNITS[dimension].map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            )}
          </div>
          <div style={{ fontSize: "var(--text-caption)", color: "var(--text-muted)", marginTop: 6 }}>
            Stored in {canonical}. Portions are tracked and costed in {canonical}.
          </div>
        </div>

        {error ? <div style={{ color: "var(--danger)", fontSize: "var(--text-body-sm)" }}>{error}</div> : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={busy || !name.trim()}>{busy ? "Creating…" : "Create unit"}</Button>
        </div>
      </div>
    </Modal>
  );
}
