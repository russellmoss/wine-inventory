"use client";

import React from "react";
import { Button, Modal } from "@/components/ui";
import { FermentMonitor } from "@/components/ferment/FermentMonitor";
import type { CellarMaterialDTO } from "@/lib/cellar/materials";
import { correctOperationAction, revertRackAction } from "@/lib/cellar/actions";
import { correctBlendAction } from "@/lib/blend/actions";
import type { RackVesselResult } from "@/lib/vessels/rack-core";
import { vesselAnalysesAction } from "@/lib/chemistry/actions";
import type { VesselAnalyses } from "@/lib/chemistry/data";
import { AnalyteTrends } from "@/components/chemistry/AnalyteTrends";
import {
  DoseForm,
  ToppingForm,
  FiltrationForm,
  DumpForm,
  RackForm,
  CapForm,
  AnalysisForm,
  TastingForm,
  SampleForm,
  type CellarActionsVessel,
  type KegOption,
  type ResidentLot,
} from "@/components/cellar/forms";

// Re-export the shared vessel/lot/keg types so existing consumers (BulkClient) keep importing them
// from here. The sub-forms now live in @/components/cellar/forms (plan 045 Unit 5 extraction).
export type { CellarActionsVessel, KegOption, ResidentLot };

// Vessel-first cellar-op capture (Phase 3, Unit 9). An Actions row (text buttons, not an
// icon grid — anti-slop) swaps the panel to a focused form per op. Cap management is
// one-tap instant; all others preview then confirm. A "Logged · Undo" toast follows every
// capture (Undo calls the correction/void path). Token-driven, light-only, sentence-case;
// inputMode="decimal" + ≥44px targets + aria-live math for the floor. Revalidation on the
// server actions refreshes the page data; this component only owns the transient form state.

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
          <FermentMonitor key={fermentLot.lotId} vesselId={vessel.id} vesselCode={vessel.code} lotId={fermentLot.lotId} lotCode={fermentLot.code} materials={materials} />
        ) : (
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>This vessel is empty — nothing to monitor.</p>
        )}
      </Modal>
    </div>
  );
}
