"use client";

import React from "react";
import { Button } from "@/components/ui";
import { rackVesselAction } from "@/lib/cellar/actions";
import type { RackVesselResult } from "@/lib/vessels/rack-core";
import { FormShell, fieldStyle, type CellarActionsVessel, type KegOption } from "./shared";
import { VesselFilterPicker } from "@/components/cellar/VesselFilterPicker";

// ── Rack (move wine to another vessel; lees loss = out − measured-in) ──
export function RackForm({
  vessel,
  kegOptions,
  pending,
  onSubmit,
}: {
  vessel: CellarActionsVessel;
  kegOptions: KegOption[];
  pending: boolean;
  onSubmit: (fn: () => Promise<RackVesselResult>, label: string) => void;
}) {
  const destinations = kegOptions.filter((k) => k.id !== vessel.id);
  const [toVesselId, setToVesselId] = React.useState("");
  const [drawL, setDrawL] = React.useState(String(vessel.totalL || ""));
  const [landedL, setLandedL] = React.useState("");
  const [useNewBlend, setUseNewBlend] = React.useState(false);
  const [token, setToken] = React.useState("");

  const draw = Number(drawL);
  const landed = landedL.trim() === "" ? null : Number(landedL);
  const drawValid = Number.isFinite(draw) && draw > 0 && draw <= vessel.totalL + 1e-9;
  const landedValid = landed == null || (Number.isFinite(landed) && landed >= 0 && landed <= draw + 1e-9);
  const lossL = landed == null ? 0 : Math.round((draw - landed) * 100) / 100;

  // Is the chosen destination occupied by a DIFFERENT lot? Then racking blends (Unit 8b).
  const sourceCodes = vessel.residentLots.map((r) => r.code);
  const dest = destinations.find((d) => d.id === toVesselId);
  const destLotCodes = dest?.lotCodes ?? [];
  const occupiedDifferent = destLotCodes.length > 0 && destLotCodes.some((c) => !sourceCodes.includes(c));
  const tokenValid = /^[A-Za-z]{2,4}$/.test(token.trim());
  // The "new blend" escape only applies to an occupied-different destination — derive it so it
  // self-clears when the destination changes (no setState-in-effect cascade).
  const newBlendActive = useNewBlend && occupiedDifferent;
  const valid = !!toVesselId && drawValid && landedValid && (!newBlendActive || tokenValid);

  return (
    <FormShell>
      <VesselFilterPicker
        options={destinations}
        value={toVesselId}
        onChange={setToVesselId}
        placeholder="Rack into…"
        ariaLabel="Destination vessel"
        emptyHint="No other vessel to rack into."
      />
      <input value={drawL} onChange={(e) => setDrawL(e.target.value)} inputMode="decimal" placeholder="Litres out" style={{ ...fieldStyle, width: 100 }} aria-label="Litres moved out of this vessel" title={`Out of ${vessel.code} (defaults to its full volume)`} />
      <input value={landedL} onChange={(e) => setLandedL(e.target.value)} inputMode="decimal" placeholder="Litres in (measured)" style={{ ...fieldStyle, width: 140 }} aria-label="Measured litres into the destination" />
      {newBlendActive ? (
        <input value={token} onChange={(e) => setToken(e.target.value.toUpperCase())} maxLength={4} placeholder="Tag (e.g. EST)" style={{ ...fieldStyle, width: 110 }} aria-label="New blend tag (2–4 letters)" />
      ) : null}
      <Button
        variant="primary"
        size="sm"
        disabled={pending || !valid}
        onClick={() =>
          onSubmit(
            () =>
              rackVesselAction({
                fromVesselId: vessel.id,
                toVesselId,
                drawL: draw,
                lossL,
                ...(newBlendActive ? { newBlend: { token: token.trim() } } : {}),
              }),
            `racked ${draw} L`,
          )
        }
        style={{ minHeight: 44 }}
      >
        {pending ? "Saving…" : newBlendActive ? `Rack as new blend` : `Rack from ${vessel.code}`}
      </Button>
      <div aria-live="polite" style={{ width: "100%", marginTop: 8, fontSize: 13, color: !landedValid ? "var(--danger)" : "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
        {destinations.length === 0
          ? "No other vessel to rack into."
          : !landedValid
            ? "Measured volume in can't exceed the volume out."
            : occupiedDifferent ? (
                <span>
                  {dest?.label} holds {destLotCodes.join(", ")}. Racking here blends them — kept as {destLotCodes[0]}.{" "}
                  <button
                    type="button"
                    onClick={() => setUseNewBlend((v) => !v)}
                    style={{ border: "none", background: "transparent", color: "var(--text-accent)", cursor: "pointer", fontSize: 13, padding: 0 }}
                  >
                    {newBlendActive ? "keep destination lot instead" : "make a new blend instead"}
                  </button>
                  {newBlendActive && !tokenValid ? " — enter a 2–4 letter tag." : ""}
                </span>
              )
              : landed == null
                ? `Enter the measured volume landed to record lees loss (out − in). Leaving it blank logs no loss.`
                : `Lees loss = ${lossL} L (out ${draw} − in ${landed}).`}
      </div>
    </FormShell>
  );
}
