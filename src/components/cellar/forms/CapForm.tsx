"use client";

import React from "react";
import { Button } from "@/components/ui";
import { capManagementAction } from "@/lib/cellar/actions";
import { CAP_KINDS, CAP_LABELS, type CapKind } from "@/lib/cellar/cap-vocab";
import { FormShell, fieldStyle, type CellarActionsVessel, type OpSubmit } from "./shared";

// ── Cap management (one-tap instant) ──
// Techniques are sourced from the canonical CAP_KINDS/CAP_LABELS (cap-vocab.ts) so this form offers
// every technique the domain supports — including PULSE_AIR and BATONNAGE (bâtonnage), the classic
// barrel lees-stir now that barrels are first-class. capManagementAction accepts any CapKind.
export function CapForm({ vessel, pending, onSubmit }: { vessel: CellarActionsVessel; pending: boolean; onSubmit: OpSubmit }) {
  const [duration, setDuration] = React.useState("");
  const durNum = duration ? Number(duration) : undefined;

  function apply(kind: CapKind, label: string) {
    onSubmit(() => capManagementAction({ vesselId: vessel.id, kind, durationMin: durNum }), label.toLowerCase());
  }

  return (
    <FormShell>
      <input value={duration} onChange={(e) => setDuration(e.target.value)} inputMode="decimal" placeholder="Minutes (optional)" style={{ ...fieldStyle, width: 150 }} aria-label="Duration in minutes" />
      {CAP_KINDS.map((kind) => (
        <Button key={kind} variant="primary" size="sm" disabled={pending} onClick={() => apply(kind, CAP_LABELS[kind])} style={{ minHeight: 44 }}>
          {CAP_LABELS[kind]}
        </Button>
      ))}
      <span style={{ width: "100%", marginTop: 8, fontSize: 13, color: "var(--text-muted)" }}>One tap logs it instantly — undo from the toast. Cold soak (pre-ferment) and maceration (dry on skins) reuse this.</span>
    </FormShell>
  );
}
