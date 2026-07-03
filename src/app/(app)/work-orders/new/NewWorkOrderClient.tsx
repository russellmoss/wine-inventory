"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Checkbox, Eyebrow } from "@/components/ui";
import { TASK_VOCABULARY, fieldLabel, type TemplateSpec, type TaskBuild } from "@/lib/work-orders/template-vocabulary";
import { RATE_BASES, RATE_BASIS_LABELS, computeAdditionTotal } from "@/lib/cellar/additions-math";
import { createWorkOrderFromTemplateAction } from "@/lib/work-orders/actions";
import { VesselMultiSelect } from "./VesselMultiSelect";

type Picker = { id: string; label: string; unit?: string | null; kind?: string | null; volumeL?: number | null };
type Template = { id: string; name: string; isSystem: boolean; spec: unknown };

const field: React.CSSProperties = { fontSize: 14, padding: "8px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface)", width: "100%" };
const labelStyle: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 };

/** Today in the browser's local timezone as yyyy-mm-dd (for the date input default). */
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function NewWorkOrderClient({ templates, pickers }: { templates: Template[]; pickers: { vessels: Picker[]; materials: Picker[]; lots: Picker[] } }) {
  const router = useRouter();
  const [templateId, setTemplateId] = React.useState<string>(templates[0]?.id ?? "");
  const [title, setTitle] = React.useState("");
  const [dueAt, setDueAt] = React.useState(todayLocal()); // default to today (editable)
  const [assigneeEmail, setAssigneeEmail] = React.useState("");
  const [autoFinalize, setAutoFinalize] = React.useState(false);
  const [overrides, setOverrides] = React.useState<Record<number, Record<string, unknown>>>({});
  // Appended ad-hoc ADDITION rows ("+ Add another addition"). Each key indexes into `overrides` at a high
  // offset so it never collides with the template's task indices.
  const [extraKeys, setExtraKeys] = React.useState<number[]>([]);
  const nextExtraKey = React.useRef(1000);
  // Per-row volume override for the dose calculator (client-only; defaults to the vessel's current volume).
  const [volOverride, setVolOverride] = React.useState<Record<number, number | "">>({});
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const template = templates.find((t) => t.id === templateId);
  const spec = (template?.spec ?? { tasks: [] }) as TemplateSpec;

  function setField(taskIdx: number, key: string, value: unknown) {
    setOverrides((prev) => ({ ...prev, [taskIdx]: { ...(prev[taskIdx] ?? {}), [key]: value } }));
  }

  function renderField(taskIdx: number, key: string, type: string, def: unknown, options?: readonly string[]) {
    const current = overrides[taskIdx]?.[key] ?? def ?? "";
    // key is passed DIRECTLY (never spread — React warns on a spread key prop).
    const common = { style: labelStyle } as const;
    if (key === "vesselId") {
      // Single-vessel ops (additions/fining/filtration/maintenance) get a searchable, tank/barrel-filterable
      // MULTI-select — selecting several vessels fans out to one task per vessel at submit. (RACK/TOPPING
      // use fromVesselId/toVesselId, which stay single selects below.)
      const sel = Array.isArray(overrides[taskIdx]?.vesselId) ? (overrides[taskIdx]!.vesselId as string[]) : [];
      return (
        <div key={key} style={{ gridColumn: "1 / -1" }}>
          <div style={labelStyle}>Vessels</div>
          <VesselMultiSelect options={pickers.vessels} value={sel} onChange={(ids) => setField(taskIdx, "vesselId", ids)} />
        </div>
      );
    }
    if (type === "select") {
      // A7: controlled options from the vocabulary's fieldOptions.
      return (
        <label key={key} {...common}>
          {fieldLabel(key)}
          <select style={field} value={String(current)} onChange={(e) => setField(taskIdx, key, e.target.value)}>
            <option value="">— pick —</option>
            {(options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
      );
    }
    if (type === "vessel" || type === "lot" || type === "material") {
      const opts = type === "vessel" ? pickers.vessels : type === "lot" ? pickers.lots : pickers.materials;
      return (
        <label key={key} {...common}>
          {fieldLabel(key)}
          <select style={field} value={String(current)} onChange={(e) => setField(taskIdx, key, e.target.value)}>
            <option value="">— pick —</option>
            {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
      );
    }
    if (type === "rateBasis") {
      return (
        <label key={key} {...common}>
          {fieldLabel(key)}
          <select style={field} value={String(current)} onChange={(e) => setField(taskIdx, key, e.target.value)}>
            {RATE_BASES.map((b) => <option key={b} value={b}>{RATE_BASIS_LABELS[b]}</option>)}
          </select>
        </label>
      );
    }
    if (type === "number") {
      // "amount" is denominated in the selected material's stock unit — show it so the number isn't ambiguous.
      let label: string = fieldLabel(key);
      if (key === "amount") {
        const selectedMaterialId = overrides[taskIdx]?.materialId;
        const unit = pickers.materials.find((m) => m.id === selectedMaterialId)?.unit;
        label = unit ? `Amount (${unit})` : "Amount — pick a material first";
      }
      return (
        <label key={key} {...common}>
          {label}
          <input type="number" inputMode="decimal" step="any" style={field} value={String(current)} onChange={(e) => setField(taskIdx, key, e.target.value === "" ? "" : Number(e.target.value))} />
        </label>
      );
    }
    if (key === "note" || key === "instructions") {
      // Bigger, resizable note area (Unit 4) — planning notes are often multi-line.
      return (
        <label key={key} {...common}>
          {fieldLabel(key)}
          <textarea rows={2} style={{ ...field, minHeight: 60, resize: "vertical", lineHeight: 1.5, padding: "8px 10px" }} value={String(current)} onChange={(e) => setField(taskIdx, key, e.target.value)} />
        </label>
      );
    }
    return (
      <label key={key} {...common}>
        {fieldLabel(key)}
        <input type="text" style={field} value={String(current)} onChange={(e) => setField(taskIdx, key, e.target.value)} />
      </label>
    );
  }

  // Rate is ONE concept: a value + its basis (e.g. 30 g/hL). Render them together under a single "Rate"
  // label so it doesn't read as two separate fields ("Rate" + "Rate basis").
  function renderRate(taskIdx: number, defaults?: Record<string, unknown>) {
    const rv = overrides[taskIdx]?.rateValue ?? defaults?.rateValue ?? "";
    const rb = overrides[taskIdx]?.rateBasis ?? defaults?.rateBasis ?? "G_HL";
    return (
      <label key="rate" style={labelStyle}>
        Rate <span style={{ color: "var(--text-muted)" }}>(optional if you set an amount)</span>
        <div style={{ display: "flex", gap: 6 }}>
          <input type="number" inputMode="decimal" step="any" placeholder="e.g. 30" style={{ ...field, flex: "3 1 0" }} value={String(rv)} onChange={(e) => setField(taskIdx, "rateValue", e.target.value === "" ? "" : Number(e.target.value))} />
          <select style={{ ...field, flex: "2 1 0" }} value={String(rb)} onChange={(e) => setField(taskIdx, "rateBasis", e.target.value)}>
            {RATE_BASES.map((b) => <option key={b} value={b}>{RATE_BASIS_LABELS[b]}</option>)}
          </select>
        </div>
      </label>
    );
  }

  // Render a task's fields (shared by template tasks + appended additions): Amount before the combined Rate.
  function renderTaskFields(taskIdx: number, def: (typeof TASK_VOCABULARY)[string], defaults?: Record<string, unknown>) {
    return Object.entries(def.fields)
      .filter(([key]) => key !== "rateBasis")
      .map(([key, type]) => (key === "rateValue" ? renderRate(taskIdx, defaults) : renderField(taskIdx, key, type, defaults?.[key], def.fieldOptions?.[key])));
  }

  // Live dose calculator: given a rate + basis + selected vessel(s), show the total it works out to using
  // each vessel's current volume (single-vessel volume is overridable). Volume-aware; informational — the
  // actual dose is recomputed from the vessel's real volume at completion (A3). Returns null when N/A.
  function renderEstimate(taskIdx: number, defaults?: Record<string, unknown>) {
    const rate = Number(overrides[taskIdx]?.rateValue ?? defaults?.rateValue ?? "");
    const basis = String(overrides[taskIdx]?.rateBasis ?? defaults?.rateBasis ?? "G_HL");
    const sel = overrides[taskIdx]?.vesselId;
    const vesselIds = Array.isArray(sel) ? (sel as string[]) : sel ? [String(sel)] : [];
    if (!(rate > 0) || vesselIds.length === 0) return null;
    const volOf = new Map(pickers.vessels.map((v) => [v.id, v.volumeL ?? 0]));
    const est = (vol: number) => { try { return computeAdditionTotal(rate, basis as never, vol); } catch { return null; } };
    const wrap: React.CSSProperties = { gridColumn: "1 / -1", fontSize: 13, background: "var(--paper-100)", borderRadius: "var(--radius-md)", padding: "8px 10px" };

    if (vesselIds.length === 1) {
      const base = volOf.get(vesselIds[0]) ?? 0;
      const ov = volOverride[taskIdx];
      const vol = ov === "" || ov == null ? base : Number(ov);
      const e = est(vol);
      return (
        <div key="est" style={wrap}>
          <span style={{ color: "var(--text-muted)" }}>Volume </span>
          <input type="number" inputMode="decimal" step="any" value={String(ov ?? base)} onChange={(ev) => setVolOverride((o) => ({ ...o, [taskIdx]: ev.target.value === "" ? "" : Number(ev.target.value) }))} style={{ width: 90, padding: "2px 6px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)" }} /> L
          {e ? <span> → ≈ <strong>{e.total.toLocaleString()} {e.unit}</strong> total</span> : <span style={{ color: "var(--text-muted)" }}> — enter a positive volume</span>}
          {ov !== "" && ov != null && Number(ov) !== base ? <span style={{ color: "var(--text-muted)" }}> (vessel currently {base.toLocaleString()} L)</span> : null}
        </div>
      );
    }
    // Multiple vessels: total across all, using each vessel's own current volume.
    let grand = 0; let unit = "g"; let ok = false;
    for (const vid of vesselIds) { const e = est(volOf.get(vid) ?? 0); if (e) { grand += e.total; unit = e.unit; ok = true; } }
    return (
      <div key="est" style={wrap}>
        {ok ? <span>≈ <strong>{grand.toLocaleString()} {unit}</strong> total across {vesselIds.length} vessels <span style={{ color: "var(--text-muted)" }}>{"(each vessel's current volume)"}</span></span> : <span style={{ color: "var(--text-muted)" }}>Selected vessels are empty — no volume to compute against.</span>}
      </div>
    );
  }

  // Clean a value map for submit: drop empty strings/undefined + empty vessel arrays.
  function cleanValues(raw: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(raw).filter(([, v]) => v !== "" && v !== undefined && !(Array.isArray(v) && v.length === 0)),
    );
  }

  // One task → one build, UNLESS its vesselId is a multi-select array → fan out to one build per vessel.
  function buildsForTask(taskType: string, taskTitle: string, values: Record<string, unknown>): TaskBuild[] {
    const vessels = Array.isArray(values.vesselId) ? (values.vesselId as string[]) : values.vesselId ? [values.vesselId as string] : [];
    if (vessels.length > 1) return vessels.map((vid) => ({ taskType, title: taskTitle, values: { ...values, vesselId: vid } }));
    if (vessels.length === 1) return [{ taskType, title: taskTitle, values: { ...values, vesselId: vessels[0] } }];
    return [{ taskType, title: taskTitle, values }];
  }

  function submit() {
    setError(null);
    if (!templateId) { setError("Pick a template."); return; }
    const builds: TaskBuild[] = [];
    spec.tasks.forEach((t, i) => {
      builds.push(...buildsForTask(t.taskType, t.title, cleanValues({ ...(t.defaults ?? {}), ...(overrides[i] ?? {}) })));
    });
    extraKeys.forEach((k) => {
      const values = cleanValues(overrides[k] ?? {});
      if (Object.keys(values).length > 0) builds.push(...buildsForTask("ADDITION", "Add material", values));
    });
    if (builds.length === 0) { setError("Add at least one task."); return; }
    startTransition(async () => {
      try {
        const res = await createWorkOrderFromTemplateAction({
          templateId,
          title: title.trim() || undefined,
          assigneeEmail: assigneeEmail.trim() || null,
          dueAt: dueAt ? new Date(dueAt) : null,
          autoFinalize,
          taskBuilds: builds,
        });
        router.push(`/work-orders/${res.workOrderId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't create the work order.");
      }
    });
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "8px 4px 60px" }}>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, margin: "0 0 16px" }}>New work order</h1>

      {templates.length === 0 ? (
        <Card style={{ padding: 24 }}>No templates yet. Seed the system templates with <code>npm run seed:work-order-templates</code>.</Card>
      ) : (
        <Card style={{ display: "flex", flexDirection: "column", gap: 14, padding: 20 }}>
          <label style={labelStyle}>
            Template
            <select style={field} value={templateId} onChange={(e) => { setTemplateId(e.target.value); setOverrides({}); setExtraKeys([]); }}>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isSystem ? " (system)" : ""}</option>)}
            </select>
          </label>

          <Input label="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={template?.name} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={labelStyle}>Due date<input type="date" style={field} value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></label>
            <Input label="Assignee email (optional)" value={assigneeEmail} onChange={(e) => setAssigneeEmail(e.target.value)} />
          </div>
          <Checkbox checked={autoFinalize} onChange={setAutoFinalize} label="Auto-finalize my own work (skip review when I complete it)" />

          {spec.tasks.map((t, i) => {
            const def = TASK_VOCABULARY[t.taskType];
            if (!def) return null;
            return (
              <div key={i} style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                <Eyebrow>{i + 1}. {t.title} · {def.label}</Eyebrow>
                {def.hint ? <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 6 }}>{def.hint}</div> : null}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
                  {renderTaskFields(i, def, t.defaults)}
                  {renderEstimate(i, t.defaults)}
                </div>
              </div>
            );
          })}

          {/* Appended ad-hoc additions ("+ Add another addition"). */}
          {extraKeys.map((k, n) => {
            const def = TASK_VOCABULARY.ADDITION;
            return (
              <div key={k} style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Eyebrow>+ Addition {n + 1}</Eyebrow>
                  <button type="button" onClick={() => { setExtraKeys((keys) => keys.filter((x) => x !== k)); setOverrides((o) => { const c = { ...o }; delete c[k]; return c; }); }} style={{ border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer", fontSize: 13 }}>Remove</button>
                </div>
                {def.hint ? <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 6 }}>{def.hint}</div> : null}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
                  {renderTaskFields(k, def)}
                  {renderEstimate(k)}
                </div>
              </div>
            );
          })}

          <div>
            <Button variant="secondary" size="sm" onClick={() => setExtraKeys((keys) => [...keys, nextExtraKey.current++])}>+ Add another addition</Button>
          </div>

          {error ? <div style={{ color: "var(--danger)", fontSize: 14 }}>{error}</div> : null}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => router.push("/work-orders")}>Cancel</Button>
            <Button disabled={pending} onClick={submit}>{pending ? "Creating…" : "Create draft"}</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
