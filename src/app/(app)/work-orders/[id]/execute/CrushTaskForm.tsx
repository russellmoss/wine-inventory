"use client";

import React from "react";
import { Card, Button, Badge, Eyebrow } from "@/components/ui";
import type { WorkOrderTaskView } from "@/lib/work-orders/data";
import type { CrushFormData } from "@/lib/ferment/crush-data";
import { startTaskAction, completeTaskAction } from "@/lib/work-orders/actions";
import { unwrap } from "@/lib/action-result";

// Plan 035 Unit 5: the native run-time de-stem/crush sub-form on the work-order execute screen. Mirrors
// the standalone CrushClient's field logic (block → picks with per-pick kg, destination vessel, measured
// output volume, crusher on / crush %, must temp, NEW-vs-ADD target) but packs the picks + settings into
// the task's actualPayload and calls the SAME completeTaskAction the generic executor uses — the dispatch
// (execute.ts CRUSH case) runs crushLotTx inside the work order's single ledger tx. Template "what"
// defaults (destemmed/crusherOn/crushedPct/mustTempC/pressCycle) prefill from plannedPayload.
//
// v1 SCOPE: a SINGLE destination vessel (the core supports destinations[] multi-dest; the WO sub-form can
// add a split later). The whole-cluster direct-press path is out of scope (use the standalone /ferment/press).

const big: React.CSSProperties = { fontSize: 16, padding: "12px 12px", minHeight: 44, borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface)", width: "100%" };
const lbl: React.CSSProperties = { fontSize: 13, color: "var(--text-muted)", display: "block", marginBottom: 4 };
const toggle = (on: boolean): React.CSSProperties => ({ ...big, cursor: "pointer", background: on ? "var(--accent)" : "var(--surface)", color: on ? "#fff" : "var(--text-primary)", border: on ? "none" : "1px solid var(--border)", flex: 1 });

export function CrushTaskForm({ task, data, onDone }: { task: WorkOrderTaskView; data: CrushFormData | null; onDone: () => void }) {
  const commandId = React.useMemo(() => crypto.randomUUID(), []);
  const planned = (task.plannedPayload ?? {}) as Record<string, unknown>;
  const blocks = data?.blocks ?? [];
  const vessels = data?.vessels ?? [];
  const plannedDestVesselId = typeof task.destVesselId === "string" && task.destVesselId ? task.destVesselId : typeof planned.destVesselId === "string" ? planned.destVesselId : "";
  const initialDestVesselId = plannedDestVesselId && vessels.some((v) => v.id === plannedDestVesselId) ? plannedDestVesselId : vessels[0]?.id ?? "";
  const plannedNote = typeof planned.note === "string" && planned.note.trim() ? planned.note.trim() : "";

  const [blockId, setBlockId] = React.useState(blocks[0]?.blockId ?? "");
  const block = blocks.find((b) => b.blockId === blockId);
  const [consumed, setConsumed] = React.useState<Record<string, string>>({});
  const [destVesselId, setDestVesselId] = React.useState(initialDestVesselId);
  const dest = vessels.find((v) => v.id === destVesselId);
  const [mode, setMode] = React.useState<"NEW" | "ADD">("NEW");
  const [addLotId, setAddLotId] = React.useState("");
  const [outputL, setOutputL] = React.useState("");
  const [destemmed, setDestemmed] = React.useState(String(planned.destemmed ?? "true") !== "false");
  const [crusherOn, setCrusherOn] = React.useState(String(planned.crusherOn ?? "true") !== "false");
  const [crushedPct, setCrushedPct] = React.useState(planned.crushedPct != null ? String(planned.crushedPct) : "100");
  const [mustTemp, setMustTemp] = React.useState(planned.mustTempC != null ? String(planned.mustTempC) : "");
  const [note, setNote] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const consumedFor = (pickId: string, remainingKg: number) => consumed[pickId] ?? String(remainingKg);
  const canAdd = (dest?.mustLots.length ?? 0) > 0;
  const effMode: "NEW" | "ADD" = canAdd && mode === "ADD" ? "ADD" : "NEW";
  const selectedPicks = (block?.picks ?? [])
    .map((p) => ({ pick: p, kg: Number(consumedFor(p.pickId, p.remainingKg)) }))
    .filter((x) => x.kg > 0);
  const totalKg = selectedPicks.reduce((a, x) => a + x.kg, 0);
  const outL = Number(outputL) || 0;
  const yieldLPerTonne = totalKg > 0 && outL > 0 ? Math.round((outL / totalKg) * 1000 * 100) / 100 : null;

  function complete() {
    setError(null);
    if (selectedPicks.length === 0) return setError("Enter consumed kg for at least one pick.");
    if (!(outL > 0)) return setError("Enter the measured must volume (liters).");
    if (!destVesselId) return setError("Pick a destination vessel.");
    if (effMode === "ADD" && !addLotId) return setError("Pick the must lot to add into.");
    for (const { pick, kg } of selectedPicks) {
      if (kg > pick.remainingKg + 1e-6) return setError(`Pick ${pick.pickDate}: only ${pick.remainingKg} kg remain.`);
    }
    const actualPayload: Record<string, unknown> = {
      picks: selectedPicks.map((x) => ({ pickId: x.pick.pickId, consumedKg: x.kg })),
      destVesselId,
      outputVolumeL: outL,
      destemmed,
      crusherOn,
      note: note.trim() || undefined,
    };
    if (crusherOn) actualPayload.crushedPct = Number(crushedPct) || 100;
    if (mustTemp) actualPayload.mustTempC = Number(mustTemp);
    if (effMode === "ADD") {
      actualPayload.addLotId = addLotId;
    } else {
      actualPayload.vintage = block?.vintageYear;
      if (block?.varietyId) actualPayload.varietyId = block.varietyId;
    }
    // Carry a template-set whole-cluster press cycle default through (crush's optional press program).
    if (planned.pressCycle != null && String(planned.pressCycle).trim()) actualPayload.pressCycle = String(planned.pressCycle);

    startTransition(async () => {
      try {
        unwrap(await completeTaskAction({ taskId: task.id, commandId, actualPayload, completionNote: note.trim() || undefined }));
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't record the crush.");
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
      <div style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 14px" }}>de-stem / crush</div>
    </>
  );

  if (blocks.length === 0) {
    return (
      <Card style={{ padding: 18 }}>
        {header}
        {plannedNote ? <PlannedGuidanceCard note={plannedNote} /> : null}
        <div style={{ fontSize: 13.5, color: "var(--text-muted)" }}>No harvest picks with fruit remaining. Record picks under Harvest first.</div>
      </Card>
    );
  }

  return (
    <Card style={{ padding: 18 }}>
      {header}
      {plannedNote ? <PlannedGuidanceCard note={plannedNote} /> : null}

      <label style={lbl}>Block (vintage)
        <select style={big} value={blockId} onChange={(e) => { setBlockId(e.target.value); setConsumed({}); }}>
          {blocks.map((b) => <option key={b.blockId} value={b.blockId}>{b.label} — {b.vintageYear}</option>)}
        </select>
      </label>

      <div style={{ marginTop: 12 }}>
        <div style={lbl}>Picks — consumed kg (default = remaining; partial allowed)</div>
        {block?.picks.map((p) => (
          <div key={p.pickId} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
            <span style={{ flex: 1, fontSize: 13 }}>{p.pickDate} · {p.remainingKg} kg left{p.brixAtPick != null ? ` · ${p.brixAtPick} °Bx` : ""}</span>
            <input value={consumedFor(p.pickId, p.remainingKg)} onChange={(e) => setConsumed((c) => ({ ...c, [p.pickId]: e.target.value }))} inputMode="decimal" aria-label={`Consumed kg for pick ${p.pickDate}`} style={{ ...big, width: 120, textAlign: "right" }} />
            <span style={{ fontSize: 12, color: "var(--text-muted)", width: 24 }}>kg</span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <label style={lbl}>Destination vessel
          <select style={big} value={destVesselId} onChange={(e) => setDestVesselId(e.target.value)}>
            {vessels.map((v) => <option key={v.id} value={v.id}>{v.code} ({v.capacityL} L)</option>)}
          </select>
        </label>
        <label style={lbl}>Target lot
          <select style={big} value={effMode === "ADD" ? addLotId : "NEW"} onChange={(e) => { if (e.target.value === "NEW") setMode("NEW"); else { setMode("ADD"); setAddLotId(e.target.value); } }}>
            <option value="NEW">New must lot</option>
            {dest?.mustLots.map((l) => <option key={l.lotId} value={l.lotId}>Add into {l.code} ({l.volumeL} L)</option>)}
          </select>
        </label>
        <label style={lbl}>Measured must (L)
          <input value={outputL} onChange={(e) => setOutputL(e.target.value)} inputMode="decimal" placeholder="e.g. 2350" style={big} />
        </label>
        <label style={lbl}>Must temp °C
          <input value={mustTemp} onChange={(e) => setMustTemp(e.target.value)} inputMode="decimal" placeholder="optional" style={big} />
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: crusherOn ? "1fr 1fr 1fr" : "1fr 1fr", gap: 12, marginTop: 12 }}>
        <div>
          <div style={lbl}>De-stemmed?</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => setDestemmed(true)} style={toggle(destemmed)}>Yes</button>
            <button type="button" onClick={() => setDestemmed(false)} style={toggle(!destemmed)}>No</button>
          </div>
        </div>
        <div>
          <div style={lbl}>Crusher rollers</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => setCrusherOn(true)} style={toggle(crusherOn)}>On</button>
            <button type="button" onClick={() => setCrusherOn(false)} style={toggle(!crusherOn)}>Off</button>
          </div>
        </div>
        {crusherOn ? (
          <label style={lbl}>% crushed
            <input value={crushedPct} onChange={(e) => setCrushedPct(e.target.value)} inputMode="decimal" placeholder="100" style={big} />
          </label>
        ) : null}
      </div>

      <label style={{ ...lbl, marginTop: 12 }}>Note (optional)
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. cold soak 3 days" style={big} />
      </label>

      <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 12 }}>
        <strong style={{ color: "var(--text-primary)" }}>{effMode === "NEW" ? `New ${block?.vintageYear ?? ""} must lot` : `Adding to ${dest?.mustLots.find((l) => l.lotId === addLotId)?.code ?? "lot"}`}</strong>
        {" · "}{totalKg > 0 ? `${Math.round(totalKg * 1000) / 1000} kg` : "no picks"}
        {yieldLPerTonne != null ? ` → ${outL} L (${yieldLPerTonne} L/t)` : ""}
      </div>

      {error ? <div style={{ color: "var(--danger)", fontSize: 14, marginTop: 10 }}>{error}</div> : null}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        {canStart ? <Button size="lg" variant="secondary" disabled={pending} onClick={() => startTransition(async () => { await startTaskAction({ taskId: task.id }); })}>Start</Button> : null}
        <Button size="lg" fullWidth disabled={pending} onClick={complete}>{pending ? "De-stemming…" : "Complete — record the crush"}</Button>
      </div>
    </Card>
  );
}

function PlannedGuidanceCard({ note }: { note: string }) {
  return (
    <Card role="region" aria-label="Planned guidance" style={{ padding: 12, marginBottom: 12, boxShadow: "var(--shadow-sm)" }}>
      <Eyebrow>Planned guidance</Eyebrow>
      <div style={{ fontSize: 13.5, marginTop: 6 }}>{note}</div>
    </Card>
  );
}
