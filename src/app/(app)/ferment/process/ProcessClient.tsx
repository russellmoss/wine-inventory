"use client";

import * as React from "react";
import type { CrushBlockOption, CrushVesselOption } from "@/lib/ferment/crush-data";
import type { PressablePosition, PressDestVessel } from "@/lib/ferment/press-data";
import type { CellarMaterialDTO } from "@/lib/cellar/materials";
import { CrushClient } from "../crush/CrushClient";
import { PressClient } from "../press/PressClient";

// One module, two operations. De-stem and press are the same primitive (fruit → liquid); the user
// picks which they're doing. A tab toggle sits above the existing De-stem / Press forms.

type Mode = "DESTEM" | "PRESS";

export function ProcessClient({
  blocks,
  vessels,
  materials,
  positions,
  pressVessels,
}: {
  blocks: CrushBlockOption[];
  vessels: CrushVesselOption[];
  materials: CellarMaterialDTO[];
  positions: PressablePosition[];
  pressVessels: PressDestVessel[];
}) {
  const [mode, setMode] = React.useState<Mode>("DESTEM");

  const tab = (m: Mode): React.CSSProperties => ({
    flex: 1,
    height: 46,
    cursor: "pointer",
    fontFamily: "var(--font-body)",
    fontSize: 15,
    borderRadius: "var(--radius-md)",
    border: mode === m ? "none" : "1px solid var(--border-strong)",
    background: mode === m ? "var(--accent)" : "var(--surface-base)",
    color: mode === m ? "#fff" : "var(--text-primary)",
  });

  return (
    <div>
      <div style={{ maxWidth: "var(--container-md)", margin: "0 auto", padding: "var(--space-5) var(--space-5) 0" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setMode("DESTEM")} style={tab("DESTEM")}>De-stem (crush)</button>
          <button onClick={() => setMode("PRESS")} style={tab("PRESS")}>Press</button>
        </div>
      </div>
      {mode === "DESTEM" ? (
        <CrushClient blocks={blocks} vessels={vessels} materials={materials} />
      ) : (
        <PressClient positions={positions} vessels={pressVessels} blocks={blocks} materials={materials} />
      )}
    </div>
  );
}
