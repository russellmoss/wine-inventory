"use client";

import React from "react";
import Link from "next/link";
import { Modal, Badge, Button, ConfirmButton } from "@/components/ui";
import type { TimelineItem, OpItem, RecordItem, OpWorkOrderProvenance } from "@/lib/lot/timeline";
import { RATE_BASES, RATE_BASIS_LABELS, type RateBasis } from "@/lib/cellar/additions-math";
import { editOperationAction, deleteOperationAction } from "@/lib/cellar/actions";
import { reverseOperationAction } from "@/lib/ledger/actions";
import { voidPanelAction, voidTastingNoteAction, cancelSampleAction } from "@/lib/chemistry/actions";

// ───────────────────────── Unit 8: the timeline-entry detail modal ─────────────────────────
// Opens on any History entry. Shows full provenance (entered by / capture method / observed date+
// time / note) and, for WO-sourced ops + WORK_ORDER items, a Work-order block (issuer/completer/
// assignee + status badge + link). Edit/undo reuses the SAME server actions LotDetailClient calls —
// no refactor of LotDetailClient. After any successful mutation we call onMutated() so the parent
// refetches getVesselTimeline (occupancy may have changed — Codex #4).
//
// PRE-COMPUTED LOCK STATE (Gemini G5): the loader already stamped `reversible`/`reversalReason` and
// the `corrected`/`isCorrection` flags on each OP event. We render Edit/Undo DISABLED up-front with
// a lock hint when the op can't be edited/reversed — the user never clicks into a guaranteed reject.

const NEUTRAL_OPS = new Set(["ADDITION", "FINING", "CAP_MGMT"]);

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

export type TimelineEntryDetailProps = {
  item: TimelineItem | null;
  /** Resolve a lotId for reversing a structural OP (reverseOperationAction needs one). */
  lotIdForOp?: (item: TimelineItem) => string | null;
  onClose: () => void;
  onMutated: () => void;
};

const LockIcon = () => (
  <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>
    🔒
  </span>
);

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (children == null || children === "") return null;
  return (
    <div style={{ display: "flex", gap: 10, fontSize: 13.5, lineHeight: 1.5 }}>
      <span style={{ color: "var(--text-muted)", minWidth: 96 }}>{label}</span>
      <span style={{ color: "var(--text-primary)" }}>{children}</span>
    </div>
  );
}

function ProvenanceBlock({ item }: { item: TimelineItem }) {
  const method = item.captureMethod && item.captureMethod !== "MANUAL" ? item.captureMethod.toLowerCase() : "manual";
  const observed = new Date(item.observedAt);
  const when = Number.isNaN(observed.getTime())
    ? item.observedAt
    : observed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
      <Row label="When">
        <time dateTime={item.observedAt}>{when}</time>
      </Row>
      <Row label="Entered by">{item.enteredBy}</Row>
      <Row label="Capture">{method}</Row>
      {item.note ? <Row label="Note">{item.note}</Row> : null}
    </div>
  );
}

function WorkOrderBlock({ wo }: { wo: OpWorkOrderProvenance }) {
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;
  return (
    <div
      style={{
        borderTop: "1px solid var(--border-subtle)",
        marginTop: 4,
        paddingTop: 14,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: "var(--weight-medium)" as unknown as number, color: "var(--text-primary)" }}>
          Work order #{wo.number}
        </span>
        <Badge tone={wo.tone} variant="soft">
          {wo.statusLabel}
        </Badge>
      </div>
      <Row label="Title">{wo.title}</Row>
      <Row label="Issued by">{wo.issuedByEmail}</Row>
      <Row label="Issued">{fmt(wo.issuedAt)}</Row>
      <Row label="Assignee">{wo.assigneeEmail}</Row>
      <Row label="Completed by">{wo.completedByEmail}</Row>
      <Row label="Completed">{fmt(wo.completedAt)}</Row>
      <div style={{ marginTop: 8 }}>
        <Link href={`/work-orders/${wo.workOrderId}`} style={{ fontSize: 13, color: "var(--text-accent)" }}>
          Open work order ›
        </Link>
      </div>
    </div>
  );
}

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

// Edit form for an ADDITION/FINING/CAP_MGMT op (reuses editOperationAction; matches the lot-detail
// EditPanel field set). capKind is narrowed to the two the edit core accepts.
function NeutralEdit({ event, onMutated, onClose }: { event: OpItem; onMutated: () => void; onClose: () => void }) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const tr = event.treatments[0];
  const isDose = event.type === "ADDITION" || event.type === "FINING";
  const isCap = event.type === "CAP_MGMT";

  const [material, setMaterial] = React.useState(tr?.materialName ?? "");
  const [rate, setRate] = React.useState(tr?.rateValue != null ? String(tr.rateValue) : "");
  const [basis, setBasis] = React.useState<RateBasis>((tr?.rateBasis as RateBasis) ?? "G_HL");
  const [capKind, setCapKind] = React.useState<"PUMPOVER" | "PUNCHDOWN">(tr?.kind === "PUNCHDOWN" ? "PUNCHDOWN" : "PUMPOVER");
  const [duration, setDuration] = React.useState(tr?.durationMin != null ? String(tr.durationMin) : "");
  const [note, setNote] = React.useState(event.note ?? "");

  function act(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        onClose();
        onMutated();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  function saveEdit() {
    const opId = event.id;
    if (isDose) {
      const r = Number(rate);
      if (!material.trim() || !(r > 0)) {
        setError("Enter a material and a rate greater than 0.");
        return;
      }
      act(() => editOperationAction({ operationId: opId, materialName: material.trim(), rateValue: r, rateBasis: basis, note }));
    } else if (isCap) {
      act(() => editOperationAction({ operationId: opId, capKind, durationMin: duration ? Number(duration) : null, note }));
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {error ? <p style={{ color: "var(--danger)", fontSize: 13.5 }}>{error}</p> : null}
      {isDose ? (
        <>
          <input value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="Material" style={fieldStyle} aria-label="Material" />
          <div style={{ display: "flex", gap: 8 }}>
            <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" placeholder="Rate" style={{ ...fieldStyle, width: 110 }} aria-label="Rate" />
            <select value={basis} onChange={(e) => setBasis(e.target.value as RateBasis)} style={{ ...fieldStyle, flex: 1 }} aria-label="Basis">
              {RATE_BASES.map((b) => (
                <option key={b} value={b}>
                  {RATE_BASIS_LABELS[b]}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : null}
      {isCap ? (
        <>
          <select value={capKind} onChange={(e) => setCapKind(e.target.value as "PUMPOVER" | "PUNCHDOWN")} style={fieldStyle} aria-label="Cap kind">
            <option value="PUMPOVER">Pump-over</option>
            <option value="PUNCHDOWN">Punch-down</option>
          </select>
          <input value={duration} onChange={(e) => setDuration(e.target.value)} inputMode="decimal" placeholder="Minutes (optional)" style={fieldStyle} aria-label="Duration" />
        </>
      ) : null}
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" style={fieldStyle} aria-label="Note" />
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <ConfirmButton onConfirm={saveEdit} confirmLabel="Save changes" disabled={pending}>
          Save changes
        </ConfirmButton>
        <ConfirmButton onConfirm={() => act(() => deleteOperationAction(event.id))} confirmLabel="Delete it" disabled={pending}>
          Delete entirely
        </ConfirmButton>
      </div>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
        Delete removes it from the history (an audit record is kept).
      </span>
    </div>
  );
}

// Undo/reverse control for a structural op. Reads the loader's pre-computed verdict so it's disabled
// up-front (with the reason) when non-reversible — never a click-into-rejection.
function StructuralUndo({
  event,
  lotId,
  onMutated,
  onClose,
}: {
  event: OpItem;
  lotId: string | null;
  onMutated: () => void;
  onClose: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  if (!event.reversible) {
    return (
      <div style={{ fontSize: 13, color: "var(--text-muted)", display: "flex", gap: 6, alignItems: "center" }}>
        <LockIcon />
        {event.reversalReason ?? "This operation can’t be reversed from here."}
      </div>
    );
  }

  if (!lotId) {
    return (
      <div style={{ fontSize: 13, color: "var(--text-muted)", display: "flex", gap: 6, alignItems: "center" }}>
        <LockIcon />
        Open this operation from a lot to undo it.
      </div>
    );
  }

  const step = undoStepLabel(event.type);
  function run() {
    setError(null);
    startTransition(async () => {
      try {
        await reverseOperationAction({ operationId: event.id, lotId: lotId as string });
        onClose();
        onMutated();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn’t undo that step.");
      }
    });
  }
  return (
    <div>
      <ConfirmButton onConfirm={run} confirmLabel={pending ? "Undoing…" : `Undo ${step}`} disabled={pending}>
        {pending ? "Undoing…" : `Undo ${step}`}
      </ConfirmButton>
      {error ? (
        <div role="alert" style={{ fontSize: 12.5, color: "var(--danger)", marginTop: 6 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}

// Void/cancel for a standalone record (panel void / tasting void / sample cancel).
function RecordVoid({ item, onMutated, onClose }: { item: RecordItem; onMutated: () => void; onClose: () => void }) {
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
        onMutated();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }
  return (
    <div>
      {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 10 }}>{error}</p> : null}
      <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginBottom: 12 }}>
        {isSample
          ? "Cancel this sample — it drops off the vessel history and the open-samples list."
          : "Remove this record from the history (an audit record is kept)."}
      </p>
      <ConfirmButton onConfirm={run} confirmLabel={verb} disabled={pending}>
        {verb}
      </ConfirmButton>
    </div>
  );
}

// The action region — branches on the item kind + op family.
function ActionRegion({
  item,
  lotIdForOp,
  onMutated,
  onClose,
}: {
  item: TimelineItem;
  lotIdForOp?: (item: TimelineItem) => string | null;
  onMutated: () => void;
  onClose: () => void;
}) {
  if (item.kind === "MEASUREMENT" || item.kind === "TASTING" || item.kind === "SAMPLE") {
    return <RecordVoid item={item} onMutated={onMutated} onClose={onClose} />;
  }
  if (item.kind === "OP") {
    // Corrected / correction ops are locked (their badge already says so).
    if (item.corrected || item.isCorrection) {
      return (
        <div style={{ fontSize: 13, color: "var(--text-muted)", display: "flex", gap: 6, alignItems: "center" }}>
          <LockIcon />
          {item.corrected ? "This operation was already reversed." : "This is a correction entry."}
        </div>
      );
    }
    if (NEUTRAL_OPS.has(item.type)) {
      return <NeutralEdit event={item} onMutated={onMutated} onClose={onClose} />;
    }
    const lotId = lotIdForOp ? lotIdForOp(item) : null;
    return <StructuralUndo event={item} lotId={lotId} onMutated={onMutated} onClose={onClose} />;
  }
  // WORK_ORDER + VESSEL_ACTIVITY have no in-modal edit path here.
  return null;
}

export function TimelineEntryDetail({ item, lotIdForOp, onClose, onMutated }: TimelineEntryDetailProps) {
  if (!item) return null;

  // The WO provenance block source: a WORK_ORDER item carries its own fields; an OP item may carry
  // `workOrder` provenance (issuer/completer). Normalize a WORK_ORDER item into the same shape.
  const woProvenance: OpWorkOrderProvenance | null =
    item.kind === "OP"
      ? item.workOrder ?? null
      : item.kind === "WORK_ORDER"
        ? {
            workOrderId: item.workOrderId,
            number: item.number,
            title: item.title,
            taskStatus: item.taskStatus,
            woStatus: item.woStatus,
            tone: item.tone,
            statusLabel: item.statusLabel,
            issuedByEmail: item.issuedByEmail,
            issuedAt: item.issuedAt,
            completedByEmail: null,
            completedAt: null,
            assigneeEmail: null,
          }
        : null;

  return (
    <Modal open onClose={onClose} title={item.summary} subtitle="Timeline entry">
      <ProvenanceBlock item={item} />
      {woProvenance ? <WorkOrderBlock wo={woProvenance} /> : null}
      <div style={{ borderTop: "1px solid var(--border-subtle)", marginTop: 16, paddingTop: 16 }}>
        <ActionRegion item={item} lotIdForOp={lotIdForOp} onMutated={onMutated} onClose={onClose} />
      </div>
    </Modal>
  );
}
