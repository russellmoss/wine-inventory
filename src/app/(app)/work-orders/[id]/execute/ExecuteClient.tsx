"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Badge, Eyebrow, Textarea } from "@/components/ui";
import type { WorkOrderDetail, WorkOrderTaskView } from "@/lib/work-orders/data";
import { TASK_VOCABULARY, fieldLabel } from "@/lib/work-orders/template-vocabulary";
import { startTaskAction, completeTaskAction } from "@/lib/work-orders/actions";
import type { CrushFormData } from "@/lib/ferment/crush-data";
import type { PressFormData } from "@/lib/ferment/press-data";
import { CrushTaskForm } from "./CrushTaskForm";
import { PressTaskForm } from "./PressTaskForm";
import { MaterialFilterPicker } from "@/components/work-orders/MaterialFilterPicker";
import type { MaterialCategory } from "@/lib/cellar/material-taxonomy";

// Which main categories the material picker shows per task type: additions dose additives (+ generic
// OTHER); cleaning/sanitizing tasks draw cleaning supplies (+ OTHER); anything else (e.g. GAS) shows all.
const MATERIAL_SCOPE_BY_VOCAB: Record<string, MaterialCategory[] | undefined> = {
  ADDITION: ["ADDITIVE", "OTHER"],
  FINING: ["ADDITIVE", "OTHER"],
  CLEAN: ["CLEANING_SANITIZING", "OTHER"],
  SANITIZE: ["CLEANING_SANITIZING", "OTHER"],
};

// Floor-first execution (Phase 9 Unit 12, D2): one task in focus, big prefilled actuals (≥44px targets,
// inputMode decimal), commandId minted once per task (offline-drain-safe idempotency — same contract the
// Dexie outbox uses). Not harvest-grade offline yet (Phase 28); online status is pinned via aria-live.

type Picker = { id: string; label: string; unit?: string | null; kind?: string | null; subcategory?: string | null; onHand?: number | null };
const TASK_TYPE_BY_OP: Record<string, string> = { RACK: "RACK", ADDITION: "ADDITION", FINING: "FINING", TOPPING: "TOPPING", FILTRATION: "FILTRATION" };
const big: React.CSSProperties = { fontSize: 16, padding: "12px 12px", minHeight: 44, borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface)", width: "100%" };
const lbl: React.CSSProperties = { fontSize: 13, color: "var(--text-muted)", display: "block", marginBottom: 4 };

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

  function set(key: string, v: unknown) { setFields((p) => ({ ...p, [key]: v })); }

  function renderField(key: string, type: string) {
    const cur = fields[key] ?? "";
    if (type === "material") {
      // Phase 034: category-filtered + fuzzy picker (replaces the flat <select>). Scope depends on the task.
      return (
        <label key={key} style={lbl}>{fieldLabel(key)}
          <MaterialFilterPicker
            options={pickers.materials}
            value={String(cur)}
            onChange={(id) => set(key, id)}
            categoryScope={MATERIAL_SCOPE_BY_VOCAB[vocabKey ?? ""]}
          />
        </label>
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

  function complete() {
    setError(null);
    const actualPayload: Record<string, unknown> = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== "" && v !== undefined));
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
  return (
    <Card style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{task.seq}. {task.title}</div>
        <Badge tone="gold">{task.status.replace(/_/g, " ").toLowerCase()}</Badge>
      </div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 14px" }}>{task.kind === "OPERATION" ? task.opType : task.kind === "NOTE" ? "checklist" : task.kind === "MAINTENANCE" ? `maintenance · ${task.activityType}` : `observation · ${task.observationType}`}{def ? ` · ${def.label}` : ""}</div>

      {def?.hint ? <div style={{ fontSize: 12.5, color: "var(--text-secondary)", background: "var(--paper-100)", borderRadius: "var(--radius-md)", padding: "8px 10px", marginBottom: 12 }}>{def.hint}</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {def ? Object.entries(def.fields).filter(([k]) => k !== "note").map(([k, t]) => renderField(k, t)) : null}
        {task.kind === "OBSERVATION" ? (
          <label style={lbl}>{task.observationType ?? "reading"} value<input type="number" inputMode="decimal" step="any" style={big} value={readingValue} onChange={(e) => setReadingValue(e.target.value)} /></label>
        ) : null}
      </div>
      <Textarea label="Note (optional)" minRows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. actual differed because…" style={{ marginTop: 12 }} />

      {error ? <div style={{ color: "var(--danger)", fontSize: 14, marginTop: 10 }}>{error}</div> : null}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        {canStart ? <Button size="lg" variant="secondary" disabled={pending} onClick={() => startTransition(async () => { await startTaskAction({ taskId: task.id }); })}>Start</Button> : null}
        <Button size="lg" fullWidth disabled={pending} onClick={complete}>{pending ? "Recording…" : "Complete — record it"}</Button>
      </div>
    </Card>
  );
}

export function ExecuteClient({ wo, pickers, crushData, pressData }: { wo: WorkOrderDetail; pickers: { vessels: Picker[]; materials: Picker[]; lots: Picker[] }; crushData: CrushFormData | null; pressData: PressFormData | null }) {
  const router = useRouter();
  const [online, setOnline] = React.useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));
  React.useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const open = wo.tasks.filter((t) => t.status === "PENDING" || t.status === "IN_PROGRESS" || t.status === "REJECTED");
  const done = wo.tasks.filter((t) => !open.includes(t));

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
          {open.map((t) => {
            // Plan 035: transform ops (de-stem/crush, press/saignée) take list-shaped run-time inputs
            // (picks, fractions) that don't fit the flat generic renderer — they get their own sub-forms.
            if (t.kind === "OPERATION" && t.opType === "CRUSH") return <CrushTaskForm key={t.id} task={t} data={crushData} onDone={() => router.refresh()} />;
            if (t.kind === "OPERATION" && t.opType === "PRESS") return <PressTaskForm key={t.id} task={t} data={pressData} onDone={() => router.refresh()} />;
            return <TaskExecutor key={t.id} task={t} pickers={pickers} onDone={() => router.refresh()} />;
          })}
        </div>
      )}

      {done.length > 0 ? (
        <section style={{ marginTop: 24 }}>
          <Eyebrow>Recorded</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {done.map((t) => (
              <Card key={t.id} padding="10px 14px" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{t.seq}. {t.title}</span>
                <Badge tone={t.status === "APPROVED" || t.status === "DONE" ? "green" : t.status === "REJECTED" ? "red" : "maroon"}>{t.status.replace(/_/g, " ").toLowerCase()}</Badge>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
