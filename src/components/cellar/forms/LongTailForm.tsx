"use client";

import React from "react";
import { Button } from "@/components/ui";
import { recordLongTailOperationAction } from "@/lib/cellar/actions";
import { FormShell, fieldStyle, type CellarActionsVessel, type OpSubmit } from "./shared";

type Mode = "DRAIN" | "CUSTOM_LOSS";

export function LongTailForm({ vessel, pending, onSubmit }: { vessel: CellarActionsVessel; pending: boolean; onSubmit: OpSubmit }) {
  const [mode, setMode] = React.useState<Mode>("DRAIN");
  const [volume, setVolume] = React.useState("");
  const [label, setLabel] = React.useState("");
  const amount = Number(volume);
  const validVolume = Number.isFinite(amount) && amount > 0 && amount <= vessel.totalL + 1e-9;
  const validLabel = mode === "DRAIN" || label.trim().length > 0;
  const resulting = validVolume ? Math.round((vessel.totalL - amount) * 100) / 100 : null;

  return (
    <FormShell>
      <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} style={{ ...fieldStyle, minWidth: 170 }} aria-label="Long-tail operation">
        <option value="DRAIN">Drain to waste</option>
        <option value="CUSTOM_LOSS">Custom loss</option>
      </select>
      {mode === "CUSTOM_LOSS" ? (
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Short label" maxLength={80} style={{ ...fieldStyle, flex: "1 1 180px" }} aria-label="Custom operation label" />
      ) : null}
      <input value={volume} onChange={(e) => setVolume(e.target.value)} inputMode="decimal" placeholder="Litres" style={{ ...fieldStyle, width: 110 }} aria-label="Volume" />
      <Button variant="ghost" size="sm" disabled={pending || vessel.totalL <= 0} onClick={() => setVolume(String(vessel.totalL))} style={{ minHeight: 44 }}>
        Empty vessel
      </Button>
      <Button
        variant="primary"
        size="sm"
        disabled={pending || !validVolume || !validLabel}
        onClick={() =>
          onSubmit(
            () =>
              mode === "DRAIN"
                ? recordLongTailOperationAction({ candidate: "DRAIN", drainIntent: "WASTE", vesselId: vessel.id, volumeL: amount })
                : recordLongTailOperationAction({ candidate: "CUSTOM", shape: "LOSS", customLabel: label, vesselId: vessel.id, volumeL: amount }),
            mode === "DRAIN" ? `drained ${volume} L` : `${label.trim()} ${volume} L`,
          )
        }
        style={{ minHeight: 44 }}
      >
        {pending ? "Saving..." : `Record on ${vessel.code}`}
      </Button>
      <div aria-live="polite" style={{ width: "100%", marginTop: 8, fontSize: 13, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
        {resulting != null ? `New volume = ${resulting} L` : vessel.totalL <= 0 ? "This vessel is empty." : "Records a controlled existing ledger shape."}
      </div>
    </FormShell>
  );
}
