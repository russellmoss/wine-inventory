"use client";

import React from "react";
import { Card, Button, Badge } from "@/components/ui";
import type { WorkOrderTaskView } from "@/lib/work-orders/data";
import { completeTaskAction, undoMaintenanceTaskAction } from "@/lib/work-orders/actions";

// Plan 061: run-time sub-form for a CONSOLIDATED group maintenance task (clean/sanitize/… a barrel range as
// ONE task). All-at-once: one "Complete all N vessels" action records every member together (the backend
// writes one record-only VesselActivityEvent per barrel). No per-member picking, no batches — that is the
// deliberate scope choice vs. group-rack. The members live in the task's payload; this form only needs the
// task id + a fresh commandId to complete.

const big: React.CSSProperties = { fontSize: 16, padding: "10px 12px", minHeight: 44, borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface)", width: "100%" };
const lbl: React.CSSProperties = { fontSize: 13, color: "var(--text-muted)", display: "block", marginBottom: 4 };
const chip: React.CSSProperties = { fontSize: 12.5, padding: "3px 8px", borderRadius: 999, background: "var(--paper-100)", color: "var(--text-secondary)" };

export function GroupMaintenanceTaskForm({ task, onDone }: { task: WorkOrderTaskView; onDone: () => void }) {
  const ga = task.groupActivity;
  const [note, setNote] = React.useState("");
  const [pendingTx, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  if (!ga) {
    return (
      <Card style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{task.seq}. {task.title}</div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>This group maintenance task has no resolved members.</div>
      </Card>
    );
  }

  function completeAll() {
    setError(null);
    const commandId = crypto.randomUUID();
    startTransition(async () => {
      try {
        await completeTaskAction({ taskId: task.id, commandId, completionNote: note.trim() || undefined });
        setNote("");
        onDone();
      } catch (e) { setError(e instanceof Error ? e.message : "Couldn't record the maintenance."); }
    });
  }

  return (
    <Card style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{task.seq}. {task.title}</div>
        <Badge tone="gold">{task.status.replace(/_/g, " ").toLowerCase()}</Badge>
      </div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 12px" }}>
        {ga.activityType.toLowerCase().replace(/_/g, " ")} · <strong>{ga.count} {ga.count === 1 ? "vessel" : "vessels"}</strong> — completed together
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {ga.members.map((m) => (
          <span key={m.vesselId} style={chip}>{m.code}</span>
        ))}
      </div>

      <label style={lbl}>Note (optional)
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" style={big} />
      </label>

      {error ? <div style={{ color: "var(--danger)", fontSize: 14, marginTop: 10 }}>{error}</div> : null}
      <div style={{ marginTop: 14 }}>
        <Button size="lg" disabled={pendingTx} onClick={completeAll}>
          {pendingTx ? "Recording…" : `Complete all ${ga.count} ${ga.count === 1 ? "vessel" : "vessels"}`}
        </Button>
      </div>
    </Card>
  );
}

// The done-state affordance: undo a completed group maintenance task (reverses every member's activity event
// and REOPENS the task so it can be re-done). Self-undo: the person who recorded it, or an admin/developer.
export function GroupMaintenanceUndo({ task, onDone }: { task: WorkOrderTaskView; onDone: () => void }) {
  const [pendingTx, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  function undo() {
    setError(null);
    startTransition(async () => {
      try { await undoMaintenanceTaskAction({ taskId: task.id }); onDone(); }
      catch (e) { setError(e instanceof Error ? e.message : "Couldn't undo."); }
    });
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <Button variant="ghost" disabled={pendingTx} onClick={undo}>{pendingTx ? "Undoing…" : "Undo"}</Button>
      {error ? <span style={{ color: "var(--danger)", fontSize: 12.5 }}>{error}</span> : null}
    </span>
  );
}
