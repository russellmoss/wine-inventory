"use client";

// S3a Unit 14 — set / retract planned harvest dates per block-vintage-pass. Dates travel as ISO
// YYYY-MM-DD STRINGS end to end (KD-13/C6). Split picks are first-class: a block can hold several
// open pass labels at once (council G4).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { submitPlannedHarvestDate, submitPlannedHarvestRetraction, type PlannedHarvestBlockRow } from "@/lib/harvest/planned-harvest-actions";

const inputStyle: React.CSSProperties = {
  padding: "6px 8px",
  borderRadius: 10,
  border: "1px solid var(--border-default, #DED7C6)",
  fontSize: 14,
};

export function PlannedHarvestBoard({ rows, vintageYear }: { rows: PlannedHarvestBlockRow[]; vintageYear: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { date: string; label: string }>>({});

  const set = (blockId: string) => {
    const d = drafts[blockId];
    if (!d?.date) {
      setError("Pick a date first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitPlannedHarvestDate({ blockId, vintageYear, harvestPassLabel: d.label.trim() || undefined, plannedDate: d.date });
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  };

  const retract = (blockId: string, harvestPassLabel: string) => {
    setError(null);
    startTransition(async () => {
      const result = await submitPlannedHarvestRetraction({ blockId, vintageYear, harvestPassLabel });
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {error ? <p role="alert" style={{ color: "var(--danger, #B63D35)", margin: 0 }}>{error}</p> : null}
      {rows.map((r) => (
        <Card key={r.blockId} style={{ padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <strong>{r.blockLabel}</strong> <span style={{ color: "var(--text-muted)", fontSize: 13 }}>· {r.vineyardName}</span>
              <div style={{ fontSize: 14, marginTop: 4 }}>
                {r.open.length === 0 ? (
                  <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>no planned date</span>
                ) : (
                  r.open.map((o) => (
                    <span key={o.harvestPassLabel} style={{ marginRight: 12 }}>
                      {o.harvestPassLabel}: <strong>{o.plannedDate}</strong>{" "}
                      <span style={{ color: "var(--text-muted)", fontSize: 12 }}>(v{o.version})</span>{" "}
                      <button
                        onClick={() => retract(r.blockId, o.harvestPassLabel)}
                        disabled={pending}
                        style={{ background: "none", border: "none", color: "var(--accent, #722F37)", cursor: "pointer", fontSize: 12, textDecoration: "underline", padding: 0 }}
                      >
                        retract
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <label htmlFor={`ph-${r.blockId}-date`} style={{ fontSize: 12, color: "var(--text-secondary)" }}>Set</label>
              <input
                id={`ph-${r.blockId}-date`}
                type="date"
                style={inputStyle}
                value={drafts[r.blockId]?.date ?? ""}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [r.blockId]: { date: e.target.value, label: prev[r.blockId]?.label ?? "main" } }))}
              />
              <input
                aria-label="pass label (e.g. main, sparkling)"
                placeholder="main"
                style={{ ...inputStyle, width: 110 }}
                value={drafts[r.blockId]?.label ?? "main"}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [r.blockId]: { date: prev[r.blockId]?.date ?? "", label: e.target.value } }))}
              />
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => set(r.blockId)}>
                Save
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
