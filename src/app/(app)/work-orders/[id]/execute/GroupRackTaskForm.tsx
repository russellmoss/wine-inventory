"use client";

import React from "react";
import { Card, Button, Badge, Eyebrow } from "@/components/ui";
import type { WorkOrderTaskView } from "@/lib/work-orders/data";
import { completeGroupRackBatchAction, rejectGroupRackBatchAction } from "@/lib/work-orders/actions";
import { unwrap } from "@/lib/action-result";

// Plan 054 (Phase 9.4b): the run-time group barrel-down / rack-to-tank sub-form. A group-rack task keeps
// ONE reviewable row but completes in batches — pick the members you filled/drained now, record them, and
// the rest stay pending for later. Each batch writes one balanced RACK op; the task stays IN_PROGRESS until
// the last member lands. Per-member volume is optional (blank = fill each to headroom / drain each full).

const big: React.CSSProperties = { fontSize: 16, padding: "10px 12px", minHeight: 44, borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface)", width: "100%" };
const lbl: React.CSSProperties = { fontSize: 13, color: "var(--text-muted)", display: "block", marginBottom: 4 };

export function GroupRackTaskForm({ task, onDone }: { task: WorkOrderTaskView; onDone: () => void }) {
  const gr = task.groupRack;
  const isBarrelDown = gr?.direction !== "RACK_TO_TANK";
  const pending = React.useMemo(() => (gr?.members ?? []).filter((m) => !m.done), [gr]);
  const done = React.useMemo(() => (gr?.members ?? []).filter((m) => m.done), [gr]);

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [volumes, setVolumes] = React.useState<Record<string, string>>({});
  const [loss, setLoss] = React.useState("");
  const [note, setNote] = React.useState("");
  const [pendingTx, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function run(memberIds: string[]) {
    setError(null);
    if (memberIds.length === 0) { setError("Pick at least one vessel to record."); return; }
    const perMemberVolumeL = memberIds.map((id) => { const v = Number(volumes[id]); return Number.isFinite(v) && v > 0 ? v : null; });
    const commandId = crypto.randomUUID();
    const lossL = Number(loss);
    startTransition(async () => {
      try {
        unwrap(await completeGroupRackBatchAction({ taskId: task.id, commandId, memberVesselIds: memberIds, perMemberVolumeL, lossL: Number.isFinite(lossL) && lossL > 0 ? lossL : undefined, note: note.trim() || undefined }));
        // router.refresh() re-fetches server data but preserves this client component's state — clear the
        // selection + inputs so the next batch starts fresh (else the just-completed members stay "selected").
        setSelected(new Set());
        setVolumes({});
        setLoss("");
        setNote("");
        onDone();
      } catch (e) { setError(e instanceof Error ? e.message : "Couldn't record the batch."); }
    });
  }

  function undoLast() {
    setError(null);
    startTransition(async () => {
      try { unwrap(await rejectGroupRackBatchAction({ taskId: task.id, reason: "undo last batch" })); onDone(); }
      catch (e) { setError(e instanceof Error ? e.message : "Couldn't undo the last batch."); }
    });
  }

  if (!gr) {
    // Defensive: a group-rack task with no resolved progress block — fall back to a plain message.
    return (
      <Card style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{task.seq}. {task.title}</div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>This group rack has no resolved members to complete.</div>
      </Card>
    );
  }

  const verb = isBarrelDown ? "fill" : "drain";
  const total = gr.members.length;
  return (
    <Card style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{task.seq}. {task.title}</div>
        <Badge tone="gold">{task.status.replace(/_/g, " ").toLowerCase()}</Badge>
      </div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 12px" }}>
        {isBarrelDown ? "barrel down" : "rack to tank"} · <strong>{gr.doneCount} of {total} done</strong>{gr.pendingCount > 0 ? ` · ${gr.pendingCount} to go` : " · complete"}
      </div>

      {done.length > 0 ? (
        <div style={{ marginBottom: 12 }}>
          <Eyebrow>Recorded</Eyebrow>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {done.map((m) => (
              <span key={m.vesselId} style={{ fontSize: 12.5, padding: "3px 8px", borderRadius: 999, background: "var(--paper-100)", color: "var(--text-secondary)" }}>✓ {m.code ?? m.vesselId.slice(0, 6)}</span>
            ))}
          </div>
        </div>
      ) : null}

      {pending.length > 0 ? (
        <>
          <div style={lbl}>{isBarrelDown ? "Barrels to fill now" : "Barrels to drain now"} (leave the rest for later)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {pending.map((m) => (
              <div key={m.vesselId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, fontSize: 15, cursor: "pointer" }}>
                  <input type="checkbox" checked={selected.has(m.vesselId)} onChange={() => toggle(m.vesselId)} style={{ width: 20, height: 20 }} />
                  <span>{m.code ?? m.vesselId.slice(0, 6)} <span style={{ color: "var(--text-muted)", fontSize: 12.5 }}>· {m.currentL ?? 0} / {m.capacityL ?? "?"} L{isBarrelDown && m.headroomL != null ? ` · ${m.headroomL} L room` : ""}</span></span>
                </label>
                <input
                  type="number" inputMode="decimal" step="any"
                  value={volumes[m.vesselId] ?? ""}
                  onChange={(e) => setVolumes((v) => ({ ...v, [m.vesselId]: e.target.value }))}
                  placeholder={isBarrelDown ? (m.headroomL != null ? `${m.headroomL}` : "L") : (m.currentL != null ? `${m.currentL}` : "L")}
                  aria-label={`Volume to ${verb} ${m.code ?? "vessel"}`}
                  style={{ ...big, width: 96, textAlign: "right" }}
                />
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={lbl}>Loss (L, optional)
              <input type="number" inputMode="decimal" step="any" value={loss} onChange={(e) => setLoss(e.target.value)} style={big} />
            </label>
            <label style={lbl}>Note (optional)
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" style={big} />
            </label>
          </div>

          {error ? <div style={{ color: "var(--danger)", fontSize: 14, marginTop: 10 }}>{error}</div> : null}
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <Button size="lg" disabled={pendingTx || selected.size === 0} onClick={() => run([...selected])}>
              {pendingTx ? "Recording…" : `Complete ${selected.size} now`}
            </Button>
            <Button size="lg" variant="secondary" disabled={pendingTx} onClick={() => run(pending.map((m) => m.vesselId))}>
              Complete all remaining ({pending.length})
            </Button>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>All members recorded — this task is awaiting review.</div>
      )}

      {gr.doneCount > 0 && task.status === "IN_PROGRESS" ? (
        <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <Button variant="ghost" disabled={pendingTx} onClick={undoLast}>Undo the last batch</Button>
        </div>
      ) : null}
    </Card>
  );
}
