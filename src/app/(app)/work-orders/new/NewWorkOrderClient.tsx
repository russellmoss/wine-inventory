"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Checkbox, Eyebrow, Badge } from "@/components/ui";
import { TASK_VOCABULARY, fieldLabel, type TemplateSpec, type TaskBuild } from "@/lib/work-orders/template-vocabulary";
import { computeDoseTotal, isRateUnit } from "@/lib/cellar/additions-math";
import { createWorkOrderFromTemplateAction } from "@/lib/work-orders/actions";
import { unwrap } from "@/lib/action-result";
import { previewWorkOrderReadinessAction } from "@/lib/work-orders/proposal-readiness-actions";
import type { WorkOrderReadinessProposal } from "@/lib/work-orders/proposal-readiness";
import { WorkOrderReadinessPanel } from "@/components/work-orders/WorkOrderReadinessPanel";
import { VesselMultiSelect } from "./VesselMultiSelect";
import { MaterialFilterPicker } from "@/components/work-orders/MaterialFilterPicker";
import { materialScopeForTask, type MaterialCategory } from "@/lib/cellar/material-taxonomy";

type Picker = { id: string; label: string; unit?: string | null; kind?: string | null; category?: string | null; subcategory?: string | null; onHand?: number | null; volumeL?: number | null; capacityL?: number | null };
type Template = { id: string; name: string; isSystem: boolean; spec: unknown };
type Member = { userId: string; name: string; email: string };

const field: React.CSSProperties = { fontSize: 14, padding: "8px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface)", width: "100%" };
const labelStyle: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 };

/** Today in the browser's local timezone as yyyy-mm-dd (for the date input default). */
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Result of a locked-vessel create+issue (mirrors createAndIssueWorkOrderAction's return). */
export type NewWorkOrderIssued = { workOrderId: string; number: number; status: string; reservationWarnings: string[] };

// ── Task-build assembly (hoisted so the live readiness preview and submit build the SAME TaskBuild[]). ──

/** Clean a value map for submit/preview: drop empty strings/undefined + empty vessel arrays. */
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

// Plan 045: in locked-vessel mode, fold the locked vessel into a task's values — pin a single-vessel field
// (vesselId), and default a transform SOURCE-vessel field (fromVesselId/sourceVesselId) where unset. No-op
// when unlocked.
function withLockedVessel(lockedVessel: { id: string; label: string } | undefined, taskType: string, values: Record<string, unknown>): Record<string, unknown> {
  if (!lockedVessel) return values;
  const def = TASK_VOCABULARY[taskType];
  if (!def) return values;
  const out = { ...values };
  if ("vesselId" in def.fields && (out.vesselId === undefined || (Array.isArray(out.vesselId) && out.vesselId.length === 0))) {
    out.vesselId = [lockedVessel.id];
  }
  for (const srcKey of ["fromVesselId", "sourceVesselId"] as const) {
    if (srcKey in def.fields && (out[srcKey] === undefined || out[srcKey] === "")) out[srcKey] = lockedVessel.id;
  }
  return out;
}

export function NewWorkOrderClient({
  templates,
  pickers,
  members = [],
  initialTemplateId,
  // Plan 045 Unit 9 — LOCKED-VESSEL mode (default undefined ⇒ standalone /work-orders/new, byte-identical).
  // When set: every single-vessel task field is pre-filled to [lockedVessel.id] and rendered as a read-only
  // Badge; transform SOURCE-vessel selects default to it but stay selectable; submit routes through
  // onCreateAndIssue (create → issue) instead of the standalone create-then-navigate.
  lockedVessel,
  onCreateAndIssue,
  onCancel,
}: {
  templates: Template[];
  pickers: { vessels: Picker[]; materials: Picker[]; lots: Picker[] };
  members?: Member[];
  initialTemplateId?: string;
  lockedVessel?: { id: string; label: string };
  onCreateAndIssue?: (input: Parameters<typeof createWorkOrderFromTemplateAction>[0]) => Promise<NewWorkOrderIssued>;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = React.useState<string>(
    initialTemplateId && templates.some((t) => t.id === initialTemplateId) ? initialTemplateId : templates[0]?.id ?? "",
  );
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
  const spec = React.useMemo<TemplateSpec>(() => (template?.spec ?? { tasks: [] }) as TemplateSpec, [template]);

  function setField(taskIdx: number, key: string, value: unknown) {
    setOverrides((prev) => ({ ...prev, [taskIdx]: { ...(prev[taskIdx] ?? {}), [key]: value } }));
  }

  function renderField(taskIdx: number, key: string, type: string, def: unknown, options?: readonly string[], hasDoseUnit?: boolean, materialScope?: MaterialCategory[]) {
    const current = overrides[taskIdx]?.[key] ?? def ?? "";
    // key is passed DIRECTLY (never spread — React warns on a spread key prop).
    const common = { style: labelStyle } as const;
    // Plan 039: a vineyard-block target is always chosen at run time (on the execute sub-form), never a
    // template/new-WO default — mirror the vessel/lot rule.
    if (type === "block") return null;
    if (key === "vesselId") {
      // Single-vessel ops (additions/fining/filtration/maintenance) get a searchable, tank/barrel-filterable
      // MULTI-select — selecting several vessels fans out to one task per vessel at submit. (RACK/TOPPING
      // use fromVesselId/toVesselId, which stay single selects below.)
      // Plan 045: in locked-vessel mode this field is pinned to the vessel the modal was opened from —
      // render a read-only Badge instead of the multi-select (the effective value is the locked id).
      if (lockedVessel) {
        return (
          <div key={key} style={{ gridColumn: "1 / -1" }}>
            <div style={labelStyle}>Vessel</div>
            <Badge tone="gold" variant="soft">{lockedVessel.label}</Badge>
          </div>
        );
      }
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
    if (type === "material") {
      // Phase 034: category-filtered + fuzzy picker (replaces the flat <select>).
      return (
        <div key={key} style={{ gridColumn: "1 / -1" }}>
          <div style={labelStyle}>{fieldLabel(key)}</div>
          <MaterialFilterPicker options={pickers.materials} value={String(current)} onChange={(id) => setField(taskIdx, key, id)} categoryScope={materialScope} />
        </div>
      );
    }
    if (type === "vessel" || type === "lot") {
      const opts = type === "vessel" ? pickers.vessels : pickers.lots;
      // Plan 045: in locked-vessel mode, default a transform SOURCE-vessel select (fromVesselId /
      // sourceVesselId) to the locked vessel — but keep it selectable so the crew can override, and leave
      // destination selects (toVesselId) untouched.
      const isSourceVessel = type === "vessel" && (key === "fromVesselId" || key === "sourceVesselId");
      const selectValue =
        lockedVessel && isSourceVessel && current === "" ? lockedVessel.id : String(current);
      return (
        <label key={key} {...common}>
          {fieldLabel(key)}
          <select style={field} value={selectValue} onChange={(e) => setField(taskIdx, key, e.target.value)}>
            <option value="">— pick —</option>
            {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
      );
    }
    if (type === "number") {
      let label: string = fieldLabel(key);
      if (key === "amount") {
        // Additions pair Amount with the Units dropdown → just "Amount". Maintenance amounts are in the
        // material's stock unit → show it ("Amount (g)").
        if (hasDoseUnit) {
          label = "Amount";
        } else {
          const unit = pickers.materials.find((m) => m.id === overrides[taskIdx]?.materialId)?.unit;
          label = unit ? `Amount (${unit})` : "Amount — pick a material first";
        }
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

  // Render a task's fields (shared by template tasks + appended additions). Additions render Amount + the
  // Units dropdown (doseUnit); the live total estimate is appended by renderEstimate below.
  function renderTaskFields(taskIdx: number, def: (typeof TASK_VOCABULARY)[string], defaults?: Record<string, unknown>) {
    const hasDoseUnit = "doseUnit" in def.fields;
    const materialScope = materialScopeForTask(def);
    return Object.entries(def.fields).map(([key, type]) => renderField(taskIdx, key, type, defaults?.[key], def.fieldOptions?.[key], hasDoseUnit, materialScope));
  }

  // The effective volume for the dose calc: a BARREL is assumed FULL (use capacity); a tank uses its current
  // wine volume. Single-vessel volume is overridable.
  function vesselVolume(vid: string): number {
    const v = pickers.vessels.find((x) => x.id === vid);
    if (!v) return 0;
    return v.kind === "BARREL" ? Number(v.capacityL ?? v.volumeL ?? 0) : Number(v.volumeL ?? 0);
  }

  // Live dose calculator: for a rate unit (g/hL…) show the total it works out to against the vessel volume
  // (barrels full). Absolute units (g, kg…) are already a total → no estimate. Informational; the actual
  // dose is recomputed from the vessel's real volume at completion (A3). Returns null when N/A.
  function renderEstimate(taskIdx: number, defaults?: Record<string, unknown>) {
    const amount = Number(overrides[taskIdx]?.amount ?? defaults?.amount ?? "");
    const unitSel = String(overrides[taskIdx]?.doseUnit ?? defaults?.doseUnit ?? "");
    // Locked-vessel mode pins the single-vessel field to the locked id (no override is written).
    const sel = overrides[taskIdx]?.vesselId ?? (lockedVessel ? [lockedVessel.id] : undefined);
    const vesselIds = Array.isArray(sel) ? (sel as string[]) : sel ? [String(sel)] : [];
    if (!(amount > 0) || !isRateUnit(unitSel) || vesselIds.length === 0) return null;
    const wrap: React.CSSProperties = { gridColumn: "1 / -1", fontSize: 13, background: "var(--paper-100)", borderRadius: "var(--radius-md)", padding: "8px 10px" };

    if (vesselIds.length === 1) {
      const base = vesselVolume(vesselIds[0]);
      const isBarrel = pickers.vessels.find((v) => v.id === vesselIds[0])?.kind === "BARREL";
      const ov = volOverride[taskIdx];
      const vol = ov === "" || ov == null ? base : Number(ov);
      const e = computeDoseTotal(amount, unitSel, vol);
      return (
        <div key="est" style={wrap}>
          <span style={{ color: "var(--text-muted)" }}>Volume </span>
          <input type="number" inputMode="decimal" step="any" value={String(ov ?? base)} onChange={(ev) => setVolOverride((o) => ({ ...o, [taskIdx]: ev.target.value === "" ? "" : Number(ev.target.value) }))} style={{ width: 90, padding: "2px 6px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)" }} /> L
          {isBarrel ? <span style={{ color: "var(--text-muted)" }}> (barrel assumed full)</span> : null}
          {e ? <span> → ≈ <strong>{e.total.toLocaleString()} {e.unit}</strong> total to weigh out</span> : <span style={{ color: "var(--text-muted)" }}> — enter a positive volume</span>}
        </div>
      );
    }
    // Multiple vessels: total across all, using each vessel's effective volume (barrels full).
    let grand = 0; let unit = "g"; let ok = false;
    for (const vid of vesselIds) { const e = computeDoseTotal(amount, unitSel, vesselVolume(vid)); if (e) { grand += e.total; unit = e.unit; ok = true; } }
    return (
      <div key="est" style={wrap}>
        {ok ? <span>≈ <strong>{grand.toLocaleString()} {unit}</strong> total across {vesselIds.length} vessels <span style={{ color: "var(--text-muted)" }}>{"(each vessel's current volume)"}</span></span> : <span style={{ color: "var(--text-muted)" }}>Selected vessels are empty — no volume to compute against.</span>}
      </div>
    );
  }

  // The TaskBuild[] the form currently represents — the single source fed to BOTH the live readiness
  // preview and submit, so what the winemaker sees is exactly what gets created.
  const taskBuilds = React.useMemo<TaskBuild[]>(() => {
    const out: TaskBuild[] = [];
    spec.tasks.forEach((t, i) => {
      out.push(...buildsForTask(t.taskType, t.title, cleanValues(withLockedVessel(lockedVessel, t.taskType, { ...(t.defaults ?? {}), ...(overrides[i] ?? {}) }))));
    });
    extraKeys.forEach((k) => {
      const values = cleanValues(withLockedVessel(lockedVessel, "ADDITION", overrides[k] ?? {}));
      if (Object.keys(values).length > 0) out.push(...buildsForTask("ADDITION", "Add material", values));
    });
    return out;
  }, [spec, overrides, extraKeys, lockedVessel]);

  // ── Live readiness preview (Unit 2): debounced call to the shared readiness engine as the form changes.
  // A request counter drops stale responses. The returned fingerprint is threaded back on submit so the
  // server refuses a stale create. ──
  const [readiness, setReadiness] = React.useState<WorkOrderReadinessProposal | null>(null);
  const [readinessPending, setReadinessPending] = React.useState(false);
  const readinessReq = React.useRef(0);

  React.useEffect(() => {
    if (taskBuilds.length === 0) return; // stale preview is hidden in render; nothing to fetch
    const id = ++readinessReq.current;
    let cancelled = false;
    const handle = setTimeout(() => {
      setReadinessPending(true);
      previewWorkOrderReadinessAction({
        source: lockedVessel ? "vessel_modal" : "manual",
        title: title.trim() || template?.name || "Work order",
        assigneeEmail: assigneeEmail.trim() || null,
        dueDate: null,
        taskBuilds,
      })
        .then((p) => { if (!cancelled && id === readinessReq.current) setReadiness(p); })
        .catch(() => { if (!cancelled && id === readinessReq.current) setReadiness(null); })
        .finally(() => { if (!cancelled && id === readinessReq.current) setReadinessPending(false); });
    }, 400);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [taskBuilds, title, assigneeEmail, lockedVessel, template?.name]);

  const hasTasks = taskBuilds.length > 0;
  const readinessBlocked = hasTasks && readiness?.status === "blocked";

  function submit() {
    setError(null);
    if (!templateId) { setError("Pick a template."); return; }
    if (taskBuilds.length === 0) { setError("Add at least one task."); return; }
    if (readinessBlocked) { setError("Resolve the blocking issues above before issuing."); return; }
    const payload = {
      templateId,
      title: title.trim() || undefined,
      assigneeEmail: assigneeEmail.trim() || null,
      dueAt: dueAt ? new Date(dueAt) : null,
      autoFinalize,
      taskBuilds,
      readinessFingerprint: readiness?.fingerprint ?? null,
    };
    startTransition(async () => {
      try {
        if (lockedVessel && onCreateAndIssue) {
          // Locked-vessel mode: create + issue in one step; the parent panel handles success (warnings, close).
          await onCreateAndIssue(payload);
          return;
        }
        const res = unwrap(await createWorkOrderFromTemplateAction(payload));
        router.push(`/work-orders/${res.workOrderId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't create the work order.");
      }
    });
  }

  return (
    <div style={lockedVessel ? { padding: 0 } : { maxWidth: 720, margin: "0 auto", padding: "8px 4px 60px" }}>
      {/* Standalone page keeps its own <h1>; embedded (locked) mode gets its title from the host Modal. */}
      {lockedVessel ? null : <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, margin: "0 0 16px" }}>New work order</h1>}

      {templates.length === 0 ? (
        <Card style={{ padding: 24 }}>No templates yet. Seed the system templates with <code>npm run seed:work-order-templates</code>.</Card>
      ) : (
        <Card style={lockedVessel ? { display: "flex", flexDirection: "column", gap: 14, padding: 0, border: "none", boxShadow: "none", background: "transparent" } : { display: "flex", flexDirection: "column", gap: 14, padding: 20 }}>
          <label style={labelStyle}>
            Template
            <select style={field} value={templateId} onChange={(e) => { setTemplateId(e.target.value); setOverrides({}); setExtraKeys([]); }}>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isSystem ? " (system)" : ""}</option>)}
            </select>
          </label>
          <div style={{ fontSize: 12.5, marginTop: -6 }}>
            Don&apos;t see what you need? <Link href="/work-orders/templates" style={{ color: "var(--wine-primary)" }}>Manage templates</Link>.
          </div>

          <Input label="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={template?.name} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={labelStyle}>Due date<input type="date" style={field} value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></label>
            {/* Pick the assignee from tenant members (value = email) so the backend can resolve it to a
                real user id — a WO assigned by member drives their inbox bucket + notification. */}
            <label style={labelStyle}>Assignee (optional)
              <select style={field} value={assigneeEmail} onChange={(e) => setAssigneeEmail(e.target.value)}>
                <option value="">— unassigned —</option>
                {members.map((m) => <option key={m.userId} value={m.email}>{m.name}</option>)}
              </select>
            </label>
          </div>
          <Checkbox checked={autoFinalize} onChange={setAutoFinalize} label="Auto-finalize my own work (skip review when I complete it)" />

          {spec.tasks.map((t, i) => {
            const def = TASK_VOCABULARY[t.taskType];
            if (!def) return null;
            // Plan 035: a de-stem/crush or press/saignée block only sets its "what" process defaults here;
            // the picks/fractions/vessels/measured volumes are entered when the crew RUNS the work order
            // (the native sub-forms on the execute screen). No vessel/material field → no multi-vessel fan-out.
            const isTransform = def.opType === "CRUSH" || def.opType === "PRESS";
            const isWeighIn = def.observationType === "HARVEST_WEIGH_IN";
            return (
              <div key={i} style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                <Eyebrow>{i + 1}. {t.title} · {def.label}</Eyebrow>
                {def.hint ? <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 6 }}>{def.hint}</div> : null}
                {isTransform ? <div style={{ fontSize: 12.5, color: "var(--text-secondary)", background: "var(--paper-100)", borderRadius: "var(--radius-md)", padding: "8px 10px", marginTop: 8 }}>{def.opType === "CRUSH" ? "Picks (with kg), destination and measured output volume" : "Must lot, source vessel and the press fractions"} are entered when the crew runs this — set only the process defaults below.</div> : null}
                {isWeighIn ? <div style={{ fontSize: 12.5, color: "var(--text-secondary)", background: "var(--paper-100)", borderRadius: "var(--radius-md)", padding: "8px 10px", marginTop: 8 }}>The vineyard block, fruit weight and Brix/pH/TA are entered when the crew runs this weigh-in.</div> : null}
                {isWeighIn ? null : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
                    {renderTaskFields(i, def, t.defaults)}
                    {renderEstimate(i, t.defaults)}
                  </div>
                )}
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

          {/* Shared readiness preview — cost/supply/capacity/compliance before create/issue (Unit 2). */}
          {hasTasks && readiness ? (
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
              <WorkOrderReadinessPanel proposal={readiness} />
            </div>
          ) : hasTasks && readinessPending ? (
            <div style={{ fontSize: 13, color: "var(--text-muted)", borderTop: "1px solid var(--border)", paddingTop: 12 }}>Checking readiness…</div>
          ) : null}

          {error ? <div style={{ color: "var(--danger)", fontSize: 14 }}>{error}</div> : null}

          {/* Effect summary above the CTA (design review): who/when + what happens on confirm. */}
          {hasTasks ? (
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", background: "var(--paper-100)", borderRadius: "var(--radius-md)", padding: "8px 10px" }}>
              {taskBuilds.length} task{taskBuilds.length === 1 ? "" : "s"} · {assigneeEmail.trim() ? `assigned to ${assigneeEmail.trim()}` : "unassigned"} · {dueAt ? `due ${dueAt}` : "no due date"}.{" "}
              {lockedVessel ? "Creating & issuing now reserves supply/capacity and sends it to the crew." : "Creates a draft you can review before issuing."}
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => (lockedVessel ? onCancel?.() : router.push("/work-orders"))}>Cancel</Button>
            <Button disabled={pending || readinessBlocked} onClick={submit}>{pending ? (lockedVessel ? "Issuing…" : "Creating…") : lockedVessel ? "Issue Work Order" : "Create draft"}</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
