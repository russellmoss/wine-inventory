"use client";

import React from "react";
import { Button } from "@/components/ui";
import { MaterialPicker } from "@/components/cellar/MaterialPicker";
import {
  computeAdditionTotal,
  RATE_BASES,
  RATE_BASIS_LABELS,
  type RateBasis,
} from "@/lib/cellar/additions-math";
import type { CellarMaterialDTO } from "@/lib/cellar/materials";
import { addAdditionAction, addFiningAction } from "@/lib/cellar/actions";
import { FormShell, fieldStyle, type CellarActionsVessel, type OpSubmit } from "./shared";

// ── Addition / Fining (shared form; live computed math) ──
export function DoseForm({
  kind,
  vessel,
  materials,
  pending,
  onSubmit,
}: {
  kind: "add" | "fine";
  vessel: CellarActionsVessel;
  materials: CellarMaterialDTO[];
  pending: boolean;
  onSubmit: OpSubmit;
}) {
  const [material, setMaterial] = React.useState("");
  const [rate, setRate] = React.useState("");
  const [basis, setBasis] = React.useState<RateBasis>("G_HL");
  const [note, setNote] = React.useState("");

  // Selecting a known material prefills its default basis (still editable).
  function onMaterialChange(v: string, dto?: CellarMaterialDTO) {
    setMaterial(v);
    if (dto?.defaultBasis) setBasis(dto.defaultBasis);
  }

  const rateNum = Number(rate);
  const valid = material.trim().length > 0 && Number.isFinite(rateNum) && rateNum > 0 && vessel.totalL > 0;
  const computed = valid ? computeAdditionTotal(rateNum, basis, vessel.totalL) : null;
  const verb = kind === "add" ? "Add" : "Fine";

  function submit() {
    const action = kind === "add" ? addAdditionAction : addFiningAction;
    onSubmit(
      () => action({ vesselId: vessel.id, materialName: material.trim(), rateValue: rateNum, rateBasis: basis, note: note.trim() || undefined }),
      `${material.trim()} · ${rate} ${RATE_BASIS_LABELS[basis]}`,
    );
  }

  // Stack: the material picker gets its own full-width row (it's a search+chips+list panel, not a
  // one-line control), then the dose inputs sit on the row below.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <MaterialPicker
        materials={materials}
        value={material}
        onChange={onMaterialChange}
        kind={kind === "fine" ? "FINING" : undefined}
        placeholder={kind === "add" ? "Material (e.g. KMBS, DAP)" : "Fining agent (e.g. bentonite)"}
        ariaLabel="Material"
        style={{ width: "100%" }}
      />
      <FormShell>
        <input
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          inputMode="decimal"
          placeholder="Rate"
          style={{ ...fieldStyle, width: 88 }}
          aria-label="Dose rate"
        />
        <select value={basis} onChange={(e) => setBasis(e.target.value as RateBasis)} style={{ ...fieldStyle, width: 130 }} aria-label="Dose basis">
          {RATE_BASES.map((b) => (
            <option key={b} value={b}>
              {RATE_BASIS_LABELS[b]}
            </option>
          ))}
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" style={{ ...fieldStyle, flex: "1 1 140px" }} aria-label="Note" />
        <Button variant="primary" size="sm" disabled={pending || !valid} onClick={submit} style={{ minHeight: 44 }}>
          {pending ? "Saving…" : `${verb} to ${vessel.code}`}
        </Button>
      </FormShell>
      <div aria-live="polite" style={{ fontSize: 13, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
        {computed
          ? `${rate} ${RATE_BASIS_LABELS[basis]} × ${vessel.totalL} L = ${computed.total} ${computed.unit}`
          : vessel.totalL <= 0
            ? "This vessel is empty — nothing to dose."
            : "Enter a material and a rate to see the computed total."}
      </div>
    </div>
  );
}
