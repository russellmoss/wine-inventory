"use client";

import React from "react";
import { Button } from "@/components/ui";
import { topVesselAction } from "@/lib/cellar/actions";
import { FormShell, fieldStyle, type CellarActionsVessel, type KegOption, type OpSubmit } from "./shared";
import { VesselFilterPicker } from "@/components/cellar/VesselFilterPicker";

// ── Topping ──
export function ToppingForm({
  vessel,
  kegOptions,
  pending,
  onSubmit,
}: {
  vessel: CellarActionsVessel;
  kegOptions: KegOption[];
  pending: boolean;
  onSubmit: OpSubmit;
}) {
  const sources = kegOptions.filter((k) => k.id !== vessel.id && k.totalL > 0);
  const [fromVesselId, setFromVesselId] = React.useState("");
  const [volume, setVolume] = React.useState("");
  const volNum = Number(volume);
  const valid = !!fromVesselId && Number.isFinite(volNum) && volNum > 0;
  const resulting = valid ? Math.round((vessel.totalL + volNum) * 100) / 100 : null;
  const overCap = resulting != null && resulting > vessel.capacityL + 1e-9;

  return (
    <FormShell>
      <VesselFilterPicker
        options={sources}
        value={fromVesselId}
        onChange={setFromVesselId}
        placeholder="Top from…"
        ariaLabel="Source vessel"
        emptyHint="No other vessel has wine to top from."
      />
      <input value={volume} onChange={(e) => setVolume(e.target.value)} inputMode="decimal" placeholder="Litres" style={{ ...fieldStyle, width: 96 }} aria-label="Topping volume" />
      <Button
        variant="primary"
        size="sm"
        disabled={pending || !valid || overCap}
        onClick={() => onSubmit(() => topVesselAction({ toVesselId: vessel.id, fromVesselId, volumeL: volNum }), `topped ${volume} L`)}
        style={{ minHeight: 44 }}
      >
        {pending ? "Saving…" : `Top ${vessel.code}`}
      </Button>
      <div aria-live="polite" style={{ width: "100%", marginTop: 8, fontSize: 13, color: overCap ? "var(--danger)" : "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
        {sources.length === 0
          ? "No other vessel has wine to top from."
          : resulting != null
            ? overCap
              ? `That would overfill ${vessel.code} (${resulting} L into a ${vessel.capacityL} L vessel).`
              : `${vessel.code}: ${vessel.totalL} → ${resulting} L`
            : "Pick a source and a volume."}
      </div>
    </FormShell>
  );
}
