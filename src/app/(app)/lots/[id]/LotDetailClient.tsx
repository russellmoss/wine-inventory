"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Eyebrow, Badge, Metric, Button, Modal, ConfirmButton } from "@/components/ui";
import {
  formatL,
  type TimelineEvent,
  type TimelineItem,
  type TimelineLeg,
  type OpItem,
  type MeasurementItem,
  type TastingItem,
  type SampleItem,
  type LegacyOperationItem,
  type MigrationCutoverItem,
} from "@/lib/lot/timeline";
import type { LotDetail } from "@/lib/lot/data";
import { deleteOperationAction, editOperationAction } from "@/lib/cellar/actions";
import { previewReversalChainAction, reverseOperationChainAction } from "@/lib/ledger/actions";
import { archiveLotAction, unarchiveLotAction } from "@/lib/lot/lifecycle-actions";
import { voidPanelAction, voidTastingNoteAction, cancelSampleAction } from "@/lib/chemistry/actions";
import { transitionStateAction } from "@/lib/ferment/actions";
import { AnalyteTrends, type TrendReading } from "@/components/chemistry/AnalyteTrends";
import { CompositionRollup } from "@/components/lot/CompositionRollup";
import { LotIdentityControls } from "./LotIdentityControls";
import { LineageTree } from "@/components/lot/LineageTree";
import { CostPanel } from "@/components/cost/CostPanel";
import type { LotCostView } from "@/lib/cost/data";

type Tone = React.ComponentProps<typeof Badge>["tone"];

const NEUTRAL_OPS = new Set(["ADDITION", "FINING", "CAP_MGMT"]);
type EditableRecordItem = MeasurementItem | TastingItem | SampleItem;
type ReversalChainPreview = {
  executable: boolean;
  reason: string | null;
  steps: { operationId: number; type: string; observedAt: string; reversible: boolean; reason: string | null }[];
};

// Human "Undo <step>" verb per op type (falls back to the lowercased type). Reversal itself is
// decided server-side (event.reversible / event.reversalReason from the dispatcher's verdict).
const UNDO_STEP_LABEL: Record<string, string> = {
  RACK: "rack",
  TOPPING: "topping",
  FILTRATION: "filtration",
  LOSS: "dump",
  ADDITION: "addition",
  FINING: "fining",
  CAP_MGMT: "cap management",
  BOTTLE: "bottling",
  TIRAGE: "tirage",
  RIDDLING: "riddling",
  DISGORGEMENT: "disgorgement",
  DOSAGE: "dosage",
  FINISH: "finish",
};
function undoStepLabel(type: string): string {
  return UNDO_STEP_LABEL[type] ?? type.toLowerCase();
}

function formLabel(form: string): string {
  const s = form.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function formTone(form: string): Tone {
  if (form === "FINISHED") return "green";
  if (form === "BOTTLED_IN_PROCESS") return "maroon";
  return "neutral";
}
function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}
function statusTone(status: string): Tone {
  return status === "ACTIVE" ? "green" : "neutral";
}

// Phase 6: the orthogonal ferment vectors as badges (shown only when there's something to show).
function afTone(s: string): Tone {
  return s === "ACTIVE" ? "gold" : s === "DRY" ? "maroon" : "neutral";
}
function mlfTone(s: string): Tone {
  return s === "ACTIVE" ? "gold" : s === "COMPLETE" ? "green" : "neutral";
}

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

// Phase 6: advance the AF / MLF vectors from the lot page. Form flips happen via crush/press or
// automatically when a white goes dry (AF→DRY on JUICE), so there are no manual FORM buttons here.
function FermentControls({ lot }: { lot: LotDetail }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  async function advance(kind: "AF" | "MLF", to: string) {
    setBusy(true);
    setError("");
    try {
      await transitionStateAction({ lotId: lot.id, kind, to, commandId: newId() });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change state.");
    } finally {
      setBusy(false);
    }
  }

  // Only fermentable forms (or a lot already mid-ferment) get the controls — never a finished/
  // seeded WINE (offering "Start ferment" there would just hit the illegal-state guard).
  const fermentable = lot.form === "MUST" || lot.form === "JUICE" || lot.afState !== "NONE" || lot.mlfState !== "NONE";
  const afNext = lot.afState === "NONE" ? { to: "ACTIVE", label: "Start ferment" } : lot.afState === "ACTIVE" ? { to: "DRY", label: "Mark dry" } : null;
  const mlfNext = lot.mlfState === "NONE" ? { to: "ACTIVE", label: "Start MLF" } : lot.mlfState === "ACTIVE" ? { to: "COMPLETE", label: "MLF complete" } : null;
  if (!fermentable || (!afNext && !mlfNext)) return null;

  return (
    <Card style={{ flex: "1 1 280px" }}>
      <Eyebrow tone="ink">Fermentation</Eyebrow>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, fontSize: 13, color: "var(--text-secondary)" }}>
        <span>AF: <strong>{lot.afState.toLowerCase()}</strong></span>
        <span>·</span>
        <span>MLF: <strong>{lot.mlfState.toLowerCase()}</strong></span>
        {lot.stuck?.stuck ? <span style={{ color: "var(--danger)" }}>· stuck (Brix flat)</span> : null}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {afNext ? (
          <Button variant="secondary" disabled={busy} onClick={() => void advance("AF", afNext.to)}>
            {afNext.label}
          </Button>
        ) : null}
        {mlfNext ? (
          <Button variant="secondary" disabled={busy} onClick={() => void advance("MLF", mlfNext.to)}>
            {mlfNext.label}
          </Button>
        ) : null}
      </div>
      {error ? <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{error}</p> : null}
    </Card>
  );
}

function LifecycleControls({ lot }: { lot: LotDetail }) {
  const router = useRouter();
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const isArchived = lot.status === "ARCHIVED";
  const canArchive = !lot.liveHoldings.live && lot.status !== "CORRECTED" && !isArchived;
  const disabledReason = lot.status === "CORRECTED"
    ? "Corrected lots stay terminal."
    : lot.liveHoldings.live
      ? "Live vessel or bottle holdings remain."
      : "";

  function archive() {
    setError(null);
    startTransition(async () => {
      try {
        await archiveLotAction({ lotId: lot.id, reason: reason.trim() || null });
        setArchiveOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not archive this lot.");
      }
    });
  }

  function unarchive() {
    setError(null);
    startTransition(async () => {
      try {
        await unarchiveLotAction({ lotId: lot.id });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not unarchive this lot.");
      }
    });
  }

  return (
    <Card style={{ flex: "1 1 280px" }}>
      <Eyebrow tone="ink">Lifecycle</Eyebrow>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <Badge tone={statusTone(lot.status)} variant="soft">
          {statusLabel(lot.status)}
        </Badge>
        {lot.liveHoldings.bottleCount > 0 ? (
          <Badge tone="maroon" variant="soft">
            {lot.liveHoldings.bottleCount} bottles in process
          </Badge>
        ) : null}
      </div>
      <p style={{ marginTop: 10, color: "var(--text-secondary)", fontSize: 13.5 }}>
        {isArchived
          ? "Archived lots are closed to normal cellar work."
          : lot.status === "DEPLETED"
            ? "No live vessel or bottle-storage holdings."
            : "Lifecycle follows vessel and bottle-storage holdings."}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {isArchived ? (
          <ConfirmButton onConfirm={unarchive} confirmLabel={pending ? "Restoring..." : "Unarchive"} disabled={pending}>
            {pending ? "Restoring..." : "Unarchive"}
          </ConfirmButton>
        ) : (
          <Button variant="secondary" disabled={!canArchive || pending} onClick={() => setArchiveOpen(true)}>
            Archive
          </Button>
        )}
      </div>
      {!canArchive && !isArchived && disabledReason ? (
        <p style={{ color: "var(--text-muted)", fontSize: 12.5, marginTop: 8 }}>{disabledReason}</p>
      ) : null}
      {error ? <p role="alert" style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{error}</p> : null}
      {archiveOpen ? (
        <Modal open onClose={() => setArchiveOpen(false)} title="Archive lot" subtitle={lot.code}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: 0 }}>
              Archive closes this zero-balance lot from normal cellar work. It does not delete the lot or its history.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional)"
              aria-label="Archive reason"
              rows={3}
              style={{
                padding: "10px 12px",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-md)",
                background: "var(--surface-raised)",
                color: "var(--text-primary)",
                fontFamily: "var(--font-body)",
                fontSize: 14,
                resize: "vertical",
              }}
            />
            <ConfirmButton onConfirm={archive} confirmLabel={pending ? "Archiving..." : "Archive lot"} disabled={pending}>
              {pending ? "Archiving..." : "Archive lot"}
            </ConfirmButton>
          </div>
        </Modal>
      ) : null}
    </Card>
  );
}

// Operation type -> Badge tone. Type is ALSO shown as text, so this is never color-only.
function opTone(type: string): Tone {
  switch (type) {
    case "SEED":
      return "green";
    case "RACK":
    case "TOPPING":
      return "blue";
    case "BOTTLE":
      return "maroon";
    case "LOSS":
    case "FILTRATION":
    case "CORRECTION":
      return "red";
    case "ADDITION":
    case "FINING":
    case "CAP_MGMT":
      return "gold";
    default:
      return "neutral"; // ADJUST, DEPLETE
  }
}

// Human label for an op type badge (sentence-case, never raw enum where it reads oddly).
function opLabel(type: string): string {
  switch (type) {
    case "CAP_MGMT":
      return "CAP MGMT";
    default:
      return type;
  }
}

function signed(leg: TimelineLeg): string {
  const sign = leg.deltaL >= 0 ? "+" : "−";
  return `${sign}${formatL(Math.abs(leg.deltaL))} L`;
}

function LegLine({ leg }: { leg: TimelineLeg }) {
  const vol = (
    <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>{signed(leg)}</span>
  );
  if (leg.isExternal) {
    return (
      <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
        → outside the cellar{leg.reason ? ` (${leg.reason})` : ""} {vol}
      </div>
    );
  }
  return (
    <div style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "baseline" }}>
      {leg.vesselId ? (
        <Link href={`/vessels#vessel-${leg.vesselId}`} style={{ color: "var(--text-accent)" }}>
          {leg.label}
        </Link>
      ) : (
        <span style={{ color: "var(--text-secondary)" }}>{leg.label}</span>
      )}
      {vol}
    </div>
  );
}

/** Whether this event can open the edit-mode action modal. Neutral ops can be append-only voided;
 * fenced metadata edits wait for 6B. Reversal of ANY op is a separate, always-visible affordance. */
function isEditable(event: TimelineEvent): boolean {
  if (event.corrected || event.isCorrection) return false;
  return true;
}

function ChainPreview({ preview, targetId }: { preview: ReversalChainPreview; targetId: number }) {
  if (preview.steps.length <= 1) return null;
  return (
    <div style={{ margin: "10px 0", fontSize: 12.5, color: "var(--text-secondary)" }}>
      <div style={{ color: "var(--text-muted)", marginBottom: 4 }}>Undo chain</div>
      <ol style={{ margin: 0, paddingLeft: 18 }}>
        {preview.steps.map((step) => (
          <li key={step.operationId}>
            {step.type.toLowerCase()} #{step.operationId}
            {step.operationId === targetId ? " (target)" : ""}
          </li>
        ))}
      </ol>
    </div>
  );
}

// The universal, always-visible reversal affordance for one op row (024a). Reads the loader's
// verdict (event.reversible / event.reversalReason) so it never guesses: a reversible op gets a
// two-step "Undo <step>" ConfirmButton; a non-undoable op shows a muted reason (SEED/ADJUST/
// CORRECTION/coming-soon); a corrected op shows nothing (its badge already says "corrected"). On
// success the page refreshes (the row re-renders corrected); a LIFO/CONFLICT block shows inline.
function UndoControl({ event, lotId }: { event: OpItem; lotId: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<ReversalChainPreview | null>(null);

  if (event.corrected || event.isCorrection) return null;

  if (!event.reversible) {
    if (!event.reversalReason) return null;
    return <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 8 }}>{event.reversalReason}</div>;
  }

  const step = undoStepLabel(event.type);
  function previewChain() {
    setError(null);
    startTransition(async () => {
      try {
        setPreview(await previewReversalChainAction({ operationId: event.id }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't preview that undo.");
      }
    });
  }

  function run() {
    setError(null);
    startTransition(async () => {
      try {
        const expectedStepIds = preview?.steps.map((s) => s.operationId);
        await reverseOperationChainAction({ operationId: event.id, lotId, expectedStepIds });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't undo that step.");
      }
    });
  }

  return (
    <div style={{ marginTop: 10 }}>
      {!preview ? (
        <ConfirmButton onConfirm={previewChain} confirmLabel={pending ? "Checking..." : `Preview undo ${step}`} disabled={pending}>
          {pending ? "Checking..." : `Preview undo ${step}`}
        </ConfirmButton>
      ) : preview.executable ? (
        <>
          <ChainPreview preview={preview} targetId={event.id} />
          <ConfirmButton onConfirm={run} confirmLabel={pending ? "Undoing..." : preview.steps.length > 1 ? `Undo ${preview.steps.length} steps` : `Undo ${step}`} disabled={pending}>
            {pending ? "Undoing..." : preview.steps.length > 1 ? `Undo ${preview.steps.length} steps` : `Undo ${step}`}
          </ConfirmButton>
        </>
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 8 }}>{preview.reason ?? "This undo chain can't be executed."}</div>
      )}
      {error ? (
        <div role="alert" style={{ fontSize: 12.5, color: "var(--danger)", marginTop: 6 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
function OpRow({ event, editMode, onEdit, lotId }: { event: OpItem; editMode: boolean; onEdit: (e: OpItem) => void; lotId: string }) {
  const dim = event.corrected;
  return (
    <li
      style={{
        position: "relative",
        listStyle: "none",
        borderLeft: "1px solid var(--border-strong)",
        padding: "0 0 24px 20px",
        marginLeft: 4,
        opacity: dim ? 0.6 : 1,
      }}
    >
      {/* node on the rail */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: -5,
          top: 4,
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: "var(--surface-page)",
          border: "1.5px solid var(--border-strong)",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <Badge tone={opTone(event.type)} variant="soft" uppercase>
          {opLabel(event.type)}
        </Badge>
        {event.corrected ? (
          <Badge tone="neutral" variant="outline">
            {event.voided ? "voided" : "corrected"}
          </Badge>
        ) : null}
        {editMode && isEditable(event) ? (
          <Button variant="ghost" size="sm" onClick={() => onEdit(event)} style={{ minHeight: 32, marginLeft: "auto" }}>
            Edit
          </Button>
        ) : null}
      </div>
      <div style={{ fontSize: 15.5, color: "var(--text-primary)", marginBottom: 4 }}>{event.summary}</div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: event.legs.length ? 8 : 0 }}>
        <time dateTime={event.observedAt}>{event.dateLabel}</time>
        {" · "}
        {event.enteredBy}
        {event.captureMethod && event.captureMethod !== "MANUAL" ? ` · ${event.captureMethod.toLowerCase()}` : ""}
      </div>
      {event.legs.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {event.legs.map((leg, i) => (
            <LegLine key={i} leg={leg} />
          ))}
        </div>
      ) : null}
      {event.note ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6, fontStyle: "italic" }}>{event.note}</div>
      ) : null}
      {event.supplementalNote ? (
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6 }}>
          Supplemental note: {event.supplementalNote}
        </div>
      ) : null}
      <UndoControl event={event} lotId={lotId} />
    </li>
  );
}

// ── Phase 4 standalone records on the timeline (measurement / tasting / sample) ──

const READINESS_TONE: Record<string, Tone> = {
  READY_TO_BOTTLE: "green",
  READY_TO_BLEND: "green",
  NEEDS_MORE_TIME: "neutral",
  HOLD: "neutral",
  DECLINING: "red",
};
const READINESS_LABEL: Record<string, string> = {
  NEEDS_MORE_TIME: "needs more time",
  READY_TO_BLEND: "ready to blend",
  READY_TO_BOTTLE: "ready to bottle",
  HOLD: "hold",
  DECLINING: "declining",
};
const SAMPLE_TONE: Record<string, Tone> = {
  PULLED: "neutral",
  SENT: "neutral",
  PENDING: "neutral",
  RESULT_RETURNED: "gold",
  ATTACHED: "green",
};

// Shared rail shell for the standalone records — same node-dot + meta line as an op row.
function RecordRail({
  badgeTone,
  badgeLabel,
  summary,
  observedAt,
  dateLabel,
  enteredBy,
  captureMethod,
  note,
  action,
  children,
}: {
  badgeTone: Tone;
  badgeLabel: string;
  summary: string;
  observedAt: string;
  dateLabel: string;
  enteredBy: string;
  captureMethod: string;
  note: string | null;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <li
      style={{
        position: "relative",
        listStyle: "none",
        borderLeft: "1px solid var(--border-strong)",
        padding: "0 0 24px 20px",
        marginLeft: 4,
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: -5,
          top: 4,
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: "var(--surface-page)",
          border: "1.5px solid var(--border-strong)",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <Badge tone={badgeTone} variant="soft" uppercase>
          {badgeLabel}
        </Badge>
        {action ? <span style={{ marginLeft: "auto" }}>{action}</span> : null}
      </div>
      <div style={{ fontSize: 15.5, color: "var(--text-primary)", marginBottom: 4 }}>{summary}</div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: children ? 8 : 0 }}>
        <time dateTime={observedAt}>{dateLabel}</time>
        {" · "}
        {enteredBy}
        {captureMethod && captureMethod !== "MANUAL" ? ` · ${captureMethod.toLowerCase()}` : ""}
      </div>
      {children}
      {note ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6, fontStyle: "italic" }}>{note}</div>
      ) : null}
    </li>
  );
}

function EditRecordButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} style={{ minHeight: 32 }}>
      Edit
    </Button>
  );
}

function MeasurementRow({ item, editMode, onEditRecord }: { item: MeasurementItem; editMode: boolean; onEditRecord: (i: EditableRecordItem) => void }) {
  return (
    <RecordRail
      badgeTone="gold"
      badgeLabel="ANALYSIS"
      summary={item.summary}
      observedAt={item.observedAt}
      dateLabel={item.dateLabel}
      enteredBy={item.enteredBy}
      captureMethod={item.captureMethod}
      note={item.note}
      action={editMode ? <EditRecordButton onClick={() => onEditRecord(item)} /> : null}
    >
      {item.molecular ? (
        <div
          aria-label="Derived molecular SO₂"
          style={{ fontSize: 13, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums", marginTop: 2 }}
        >
          Molecular SO₂ ≈ {item.molecular.molecularSO2.toFixed(2)} mg/L · derived from free{" "}
          {item.molecular.freeSO2} + pH {item.molecular.pH.toFixed(2)} · pKa {item.molecular.pKa}
        </div>
      ) : null}
    </RecordRail>
  );
}

function TastingRow({ item, editMode, onEditRecord }: { item: TastingItem; editMode: boolean; onEditRecord: (i: EditableRecordItem) => void }) {
  const struct: [string, number | null][] = [
    ["Tannin", item.structure.tannin],
    ["Acidity", item.structure.acidity],
    ["Body", item.structure.body],
    ["Finish", item.structure.finish],
  ];
  const shownStruct = struct.filter(([, v]) => v != null);
  const sensory: [string, string | null][] = [
    ["Appearance", item.appearance],
    ["Aroma", item.aroma],
    ["Flavor", item.flavor],
  ];
  const shownSensory = sensory.filter(([, v]) => v && v.trim());
  return (
    <RecordRail
      badgeTone="maroon"
      badgeLabel="TASTING"
      summary={item.summary}
      observedAt={item.observedAt}
      dateLabel={item.dateLabel}
      enteredBy={item.enteredBy}
      captureMethod={item.captureMethod}
      note={item.note}
      action={editMode ? <EditRecordButton onClick={() => onEditRecord(item)} /> : null}
    >
      {item.readiness ? (
        <div style={{ marginBottom: shownStruct.length || shownSensory.length ? 6 : 0 }}>
          <Badge tone={READINESS_TONE[item.readiness] ?? "neutral"} variant="soft">
            {READINESS_LABEL[item.readiness] ?? item.readiness.toLowerCase()}
          </Badge>
        </div>
      ) : null}
      {shownStruct.length ? (
        <div style={{ fontSize: 13, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
          {shownStruct.map(([k, v]) => `${k} ${v}/5`).join(" · ")}
        </div>
      ) : null}
      {shownSensory.map(([k, v]) => (
        <div key={k} style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
          <span style={{ color: "var(--text-muted)" }}>{k}:</span> {v}
        </div>
      ))}
    </RecordRail>
  );
}

function SampleRow({ item, editMode, onEditRecord }: { item: SampleItem; editMode: boolean; onEditRecord: (i: EditableRecordItem) => void }) {
  return (
    <RecordRail
      badgeTone={SAMPLE_TONE[item.status] ?? "neutral"}
      badgeLabel="SAMPLE"
      summary={item.summary}
      observedAt={item.observedAt}
      dateLabel={item.dateLabel}
      enteredBy={item.enteredBy}
      captureMethod={item.captureMethod}
      note={item.note}
      action={editMode ? <EditRecordButton onClick={() => onEditRecord(item)} /> : null}
    >
      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
        Status: {item.status.toLowerCase().replace(/_/g, " ")}
        {item.lab ? ` · ${item.lab}` : ""}
      </div>
    </RecordRail>
  );
}

function LegacyOperationRow({ item }: { item: LegacyOperationItem }) {
  return (
    <RecordRail
      badgeTone="neutral"
      badgeLabel="IMPORTED HISTORY"
      summary={item.summary}
      observedAt={item.observedAt}
      dateLabel={item.dateLabel}
      enteredBy={item.enteredBy}
      captureMethod={item.captureMethod}
      note={item.note}
    >
      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
        Pre-Cellarhand archive{item.evidenceRef ? ` · ${item.evidenceRef}` : ""}
      </div>
    </RecordRail>
  );
}

function MigrationCutoverRow({ item }: { item: MigrationCutoverItem }) {
  return (
    <RecordRail
      badgeTone="blue"
      badgeLabel="CUTOVER"
      summary={item.summary}
      observedAt={item.observedAt}
      dateLabel={item.dateLabel}
      enteredBy={item.enteredBy}
      captureMethod={item.captureMethod}
      note={item.note}
    />
  );
}

function TimelineRow({
  item,
  editMode,
  onEdit,
  onEditRecord,
  lotId,
}: {
  item: TimelineItem;
  editMode: boolean;
  onEdit: (e: OpItem) => void;
  onEditRecord: (i: EditableRecordItem) => void;
  lotId: string;
}) {
  switch (item.kind) {
    case "OP":
      return <OpRow event={item} editMode={editMode} onEdit={onEdit} lotId={lotId} />;
    case "MEASUREMENT":
      return <MeasurementRow item={item} editMode={editMode} onEditRecord={onEditRecord} />;
    case "TASTING":
      return <TastingRow item={item} editMode={editMode} onEditRecord={onEditRecord} />;
    case "SAMPLE":
      return <SampleRow item={item} editMode={editMode} onEditRecord={onEditRecord} />;
    case "LEGACY_OPERATION":
      return <LegacyOperationRow item={item} />;
    case "MIGRATION_CUTOVER":
      return <MigrationCutoverRow item={item} />;
  }
}

// Edit-mode void/cancel for a standalone record (eng-review item 3). Panels + tasting notes
// soft-delete; samples cancel. Confirms, then refreshes from the server.
function RecordEditModal({ item, onClose }: { item: EditableRecordItem | null; onClose: () => void }) {
  if (!item) return null;
  return (
    <Modal open onClose={onClose} title="Edit record" subtitle={item.summary}>
      <RecordEditPanel key={`${item.kind}-${item.id}`} item={item} onClose={onClose} />
    </Modal>
  );
}

function RecordEditPanel({ item, onClose }: { item: EditableRecordItem; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const isSample = item.kind === "SAMPLE";
  const verb = isSample ? "Cancel sample" : "Remove";
  function run() {
    setError(null);
    startTransition(async () => {
      try {
        if (item.kind === "MEASUREMENT") await voidPanelAction(item.id);
        else if (item.kind === "TASTING") await voidTastingNoteAction(item.id);
        else await cancelSampleAction(item.id);
        onClose();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }
  return (
    <div>
      {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 12 }}>{error}</p> : null}
      <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 14 }}>
        {isSample
          ? "Cancel this sample — it drops off the lot timeline and the open-samples list."
          : "Remove this record from the lot timeline (an audit record is kept). Voiding a panel removes all of its readings."}
      </p>
      <ConfirmButton onConfirm={run} confirmLabel={verb} disabled={pending}>
        {verb}
      </ConfirmButton>
    </div>
  );
}

function LineageRefs({ label, refs }: { label: string; refs: { lotId: string; code: string }[] }) {
  if (refs.length === 0) return null;
  return (
    <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
      {label}:{" "}
      {refs.map((r, i) => (
        <React.Fragment key={r.lotId}>
          {i > 0 ? ", " : ""}
          <Link href={`/lots/${r.lotId}`} style={{ color: "var(--text-accent)" }}>
            {r.code}
          </Link>
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Chemistry: filterable analyte trends + derived molecular SO₂, from the lot's panels ──

/** The most recent panel that carries a derived molecular SO₂ (same-panel free SO₂ + pH). */
function latestMolecular(events: TimelineItem[]): { mol: NonNullable<MeasurementItem["molecular"]>; dateLabel: string } | null {
  let best: { mol: NonNullable<MeasurementItem["molecular"]>; dateLabel: string; t: number } | null = null;
  for (const e of events) {
    if (e.kind !== "MEASUREMENT" || !e.molecular) continue;
    const t = new Date(e.observedAt).getTime();
    if (!best || t > best.t) best = { mol: e.molecular, dateLabel: e.dateLabel, t };
  }
  return best ? { mol: best.mol, dateLabel: best.dateLabel } : null;
}

function ChemistrySection({ events }: { events: TimelineItem[] }) {
  const readings: TrendReading[] = events.flatMap((e) =>
    e.kind === "MEASUREMENT"
      ? e.readings.map((r) => ({ analyte: r.analyte, value: r.value, unit: r.unit, date: new Date(e.observedAt).getTime() }))
      : [],
  );
  const mol = latestMolecular(events);

  return (
    <div style={{ margin: "8px 0 28px" }}>
      <Eyebrow rule>Chemistry</Eyebrow>
      <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 24, margin: "10px 0 14px" }}>Analyte trends</h2>
      <AnalyteTrends
        readings={readings}
        molecular={mol?.mol ?? null}
        molecularDateLabel={mol?.dateLabel}
        emptyHint="No readings yet — log a pH or SO₂ from the vessel to start the trend."
      />
    </div>
  );
}

export function LotDetailClient({ lot, cost }: { lot: LotDetail; cost?: LotCostView }) {
  const origin = [lot.varietyName, lot.vineyardName, lot.vintageYear != null ? String(lot.vintageYear) : null].filter(
    (x): x is string => !!x,
  );
  const empty = lot.current.locations.length === 0;

  const pendingSamples = lot.events.filter((e) => e.kind === "SAMPLE" && e.status !== "ATTACHED").length;

  const [editMode, setEditMode] = React.useState(false);
  const [selected, setSelected] = React.useState<OpItem | null>(null);
  const [selectedRecord, setSelectedRecord] = React.useState<EditableRecordItem | null>(null);
  // Editable in edit mode: neutral ops (void), plus every standalone record (void/cancel).
  // Reversal of any op is the always-visible Undo control, not gated behind edit mode.
  const anyActionable = lot.events.some((e) =>
    e.kind === "OP" ? isEditable(e) : e.kind === "MEASUREMENT" || e.kind === "TASTING" || e.kind === "SAMPLE",
  );

  return (
    <div>
      <Link href="/lots" style={{ fontSize: 13.5, color: "var(--text-accent)" }}>
        ‹ All lots
      </Link>

      {/* 1 — What it is */}
      <div style={{ marginTop: 10 }}>
        <Eyebrow rule>Lot</Eyebrow>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "10px 0 6px" }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: 0 }}>{lot.code}</h1>
          <Badge tone={formTone(lot.form)} variant="soft">
            {formLabel(lot.form)}
          </Badge>
          <Badge tone={statusTone(lot.status)} variant="soft">
            {statusLabel(lot.status)}
          </Badge>
          {lot.afState !== "NONE" ? (
            <Badge tone={afTone(lot.afState)} variant="soft">
              AF {lot.afState.toLowerCase()}
            </Badge>
          ) : null}
          {lot.mlfState !== "NONE" ? (
            <Badge tone={mlfTone(lot.mlfState)} variant="soft">
              MLF {lot.mlfState.toLowerCase()}
            </Badge>
          ) : null}
          {lot.stuck?.stuck ? (
            <Badge tone="maroon" variant="soft">
              ⚠ stuck ferment
            </Badge>
          ) : null}
          {lot.isLegacy ? (
            <Badge tone="neutral" variant="soft">
              legacy
            </Badge>
          ) : null}
          {pendingSamples > 0 ? (
            <Link href="/samples">
              <Badge tone="gold" variant="soft">
                {pendingSamples} sample{pendingSamples === 1 ? "" : "s"} pending
              </Badge>
            </Link>
          ) : null}
        </div>
        <LotIdentityControls lotId={lot.id} code={lot.code} displayName={lot.displayName} aliases={lot.aliases} />
      </div>

      {/* 2 — Where it is now + 3 — Provenance + Fermentation (Phase 6) */}
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "stretch", margin: "16px 0 28px" }}>
        <FermentControls lot={lot} />
        <LifecycleControls lot={lot} />
        <Card style={{ flex: "1 1 280px" }}>
          {empty ? (
            <div>
              <Eyebrow tone="ink">Where it is now</Eyebrow>
              <p style={{ marginTop: 10, color: "var(--text-secondary)" }}>Not currently in any vessel.</p>
            </div>
          ) : (
            <>
              <Metric value={`${formatL(lot.current.totalL)} L`} caption="currently in the cellar" />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
                {lot.current.locations.map((l) => (
                  <Link key={l.vesselId} href={`/vessels#vessel-${l.vesselId}`}>
                    <Badge tone="neutral" variant="soft">
                      {l.label} · {formatL(l.volumeL)} L
                    </Badge>
                  </Link>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card style={{ flex: "1 1 280px" }}>
          <Eyebrow tone="ink">Provenance</Eyebrow>
          <p style={{ marginTop: 10, fontSize: 16, color: "var(--text-primary)" }}>
            {origin.length ? origin.join(" · ") : "—"}
          </p>
          {lot.lineage.parents.length || lot.lineage.children.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
              <LineageRefs label="Blended from" refs={lot.lineage.parents} />
              <LineageRefs label="Split into" refs={lot.lineage.children} />
            </div>
          ) : null}
        </Card>
      </div>

      {/* Phase 5: lineage composition rollup + tree (omitted entirely when the lot has none) */}
      {lot.lineageGraph ? (
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", margin: "8px 0 4px" }}>
          <Card style={{ flex: "1 1 320px" }}>
            <CompositionRollup rollup={lot.lineageGraph.rollup} />
          </Card>
          <Card style={{ flex: "1 1 320px" }}>
            <LineageTree ancestors={lot.lineageGraph.ancestors} descendants={lot.lineageGraph.descendants} />
          </Card>
        </div>
      ) : null}

      {/* Phase 8 (Unit 15): decomposed cost-per-litre trust panel + drill-down. */}
      {cost ? <CostPanel cost={cost} /> : null}

      {/* Chemistry: trends + derived molecular SO₂ */}
      <ChemistrySection events={lot.events} />

      {/* Timeline rail */}
      <Eyebrow rule>History</Eyebrow>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", margin: "10px 0 18px" }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 24, margin: 0 }}>Operation timeline</h2>
        {anyActionable ? (
          <Button variant={editMode ? "primary" : "ghost"} size="sm" onClick={() => setEditMode((v) => !v)} style={{ minHeight: 36 }}>
            {editMode ? "Done editing" : "Timeline actions"}
          </Button>
        ) : null}
      </div>
      {editMode ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "-8px 0 14px" }}>
          Pick an event to edit its supplemental note. Additions, fining and cap management can also be voided with append-only corrections.
          Analyses and tasting notes can be removed; samples can be cancelled. To reverse any operation, use its
          <strong> Undo</strong> button on the timeline.
        </p>
      ) : null}
      <ol style={{ margin: 0, padding: 0 }}>
        {lot.events.map((e) => (
          <TimelineRow key={`${e.kind}-${e.id}`} item={e} editMode={editMode} onEdit={setSelected} onEditRecord={setSelectedRecord} lotId={lot.id} />
        ))}
      </ol>

      <TimelineEditModal event={selected} onClose={() => setSelected(null)} />
      <RecordEditModal item={selectedRecord} onClose={() => setSelectedRecord(null)} />
    </div>
  );
}

// Edit-mode action modal. Neutral ops are voided append-only; fenced metadata edits wait for 6B.
function TimelineEditModal({ event, onClose }: { event: TimelineEvent | null; onClose: () => void }) {
  if (!event) return null;
  // Key by op id so the panel remounts (fresh form state from props) per event — no effect.
  return (
    <Modal open onClose={onClose} title="Timeline action" subtitle={event.summary}>
      <EditPanel key={event.id} event={event} onClose={onClose} />
    </Modal>
  );
}

function EditPanel({ event, onClose }: { event: TimelineEvent; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const isNeutral = NEUTRAL_OPS.has(event.type);
  const [supplementalNote, setSupplementalNote] = React.useState(event.supplementalNote ?? "");

  function act(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        onClose();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <div>
      {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 12 }}>{error}</p> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13.5, color: "var(--text-secondary)" }}>
          Supplemental note
          <textarea
            value={supplementalNote}
            onChange={(e) => setSupplementalNote(e.target.value)}
            rows={4}
            style={{
              padding: 10,
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-md)",
              background: "var(--surface-raised)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-body)",
              fontSize: 14,
              resize: "vertical",
            }}
          />
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <ConfirmButton onConfirm={() => act(() => editOperationAction({ operationId: event.id, supplementalNote }))} confirmLabel="Save note" disabled={pending}>
            Save note
          </ConfirmButton>
          {isNeutral ? (
            <>
              <ConfirmButton onConfirm={() => act(() => deleteOperationAction(event.id))} confirmLabel="Void operation" disabled={pending}>
                Void operation
              </ConfirmButton>
              <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Void writes a correction and keeps the original history visible.</span>
            </>
          ) : null}
        </div>
        {!isNeutral ? (
          <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Posting fields are not editable here; use Undo or a typed rebook flow.</span>
        ) : null}
      </div>
    </div>
  );
}
