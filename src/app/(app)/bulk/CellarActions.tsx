"use client";

import React from "react";
import { Button, Modal, Tabs, EmptyState } from "@/components/ui";
import { FermentMonitor } from "@/components/ferment/FermentMonitor";
import type { CellarMaterialDTO } from "@/lib/cellar/materials";
import { correctOperationAction, revertRackAction } from "@/lib/cellar/actions";
import { correctBlendAction } from "@/lib/blend/actions";
import type { RackVesselResult } from "@/lib/vessels/rack-core";
import { vesselAnalysesAction } from "@/lib/chemistry/actions";
import type { VesselAnalyses } from "@/lib/chemistry/data";
import { AnalyteTrends } from "@/components/chemistry/AnalyteTrends";
import { getVesselTimelineAction } from "@/lib/vessel/timeline-actions";
import type { VesselTimeline as VesselTimelineData } from "@/lib/vessel/timeline-data";
import type { TimelineItem } from "@/lib/lot/timeline";
import { VesselTimeline } from "@/components/vessel/VesselTimeline";
import { TimelineEntryDetail } from "@/components/vessel/TimelineEntryDetail";
import { IssueWorkOrderPanel } from "@/components/vessel/IssueWorkOrderPanel";
import { NAV_V2_ENABLED } from "@/lib/nav/flag";
import { tankDetailAction } from "@/lib/vessels/tank-detail-actions";
import type { TankDetail } from "@/lib/vessels/tank-detail-data";
import { TankFermentPanel } from "./TankFermentPanel";
import { matchesFilter } from "@/lib/vessel/timeline-view";
import { vesselLabel } from "@/lib/lot/timeline";
import {
  DoseForm,
  ToppingForm,
  FiltrationForm,
  DumpForm,
  LongTailForm,
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

type Mode = null | "RACK" | "ADD" | "TOP" | "FINE" | "FILTER" | "CAP" | "DUMP" | "LONG_TAIL" | "ANALYSIS" | "TASTING" | "SAMPLE";
const ACTIONS: { mode: Exclude<Mode, null>; label: string }[] = [
  { mode: "RACK", label: "Rack" },
  { mode: "ADD", label: "Add" },
  { mode: "TOP", label: "Top" },
  { mode: "FINE", label: "Fine" },
  { mode: "FILTER", label: "Filter" },
  { mode: "CAP", label: "Cap" },
  { mode: "DUMP", label: "Dump" },
  { mode: "LONG_TAIL", label: "Long-tail" },
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
  // Plan 045: the "History" workspace modal (Actions / Analyses / History tabs). Opens from one
  // button; loads the timeline + analyses on open and refetches them after any mutation.
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [analyses, setAnalyses] = React.useState<VesselAnalyses | null>(null);
  const [analysesLoading, setAnalysesLoading] = React.useState(false);
  const [timeline, setTimeline] = React.useState<VesselTimelineData | null>(null);
  const [timelineLoading, setTimelineLoading] = React.useState(false);
  const [timelineError, setTimelineError] = React.useState(false);
  const [detailItem, setDetailItem] = React.useState<TimelineItem | null>(null);
  const [issueWoOpen, setIssueWoOpen] = React.useState(false);
  // Phase 6 (SC-11): the Fermentation + Tasting feeds. Fetched on open, like the timeline —
  // the board must not carry every vessel's readings.
  const [tankDetail, setTankDetail] = React.useState<TankDetail | null>(null);
  const [tankDetailLoading, setTankDetailLoading] = React.useState(false);
  const [tankDetailError, setTankDetailError] = React.useState(false);
  const fermentLot = vessel.residentLots[0];

  // Form state resets across vessels via a `key` remount in the parent (BulkClient), so no
  // reset effect is needed here.

  const loadAnalyses = React.useCallback(async () => {
    setAnalysesLoading(true);
    try {
      setAnalyses(await vesselAnalysesAction(vessel.id));
    } catch {
      setAnalyses(null);
    } finally {
      setAnalysesLoading(false);
    }
  }, [vessel.id]);

  const loadTankDetail = React.useCallback(async () => {
    if (!NAV_V2_ENABLED) return;
    setTankDetailLoading(true);
    setTankDetailError(false);
    try {
      setTankDetail(await tankDetailAction(vessel.id));
    } catch {
      // NEVER fall through to the empty state here. "No readings yet for this tank" is a
      // claim about the cellar record; a failed fetch is a claim about the network. Saying
      // the first when the second happened is how a winemaker concludes nobody sampled.
      setTankDetail(null);
      setTankDetailError(true);
    } finally {
      setTankDetailLoading(false);
    }
  }, [vessel.id]);

  const loadTimeline = React.useCallback(async () => {
    setTimelineLoading(true);
    setTimelineError(false);
    try {
      setTimeline(await getVesselTimelineAction(vessel.id));
    } catch {
      setTimelineError(true);
    } finally {
      setTimelineLoading(false);
    }
  }, [vessel.id]);

  // Refetch both feeds after a mutation (an edit/undo can shift the occupancy window — Codex #4 —
  // so never optimistic-patch; a full reload recomputes the window).
  const refreshWorkspace = React.useCallback(() => {
    void loadTimeline();
    void loadAnalyses();
    void loadTankDetail();
  }, [loadTimeline, loadAnalyses, loadTankDetail]);

  function openHistory() {
    setHistoryOpen(true);
    setIssueWoOpen(false);
    void loadTimeline();
    void loadAnalyses();
    void loadTankDetail();
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
        refreshWorkspace();
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
        refreshWorkspace();
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
        refreshWorkspace();
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
        refreshWorkspace();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't undo.");
      }
    });
  }

  // ── Actions tab: log any cellar action (mode-switch over the extracted forms) + issue a work order.
  const actionsTab = (
    <div>
      {issueWoOpen ? (
        <IssueWorkOrderPanel
          vesselId={vessel.id}
          vesselLabel={vesselLabel(vessel.type, vessel.code)}
          onClose={() => setIssueWoOpen(false)}
          onIssued={() => void loadTimeline()}
        />
      ) : (
        <>
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
            <Button variant="ghost" size="sm" onClick={() => setIssueWoOpen(true)} style={{ minHeight: 44, marginLeft: "auto" }}>
              Issue work order
            </Button>
          </div>

          {error ? <p style={{ color: "var(--danger)", fontSize: 13, margin: "4px 0 10px" }}>{error}</p> : null}

          {mode === "RACK" ? <RackForm vessel={vessel} kegOptions={kegOptions} pending={pending} onSubmit={runRack} /> : null}
          {mode === "ADD" ? <DoseForm kind="add" vessel={vessel} materials={materials} pending={pending} onSubmit={runOp} /> : null}
          {mode === "FINE" ? <DoseForm kind="fine" vessel={vessel} materials={materials} pending={pending} onSubmit={runOp} /> : null}
          {mode === "TOP" ? <ToppingForm vessel={vessel} kegOptions={kegOptions} pending={pending} onSubmit={runOp} /> : null}
          {mode === "FILTER" ? <FiltrationForm vessel={vessel} pending={pending} onSubmit={runOp} /> : null}
          {mode === "DUMP" ? <DumpForm vessel={vessel} pending={pending} onSubmit={runOp} /> : null}
          {mode === "CAP" ? <CapForm vessel={vessel} pending={pending} onSubmit={runOp} /> : null}
          {mode === "LONG_TAIL" ? <LongTailForm vessel={vessel} pending={pending} onSubmit={runOp} /> : null}
          {mode === "ANALYSIS" ? <AnalysisForm vessel={vessel} pending={pending} onSubmit={runRecord} /> : null}
          {mode === "TASTING" ? <TastingForm vessel={vessel} pending={pending} onSubmit={runRecord} /> : null}
          {mode === "SAMPLE" ? <SampleForm vessel={vessel} pending={pending} onSubmit={runRecord} /> : null}

          {toast ? (
            <div
              role="status"
              style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--accent-soft)", border: "1px solid var(--border-strong)", fontSize: 13.5 }}
            >
              <span style={{ color: "var(--text-primary)" }}>Logged · {toast.label}</span>
              <Button variant="ghost" size="sm" disabled={pending} onClick={undo} style={{ minHeight: 36 }}>
                Undo
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );

  // ── Analyses tab: fermentation monitoring (interactive chart + readings + state) + all-analyte trends.
  const analysesTab = (
    <div>
      {/* No "Lot in this vessel" select: the vessel IS the wine (LEDGER-12), so the monitor charts it. */}
      {fermentLot ? (
        <FermentMonitor key={fermentLot.lotId} vesselId={vessel.id} vesselCode={vessel.code} lotId={fermentLot.lotId} lotCode={fermentLot.code} materials={materials} />
      ) : (
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>This vessel is empty — nothing to monitor.</p>
      )}
      <div style={{ marginTop: 24, borderTop: "1px solid var(--border-subtle)", paddingTop: 16 }}>
        <span style={{ fontSize: 12.5, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-muted)" }}>All analyses over time</span>
        <div style={{ marginTop: 10 }}>
          {analysesLoading && !analyses ? (
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading…</p>
          ) : (
            <AnalyteTrends
              readings={analyses?.readings ?? []}
              molecular={analyses?.molecular ?? null}
              molecularDateLabel={analyses?.molecularDateLabel ?? undefined}
              emptyHint="No analyses logged on this vessel yet — log a reading above."
              singleColumn
            />
          )}
        </div>
      </div>
    </div>
  );

  // ── Fermentation tab (SC-11, default): the Brix + temperature curve and the numbers, all
  // from ONE derivation so the annotations cannot contradict the stated facts (AC-S27).
  const fermentTab = (
    <TankFermentPanel
      facts={tankDetail?.facts ?? null}
      loading={tankDetailLoading}
      error={tankDetailError}
      onRetry={() => void loadTankDetail()}
    />
  );

  // ── Tasting notes tab (DM-46). Scoped to the resident lots, so it follows the wine.
  const tastingTab = (
    <div>
      {tankDetailLoading && !tankDetail ? (
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading…</p>
      ) : tankDetailError ? (
        <EmptyState
          title="Couldn't load tasting notes"
          actions={<Button size="sm" onClick={() => void loadTankDetail()}>Try again</Button>}
        >
          The notes on this wine could not be read. This is not the same as there being none.
        </EmptyState>
      ) : (tankDetail?.tastingNotes.length ?? 0) === 0 ? (
        <EmptyState title="No tasting notes on this wine yet">
          Notes recorded against the lot in this tank appear here.
        </EmptyState>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          {(tankDetail?.tastingNotes ?? []).map((n) => (
            <li key={n.id} style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 10 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{n.observedAt.slice(0, 10)}</span>
                <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{n.taster}</span>
                {n.score != null ? <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>score {n.score}</span> : null}
              </div>
              {[["Appearance", n.appearance], ["Aroma", n.aroma], ["Flavour", n.flavor], ["Notes", n.notes]]
                .filter(([, v]) => v)
                .map(([label, v]) => (
                  <p key={label as string} style={{ margin: "4px 0 0", fontSize: 14, color: "var(--text-primary)" }}>
                    <span style={{ color: "var(--text-muted)" }}>{label}: </span>
                    {v}
                  </p>
                ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  // ── Additions tab: the timeline narrowed to ADDITION/FINING. Reuses the feed already
  // loaded and the same bucket logic the History chips use, so "an addition" means exactly
  // one thing on this page.
  const additionItems = (timeline?.items ?? []).filter((i) => matchesFilter(i, "additions"));
  const additionsTab = (
    <div>
      {timelineLoading && !timeline ? (
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading…</p>
      ) : timelineError ? (
        // Same feed as History, so it must tell the same truth when the feed fails.
        // "Nothing added" would be a false statement about the cellar record.
        <EmptyState
          title="Couldn't load this tank's activity"
          actions={<Button size="sm" onClick={() => void loadTimeline()}>Try again</Button>}
        >
          Additions could not be read. This is not the same as there being none.
        </EmptyState>
      ) : additionItems.length === 0 ? (
        <EmptyState title="Nothing added to this tank yet">
          Additions and finings recorded on this vessel appear here.
        </EmptyState>
      ) : (
        <VesselTimeline
          vesselCode={vessel.code}
          items={additionItems}
          windowStartAt={timeline?.windowStartAt ?? null}
          onOpenEntry={(item) => setDetailItem(item)}
          loading={timelineLoading}
          error={timelineError}
          onRetry={() => void loadTimeline()}
        />
      )}
    </div>
  );

  // ── History tab: the occupancy-scoped activity timeline (read); each entry opens the detail modal.
  const historyTab = (
    <VesselTimeline
      vesselCode={vessel.code}
      items={timeline?.items ?? []}
      windowStartAt={timeline?.windowStartAt ?? null}
      onOpenEntry={(item) => setDetailItem(item)}
      loading={timelineLoading}
      error={timelineError}
      onRetry={() => void loadTimeline()}
    />
  );

  return (
    <div style={{ borderTop: "1px solid var(--border-strong)", paddingTop: 14, marginTop: 4 }}>
      <Button variant="primary" size="sm" onClick={openHistory} style={{ minHeight: 44 }}>
        History
      </Button>

      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={`History · ${vessel.code}`}
        subtitle="Everything done to this vessel"
        maxWidth="min(1100px, 96vw)"
        fullScreenOnMobile
      >
        {/* Phase 6 (SC-11): five tabs with the flag on, Fermentation first. The legacy
            three-tab set stays in the else arm — same rollback story as the board. */}
        <Tabs
          defaultTab={NAV_V2_ENABLED ? "fermentation" : "history"}
          tabs={
            NAV_V2_ENABLED
              ? [
                  { id: "fermentation", label: "Fermentation", content: fermentTab },
                  { id: "analyses", label: "Analyses", content: analysesTab },
                  { id: "tasting", label: "Tasting notes", content: tastingTab },
                  { id: "history", label: "History", content: historyTab },
                  { id: "additions", label: "Additions", content: additionsTab },
                  { id: "actions", label: "Actions", content: actionsTab },
                ]
              : [
                  { id: "actions", label: "Actions", content: actionsTab },
                  { id: "analyses", label: "Analyses", content: analysesTab },
                  { id: "history", label: "History", content: historyTab },
                ]
          }
        />
      </Modal>

      <TimelineEntryDetail
        item={detailItem}
        lotIdForOp={() => vessel.residentLots[0]?.lotId ?? null}
        onClose={() => setDetailItem(null)}
        onMutated={() => {
          setDetailItem(null);
          refreshWorkspace();
        }}
      />
    </div>
  );
}
