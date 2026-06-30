"use client";

import React from "react";
import { Button, Modal } from "@/components/ui";
import { FermentMonitor } from "@/components/ferment/FermentMonitor";
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
  rackVesselAction,
  recordLossAction,
  revertRackAction,
  topVesselAction,
} from "@/lib/cellar/actions";
import { correctBlendAction } from "@/lib/blend/actions";
import type { RackVesselResult } from "@/lib/vessels/rack-core";
import {
  recordMeasurementsAction,
  recordTastingNoteAction,
  pullSampleAction,
  voidPanelAction,
  voidTastingNoteAction,
  cancelSampleAction,
  vesselAnalysesAction,
} from "@/lib/chemistry/actions";
import type { VesselAnalyses } from "@/lib/chemistry/data";
import {
  ReadingRows,
  emptyReadingRow,
  toReadingInputs,
  readingsValid,
  type ReadingRow,
} from "@/components/chemistry/ReadingRows";
import { AnalyteTrends } from "@/components/chemistry/AnalyteTrends";

// Vessel-first cellar-op capture (Phase 3, Unit 9). An Actions row (text buttons, not an
// icon grid — anti-slop) swaps the panel to a focused form per op. Cap management is
// one-tap instant; all others preview then confirm. A "Logged · Undo" toast follows every
// capture (Undo calls the correction/void path). Token-driven, light-only, sentence-case;
// inputMode="decimal" + ≥44px targets + aria-live math for the floor. Revalidation on the
// server actions refreshes the page data; this component only owns the transient form state.

export type ResidentLot = { lotId: string; code: string; varietyName: string | null };
export type CellarActionsVessel = {
  id: string;
  code: string;
  type: "BARREL" | "TANK";
  capacityL: number;
  totalL: number;
  /** Lots currently resident in this vessel — drives the D2 lot picker for chemistry records. */
  residentLots: ResidentLot[];
};
export type KegOption = { id: string; label: string; totalL: number; lotCodes?: string[] };

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

type Mode = null | "RACK" | "ADD" | "TOP" | "FINE" | "FILTER" | "CAP" | "DUMP" | "ANALYSIS" | "TASTING" | "SAMPLE";
const ACTIONS: { mode: Exclude<Mode, null>; label: string }[] = [
  { mode: "RACK", label: "Rack" },
  { mode: "ADD", label: "Add" },
  { mode: "TOP", label: "Top" },
  { mode: "FINE", label: "Fine" },
  { mode: "FILTER", label: "Filter" },
  { mode: "CAP", label: "Cap" },
  { mode: "DUMP", label: "Dump" },
  { mode: "ANALYSIS", label: "Analysis" },
  { mode: "TASTING", label: "Tasting" },
  { mode: "SAMPLE", label: "Sample" },
];

type LoggedToast = { label: string; undo: () => Promise<unknown> };

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
  const [analysesOpen, setAnalysesOpen] = React.useState(false);
  const [analyses, setAnalyses] = React.useState<VesselAnalyses | null>(null);
  const [analysesLoading, setAnalysesLoading] = React.useState(false);
  const [fermentOpen, setFermentOpen] = React.useState(false);
  const [fermentLotId, setFermentLotId] = React.useState(vessel.residentLots[0]?.lotId ?? "");
  const fermentLot = vessel.residentLots.find((l) => l.lotId === fermentLotId) ?? vessel.residentLots[0];

  // Form state resets across vessels via a `key` remount in the parent (BulkClient), so no
  // reset effect is needed here.

  async function openAnalyses() {
    setAnalysesOpen(true);
    setAnalyses(null);
    setAnalysesLoading(true);
    try {
      setAnalyses(await vesselAnalysesAction(vessel.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load analyses.");
      setAnalysesOpen(false);
    } finally {
      setAnalysesLoading(false);
    }
  }

  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // Cellar ops undo through the correction/void path (by operationId).
  function runOp(fn: () => Promise<{ operationId: number }>, label: string) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fn();
        setMode(null);
        setToast({ label, undo: () => correctOperationAction(res.operationId) });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  // Racking undoes through its own transfer-revert path (by transferId) — UNLESS the rack
  // auto-routed to a blend (into an occupied vessel), in which case undo is the blend correction.
  function runRack(fn: () => Promise<RackVesselResult>, label: string) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fn();
        setMode(null);
        if (res.kind === "BLEND") {
          setToast({ label: `blended into ${res.childCode}`, undo: () => correctBlendAction(res.operationId) });
        } else {
          setToast({ label, undo: () => revertRackAction(res.transferId) });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  // Standalone Phase 4 records undo via their own soft-delete/cancel path (the fn supplies it).
  function runRecord(fn: () => Promise<{ undo: () => Promise<unknown> }>, label: string) {
    setError(null);
    startTransition(async () => {
      try {
        const { undo } = await fn();
        setMode(null);
        setToast({ label, undo });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  function undo() {
    if (!toast) return;
    const fn = toast.undo;
    startTransition(async () => {
      try {
        await fn();
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
        <Button
          variant="ghost"
          size="sm"
          disabled={vessel.residentLots.length === 0}
          onClick={() => setFermentOpen(true)}
          style={{ minHeight: 44, marginLeft: "auto" }}
        >
          Fermentation
        </Button>
        <Button variant="ghost" size="sm" onClick={openAnalyses} style={{ minHeight: 44 }}>
          View analyses
        </Button>
      </div>

      {error ? <p style={{ color: "var(--danger)", fontSize: 13, margin: "4px 0 10px" }}>{error}</p> : null}

      {mode === "RACK" ? <RackForm vessel={vessel} kegOptions={kegOptions} pending={pending} onSubmit={runRack} /> : null}
      {mode === "ADD" ? (
        <DoseForm kind="add" vessel={vessel} materials={materials} pending={pending} onSubmit={runOp} />
      ) : null}
      {mode === "FINE" ? (
        <DoseForm kind="fine" vessel={vessel} materials={materials} pending={pending} onSubmit={runOp} />
      ) : null}
      {mode === "TOP" ? <ToppingForm vessel={vessel} kegOptions={kegOptions} pending={pending} onSubmit={runOp} /> : null}
      {mode === "FILTER" ? <FiltrationForm vessel={vessel} pending={pending} onSubmit={runOp} /> : null}
      {mode === "DUMP" ? <DumpForm vessel={vessel} pending={pending} onSubmit={runOp} /> : null}
      {mode === "CAP" ? <CapForm vessel={vessel} pending={pending} onSubmit={runOp} /> : null}
      {mode === "ANALYSIS" ? <AnalysisForm vessel={vessel} pending={pending} onSubmit={runRecord} /> : null}
      {mode === "TASTING" ? <TastingForm vessel={vessel} pending={pending} onSubmit={runRecord} /> : null}
      {mode === "SAMPLE" ? <SampleForm vessel={vessel} pending={pending} onSubmit={runRecord} /> : null}

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
          <Button variant="ghost" size="sm" disabled={pending} onClick={undo} style={{ minHeight: 36 }}>
            Undo
          </Button>
        </div>
      ) : null}

      <Modal
        open={analysesOpen}
        onClose={() => setAnalysesOpen(false)}
        title={`Analyses · ${vessel.code}`}
        subtitle={analyses ? `${analyses.panelCount} panel${analyses.panelCount === 1 ? "" : "s"} logged on this vessel` : "Loading…"}
        maxWidth="min(1200px, 94vw)"
      >
        {analysesLoading ? (
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading…</p>
        ) : (
          <AnalyteTrends
            readings={analyses?.readings ?? []}
            molecular={analyses?.molecular ?? null}
            molecularDateLabel={analyses?.molecularDateLabel ?? undefined}
            emptyHint="No analyses logged on this vessel yet — log one above."
            singleColumn
          />
        )}
      </Modal>

      <Modal
        open={fermentOpen}
        onClose={() => setFermentOpen(false)}
        title={`Fermentation monitoring · ${vessel.code}`}
        subtitle="Log sugar, pH and temperature over time"
        maxWidth="min(900px, 94vw)"
      >
        {vessel.residentLots.length > 1 ? (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
              Lot in this vessel
            </label>
            <select
              value={fermentLot?.lotId ?? ""}
              onChange={(e) => setFermentLotId(e.target.value)}
              style={{ height: 44, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", background: "var(--surface-raised)", fontSize: 14 }}
            >
              {vessel.residentLots.map((l) => (
                <option key={l.lotId} value={l.lotId}>
                  {l.code}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {fermentLot ? (
          <FermentMonitor key={fermentLot.lotId} vesselId={vessel.id} vesselCode={vessel.code} lotId={fermentLot.lotId} lotCode={fermentLot.code} />
        ) : (
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>This vessel is empty — nothing to monitor.</p>
        )}
      </Modal>
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

// ── Dump (deliberate disposal — NOT evaporation; angel's share is derived from topping) ──
function DumpForm({ vessel, pending, onSubmit }: { vessel: CellarActionsVessel; pending: boolean; onSubmit: (fn: () => Promise<{ operationId: number }>, label: string) => void }) {
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

// ── Rack (move wine to another vessel; lees loss = out − measured-in) ──
function RackForm({
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
      <select value={toVesselId} onChange={(e) => setToVesselId(e.target.value)} style={{ ...fieldStyle, flex: "1 1 170px" }} aria-label="Destination vessel">
        <option value="" disabled>
          Rack into…
        </option>
        {destinations.map((k) => (
          <option key={k.id} value={k.id}>
            {k.label} ({k.totalL} L)
          </option>
        ))}
      </select>
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

// ── Cap management (one-tap instant) ──
function CapForm({ vessel, pending, onSubmit }: { vessel: CellarActionsVessel; pending: boolean; onSubmit: (fn: () => Promise<{ operationId: number }>, label: string) => void }) {
  const [duration, setDuration] = React.useState("");
  const durNum = duration ? Number(duration) : undefined;
  const KINDS: { kind: "PUMPOVER" | "PUNCHDOWN" | "COLD_SOAK" | "MACERATION"; label: string }[] = [
    { kind: "PUMPOVER", label: "Pump-over" },
    { kind: "PUNCHDOWN", label: "Punch-down" },
    { kind: "COLD_SOAK", label: "Cold soak" },
    { kind: "MACERATION", label: "Maceration" },
  ];
  function apply(kind: "PUMPOVER" | "PUNCHDOWN" | "COLD_SOAK" | "MACERATION", label: string) {
    onSubmit(() => capManagementAction({ vesselId: vessel.id, kind, durationMin: durNum }), label.toLowerCase());
  }
  return (
    <FormShell>
      <input value={duration} onChange={(e) => setDuration(e.target.value)} inputMode="decimal" placeholder="Minutes (optional)" style={{ ...fieldStyle, width: 150 }} aria-label="Duration in minutes" />
      {KINDS.map((k) => (
        <Button key={k.kind} variant="primary" size="sm" disabled={pending} onClick={() => apply(k.kind, k.label)} style={{ minHeight: 44 }}>
          {k.label}
        </Button>
      ))}
      <span style={{ width: "100%", marginTop: 8, fontSize: 13, color: "var(--text-muted)" }}>One tap logs it instantly — undo from the toast. Cold soak (pre-ferment) and maceration (dry on skins) reuse this.</span>
    </FormShell>
  );
}

function FormShell({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{children}</div>;
}

// ── Phase 4 chemistry / tasting / sample capture ──

type RecordSubmit = (fn: () => Promise<{ undo: () => Promise<unknown> }>, label: string) => void;

/** A stable idempotency key per form mount (a double-submit/retry is a server no-op). */
function useRequestId(): string {
  return React.useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
  )[0];
}

/** Column layout for the record forms (ReadingRows + fields stack vertically). */
function ColumnShell({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>{children}</div>;
}

/** D2 lot picker: auto for 1 resident (static label), required select for >1, message when empty. */
function LotField({ residentLots, value, onChange }: { residentLots: ResidentLot[]; value: string; onChange: (v: string) => void }) {
  if (residentLots.length === 0) {
    return <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>This vessel is empty — nothing to record against.</p>;
  }
  if (residentLots.length === 1) {
    const l = residentLots[0];
    return (
      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
        Lot: <strong style={{ color: "var(--text-primary)" }}>{l.code}</strong>
        {l.varietyName ? ` · ${l.varietyName}` : ""}
      </div>
    );
  }
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...fieldStyle, flex: "1 1 220px" }} aria-label="Lot" required>
      <option value="" disabled>
        This vessel holds {residentLots.length} lots — pick one…
      </option>
      {residentLots.map((l) => (
        <option key={l.lotId} value={l.lotId}>
          {l.code}
          {l.varietyName ? ` · ${l.varietyName}` : ""}
        </option>
      ))}
    </select>
  );
}

function useLotPick(vessel: CellarActionsVessel) {
  const [lotId, setLotId] = React.useState(vessel.residentLots.length === 1 ? vessel.residentLots[0].lotId : "");
  const ready = vessel.residentLots.length > 0 && (vessel.residentLots.length === 1 || !!lotId);
  return { lotId, setLotId, ready };
}

// ── Analysis (panel of readings; live molecular SO₂) ──
function AnalysisForm({ vessel, pending, onSubmit }: { vessel: CellarActionsVessel; pending: boolean; onSubmit: RecordSubmit }) {
  const reqId = useRequestId();
  const { lotId, setLotId, ready } = useLotPick(vessel);
  const [rows, setRows] = React.useState<ReadingRow[]>([emptyReadingRow("PH")]);
  const [note, setNote] = React.useState("");
  const valid = ready && readingsValid(rows);

  function submit() {
    const readings = toReadingInputs(rows);
    onSubmit(async () => {
      const res = await recordMeasurementsAction({
        vesselId: vessel.id,
        lotId: lotId || undefined,
        readings,
        note: note.trim() || undefined,
        clientRequestId: reqId,
      });
      return { undo: () => voidPanelAction(res.panelId) };
    }, `analysis (${readings.length} reading${readings.length === 1 ? "" : "s"})`);
  }

  return (
    <ColumnShell>
      <LotField residentLots={vessel.residentLots} value={lotId} onChange={setLotId} />
      <ReadingRows rows={rows} onChange={setRows} />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" style={fieldStyle} aria-label="Note" />
      <div>
        <Button variant="primary" size="sm" disabled={pending || !valid} onClick={submit} style={{ minHeight: 44 }}>
          {pending ? "Saving…" : `Log analysis on ${vessel.code}`}
        </Button>
      </div>
    </ColumnShell>
  );
}

// ── Tasting (sensory + 1–5 structure segments + score/scale + readiness) ──
const READINESS_OPTIONS: { value: string; label: string }[] = [
  { value: "NEEDS_MORE_TIME", label: "Needs more time" },
  { value: "READY_TO_BLEND", label: "Ready to blend" },
  { value: "READY_TO_BOTTLE", label: "Ready to bottle" },
  { value: "HOLD", label: "Hold" },
  { value: "DECLINING", label: "Declining" },
];

function Segmented({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 13, color: "var(--text-muted)", minWidth: 64 }}>{label}</span>
      <div style={{ display: "flex", gap: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(on ? null : n)}
              aria-pressed={on}
              aria-label={`${label} ${n} of 5`}
              style={{
                minWidth: 44,
                minHeight: 44,
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-strong)",
                background: on ? "var(--accent)" : "var(--surface-raised)",
                color: on ? "var(--accent-on)" : "var(--text-primary)",
                cursor: "pointer",
                fontFamily: "var(--font-body)",
                fontSize: 14,
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TastingForm({ vessel, pending, onSubmit }: { vessel: CellarActionsVessel; pending: boolean; onSubmit: RecordSubmit }) {
  const reqId = useRequestId();
  const { lotId, setLotId, ready } = useLotPick(vessel);
  const [aroma, setAroma] = React.useState("");
  const [flavor, setFlavor] = React.useState("");
  const [tannin, setTannin] = React.useState<number | null>(null);
  const [acidity, setAcidity] = React.useState<number | null>(null);
  const [body, setBody] = React.useState<number | null>(null);
  const [finish, setFinish] = React.useState<number | null>(null);
  const [score, setScore] = React.useState("");
  const [scale, setScale] = React.useState<"HUNDRED_POINT" | "TWENTY_POINT">("HUNDRED_POINT");
  const [readiness, setReadiness] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const hasContent =
    [aroma, flavor, notes].some((s) => s.trim()) ||
    [tannin, acidity, body, finish].some((n) => n != null) ||
    score.trim() !== "" ||
    readiness !== "";
  const valid = ready && hasContent;

  function submit() {
    onSubmit(async () => {
      const res = await recordTastingNoteAction({
        vesselId: vessel.id,
        lotId: lotId || undefined,
        aroma: aroma.trim() || undefined,
        flavor: flavor.trim() || undefined,
        tannin,
        acidity,
        body,
        finish,
        score: score.trim() !== "" ? Number(score) : undefined,
        scoreScale: score.trim() !== "" ? scale : undefined,
        readiness: (readiness || undefined) as never,
        notes: notes.trim() || undefined,
        clientRequestId: reqId,
      });
      return { undo: () => voidTastingNoteAction(res.tastingNoteId) };
    }, "tasting note");
  }

  return (
    <ColumnShell>
      <LotField residentLots={vessel.residentLots} value={lotId} onChange={setLotId} />
      <input value={aroma} onChange={(e) => setAroma(e.target.value)} placeholder="Aroma" style={fieldStyle} aria-label="Aroma" />
      <input value={flavor} onChange={(e) => setFlavor(e.target.value)} placeholder="Flavor" style={fieldStyle} aria-label="Flavor" />
      <Segmented label="Tannin" value={tannin} onChange={setTannin} />
      <Segmented label="Acidity" value={acidity} onChange={setAcidity} />
      <Segmented label="Body" value={body} onChange={setBody} />
      <Segmented label="Finish" value={finish} onChange={setFinish} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input value={score} onChange={(e) => setScore(e.target.value)} inputMode="decimal" placeholder="Score" style={{ ...fieldStyle, width: 96 }} aria-label="Score" />
        <select value={scale} onChange={(e) => setScale(e.target.value as "HUNDRED_POINT" | "TWENTY_POINT")} style={{ ...fieldStyle, width: 120 }} aria-label="Score scale">
          <option value="HUNDRED_POINT">100-point</option>
          <option value="TWENTY_POINT">20-point</option>
        </select>
        <select value={readiness} onChange={(e) => setReadiness(e.target.value)} style={{ ...fieldStyle, flex: "1 1 180px" }} aria-label="Readiness">
          <option value="">Readiness (optional)</option>
          {READINESS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" style={fieldStyle} aria-label="Notes" />
      <div>
        <Button variant="primary" size="sm" disabled={pending || !valid} onClick={submit} style={{ minHeight: 44 }}>
          {pending ? "Saving…" : `Record tasting on ${vessel.code}`}
        </Button>
      </div>
    </ColumnShell>
  );
}

// ── Sample (pull; optional send-now) ──
function SampleForm({ vessel, pending, onSubmit }: { vessel: CellarActionsVessel; pending: boolean; onSubmit: RecordSubmit }) {
  const reqId = useRequestId();
  const { lotId, setLotId, ready } = useLotPick(vessel);
  const [source, setSource] = React.useState("");
  const [lab, setLab] = React.useState("");
  const [sendNow, setSendNow] = React.useState(false);
  const [note, setNote] = React.useState("");

  function submit() {
    onSubmit(async () => {
      const res = await pullSampleAction({
        vesselId: vessel.id,
        lotId: lotId || undefined,
        source: source.trim() || undefined,
        lab: lab.trim() || undefined,
        sendNow,
        note: note.trim() || undefined,
        clientRequestId: reqId,
      });
      return { undo: () => cancelSampleAction(res.sampleId) };
    }, sendNow ? "sample pulled + sent" : "sample pulled");
  }

  return (
    <ColumnShell>
      <LotField residentLots={vessel.residentLots} value={lotId} onChange={setLotId} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source (e.g. Barrel A3)" style={{ ...fieldStyle, flex: "1 1 180px" }} aria-label="Sample source" />
        <input value={lab} onChange={(e) => setLab(e.target.value)} placeholder="Lab (optional)" style={{ ...fieldStyle, flex: "1 1 140px" }} aria-label="Lab" />
      </div>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--text-primary)", minHeight: 44 }}>
        <input type="checkbox" checked={sendNow} onChange={(e) => setSendNow(e.target.checked)} style={{ width: 18, height: 18 }} />
        Mark sent to the lab now
      </label>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" style={fieldStyle} aria-label="Note" />
      <div>
        <Button variant="primary" size="sm" disabled={pending || !ready} onClick={submit} style={{ minHeight: 44 }}>
          {pending ? "Saving…" : `Pull sample from ${vessel.code}`}
        </Button>
      </div>
    </ColumnShell>
  );
}
