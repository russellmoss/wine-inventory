"use client";

import React from "react";
import { Card, Button, Badge, Eyebrow } from "@/components/ui";
import type { WorkOrderTaskView } from "@/lib/work-orders/data";
import type { PressFormData } from "@/lib/ferment/press-data";
import { startTaskAction, completeTaskAction } from "@/lib/work-orders/actions";
import { unwrap } from "@/lib/action-result";
import { buildPressGuidance, initialPressFractionDestination, stalePinnedPressSource } from "@/lib/work-orders/press-guidance";

// Plan 035 Unit 5: the native run-time press / saignée sub-form on the work-order execute screen. Mirrors
// the standalone PressClient's must-lot path (pick the pressable position, PRESS vs SAIGNEE, the fraction
// cuts [label / vessel / volume / estimated], lees loss auto = available − Σ, press cycle) and packs the
// fractions + settings into the task's actualPayload → the SAME completeTaskAction the generic executor
// uses runs pressLotTx inside the work order's single ledger tx. The template "what" defaults (op /
// pressCycle) prefill from plannedPayload.
//
// v1 SCOPE: press a MUST lot already in a vessel (the standalone whole-cluster FRUIT press path is out of
// scope for the work-order block). Fractions merge-into is not exposed here (parity with PressLotForm).

const big: React.CSSProperties = { fontSize: 16, padding: "12px 12px", minHeight: 44, borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface)", width: "100%" };
const lbl: React.CSSProperties = { fontSize: 13, color: "var(--text-muted)", display: "block", marginBottom: 4 };

type Fraction = { id: string; destVesselId: string; volumeL: string; label: string; estimated: boolean };
const newFid = (): string => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

// Parse a hand-typed volume tolerantly: strip thousands-separator commas (e.g. "1,200" → 1200) so a value
// the crew clearly entered isn't silently read as NaN and dropped. Returns 0 when the field is blank or
// unparseable (so it fails the "> 0" checks the same way an empty field would). The <input> below is also
// type="number" to keep bad characters out at the source (parity with the bottling sub-form).
function parseVol(raw: string): number {
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function PressTaskForm({ task, data, onDone }: { task: WorkOrderTaskView; data: PressFormData | null; onDone: () => void }) {
  const commandId = React.useMemo(() => crypto.randomUUID(), []);
  const planned = (task.plannedPayload ?? {}) as Record<string, unknown>;
  const positions = data?.positions ?? [];
  const vessels = data?.vessels ?? [];
  const cycles = data?.pressCycles ?? [];
  const guidance = buildPressGuidance(task, positions, vessels);
  const stale = stalePinnedPressSource(task, positions);
  const initialDestVesselId = initialPressFractionDestination(vessels, guidance.plannedDestVesselId);

  // Prefill the position from the task's canonical lot/source vessel when the manager pinned them at issue.
  const initialKey = (() => {
    const pinned = positions.find((p) => p.lotId === task.lotId && (!task.sourceVesselId || p.vesselId === task.sourceVesselId));
    return pinned ? `${pinned.vesselId}:${pinned.lotId}` : positions[0] ? `${positions[0].vesselId}:${positions[0].lotId}` : "";
  })();
  const [posKey, setPosKey] = React.useState(initialKey);
  const pos = positions.find((p) => `${p.vesselId}:${p.lotId}` === posKey);
  const [op, setOp] = React.useState<"PRESS" | "SAIGNEE">(String(planned.op) === "SAIGNEE" ? "SAIGNEE" : "PRESS");
  const [fractions, setFractions] = React.useState<Fraction[]>([{ id: newFid(), destVesselId: initialDestVesselId, volumeL: "", label: "free-run", estimated: false }]);
  const [pressCycle, setPressCycle] = React.useState(planned.pressCycle != null ? String(planned.pressCycle) : "");
  const [note, setNote] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const fractionTotal = fractions.reduce((a, f) => a + parseVol(f.volumeL), 0);
  const available = pos?.volumeL ?? 0;
  const lees = Math.round((available - fractionTotal) * 100) / 100;

  const setFraction = (i: number, patch: Partial<Fraction>) => setFractions((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const addFraction = () => setFractions((fs) => [...fs, { id: newFid(), destVesselId: vessels[0]?.id ?? "", volumeL: "", label: "press", estimated: false }]);
  const removeFraction = (i: number) => setFractions((fs) => fs.filter((_, j) => j !== i));

  function complete() {
    setError(null);
    if (!pos) return setError("Pick a must lot to press.");
    const fr = fractions.filter((f) => parseVol(f.volumeL) > 0 && f.destVesselId);
    if (fr.length === 0) return setError("Add at least one fraction (a cut with a vessel + volume).");
    if (fractionTotal > available + 1e-6) return setError(`Fractions (${fractionTotal} L) exceed what the lot holds (${available} L).`);
    const actualPayload: Record<string, unknown> = {
      parentLotId: pos.lotId,
      sourceVesselId: pos.vesselId,
      fractions: fr.map((f) => ({ destVesselId: f.destVesselId, volumeL: parseVol(f.volumeL), label: f.label, estimated: f.estimated })),
      lossL: lees > 0 ? lees : 0,
      op,
      note: note.trim() || undefined,
    };
    if (pressCycle.trim()) actualPayload.pressCycle = pressCycle.trim();

    startTransition(async () => {
      try {
        unwrap(await completeTaskAction({ taskId: task.id, commandId, actualPayload, completionNote: note.trim() || undefined }));
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't record the press.");
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
      <div style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 14px" }}>press / saignée</div>
    </>
  );

  if (positions.length === 0) {
    return (
      <Card style={{ padding: 18 }}>
        {header}
        {guidance.items.length > 0 ? <PlannedGuidanceCard items={guidance.items} /> : null}
        <div style={{ fontSize: 13.5, color: "var(--text-muted)" }}>Nothing to press — no MUST lot is sitting in a vessel. De-stem fruit into a must lot first.</div>
      </Card>
    );
  }

  return (
    <Card style={{ padding: 18 }}>
      {header}
      {guidance.items.length > 0 ? <PlannedGuidanceCard items={guidance.items} /> : null}
      {stale.stale ? (
        <div style={{ padding: 12, borderRadius: "var(--radius-md)", background: "var(--surface-alt)", marginBottom: 12, fontSize: 13.5 }}>
          <strong>The planned source is stale.</strong> Expected {stale.expected}, but that lot/source is no longer a pressable position. Current pressable positions: {stale.current.length ? stale.current.join("; ") : "none"}.
        </div>
      ) : null}

      <label style={lbl}>Lot to press
        <select style={big} value={posKey} onChange={(e) => setPosKey(e.target.value)}>
          {positions.map((p) => (
            <option key={`${p.vesselId}:${p.lotId}`} value={`${p.vesselId}:${p.lotId}`}>{p.vesselCode} · {p.lotCode} · {p.form} ({p.volumeL} L)</option>
          ))}
        </select>
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <label style={lbl}>Operation
          <select style={big} value={op} onChange={(e) => setOp(e.target.value as "PRESS" | "SAIGNEE")}>
            <option value="PRESS">Press (free-run + press cuts)</option>
            <option value="SAIGNEE">Saignée (bleed juice off must)</option>
          </select>
        </label>
        <label style={lbl}>Press cycle (optional)
          <input value={pressCycle} onChange={(e) => setPressCycle(e.target.value)} placeholder="e.g. Champagne cycle" list="wo-press-cycles" style={big} />
          <datalist id="wo-press-cycles">{cycles.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={lbl}>Fractions</div>
        {fractions.map((f, i) => (
          <div key={f.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <input value={f.label} onChange={(e) => setFraction(i, { label: e.target.value })} placeholder="label" aria-label="Fraction label" style={{ ...big, width: 120 }} />
            <select value={f.destVesselId} onChange={(e) => setFraction(i, { destVesselId: e.target.value })} aria-label="Destination vessel" style={{ ...big, width: 150 }}>
              {vessels.map((v) => <option key={v.id} value={v.id}>{v.code}</option>)}
            </select>
            <input type="number" value={f.volumeL} onChange={(e) => setFraction(i, { volumeL: e.target.value })} inputMode="decimal" step="any" min="0" placeholder="L" aria-label="Fraction volume" style={{ ...big, width: 100, textAlign: "right" }} />
            <label style={{ fontSize: 12.5, display: "flex", gap: 4, alignItems: "center", color: "var(--text-muted)" }}>
              <input type="checkbox" checked={f.estimated} onChange={(e) => setFraction(i, { estimated: e.target.checked })} /> est.
            </label>
            {fractions.length > 1 ? <button type="button" onClick={() => removeFraction(i)} aria-label="Remove fraction" style={{ ...big, width: 44, cursor: "pointer" }}>×</button> : null}
          </div>
        ))}
        <button type="button" onClick={addFraction} style={{ ...big, width: "auto", cursor: "pointer", paddingInline: 14 }}>+ fraction</button>
      </div>

      <label style={{ ...lbl, marginTop: 12 }}>Note (optional)
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" style={big} />
      </label>

      <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 12 }}>
        {fractionTotal} L into {fractions.filter((f) => parseVol(f.volumeL) > 0).length} fraction(s){lees > 0 ? ` · ${lees} L lees` : ""}{available > 0 ? ` · of ${available} L` : ""}
      </div>

      {error ? <div style={{ color: "var(--danger)", fontSize: 14, marginTop: 10 }}>{error}</div> : null}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        {canStart ? <Button size="lg" variant="secondary" disabled={pending} onClick={() => startTransition(async () => { unwrap(await startTaskAction({ taskId: task.id })); })}>Start</Button> : null}
        <Button size="lg" fullWidth disabled={pending} onClick={complete}>{pending ? "Pressing…" : op === "SAIGNEE" ? "Complete — record the bleed" : "Complete — record the press"}</Button>
      </div>
    </Card>
  );
}

function PlannedGuidanceCard({ items }: { items: { label: string; value: string }[] }) {
  return (
    <Card role="region" aria-label="Planned guidance" style={{ padding: 12, marginBottom: 12, boxShadow: "var(--shadow-sm)" }}>
      <Eyebrow>Planned guidance</Eyebrow>
      <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
        {items.map((item) => (
          <div key={item.label} style={{ fontSize: 13.5 }}>
            <strong>{item.label}:</strong> {item.value}
          </div>
        ))}
      </div>
    </Card>
  );
}
