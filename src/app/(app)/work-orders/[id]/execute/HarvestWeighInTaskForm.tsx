"use client";

import React from "react";
import { Card, Button, Badge } from "@/components/ui";
import type { WorkOrderTaskView } from "@/lib/work-orders/data";
import type { HarvestWeighInFormData } from "@/lib/work-orders/harvest-weigh-in-data";
import { toKg, type Unit } from "@/lib/harvest/units";
import { startTaskAction, completeTaskAction } from "@/lib/work-orders/actions";

// Plan 039 Unit 7: the run-time fruit-intake / weigh-in sub-form on the work-order execute screen. Mirrors
// the CrushTaskForm pattern — a block picker (pre-filled if the task was issued against a block) plus the
// weigh-in readings (weight in kg/lb, optional Brix/pH/TA) packed into the task's actualPayload. It calls
// the SAME completeTaskAction the generic executor uses; the dispatch (completeHarvestWeighInTaskCore)
// writes a HarvestPick to the block's current-vintage record — no cellar ledger op.

const big: React.CSSProperties = { fontSize: 16, padding: "12px 12px", minHeight: 44, borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface)", width: "100%" };
const lbl: React.CSSProperties = { fontSize: 13, color: "var(--text-muted)", display: "block", marginBottom: 4 };
const toggle = (on: boolean): React.CSSProperties => ({ ...big, cursor: "pointer", background: on ? "var(--accent)" : "var(--surface)", color: on ? "#fff" : "var(--text-primary)", border: on ? "none" : "1px solid var(--border)", flex: 1 });

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function HarvestWeighInTaskForm({ task, data, onDone }: { task: WorkOrderTaskView; data: HarvestWeighInFormData | null; onDone: () => void }) {
  const commandId = React.useMemo(() => crypto.randomUUID(), []);
  const blocks = data?.blocks ?? [];
  // Pre-fill the block if the task was issued against one; else default to the first accessible block.
  const [blockId, setBlockId] = React.useState(task.blockId ?? blocks[0]?.blockId ?? "");
  const [unit, setUnit] = React.useState<Unit>("metric");
  const [weight, setWeight] = React.useState("");
  const [brix, setBrix] = React.useState("");
  const [ph, setPh] = React.useState("");
  const [ta, setTa] = React.useState("");
  const [pickDate, setPickDate] = React.useState(todayISO);
  const [note, setNote] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const unitLabel = unit === "metric" ? "kg" : "lb";

  function complete() {
    setError(null);
    if (!blockId) return setError("Pick the vineyard block.");
    const n = Number(weight);
    if (!(weight.trim() !== "" && Number.isFinite(n) && n > 0)) return setError("Enter the fruit weight.");
    const kg = toKg(n, unit);
    if (kg == null || kg <= 0) return setError("Enter a valid fruit weight.");
    const optional = (s: string) => (s.trim() === "" ? undefined : Number(s));
    if ([brix, ph, ta].some((s) => s.trim() !== "" && !Number.isFinite(Number(s)))) return setError("Brix, pH and TA must be numbers.");

    const actualPayload: Record<string, unknown> = { blockId, weightKg: kg, pickDate };
    const bx = optional(brix); if (bx != null) actualPayload.brixAtPick = bx;
    const p = optional(ph); if (p != null) actualPayload.phAtPick = p;
    const t = optional(ta); if (t != null) actualPayload.taAtPick = t;
    if (note.trim()) actualPayload.note = note.trim();

    startTransition(async () => {
      try {
        await completeTaskAction({ taskId: task.id, commandId, actualPayload, completionNote: note.trim() || undefined });
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't record the weigh-in.");
      }
    });
  }

  const canStart = task.status === "PENDING";
  const header = (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{task.seq}. {task.title}</div>
        <Badge tone="gold">{task.status.replace(/_/g, " ").toLowerCase()}</Badge>
      </div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 14px" }}>fruit intake / weigh-in</div>
    </>
  );

  if (blocks.length === 0) {
    return (
      <Card style={{ padding: 18 }}>
        {header}
        <div style={{ fontSize: 13.5, color: "var(--text-muted)" }}>No vineyard blocks you can access. Add a block under Vineyards first.</div>
      </Card>
    );
  }

  return (
    <Card style={{ padding: 18 }}>
      {header}

      <label style={lbl}>Vineyard block
        <select style={big} value={blockId} onChange={(e) => setBlockId(e.target.value)}>
          {blocks.map((b) => <option key={b.blockId} value={b.blockId}>{b.label}{b.varietyName ? ` (${b.varietyName})` : ""}</option>)}
        </select>
      </label>

      <div style={{ marginTop: 12 }}>
        <div style={lbl}>Weight unit</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" onClick={() => setUnit("metric")} style={toggle(unit === "metric")}>kg</button>
          <button type="button" onClick={() => setUnit("imperial")} style={toggle(unit === "imperial")}>lb</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <label style={lbl}>Fruit weight ({unitLabel})
          <input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" placeholder="e.g. 1200" style={big} />
        </label>
        <label style={lbl}>Pick date
          <input type="date" value={pickDate} onChange={(e) => setPickDate(e.target.value)} style={big} />
        </label>
        <label style={lbl}>Brix (optional)
          <input value={brix} onChange={(e) => setBrix(e.target.value)} inputMode="decimal" placeholder="°Bx" style={big} />
        </label>
        <label style={lbl}>pH (optional)
          <input value={ph} onChange={(e) => setPh(e.target.value)} inputMode="decimal" placeholder="2.5–4.5" style={big} />
        </label>
        <label style={lbl}>TA — g/L tartaric (optional)
          <input value={ta} onChange={(e) => setTa(e.target.value)} inputMode="decimal" placeholder="g/L" style={big} />
        </label>
      </div>

      <label style={{ ...lbl, marginTop: 12 }}>Note (optional)
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. hand-picked, morning" style={big} />
      </label>

      {error ? <div style={{ color: "var(--danger)", fontSize: 14, marginTop: 10 }}>{error}</div> : null}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        {canStart ? <Button size="lg" variant="secondary" disabled={pending} onClick={() => startTransition(async () => { await startTaskAction({ taskId: task.id }); })}>Start</Button> : null}
        <Button size="lg" fullWidth disabled={pending} onClick={complete}>{pending ? "Recording…" : "Complete — record the weigh-in"}</Button>
      </div>
    </Card>
  );
}
