"use client";

import React from "react";
import { Button } from "@/components/ui";
import { topVesselAction } from "@/lib/cellar/actions";
import { FormShell, type CellarActionsVessel, type KegOption, type OpSubmit } from "./shared";
import { VesselFilterPicker } from "@/components/cellar/VesselFilterPicker";
import { VolumeInput } from "./VolumeInput";
import { formatVolume, volumeInputToLiters } from "@/lib/units/display";
import { useUnitPrefs } from "@/components/units/UnitsProvider";

// ── Topping ──
// Plan 098 U9: entry in the winery's display unit (inline adornment); canonical litres to the action.
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
  const unit = useUnitPrefs().volume;
  const sources = kegOptions.filter((k) => k.id !== vessel.id && k.totalL > 0);
  const [fromVesselId, setFromVesselId] = React.useState("");
  const [volume, setVolume] = React.useState("");
  const volNum = volumeInputToLiters(volume, unit) ?? Number.NaN;
  const valid = !!fromVesselId && Number.isFinite(volNum) && volNum > 0;
  const resulting = valid ? Math.round((vessel.totalL + volNum) * 100) / 100 : null;
  const overCap = resulting != null && resulting > vessel.capacityL + 1e-9;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <VesselFilterPicker
        options={sources}
        value={fromVesselId}
        onChange={setFromVesselId}
        placeholder="Top from…"
        ariaLabel="Source vessel"
        emptyHint="No other vessel has wine to top from."
      />
      <FormShell>
        <VolumeInput value={volume} onChange={setVolume} unit={unit} placeholder="Volume" width={110} ariaLabel="Topping volume" />
        <Button
          variant="primary"
          size="sm"
          disabled={pending || !valid || overCap}
          onClick={() => onSubmit(() => topVesselAction({ toVesselId: vessel.id, fromVesselId, volumeL: volNum }), `topped ${formatVolume(volNum, unit)}`)}
          style={{ minHeight: 44 }}
        >
          {pending ? "Saving…" : `Top ${vessel.code}`}
        </Button>
      </FormShell>
      <div aria-live="polite" style={{ fontSize: 13, color: overCap ? "var(--danger)" : "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
        {sources.length === 0
          ? "No other vessel has wine to top from."
          : resulting != null
            ? overCap
              ? `That would overfill ${vessel.code} (${formatVolume(resulting, unit)} into a ${formatVolume(vessel.capacityL, unit)} vessel).`
              : `${vessel.code}: ${formatVolume(vessel.totalL, unit)} → ${formatVolume(resulting, unit)}${unit !== "L" ? ` (recorded as ${formatVolume(volNum, "L")})` : ""}`
            : "Pick a source and a volume."}
      </div>
    </div>
  );
}
