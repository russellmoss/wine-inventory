"use client";

import React from "react";
import Link from "next/link";
import { Modal, Badge, ConfirmButton, LocalTime } from "@/components/ui";
import type { TimelineItem, OpItem, RecordItem, OpWorkOrderProvenance } from "@/lib/lot/timeline";
import { deleteOperationAction, editOperationAction } from "@/lib/cellar/actions";
import { previewReversalChainAction, reverseOperationChainAction } from "@/lib/ledger/actions";
import { voidPanelAction, voidTastingNoteAction, cancelSampleAction } from "@/lib/chemistry/actions";
import { describeLotIdentityAction } from "@/lib/lot/naming-actions";

// Phase 1 (identity presentation, plan U4): the honest "renamed → / also-known-as" affordance. Timeline
// entries render the code AS-RECORDED (the immutable snapshot); this surfaces the lot's CURRENT code +
// prior codes / legacy aliases so a reader sees the rename history without any snapshot being rewritten
// (NAMING-2). Neutral provenance styling (design-review): a muted line, never an alert.
function LotAkaBlock({ lotId }: { lotId: string }) {
  const [info, setInfo] = React.useState<{ currentCode: string; displayName: string | null; aliases: string[] } | null>(null);
  React.useEffect(() => {
    let live = true;
    describeLotIdentityAction({ lotId })
      .then((r) => { if (live && r) setInfo({ currentCode: r.currentCode, displayName: r.displayName, aliases: r.aliases.map((a) => a.value) }); })
      .catch(() => {});
    return () => { live = false; };
  }, [lotId]);
  if (!info || (info.aliases.length === 0 && !info.displayName)) return null;
  return (
    <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 8 }}>
      Lot <span style={{ color: "var(--text-secondary)" }}>{info.currentCode}</span>
      {info.displayName ? ` (${info.displayName})` : ""}
      {info.aliases.length > 0 ? <> · formerly / also: {info.aliases.join(", ")}</> : null}
    </div>
  );
}

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

type ReversalChainPreview = {
  executable: boolean;
  reason: string | null;
  steps: { operationId: number; type: string; observedAt: string; reversible: boolean; reason: string | null }[];
};

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
  /** Resolve a lotId for reversing an OP (the chain executor needs one for revalidation). */
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
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
      <Row label="When">
        <LocalTime value={item.observedAt} options={{ dateStyle: "medium", timeStyle: "short" }} invalidText={item.observedAt} />
      </Row>
      <Row label="Entered by">{item.enteredBy}</Row>
      <Row label="Capture">{method}</Row>
      {item.note ? <Row label="Note">{item.note}</Row> : null}
      {item.kind === "OP" && item.supplementalNote ? <Row label="Supplemental">{item.supplementalNote}</Row> : null}
    </div>
  );
}

function WorkOrderBlock({ wo }: { wo: OpWorkOrderProvenance }) {
  const fmt = (iso: string | null) =>
    iso ? <LocalTime value={iso} options={{ dateStyle: "medium", timeStyle: "short" }} /> : null;
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

function MetadataEdit({
  event,
  allowVoid,
  onMutated,
  onClose,
}: {
  event: OpItem;
  allowVoid: boolean;
  onMutated: () => void;
  onClose: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [supplementalNote, setSupplementalNote] = React.useState(event.supplementalNote ?? "");

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {error ? <p style={{ color: "var(--danger)", fontSize: 13.5 }}>{error}</p> : null}
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
        {allowVoid ? (
          <ConfirmButton onConfirm={() => act(() => deleteOperationAction(event.id))} confirmLabel="Void operation" disabled={pending}>
            Void operation
          </ConfirmButton>
        ) : null}
      </div>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
        Posting fields are not editable here. {allowVoid ? "Void writes a correction and keeps the original history visible." : "Use Undo or a typed rebook flow for operational changes."}
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
  const [preview, setPreview] = React.useState<ReversalChainPreview | null>(null);

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
  function previewChain() {
    setError(null);
    startTransition(async () => {
      try {
        setPreview(await previewReversalChainAction({ operationId: event.id }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn’t preview that undo.");
      }
    });
  }

  function run() {
    setError(null);
    startTransition(async () => {
      try {
        const expectedStepIds = preview?.steps.map((s) => s.operationId);
        await reverseOperationChainAction({ operationId: event.id, lotId: lotId as string, expectedStepIds });
        onClose();
        onMutated();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn’t undo that step.");
      }
    });
  }
  return (
    <div>
      {!preview ? (
        <ConfirmButton onConfirm={previewChain} confirmLabel={pending ? "Checking…" : `Preview undo ${step}`} disabled={pending}>
          {pending ? "Checking…" : `Preview undo ${step}`}
        </ConfirmButton>
      ) : preview.executable ? (
        <>
          <ChainPreview preview={preview} targetId={event.id} />
          <ConfirmButton onConfirm={run} confirmLabel={pending ? "Undoing…" : preview.steps.length > 1 ? `Undo ${preview.steps.length} steps` : `Undo ${step}`} disabled={pending}>
            {pending ? "Undoing…" : preview.steps.length > 1 ? `Undo ${preview.steps.length} steps` : `Undo ${step}`}
          </ConfirmButton>
        </>
      ) : (
        <div style={{ fontSize: 13, color: "var(--text-muted)", display: "flex", gap: 6, alignItems: "center" }}>
          <LockIcon />
          {preview.reason ?? "This undo chain can't be executed."}
        </div>
      )}
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
    const lotId = lotIdForOp ? lotIdForOp(item) : null;
    if (item.workOrder) {
      if (NEUTRAL_OPS.has(item.type)) {
        return (
          <div style={{ fontSize: 13, color: "var(--text-muted)", display: "flex", gap: 6, alignItems: "center" }}>
            <LockIcon />
            Logged by work order #{item.workOrder.number} - to change or remove it, reject that work order&apos;s task.
          </div>
        );
      }
      return <StructuralUndo event={item} lotId={lotId} onMutated={onMutated} onClose={onClose} />;
    }
    if (NEUTRAL_OPS.has(item.type)) {
      return <MetadataEdit event={item} allowVoid onMutated={onMutated} onClose={onClose} />;
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <MetadataEdit event={item} allowVoid={false} onMutated={onMutated} onClose={onClose} />
        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 14 }}>
          <StructuralUndo event={item} lotId={lotId} onMutated={onMutated} onClose={onClose} />
        </div>
      </div>
    );
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
      {(() => {
        const lotId = lotIdForOp ? lotIdForOp(item) : null;
        return lotId ? <LotAkaBlock lotId={lotId} /> : null;
      })()}
      {woProvenance ? <WorkOrderBlock wo={woProvenance} /> : null}
      <div style={{ borderTop: "1px solid var(--border-subtle)", marginTop: 16, paddingTop: 16 }}>
        <ActionRegion item={item} lotIdForOp={lotIdForOp} onMutated={onMutated} onClose={onClose} />
      </div>
    </Modal>
  );
}
