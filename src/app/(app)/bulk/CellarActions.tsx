"use client";

import React from "react";
import { Button } from "@/components/ui";
import {
  computeAdditionTotal,
  RATE_BASES,
  RATE_BASIS_LABELS,
  type RateBasis,
} from "@/lib/cellar/additions-math";
import type { CellarMaterialDTO } from "@/lib/cellar/materials";
import {
  addAdditionAction,
  addFiningAction,
  capManagementAction,
  correctOperationAction,
  filterVesselAction,
  recordLossAction,
  topVesselAction,
} from "@/lib/cellar/actions";

// Vessel-first cellar-op capture (Phase 3, Unit 9). An Actions row (text buttons, not an
// icon grid — anti-slop) swaps the panel to a focused form per op. Cap management is
// one-tap instant; all others preview then confirm. A "Logged · Undo" toast follows every
// capture (Undo calls the correction/void path). Token-driven, light-only, sentence-case;
// inputMode="decimal" + ≥44px targets + aria-live math for the floor. Revalidation on the
// server actions refreshes the page data; this component only owns the transient form state.

export type CellarActionsVessel = { id: string; code: string; type: "BARREL" | "TANK"; capacityL: number; totalL: number };
export type KegOption = { id: string; label: string; totalL: number };

const fieldStyle: React.CSSProperties = {
  height: 44,
  padding: "0 10px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  color: "var(--text-primary)",
};

type Mode = null | "ADD" | "TOP" | "FINE" | "FILTER" | "CAP" | "LOSS";
const ACTIONS: { mode: Exclude<Mode, null>; label: string }[] = [
  { mode: "ADD", label: "Add" },
  { mode: "TOP", label: "Top" },
  { mode: "FINE", label: "Fine" },
  { mode: "FILTER", label: "Filter" },
  { mode: "CAP", label: "Cap" },
  { mode: "LOSS", label: "Loss" },
];

type LoggedToast = { operationId: number; label: string };

export function CellarActions({
  vessel,
  materials,
  kegOptions,
}: {
  vessel: CellarActionsVessel;
  materials: CellarMaterialDTO[];
  kegOptions: KegOption[];
}) {
  const [mode, setMode] = React.useState<Mode>(null);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<LoggedToast | null>(null);

  // Form state resets across vessels via a `key` remount in the parent (BulkClient), so no
  // reset effect is needed here.

  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  function run(fn: () => Promise<{ operationId: number }>, label: string) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fn();
        setMode(null);
        setToast({ operationId: res.operationId, label });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  function undo(operationId: number) {
    startTransition(async () => {
      try {
        await correctOperationAction(operationId);
        setToast(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't undo.");
      }
    });
  }

  return (
    <div style={{ borderTop: "1px solid var(--border-strong)", paddingTop: 14, marginTop: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: mode ? 12 : 0 }}>
        <span style={{ fontSize: 12.5, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", marginRight: 4 }}>
          Cellar actions
        </span>
        {ACTIONS.map((a) => (
          <Button
            key={a.mode}
            variant={mode === a.mode ? "primary" : "secondary"}
            size="sm"
            disabled={pending}
            onClick={() => setMode((m) => (m === a.mode ? null : a.mode))}
            style={{ minHeight: 44 }}
          >
            {a.label}
          </Button>
        ))}
      </div>

      {error ? <p style={{ color: "var(--danger)", fontSize: 13, margin: "4px 0 10px" }}>{error}</p> : null}

      {mode === "ADD" ? (
        <DoseForm kind="add" vessel={vessel} materials={materials} pending={pending} onSubmit={run} />
      ) : null}
      {mode === "FINE" ? (
        <DoseForm kind="fine" vessel={vessel} materials={materials} pending={pending} onSubmit={run} />
      ) : null}
      {mode === "TOP" ? <ToppingForm vessel={vessel} kegOptions={kegOptions} pending={pending} onSubmit={run} /> : null}
      {mode === "FILTER" ? <FiltrationForm vessel={vessel} pending={pending} onSubmit={run} /> : null}
      {mode === "LOSS" ? <LossForm vessel={vessel} pending={pending} onSubmit={run} /> : null}
      {mode === "CAP" ? <CapForm vessel={vessel} pending={pending} onSubmit={run} /> : null}

      {toast ? (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 14,
            padding: "10px 14px",
            borderRadius: "var(--radius-md)",
            background: "var(--accent-soft)",
            border: "1px solid var(--border-strong)",
            fontSize: 13.5,
          }}
        >
          <span style={{ color: "var(--text-primary)" }}>Logged · {toast.label}</span>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => undo(toast.operationId)} style={{ minHeight: 36 }}>
            Undo
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ── Addition / Fining (shared form; live computed math) ──
function DoseForm({
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
  onSubmit: (fn: () => Promise<{ operationId: number }>, label: string) => void;
}) {
  const [material, setMaterial] = React.useState("");
  const [rate, setRate] = React.useState("");
  const [basis, setBasis] = React.useState<RateBasis>("G_HL");
  const [note, setNote] = React.useState("");

  // Selecting a known material prefills its default basis (still editable).
  function onMaterialChange(v: string) {
    setMaterial(v);
    const hit = materials.find((m) => m.name.toLowerCase() === v.trim().toLowerCase());
    if (hit?.defaultBasis) setBasis(hit.defaultBasis);
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

  const listId = `materials-${vessel.id}`;
  return (
    <FormShell>
      <input
        list={listId}
        value={material}
        onChange={(e) => onMaterialChange(e.target.value)}
        placeholder={kind === "add" ? "Material (e.g. KMBS, DAP)" : "Fining agent (e.g. bentonite)"}
        style={{ ...fieldStyle, flex: "1 1 180px" }}
        aria-label="Material"
      />
      <datalist id={listId}>
        {materials.map((m) => (
          <option key={m.id} value={m.name} />
        ))}
      </datalist>
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
      <div aria-live="polite" style={{ width: "100%", marginTop: 8, fontSize: 13, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
        {computed
          ? `${rate} ${RATE_BASIS_LABELS[basis]} × ${vessel.totalL} L = ${computed.total} ${computed.unit}`
          : vessel.totalL <= 0
            ? "This vessel is empty — nothing to dose."
            : "Enter a material and a rate to see the computed total."}
      </div>
    </FormShell>
  );
}

// ── Topping ──
function ToppingForm({
  vessel,
  kegOptions,
  pending,
  onSubmit,
}: {
  vessel: CellarActionsVessel;
  kegOptions: KegOption[];
  pending: boolean;
  onSubmit: (fn: () => Promise<{ operationId: number }>, label: string) => void;
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
      <select value={fromVesselId} onChange={(e) => setFromVesselId(e.target.value)} style={{ ...fieldStyle, flex: "1 1 180px" }} aria-label="Source keg">
        <option value="" disabled>
          Top from…
        </option>
        {sources.map((k) => (
          <option key={k.id} value={k.id}>
            {k.label} ({k.totalL} L)
          </option>
        ))}
      </select>
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

// ── Filtration ──
function FiltrationForm({ vessel, pending, onSubmit }: { vessel: CellarActionsVessel; pending: boolean; onSubmit: (fn: () => Promise<{ operationId: number }>, label: string) => void }) {
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

// ── Loss / angel's share ──
function LossForm({ vessel, pending, onSubmit }: { vessel: CellarActionsVessel; pending: boolean; onSubmit: (fn: () => Promise<{ operationId: number }>, label: string) => void }) {
  const [loss, setLoss] = React.useState("");
  const lossNum = Number(loss);
  const valid = Number.isFinite(lossNum) && lossNum > 0 && lossNum <= vessel.totalL + 1e-9;
  const resulting = valid ? Math.round((vessel.totalL - lossNum) * 100) / 100 : null;

  return (
    <FormShell>
      <input value={loss} onChange={(e) => setLoss(e.target.value)} inputMode="decimal" placeholder="Litres lost" style={{ ...fieldStyle, width: 120 }} aria-label="Volume lost" />
      <Button
        variant="primary"
        size="sm"
        disabled={pending || !valid}
        onClick={() => onSubmit(() => recordLossAction({ vesselId: vessel.id, lossL: lossNum }), `lost ${loss} L`)}
        style={{ minHeight: 44 }}
      >
        {pending ? "Saving…" : `Record loss`}
      </Button>
      <div aria-live="polite" style={{ width: "100%", marginTop: 8, fontSize: 13, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
        {resulting != null ? `New volume = ${resulting} L (angel's share)` : vessel.totalL <= 0 ? "This vessel is empty." : "Enter the volume lost to evaporation."}
      </div>
    </FormShell>
  );
}

// ── Cap management (one-tap instant) ──
function CapForm({ vessel, pending, onSubmit }: { vessel: CellarActionsVessel; pending: boolean; onSubmit: (fn: () => Promise<{ operationId: number }>, label: string) => void }) {
  const [duration, setDuration] = React.useState("");
  const durNum = duration ? Number(duration) : undefined;
  function apply(kind: "PUMPOVER" | "PUNCHDOWN") {
    onSubmit(
      () => capManagementAction({ vesselId: vessel.id, kind, durationMin: durNum }),
      kind === "PUMPOVER" ? "pump-over" : "punch-down",
    );
  }
  return (
    <FormShell>
      <input value={duration} onChange={(e) => setDuration(e.target.value)} inputMode="decimal" placeholder="Minutes (optional)" style={{ ...fieldStyle, width: 150 }} aria-label="Duration in minutes" />
      <Button variant="primary" size="sm" disabled={pending} onClick={() => apply("PUMPOVER")} style={{ minHeight: 44 }}>
        Pump-over
      </Button>
      <Button variant="primary" size="sm" disabled={pending} onClick={() => apply("PUNCHDOWN")} style={{ minHeight: 44 }}>
        Punch-down
      </Button>
      <span style={{ width: "100%", marginTop: 8, fontSize: 13, color: "var(--text-muted)" }}>One tap logs it instantly — undo from the toast.</span>
    </FormShell>
  );
}

function FormShell({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{children}</div>;
}
