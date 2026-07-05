"use client";

import React from "react";
import { Button } from "@/components/ui";
import { filterVesselAction } from "@/lib/cellar/actions";
import { FormShell, fieldStyle, type CellarActionsVessel, type OpSubmit } from "./shared";

// ── Filtration ──
export function FiltrationForm({ vessel, pending, onSubmit }: { vessel: CellarActionsVessel; pending: boolean; onSubmit: OpSubmit }) {
  const [loss, setLoss] = React.useState("");
  const [medium, setMedium] = React.useState("");
  const [micron, setMicron] = React.useState("");
  const lossNum = Number(loss);
  const valid = Number.isFinite(lossNum) && lossNum > 0 && lossNum <= vessel.totalL + 1e-9;
  const resulting = valid ? Math.round((vessel.totalL - lossNum) * 100) / 100 : null;

  return (
    <FormShell>
      <input value={loss} onChange={(e) => setLoss(e.target.value)} inputMode="decimal" placeholder="Litres lost" style={{ ...fieldStyle, width: 110 }} aria-label="Volume lost to the filter" />
      <input value={medium} onChange={(e) => setMedium(e.target.value)} placeholder="Medium (optional)" style={{ ...fieldStyle, flex: "1 1 130px" }} aria-label="Filter medium" />
      <input value={micron} onChange={(e) => setMicron(e.target.value)} inputMode="decimal" placeholder="µm (optional)" style={{ ...fieldStyle, width: 110 }} aria-label="Filter micron" />
      <Button
        variant="primary"
        size="sm"
        disabled={pending || !valid}
        onClick={() =>
          onSubmit(
            () => filterVesselAction({ vesselId: vessel.id, lossL: lossNum, medium: medium.trim() || undefined, micron: micron ? Number(micron) : undefined }),
            `filtered (${loss} L loss)`,
          )
        }
        style={{ minHeight: 44 }}
      >
        {pending ? "Saving…" : `Filter ${vessel.code}`}
      </Button>
      <div aria-live="polite" style={{ width: "100%", marginTop: 8, fontSize: 13, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
        {resulting != null ? `New volume = ${resulting} L` : vessel.totalL <= 0 ? "This vessel is empty." : "Enter the volume lost to the filter."}
      </div>
    </FormShell>
  );
}
