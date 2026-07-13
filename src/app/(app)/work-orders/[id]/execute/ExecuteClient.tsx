"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Badge, Eyebrow, Textarea } from "@/components/ui";
import type { WorkOrderDetail, WorkOrderTaskView } from "@/lib/work-orders/data";
import { TASK_VOCABULARY, fieldLabel } from "@/lib/work-orders/template-vocabulary";
import type { CustomLogFieldSpec } from "@/lib/work-orders/custom-log-fields";
import { startTaskAction, completeTaskAction, completeTasksBatchAction } from "@/lib/work-orders/actions";
import type { CrushFormData } from "@/lib/ferment/crush-data";
import type { PressFormData } from "@/lib/ferment/press-data";
import type { HarvestWeighInFormData } from "@/lib/work-orders/harvest-weigh-in-data";
import type { BottlingTaskFormData } from "@/lib/bottling/bottling-task-data";
import { CrushTaskForm } from "./CrushTaskForm";
import { PressTaskForm } from "./PressTaskForm";
import { HarvestWeighInTaskForm } from "./HarvestWeighInTaskForm";
import { BottlingTaskForm } from "./BottlingTaskForm";
import { GroupRackTaskForm } from "./GroupRackTaskForm";
import { GroupMaintenanceTaskForm, GroupMaintenanceUndo } from "./GroupMaintenanceTaskForm";
import { MaterialFilterPicker } from "@/components/work-orders/MaterialFilterPicker";
import { materialScopeForTask } from "@/lib/cellar/material-taxonomy";
import { CAP_LABELS } from "@/lib/cellar/cap-vocab";
import { computeDoseTotal, convertDoseToStock } from "@/lib/cellar/additions-math";

// Floor-first execution (Phase 9 Unit 12, D2): one task in focus, big prefilled actuals (≥44px targets,
// inputMode decimal), commandId minted once per task (offline-drain-safe idempotency — same contract the
// Dexie outbox uses). Not harvest-grade offline yet (Phase 28); online status is pinned via aria-live.

type Picker = { id: string; label: string; unit?: string | null; kind?: string | null; category?: string | null; subcategory?: string | null; onHand?: number | null; volumeL?: number | null; capacityL?: number | null };
const TASK_TYPE_BY_OP: Record<string, string> = { RACK: "RACK", ADDITION: "ADDITION", FINING: "FINING", TOPPING: "TOPPING", FILTRATION: "FILTRATION", CAP_MGMT: "CAP_MGMT" };
const big: React.CSSProperties = { fontSize: 16, padding: "12px 12px", minHeight: 44, borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface)", width: "100%" };
const lbl: React.CSSProperties = { fontSize: 13, color: "var(--text-muted)", display: "block", marginBottom: 4 };

// A clear "do this → to this → with this much" summary line for the read-only execution view.
type SummaryRow = { label: string; value: string; strong?: boolean };

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Build the read-only "story" a cellarhand reads before acting. Resolves the planned payload's raw ids to
 * human vessel/material labels and — for additions/finings — states the dose WITH ITS UNITS plus the
 * computed total to weigh/measure out (from the vessel volume). If the addition was dictated as a %
 * solution (e.g. "10% KMBS"), the total solution volume is stated too, so the crew knows how much liquid
 * to actually add. Mirrors the printable work-order logic (data.ts getWorkOrderPrintView).
 */
function buildSummary(
  task: WorkOrderTaskView,
  def: (typeof TASK_VOCABULARY)[string] | undefined,
  pickers: { vessels: Picker[]; materials: Picker[]; lots: Picker[] },
): { rows: SummaryRow[]; headline: string | null } {
  const p = (task.plannedPayload ?? {}) as Record<string, unknown>;
  const rows: SummaryRow[] = [];
  const vLabel = (id?: string | null) => (id ? pickers.vessels.find((v) => v.id === id)?.label ?? null : null);
  const mMat = (id?: string | null) => (id ? pickers.materials.find((m) => m.id === id) ?? null : null);
  const lLabel = (id?: string | null) => (id ? pickers.lots.find((l) => l.id === id)?.label ?? null : null);
  const vessel = (id?: string | null) => (id ? pickers.vessels.find((v) => v.id === id) ?? null : null);

  const fromV = vLabel(str(p.fromVesselId) ?? task.sourceVesselId);
  const toV = vLabel(str(p.toVesselId) ?? task.destVesselId);
  const singleVId = str(p.vesselId) ?? task.destVesselId ?? task.sourceVesselId;
  const singleV = vLabel(singleVId);
  if (fromV && toV) { rows.push({ label: "From", value: fromV }); rows.push({ label: "To", value: toV, strong: true }); }
  else if (singleV) rows.push({ label: "Vessel", value: singleV, strong: true });

  const lotLabel = lLabel(str(p.lotId) ?? task.lotId);
  if (lotLabel) rows.push({ label: "Lot", value: lotLabel });

  const mat = mMat(str(p.materialId) ?? task.materialId);
  if (mat) rows.push({ label: "Material", value: mat.label, strong: true });

  let headline: string | null = null;

  if (task.opType === "ADDITION" || task.opType === "FINING") {
    const amount = num(p.amount);
    const doseUnit = str(p.doseUnit);
    const v = vessel(singleVId);
    // Barrels dose against capacity (assumed full); tanks against current wine volume.
    const vol = v ? (v.kind === "BARREL" ? Number(v.capacityL ?? v.volumeL ?? 0) : Number(v.volumeL ?? 0)) : 0;
    if (amount != null && doseUnit) {
      rows.push({ label: "Dose", value: `${amount} ${doseUnit}`, strong: true });
      const est = computeDoseTotal(amount, doseUnit, vol);
      if (est) {
        const context = v?.kind === "BARREL" ? " (barrel full)" : vol > 0 ? ` (at ${vol.toLocaleString()} L)` : "";
        rows.push({ label: "Total to add", value: `≈ ${est.total.toLocaleString()} ${est.unit}${context}`, strong: true });
        // If the material is a % solution (e.g. a 10% KMBS solution), also state the volume of solution to
        // pour: total active mass ÷ (percentActive/100), converted from grams to the material's stock unit.
        const pct = num((mat as unknown as { percentActive?: unknown } | null)?.percentActive)
          ?? num(p.percentActive)
          ?? num(p.solutionPercent);
        if (est.unit === "g" && pct != null && pct > 0 && pct < 100) {
          const solutionMassG = est.total / (pct / 100); // grams of solution
          const asStock = convertDoseToStock({ total: solutionMassG, unit: "g" }, mat?.unit ?? null);
          if (asStock) rows.push({ label: "As solution", value: `≈ ${asStock.qty.toLocaleString()} ${asStock.unit} of ${pct}% solution`, strong: true });
        }
        headline = `Add ${est.total.toLocaleString()} ${est.unit}${mat ? ` of ${mat.label}` : ""}${singleV ? ` to ${singleV}` : ""}`;
      }
    } else if (amount != null) {
      rows.push({ label: "Amount", value: mat?.unit ? `${amount} ${mat.unit}` : String(amount), strong: true });
    }
  } else if (task.kind === "MAINTENANCE") {
    const amount = num(p.amount);
    if (amount != null) rows.push({ label: "Amount", value: mat?.unit ? `${amount} ${mat.unit}` : String(amount) });
    const technique = str(p.technique); if (technique) rows.push({ label: "Technique", value: technique });
    const so2Method = str(p.so2Method); if (so2Method) rows.push({ label: "SO₂ method", value: so2Method });
    const gasType = str(p.gasType); if (gasType) rows.push({ label: "Gas", value: gasType });
    const durationMin = num(p.durationMin); if (durationMin != null) rows.push({ label: "Duration", value: `${durationMin} min` });
    const target = num(p.targetValue); const tu = str(p.targetUnit);
    if (target != null) rows.push({ label: "Target", value: tu ? `${target} ${tu}` : String(target) });
  } else if (task.kind === "OPERATION") {
    const technique = str(p.technique); if (technique) rows.push({ label: "Technique", value: technique });
    const durationMin = num(p.durationMin); if (durationMin != null) rows.push({ label: "Duration", value: `${durationMin} min` });
    const drawL = num(p.drawL); if (drawL != null) rows.push({ label: "Draw", value: `${drawL} L` });
    const volumeL = num(p.volumeL); if (volumeL != null) rows.push({ label: "Volume", value: `${volumeL} L` });
    const rackType = str(p.rackType); if (rackType) rows.push({ label: "Rack type", value: rackType });
    const filterType = str(p.filterType); if (filterType) rows.push({ label: "Filter", value: filterType });
    const micron = num(p.micron); if (micron != null) rows.push({ label: "Micron", value: `${micron} µm` });
  }

  if (task.instructions?.trim()) rows.push({ label: "Instructions", value: task.instructions.trim() });

  return { rows, headline };
}

function TaskExecutor({ task, pickers, onDone }: { task: WorkOrderTaskView; pickers: { vessels: Picker[]; materials: Picker[]; lots: Picker[] }; onDone: () => void }) {
  const commandId = React.useMemo(() => crypto.randomUUID(), []);
  const planned = (task.plannedPayload ?? {}) as Record<string, unknown>;
  const vocabKey =
    task.kind === "OPERATION" ? TASK_TYPE_BY_OP[task.opType ?? ""]
    : task.kind === "MAINTENANCE" ? (task.activityType ?? "")
    : task.kind === "NOTE" ? "NOTE"
    : task.observationType === "PANEL" ? "PANEL" : "BRIX";
  const def = TASK_VOCABULARY[vocabKey ?? ""];
  const [fields, setFields] = React.useState<Record<string, unknown>>({ ...planned });
  const [readingValue, setReadingValue] = React.useState<string>("");
  const [note, setNote] = React.useState<string>("");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  // Execution views must read as a clear "do this → to this → with this amount" story (bug: SO2 WO was a
  // raw editable form with a material-picker panel). Show a read-only summary first; only reveal the
  // editable fields once the crew explicitly taps "Edit".
  const [editing, setEditing] = React.useState(false);

  function set(key: string, v: unknown) { setFields((p) => ({ ...p, [key]: v })); }

  function renderField(key: string, type: string) {
    const cur = fields[key] ?? "";
    // A vineyard-block field only appears on HARVEST_WEIGH_IN, which is dispatched to its own sub-form
    // before this generic renderer. Guard anyway so a block field can never become a raw text input.
    if (type === "block") return null;
    if (type === "material") {
      // Phase 034: category-filtered + fuzzy picker (replaces the flat <select>). Scope depends on the task.
      // Span the full grid width (matches the WO builder + NewWorkOrderClient): the picker is a rich
      // search + chips + list panel, not a single field, so it must fill its parent left-to-right rather
      // than sit half-width in one 1fr column.
      return (
        <div key={key} style={{ gridColumn: "1 / -1" }}>
          <div style={lbl}>{fieldLabel(key)}</div>
          <MaterialFilterPicker
            options={pickers.materials}
            value={String(cur)}
            onChange={(id) => set(key, id)}
            categoryScope={def ? materialScopeForTask(def) : undefined}
          />
        </div>
      );
    }
    if (type === "vessel" || type === "lot") {
      const opts = type === "vessel" ? pickers.vessels : pickers.lots;
      return (
        <label key={key} style={lbl}>{fieldLabel(key)}
          <select style={big} value={String(cur)} onChange={(e) => set(key, e.target.value)}>
            <option value="">— pick —</option>
            {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
      );
    }
    if (type === "select") {
      // A7: options come from the vocabulary's fieldOptions (controlled list, never free-form).
      const options = def?.fieldOptions?.[key] ?? [];
      return (
        <label key={key} style={lbl}>{fieldLabel(key)}
          <select style={big} value={String(cur)} onChange={(e) => set(key, e.target.value)}>
            <option value="">— pick —</option>
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
      );
    }
    if (type === "number") {
      let label: string = fieldLabel(key);
      if (key === "amount") {
        // Additions pair Amount with the Units dropdown → plain "Amount"; maintenance amounts are in the
        // material's stock unit → show it.
        if (def?.fields.doseUnit) {
          label = "Amount";
        } else {
          const unit = pickers.materials.find((m) => m.id === fields.materialId)?.unit;
          label = unit ? `Amount (${unit})` : "Amount — pick a material first";
        }
      }
      return <label key={key} style={lbl}>{label}<input type="number" inputMode="decimal" step="any" style={big} value={String(cur)} onChange={(e) => set(key, e.target.value === "" ? "" : Number(e.target.value))} /></label>;
    }
    return <label key={key} style={lbl}>{fieldLabel(key)}<input type="text" style={big} value={String(cur)} onChange={(e) => set(key, e.target.value)} /></label>;
  }

  // C11: a Custom Log task carries its field spec as a snapshot on the task (plannedPayload.__fieldSchema),
  // so it renders stably even if the type later changes. Render the execution-stage fields here.
  const customFields = Array.isArray((planned as Record<string, unknown>).__fieldSchema)
    ? ((planned as Record<string, unknown>).__fieldSchema as CustomLogFieldSpec[])
    : [];
  function renderCustomField(f: CustomLogFieldSpec) {
    const cur = fields[f.key] ?? "";
    const label = f.label + (f.type === "number" && f.dimension && f.dimension !== "unitless" ? ` (${f.dimension})` : "");
    if (f.type === "select") return <label key={f.key} style={lbl}>{label}<select style={big} value={String(cur)} onChange={(e) => set(f.key, e.target.value)}><option value="">— pick —</option>{(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</select></label>;
    if (f.type === "number") return <label key={f.key} style={lbl}>{label}<input type="number" inputMode="decimal" step="any" style={big} value={String(cur)} onChange={(e) => set(f.key, e.target.value === "" ? "" : Number(e.target.value))} /></label>;
    if (f.type === "date") return <label key={f.key} style={lbl}>{label}<input type="date" style={big} value={String(cur)} onChange={(e) => set(f.key, e.target.value)} /></label>;
    if (f.type === "boolean") return <label key={f.key} style={{ ...lbl, display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={cur === true} onChange={(e) => set(f.key, e.target.checked)} />{label}</label>;
    return <label key={f.key} style={lbl}>{label}<input type="text" style={big} value={String(cur)} onChange={(e) => set(f.key, e.target.value)} /></label>;
  }

  function complete() {
    setError(null);
    const actualPayload: Record<string, unknown> = Object.fromEntries(
      Object.entries(fields).filter(([k, v]) => v !== "" && v !== undefined && k !== "__fieldSchema"),
    );
    if (task.kind === "OBSERVATION") {
      const v = Number(readingValue);
      if (Number.isFinite(v)) actualPayload.readings = [{ analyte: task.observationType ?? "BRIX", value: v, unit: task.observationType === "BRIX" ? "Brix" : "" }];
    }
    startTransition(async () => {
      try {
        await completeTaskAction({ taskId: task.id, commandId, actualPayload, completionNote: note.trim() || undefined });
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't record the task.");
      }
    });
  }

  const canStart = task.status === "PENDING";
  const summary = buildSummary(task, def, pickers);
  const isObservation = task.kind === "OBSERVATION";
  return (
    <Card style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{task.seq}. {task.title}</div>
        <Badge tone="gold">{task.status.replace(/_/g, " ").toLowerCase()}</Badge>
      </div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 14px" }}>{task.kind === "OPERATION" ? task.opType : task.kind === "NOTE" ? "checklist" : task.kind === "MAINTENANCE" ? `maintenance · ${task.activityType}` : `observation · ${task.observationType}`}{def ? ` · ${def.label}` : ""}</div>

      {/* Read-only story first: what to do, to which vessel, with how much (units + computed total). */}
      {summary.headline ? (
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", background: "var(--paper-100)", borderRadius: "var(--radius-md)", padding: "10px 12px", marginBottom: 12 }}>{summary.headline}</div>
      ) : null}
      {summary.rows.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", alignItems: "baseline", marginBottom: 12 }}>
          {summary.rows.map((r, i) => (
            <React.Fragment key={i}>
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{r.label}</div>
              <div style={{ fontSize: r.strong ? 16 : 14.5, fontWeight: r.strong ? 600 : 400, color: "var(--text)" }}>{r.value}</div>
            </React.Fragment>
          ))}
        </div>
      ) : null}

      {def?.hint && editing ? <div style={{ fontSize: 12.5, color: "var(--text-secondary)", background: "var(--paper-100)", borderRadius: "var(--radius-md)", padding: "8px 10px", marginBottom: 12 }}>{def.hint}</div> : null}

      {/* The editable fields (incl. the material-picker panel) only appear once the crew taps Edit — or
          always for observations, which capture a fresh reading rather than confirm a planned dose. */}
      {editing || isObservation ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {def ? Object.entries(def.fields).filter(([k]) => k !== "note").map(([k, t]) => renderField(k, t)) : null}
          {customFields.filter((f) => (f.stage ?? []).includes("execution")).map(renderCustomField)}
          {isObservation ? (
            <label style={lbl}>{task.observationType ?? "reading"} value<input type="number" inputMode="decimal" step="any" style={big} value={readingValue} onChange={(e) => setReadingValue(e.target.value)} /></label>
          ) : null}
        </div>
      ) : (
        <div style={{ marginBottom: 4 }}>
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
        </div>
      )}
      <Textarea label="Note (optional)" minRows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. actual differed because…" style={{ marginTop: 12 }} />

      {error ? <div style={{ color: "var(--danger)", fontSize: 14, marginTop: 10 }}>{error}</div> : null}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        {canStart ? <Button size="lg" variant="secondary" disabled={pending} onClick={() => startTransition(async () => { await startTaskAction({ taskId: task.id }); })}>Start</Button> : null}
        <Button size="lg" fullWidth disabled={pending} onClick={complete}>{pending ? "Recording…" : "Complete — record it"}</Button>
      </div>
    </Card>
  );
}

/** Plan 043: batch-complete N cap-management tanks at once. Pick the technique + duration ONCE, check the
 * tanks, done. Shared actuals override each task's planned technique; the vessel is already on each task.
 * Mints one commandId per selected task (per-attempt idempotency). Individual cards below still work — this
 * is an additive shortcut for the "punch down 3, 4, 5" flow. Partial failures surface per-tank. */
function BatchCapExecutor({ tasks, vessels, onDone }: { tasks: WorkOrderTaskView[]; vessels: Picker[]; onDone: () => void }) {
  const def = TASK_VOCABULARY.CAP_MGMT;
  const techniqueOptions = def?.fieldOptions?.technique ?? [];
  const vLabel = (id: string | null | undefined) => (id ? vessels.find((v) => v.id === id)?.label ?? "a vessel" : "a vessel");
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set(tasks.map((t) => t.id)));
  const [technique, setTechnique] = React.useState<string>("");
  const [durationMin, setDurationMin] = React.useState<string>("");
  const [note, setNote] = React.useState<string>("");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [failures, setFailures] = React.useState<{ taskId: string; error?: string }[] | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  const taskVessel = (t: WorkOrderTaskView) => {
    const p = (t.plannedPayload ?? {}) as Record<string, unknown>;
    return vLabel((typeof p.vesselId === "string" ? p.vesselId : null) ?? t.destVesselId);
  };

  function run() {
    setError(null);
    setFailures(null);
    const chosen = tasks.filter((t) => selected.has(t.id));
    if (chosen.length === 0) { setError("Pick at least one tank."); return; }
    const shared: Record<string, unknown> = {};
    if (technique) shared.technique = technique;
    if (durationMin !== "") shared.durationMin = Number(durationMin);
    const items = chosen.map((t) => ({
      taskId: t.id,
      commandId: crypto.randomUUID(), // one per task — a shared id would dedupe to a single write
      actualPayload: shared,
      completionNote: note.trim() || undefined,
    }));
    startTransition(async () => {
      try {
        const res = await completeTasksBatchAction({ items });
        if (res.failed > 0) {
          setFailures(res.results.filter((r) => !r.ok).map((r) => ({ taskId: r.taskId, error: r.error })));
        } else {
          onDone();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't record the batch.");
      }
    });
  }

  return (
    <Card style={{ padding: 18, borderColor: "var(--gold)" }}>
      <Eyebrow>Batch cap management</Eyebrow>
      <div style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 12px" }}>Work the cap on several tanks at once. Pick the technique, check the tanks, record them all.</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={lbl}>Technique
          <select style={big} value={technique} onChange={(e) => setTechnique(e.target.value)}>
            <option value="">— use each task&apos;s plan —</option>
            {techniqueOptions.map((o) => <option key={o} value={o}>{CAP_LABELS[o as keyof typeof CAP_LABELS] ?? o}</option>)}
          </select>
        </label>
        <label style={lbl}>Duration (min)<input type="number" inputMode="decimal" step="any" style={big} value={durationMin} onChange={(e) => setDurationMin(e.target.value)} /></label>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
        {tasks.map((t) => (
          <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, padding: "6px 2px", cursor: "pointer" }}>
            <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} style={{ width: 20, height: 20 }} />
            <span>{t.seq}. {taskVessel(t)}{failures?.some((f) => f.taskId === t.id) ? <span style={{ color: "var(--danger)", fontSize: 12.5 }}> — {failures.find((f) => f.taskId === t.id)?.error}</span> : null}</span>
          </label>
        ))}
      </div>

      <Textarea label="Note (optional)" minRows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="applies to every tank in this batch" style={{ marginTop: 12 }} />
      {error ? <div style={{ color: "var(--danger)", fontSize: 14, marginTop: 10 }}>{error}</div> : null}
      <Button size="lg" fullWidth disabled={pending} onClick={run} style={{ marginTop: 14 }}>{pending ? "Recording…" : `Complete ${selected.size} ${selected.size === 1 ? "tank" : "tanks"}`}</Button>
    </Card>
  );
}

export function ExecuteClient({ wo, pickers, crushData, pressData, weighInData, bottlingData }: { wo: WorkOrderDetail; pickers: { vessels: Picker[]; materials: Picker[]; lots: Picker[] }; crushData: CrushFormData | null; pressData: PressFormData | null; weighInData: HarvestWeighInFormData | null; bottlingData: BottlingTaskFormData | null }) {
  const router = useRouter();
  const [online, setOnline] = React.useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));
  React.useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const open = wo.tasks.filter((t) => t.status === "PENDING" || t.status === "IN_PROGRESS" || t.status === "REJECTED");
  const done = wo.tasks.filter((t) => !open.includes(t));
  // Plan 043: batch-complete cap-management tanks. Offer the shortcut only when ≥2 cap tasks are open.
  const openCap = open.filter((t) => t.kind === "OPERATION" && t.opType === "CAP_MGMT");

  return (
    <div style={{ maxWidth: 620, margin: "0 auto", padding: "8px 4px 80px" }}>
      <Link href={`/work-orders/${wo.id}`} style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none" }}>← #{wo.number} {wo.title}</Link>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, margin: 0 }}>Execute</h1>
        <span aria-live="polite" style={{ fontSize: 12.5, color: online ? "var(--text-muted)" : "var(--danger)" }}>{online ? "Online" : "Offline — will retry"}</span>
      </div>

      {open.length === 0 ? (
        <Card style={{ marginTop: 20, textAlign: "center", padding: 36 }}>All tasks recorded ✓</Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
          {openCap.length >= 2 ? <BatchCapExecutor tasks={openCap} vessels={pickers.vessels} onDone={() => router.refresh()} /> : null}
          {open.map((t) => {
            // Plan 035: transform ops (de-stem/crush, press/saignée) take list-shaped run-time inputs
            // (picks, fractions) that don't fit the flat generic renderer — they get their own sub-forms.
            if (t.kind === "OPERATION" && t.opType === "CRUSH") return <CrushTaskForm key={t.id} task={t} data={crushData} onDone={() => router.refresh()} />;
            if (t.kind === "OPERATION" && t.opType === "PRESS") return <PressTaskForm key={t.id} task={t} data={pressData} onDone={() => router.refresh()} />;
            // Plan 054: a group barrel-down / rack-to-tank task completes in per-member batches — its own sub-form.
            if (t.kind === "OPERATION" && t.opType === "RACK" && t.groupRack) return <GroupRackTaskForm key={t.id} task={t} onDone={() => router.refresh()} />;
            // Plan 061: a consolidated group maintenance task (clean/sanitize/… a barrel range) completes all
            // members at once — its own sub-form (the generic flat renderer has no single vessel to bind).
            if (t.kind === "MAINTENANCE" && t.groupActivity) return <GroupMaintenanceTaskForm key={t.id} task={t} onDone={() => router.refresh()} />;
            // Plan 053 E15: bottling captures multi-vessel source + bottle count + ABV + destination — its own sub-form.
            if (t.kind === "OPERATION" && t.opType === "BOTTLE") return <BottlingTaskForm key={t.id} task={t} data={bottlingData} onDone={() => router.refresh()} />;
            // Plan 039: a fruit weigh-in captures a block + readings that don't fit the flat renderer — its own sub-form.
            if (t.kind === "OBSERVATION" && t.observationType === "HARVEST_WEIGH_IN") return <HarvestWeighInTaskForm key={t.id} task={t} data={weighInData} onDone={() => router.refresh()} />;
            return <TaskExecutor key={t.id} task={t} pickers={pickers} onDone={() => router.refresh()} />;
          })}
        </div>
      )}

      {done.length > 0 ? (
        <section style={{ marginTop: 24 }}>
          <Eyebrow>Recorded</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {done.map((t) => (
              <Card key={t.id} padding="10px 14px" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <span>{t.seq}. {t.title}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                  {/* Plan 061: undo a completed group maintenance task (reverses every member's activity event). */}
                  {t.kind === "MAINTENANCE" && t.groupActivity && t.status === "DONE" ? <GroupMaintenanceUndo task={t} onDone={() => router.refresh()} /> : null}
                  <Badge tone={t.status === "APPROVED" || t.status === "DONE" ? "green" : t.status === "REJECTED" ? "red" : "maroon"}>{t.status.replace(/_/g, " ").toLowerCase()}</Badge>
                </span>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
