"use client";

import React from "react";
import { addAdditionAction, addFiningAction } from "@/lib/cellar/actions";
import { MATERIAL_KINDS, RATE_BASES, RATE_BASIS_LABELS, type MaterialKind, type RateBasis } from "@/lib/cellar/additions-math";
import type { CellarMaterialDTO } from "@/lib/cellar/materials";

// Phase 6: a staged "products added at this step" editor for the crush / press forms. The lot
// doesn't exist until the transform commits, so additions are STAGED here and applied (chained)
// once we have the new lotId — see applyStagedAdditions. Reuses the Phase 3 ADDITION/FINING op;
// stock draw-down + cost arrive in Phase 8.

export type StagedAddition = { key: number; material: string; kind: MaterialKind; rate: string; basis: RateBasis; note: string };

let seq = 0;
export const blankAddition = (): StagedAddition => ({ key: ++seq, material: "", kind: "YEAST", rate: "", basis: "G_HL", note: "" });

/** Chain the staged additions onto a freshly-created lot in its vessel. Throws on the first
 * failure (the lot + any prior additions persist — the rest can be added from the monitor). */
export async function applyStagedAdditions(additions: StagedAddition[], vesselId: string, lotId: string): Promise<number> {
  let n = 0;
  for (const a of additions) {
    if (!a.material.trim() || !(Number(a.rate) > 0)) continue;
    const input = { vesselId, lotId, materialName: a.material.trim(), materialKind: a.kind, rateValue: Number(a.rate), rateBasis: a.basis, note: a.note.trim() || undefined };
    await (a.kind === "FINING" ? addFiningAction(input) : addAdditionAction(input));
    n++;
  }
  return n;
}

const field: React.CSSProperties = {
  height: 42,
  padding: "0 8px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  color: "var(--text-primary)",
};

export function StagedAdditions({
  value,
  onChange,
  materials,
  idBase,
}: {
  value: StagedAddition[];
  onChange: (next: StagedAddition[]) => void;
  materials: CellarMaterialDTO[];
  idBase: string;
}) {
  const set = (key: number, patch: Partial<StagedAddition>) => onChange(value.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  const add = () => onChange([...value, blankAddition()]);
  const remove = (key: number) => onChange(value.filter((a) => a.key !== key));

  return (
    <div>
      <datalist id={`${idBase}-mat`}>
        {materials.map((m) => (
          <option key={m.id} value={m.name} />
        ))}
      </datalist>
      {value.map((a) => (
        <div key={a.key} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
          <input
            list={`${idBase}-mat`}
            value={a.material}
            onChange={(e) => {
              const m = materials.find((x) => x.name.toLowerCase() === e.target.value.toLowerCase());
              set(a.key, { material: e.target.value, ...(m ? { kind: m.kind as MaterialKind, basis: (m.defaultBasis as RateBasis) ?? a.basis } : {}) });
            }}
            placeholder="product (yeast, O. oeni, bentonite…)"
            aria-label="Product"
            style={{ ...field, flex: "1 1 180px" }}
          />
          <select value={a.kind} onChange={(e) => set(a.key, { kind: e.target.value as MaterialKind })} aria-label="Kind" style={{ ...field, width: 110 }}>
            {MATERIAL_KINDS.map((k) => (
              <option key={k} value={k}>{k.toLowerCase()}</option>
            ))}
          </select>
          <input value={a.rate} onChange={(e) => set(a.key, { rate: e.target.value })} inputMode="decimal" placeholder="rate" aria-label="Rate" style={{ ...field, width: 70 }} />
          <select value={a.basis} onChange={(e) => set(a.key, { basis: e.target.value as RateBasis })} aria-label="Basis" style={{ ...field, width: 108 }}>
            {RATE_BASES.map((b) => (
              <option key={b} value={b}>{RATE_BASIS_LABELS[b]}</option>
            ))}
          </select>
          <button onClick={() => remove(a.key)} aria-label="Remove addition" style={{ ...field, width: 36, cursor: "pointer", background: "var(--surface-base)" }}>×</button>
        </div>
      ))}
      <button onClick={add} style={{ ...field, cursor: "pointer", background: "var(--surface-base)", paddingInline: 14 }}>+ product</button>
    </div>
  );
}
