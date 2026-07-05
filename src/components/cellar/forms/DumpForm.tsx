"use client";

import React from "react";
import { Button } from "@/components/ui";
import { recordLossAction } from "@/lib/cellar/actions";
import { FormShell, fieldStyle, type CellarActionsVessel, type OpSubmit } from "./shared";

// ── Dump (deliberate disposal — NOT evaporation; angel's share is derived from topping) ──
export function DumpForm({ vessel, pending, onSubmit }: { vessel: CellarActionsVessel; pending: boolean; onSubmit: OpSubmit }) {
  const [loss, setLoss] = React.useState("");
  const lossNum = Number(loss);
  const valid = Number.isFinite(lossNum) && lossNum > 0 && lossNum <= vessel.totalL + 1e-9;
  const resulting = valid ? Math.round((vessel.totalL - lossNum) * 100) / 100 : null;

  return (
    <FormShell>
      <input value={loss} onChange={(e) => setLoss(e.target.value)} inputMode="decimal" placeholder="Litres to dump" style={{ ...fieldStyle, width: 130 }} aria-label="Volume to dump" />
      <Button variant="ghost" size="sm" disabled={pending || vessel.totalL <= 0} onClick={() => setLoss(String(vessel.totalL))} style={{ minHeight: 44 }}>
        Empty vessel
      </Button>
      <Button
        variant="primary"
        size="sm"
        disabled={pending || !valid}
        onClick={() => onSubmit(() => recordLossAction({ vesselId: vessel.id, lossL: lossNum }), `dumped ${loss} L`)}
        style={{ minHeight: 44 }}
      >
        {pending ? "Saving…" : `Dump from ${vessel.code}`}
      </Button>
      <div aria-live="polite" style={{ width: "100%", marginTop: 8, fontSize: 13, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
        {resulting != null
          ? `New volume = ${resulting} L`
          : vessel.totalL <= 0
            ? "This vessel is empty."
            : "Dump wine you're discarding (spoilage, failed lot, emptying a vessel). Evaporation isn't recorded — angel's share is derived from topping."}
      </div>
    </FormShell>
  );
}
