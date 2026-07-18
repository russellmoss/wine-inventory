"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Eyebrow, Badge } from "@/components/ui";
import { fieldLabel, type ResolvedTaskVocabulary, type TaskTypeDef, type TaskBuild } from "@/lib/work-orders/template-vocabulary";
import { createWorkOrderFromBuildsAction, updateWorkOrderFromBuildsAction, draftWorkOrderFromTextAction } from "@/lib/work-orders/actions";
import { unwrap } from "@/lib/action-result";
import { previewWorkOrderReadinessAction } from "@/lib/work-orders/proposal-readiness-actions";
import type { WorkOrderReadinessProposal } from "@/lib/work-orders/proposal-readiness";
import { WorkOrderReadinessPanel } from "@/components/work-orders/WorkOrderReadinessPanel";
import { MaterialFilterPicker } from "@/components/work-orders/MaterialFilterPicker";
import { PackagingBoMEditor } from "@/components/work-orders/PackagingBoMEditor";
import { materialScopeForTask } from "@/lib/cellar/material-taxonomy";
import type { PackagingPlanLine } from "@/lib/bottling/packaging-bom";
import { WORK_ORDER_PRIORITIES } from "@/lib/work-orders/planning";

type Picker = { id: string; label: string; unit?: string | null; kind?: string | null; category?: string | null; subcategory?: string | null; onHand?: number | null; volumeL?: number | null; capacityL?: number | null };
type Member = { userId: string; name: string; email: string };
type DependableWo = { id: string; number: number; title: string; status: string };
type LocationRow = { id: string; name: string; kind: string | null };
type EquipmentPick = { id: string; name: string; kind: string };
type BuilderTask = {
  key: string;
  taskType: string;
  title: string;
  values: Record<string, unknown>;
  assigneeId: string;
  equipmentIds: string[];
  // Plan 071 (edit mode): set when the task came from an existing WO. `locked` tasks are executed and
  // rendered read-only (only the ledger can change them, via reverse). renderMode drives group-form types.
  existingTaskId?: string;
  locked?: boolean;
  lockReason?: string | null;
  renderMode?: "fields" | "group-form";
};

// Plan 071: when present, the builder runs in EDIT mode — pre-populated from an existing WO, Save updates
// it in place. `groups` carries per-task existingTaskId/locked flags from the reverse-mapper.
export type ExistingWorkOrderSeed = {
  workOrderId: string;
  status: string;
  groups: BuilderTask[][];
  title: string;
  leadEmail: string;
  priority: string;
  locationId: string;
  dueAt: string; // yyyy-mm-dd (or "")
  dependsOn: string[];
};

const field: React.CSSProperties = { fontSize: 14, padding: "8px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface)", width: "100%" };
const labelStyle: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 };

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

let keyCounter = 0;
function newKey(): string {
  keyCounter += 1;
  return `t${keyCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Group a vocabulary entry into a palette category (display-only; the safety line is in the resolver). */
function categoryFor(def: TaskTypeDef): string {
  if (def.isUserDefined || def.kind === "NOTE") return "Checklist & logs";
  if (def.observationType === "HARVEST_WEIGH_IN" || def.opType === "CRUSH" || def.opType === "PRESS") return "Fruit & press";
  if (def.kind === "OBSERVATION") return "Sampling";
  if (def.kind === "MAINTENANCE") return "Maintenance";
  if (def.opType === "ADDITION" || def.opType === "FINING") return "Additions";
  return "Cellar ops";
}
const CATEGORY_ORDER = ["Cellar ops", "Additions", "Sampling", "Maintenance", "Fruit & press", "Checklist & logs"];

function cleanValues(raw: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== "" && v !== undefined && v !== null));
}

export function WorkOrderBuilderClient({
  pickers,
  members,
  dependableWorkOrders,
  locations,
  equipment,
  vocab,
  existing,
}: {
  pickers: { vessels: Picker[]; materials: Picker[]; lots: Picker[] };
  members: Member[];
  dependableWorkOrders: DependableWo[];
  locations: LocationRow[];
  equipment: EquipmentPick[];
  vocab: ResolvedTaskVocabulary;
  existing?: ExistingWorkOrderSeed;
}) {
  const router = useRouter();
  const isEdit = !!existing;
  const [title, setTitle] = React.useState(existing?.title ?? "");
  const [dueAt, setDueAt] = React.useState(existing ? existing.dueAt : todayLocal());
  // Plan 070: the Lead is chosen by the STABLE member userId — a member's email can be blank or duplicated,
  // so keying the picker on email would drop a valid selection ("pick a lead" after clearly choosing one).
  // In edit mode we may seed a lead who is no longer a member (email only, no userId) — keep that too.
  const seededLead = existing ? members.find((m) => m.email === existing.leadEmail) : undefined;
  const [leadUserId, setLeadUserId] = React.useState(seededLead?.userId ?? "");
  const [leadEmailFallback] = React.useState(existing?.leadEmail ?? "");
  // The effective lead email: from the selected member, or (edit mode) the seeded lead who left the org.
  const selectedMember = members.find((m) => m.userId === leadUserId);
  const leadEmail = selectedMember?.email || (leadUserId === "" && !seededLead ? leadEmailFallback : "") || leadEmailFallback && leadUserId === "" ? leadEmailFallback : selectedMember?.email ?? "";
  const [priority, setPriority] = React.useState(existing?.priority || "NORMAL");
  const [locationId, setLocationId] = React.useState(existing?.locationId ?? "");
  const [groups, setGroups] = React.useState<BuilderTask[][]>(existing?.groups?.length ? existing.groups : [[]]);
  const [dependsOn, setDependsOn] = React.useState<string[]>(existing?.dependsOn ?? []);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  // D14: the AI accelerator — describe the job, draft tasks into the builder, then edit before issuing.
  const [describeText, setDescribeText] = React.useState("");
  const [drafting, setDrafting] = React.useState(false);
  const [draftNote, setDraftNote] = React.useState<string | null>(null);

  // The effective lead (userId + email), resolving the edit-mode "lead left the org" case (email-only).
  const effectiveLead = React.useMemo<{ userId: string | null; email: string }>(() => {
    if (selectedMember) return { userId: selectedMember.userId, email: selectedMember.email };
    // Edit-mode seed whose lead is no longer a member: keep the email, no userId.
    if (existing && leadUserId === "" && leadEmailFallback && !members.some((m) => m.email === leadEmailFallback)) {
      return { userId: null, email: leadEmailFallback };
    }
    return { userId: null, email: "" };
  }, [selectedMember, existing, leadUserId, leadEmailFallback, members]);
  const hasLead = !!effectiveLead.email;

  // Palette entries grouped by category, in a stable display order.
  const palette = React.useMemo(() => {
    const byCat: Record<string, { key: string; label: string }[]> = {};
    for (const [key, def] of Object.entries(vocab)) {
      const cat = categoryFor(def);
      (byCat[cat] ??= []).push({ key, label: def.label });
    }
    return CATEGORY_ORDER.filter((c) => byCat[c]?.length).map((c) => ({ category: c, items: byCat[c] }));
  }, [vocab]);

  function addTask(taskType: string) {
    setGroups((prev) => {
      const next = prev.length ? prev.map((g) => [...g]) : [[]];
      next[next.length - 1].push({ key: newKey(), taskType, title: "", values: {}, assigneeId: "", equipmentIds: [] });
      return next;
    });
  }
  function toggleEquipment(groupIdx: number, key: string, equipmentId: string) {
    setGroups((prev) => prev.map((g, gi) => (gi === groupIdx ? g.map((t) => {
      if (t.key !== key) return t;
      const on = t.equipmentIds.includes(equipmentId);
      return { ...t, equipmentIds: on ? t.equipmentIds.filter((x) => x !== equipmentId) : [...t.equipmentIds, equipmentId] };
    }) : g)));
  }
  function addGroup() {
    setGroups((prev) => [...prev, []]);
  }
  function updateTask(groupIdx: number, key: string, patch: Partial<BuilderTask>) {
    setGroups((prev) => prev.map((g, gi) => (gi === groupIdx ? g.map((t) => (t.key === key ? { ...t, ...patch } : t)) : g)));
  }
  function setTaskValue(groupIdx: number, key: string, field: string, value: unknown) {
    setGroups((prev) => prev.map((g, gi) => (gi === groupIdx ? g.map((t) => (t.key === key ? { ...t, values: { ...t.values, [field]: value } } : t)) : g)));
  }
  function removeTask(groupIdx: number, key: string) {
    setGroups((prev) => prev.map((g, gi) => (gi === groupIdx ? g.filter((t) => t.key !== key) : g)));
  }
  function moveTaskToGroup(fromIdx: number, key: string, toIdx: number) {
    setGroups((prev) => {
      const task = prev[fromIdx]?.find((t) => t.key === key);
      if (!task || toIdx === fromIdx) return prev;
      return prev.map((g, gi) => {
        if (gi === fromIdx) return g.filter((t) => t.key !== key);
        if (gi === toIdx) return [...g, task];
        return g;
      });
    });
  }

  // Flatten to TaskBuild[] with a groupSeq that reflects only NON-EMPTY groups (renumbered), so an empty
  // lane never gates. Shared by the readiness preview and submit.
  const taskBuilds = React.useMemo<TaskBuild[]>(() => {
    const nonEmpty = groups.filter((g) => g.length > 0);
    const builds: TaskBuild[] = [];
    nonEmpty.forEach((g, gi) => {
      for (const t of g) {
        if (t.locked) continue; // locked (executed) tasks aren't re-validated or re-authored
        const def = vocab[t.taskType];
        builds.push({
          taskType: t.taskType,
          title: t.title.trim() || def?.label || t.taskType,
          values: cleanValues(t.values),
          groupSeq: gi,
          assigneeId: t.assigneeId || undefined,
          taskKey: t.key,
          equipmentIds: t.equipmentIds.length ? t.equipmentIds : undefined,
        });
      }
    });
    return builds;
  }, [groups, vocab]);

  // Live readiness preview (debounced, stale-guarded).
  const [readiness, setReadiness] = React.useState<WorkOrderReadinessProposal | null>(null);
  const reqRef = React.useRef(0);
  React.useEffect(() => {
    const req = ++reqRef.current;
    const handle = setTimeout(async () => {
      if (taskBuilds.length === 0) { if (req === reqRef.current) setReadiness(null); return; }
      try {
        const res = await previewWorkOrderReadinessAction({ source: "manual", title: title || "Work order", assigneeEmail: effectiveLead.email || null, dueDate: dueAt || null, taskBuilds });
        if (req === reqRef.current) setReadiness(res);
      } catch { /* preview is best-effort */ }
    }, 350);
    return () => clearTimeout(handle);
  }, [taskBuilds, title, effectiveLead.email, dueAt]);

  function renderField(groupIdx: number, task: BuilderTask, key: string, type: string) {
    const def = vocab[task.taskType];
    const current = task.values[key] ?? "";
    const flabel = def?.fieldLabels?.[key] ?? fieldLabel(key); // C12: overlay relabel wins over the default
    if (type === "block") return null; // vineyard block target is chosen at run time (execute sub-form)
    if (type === "select") {
      const options = def?.fieldOptions?.[key] ?? [];
      return (
        <label key={key} style={labelStyle}>
          {flabel}
          <select style={field} value={String(current)} onChange={(e) => setTaskValue(groupIdx, task.key, key, e.target.value)}>
            <option value="">— pick —</option>
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
      );
    }
    if (type === "material") {
      const scope = def ? materialScopeForTask(def) : undefined;
      return (
        <div key={key} style={{ gridColumn: "1 / -1" }}>
          <div style={labelStyle}>{flabel}</div>
          <MaterialFilterPicker options={pickers.materials} value={String(current)} onChange={(id) => setTaskValue(groupIdx, task.key, key, id)} categoryScope={scope} />
        </div>
      );
    }
    if (type === "vessel" || type === "lot") {
      const opts = type === "vessel" ? pickers.vessels : pickers.lots;
      return (
        <label key={key} style={labelStyle}>
          {flabel}
          <select style={field} value={String(current)} onChange={(e) => setTaskValue(groupIdx, task.key, key, e.target.value)}>
            <option value="">— pick —</option>
            {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
      );
    }
    if (type === "number") {
      return (
        <label key={key} style={labelStyle}>
          {flabel}
          <input type="number" inputMode="decimal" step="any" style={field} value={String(current)} onChange={(e) => setTaskValue(groupIdx, task.key, key, e.target.value === "" ? "" : Number(e.target.value))} />
        </label>
      );
    }
    if (type === "date") {
      return (
        <label key={key} style={labelStyle}>
          {flabel}
          <input type="date" style={field} value={String(current)} onChange={(e) => setTaskValue(groupIdx, task.key, key, e.target.value)} />
        </label>
      );
    }
    if (type === "boolean") {
      return (
        <label key={key} style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8, marginTop: 18 }}>
          <input type="checkbox" checked={current === true} onChange={(e) => setTaskValue(groupIdx, task.key, key, e.target.checked)} />
          {flabel}
        </label>
      );
    }
    if (key === "note" || key === "instructions") {
      return (
        <label key={key} style={{ ...labelStyle, gridColumn: "1 / -1" }}>
          {flabel}
          <textarea rows={2} style={{ ...field, minHeight: 56, resize: "vertical", lineHeight: 1.5 }} value={String(current)} onChange={(e) => setTaskValue(groupIdx, task.key, key, e.target.value)} />
        </label>
      );
    }
    return (
      <label key={key} style={labelStyle}>
        {flabel}
        <input type="text" style={field} value={String(current)} onChange={(e) => setTaskValue(groupIdx, task.key, key, e.target.value)} />
      </label>
    );
  }

  // Total tasks + editable (non-locked) count — edit mode may have only locked tasks left.
  const totalCount = React.useMemo(() => groups.reduce((n, g) => n + g.length, 0), [groups]);

  function submit() {
    setError(null);
    // Plan 070: every work order must have a Lead.
    if (!hasLead) { setError("A work order needs a lead — pick one above."); return; }
    const leadUserIdResolved = effectiveLead.userId;
    const leadEmailResolved = effectiveLead.email;
    const dueDate = dueAt ? new Date(`${dueAt}T00:00:00`) : null;

    if (isEdit && existing) {
      if (totalCount === 0) { setError("A work order needs at least one task."); return; }
      // Send the full ordered layout (locked + editable) so the server preserves order + never touches locked.
      const editGroups = groups
        .filter((g) => g.length > 0)
        .map((g) => g.map((t) => ({
          existingTaskId: t.existingTaskId,
          locked: !!t.locked,
          taskType: t.taskType,
          title: t.title.trim() || undefined,
          values: t.locked ? {} : cleanValues(t.values),
          assigneeId: t.assigneeId || null,
          equipmentIds: t.equipmentIds,
        })));
      startTransition(async () => {
        try {
          unwrap(await updateWorkOrderFromBuildsAction({
            workOrderId: existing.workOrderId,
            title: title.trim() || undefined,
            assigneeId: leadUserIdResolved,
            assigneeEmail: leadEmailResolved || null,
            priority,
            locationId: locationId || null,
            dueAt: dueDate,
            groups: editGroups,
            dependsOnWorkOrderIds: dependsOn,
            readinessFingerprint: readiness?.fingerprint ?? null,
          }));
          router.push(`/work-orders/${existing.workOrderId}`);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Couldn't save the work order.");
        }
      });
      return;
    }

    if (taskBuilds.length === 0) { setError("Add at least one task."); return; }
    startTransition(async () => {
      try {
        const res = unwrap(await createWorkOrderFromBuildsAction({
          title: title.trim() || undefined,
          assigneeId: leadUserIdResolved,
          assigneeEmail: leadEmailResolved || null,
          priority,
          locationId: locationId || null,
          // Parse the yyyy-mm-dd as LOCAL midnight (not UTC) so the due date doesn't shift a day back.
          dueAt: dueDate,
          taskBuilds,
          dependsOnWorkOrderIds: dependsOn,
          readinessFingerprint: readiness?.fingerprint ?? null,
        }));
        router.push(`/work-orders/${res.workOrderId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't create the work order.");
      }
    });
  }

  function draft() {
    const text = describeText.trim();
    if (!text) return;
    setError(null); setDraftNote(null); setDrafting(true);
    startTransition(async () => {
      try {
        const res = await draftWorkOrderFromTextAction({ text });
        const builds = Array.isArray(res.taskBuilds) ? res.taskBuilds : [];
        if (builds.length === 0) { setDraftNote("Couldn't turn that into tasks — try naming vessels/lots (e.g. \"rack T1 to T2\"), or add tasks from the palette."); return; }
        const drafted: BuilderTask[] = builds.map((b) => ({ key: newKey(), taskType: b.taskType, title: b.title ?? "", values: (b.values ?? {}) as Record<string, unknown>, assigneeId: "", equipmentIds: [] }));
        // Hydrate the builder: fresh group if empty, else append so we never wipe existing work.
        setGroups((prev) => (prev.some((g) => g.length > 0) ? [...prev, drafted] : [drafted]));
        // Adopt a suggested title only if the user hasn't typed one.
        if (res.title) setTitle((prev) => prev.trim() ? prev : res.title);
        const unresolved = Array.isArray(res.unresolved) ? res.unresolved : [];
        const tail = unresolved.length > 0
          ? ` ${unresolved.length} thing${unresolved.length === 1 ? "" : "s"} still need${unresolved.length === 1 ? "s" : ""} your input (${unresolved.map((u) => u.label).slice(0, 3).join(", ")}) — fix in the cards.`
          : "";
        setDraftNote(`Drafted ${drafted.length} task${drafted.length === 1 ? "" : "s"} — edit groups, assignees, and fields below, then create.${tail}`);
        setDescribeText("");
      } catch (e) { setError(e instanceof Error ? e.message : "Couldn't draft the work order."); }
      finally { setDrafting(false); }
    });
  }

  const nonEmptyGroupCount = groups.filter((g) => g.length > 0).length;

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 4px" }}>
      {/* Responsive: stack the header + palette/canvas grids on narrow viewports (phones/tablets). */}
      <style>{`@media (max-width: 760px){.wob-header-grid{grid-template-columns:1fr !important}.wob-main-grid{grid-template-columns:1fr !important}}`}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 300, margin: 0 }}>{isEdit ? "Edit work order" : "New work order"}</h1>
        <Link href="/work-orders"><Button variant="ghost">Cancel</Button></Link>
      </div>

      <Card style={{ padding: 16, marginBottom: 16 }}>
        <div className="wob-header-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 12 }}>
          <label style={labelStyle}>Title
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Racking + topping — Block 12" />
          </label>
          <label style={labelStyle}>Lead <span style={{ color: "var(--danger)" }}>*</span>
            {/* Keyed on userId (stable + always present) — a member's email can be blank/duplicated. */}
            <select style={field} value={leadUserId} onChange={(e) => setLeadUserId(e.target.value)}>
              <option value="">— choose a lead —</option>
              {/* Editing: if the current lead is no longer an org member, keep it selectable so it isn't silently dropped. */}
              {existing && leadUserId === "" && leadEmailFallback && !members.some((m) => m.email === leadEmailFallback)
                ? <option value="">{leadEmailFallback} (current)</option>
                : null}
              {members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
            </select>
          </label>
          <label style={labelStyle}>Priority
            <select style={field} value={priority} onChange={(e) => setPriority(e.target.value)}>
              {WORK_ORDER_PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
            </select>
          </label>
          <label style={labelStyle}>Location
            <select style={field} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">— none —</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <label style={labelStyle}>Due
            <input type="date" style={field} value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </label>
        </div>
        {dependableWorkOrders.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={labelStyle}>Runs after (finish these work orders first)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {dependableWorkOrders.map((w) => {
                const on = dependsOn.includes(w.id);
                return (
                  <button key={w.id} type="button" onClick={() => setDependsOn((prev) => on ? prev.filter((x) => x !== w.id) : [...prev, w.id])}
                    style={{ fontSize: 12, padding: "4px 10px", borderRadius: 999, cursor: "pointer",
                      border: on ? "1px solid var(--accent)" : "1px solid var(--border)",
                      background: on ? "var(--accent)" : "var(--surface)", color: on ? "#fff" : "var(--text-secondary)" }}>
                    WO #{w.number} · {w.title.slice(0, 28)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* D14: AI accelerator — describe the job, draft tasks into the builder, then edit before issuing. */}
      <Card style={{ padding: 16, marginBottom: 16 }}>
        <Eyebrow>Describe the job (optional)</Eyebrow>
        <div style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 8px" }}>
          Type it in plain English and we&apos;ll draft the tasks into the builder below. You stay in control — edit groups, assignees, and fields, then create.
        </div>
        <textarea
          value={describeText}
          onChange={(e) => setDescribeText(e.target.value)}
          placeholder={'e.g. "Rack T1 to T2, then add 30 ppm SO2 to T2 and take a sample"'}
          rows={3}
          style={{ ...field, resize: "vertical", fontFamily: "inherit" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
          <Button type="button" variant="secondary" onClick={draft} disabled={drafting || pending || !describeText.trim()}>
            {drafting ? "Drafting…" : "Draft it"}
          </Button>
          {draftNote && <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{draftNote}</span>}
        </div>
      </Card>

      <div className="wob-main-grid" style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 16 }}>
        {/* Palette */}
        <Card style={{ padding: 12, alignSelf: "start" }}>
          <Eyebrow>Add a task</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
            {palette.map((cat) => (
              <div key={cat.category}>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 5 }}>{cat.category}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {cat.items.map((it) => (
                    <button key={it.key} type="button" onClick={() => addTask(it.key)}
                      style={{ fontSize: 12, padding: "4px 8px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-primary)", cursor: "pointer" }}>
                      {it.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Canvas: sequential groups */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {groups.map((g, gi) => {
            const nonEmptyIndex = groups.slice(0, gi + 1).filter((x) => x.length > 0).length; // 1-based display among filled groups
            return (
              <React.Fragment key={gi}>
                {gi > 0 && <div style={{ fontSize: 11, color: "var(--text-muted)", paddingLeft: 4 }}>↓ then</div>}
                <Card style={{ padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: "var(--accent)" }}>
                      Group {g.length > 0 ? nonEmptyIndex : "—"} {g.length > 1 ? "· runs in parallel" : ""}
                    </span>
                  </div>
                  {g.length === 0 ? (
                    <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 0" }}>Pick a task from the palette to add it here.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {g.map((t) => {
                        const def = vocab[t.taskType];
                        if (t.locked) {
                          // Executed task — read-only. The immutable ledger op (WORKORDER-1) can't be edited;
                          // reverse it in the lot timeline to change it.
                          return (
                            <div key={t.key} style={{ border: "1px dashed var(--border)", borderRadius: "var(--radius-md)", padding: 10, background: "var(--paper-100)", opacity: 0.85 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <Badge tone="neutral" variant="soft">{def?.label ?? t.taskType}</Badge>
                                <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{t.title || def?.label}</span>
                                <Badge tone="neutral" variant="soft">🔒 recorded</Badge>
                              </div>
                              <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 5 }}>{t.lockReason ?? "Already recorded — reverse it in the lot timeline to edit."}</div>
                            </div>
                          );
                        }
                        return (
                          <div key={t.key} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 10, background: "var(--surface-raised)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                              <Badge tone="gold" variant="soft">{def?.label ?? t.taskType}</Badge>
                              <input value={t.title} onChange={(e) => updateTask(gi, t.key, { title: e.target.value })} placeholder={def?.label ?? "Task"} style={{ ...field, flex: 1, padding: "4px 8px" }} />
                              <button type="button" aria-label="Remove task" onClick={() => removeTask(gi, t.key)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 16 }}>×</button>
                            </div>
                            {def?.hint && <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>{def.hint}</div>}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                              {def && Object.entries(def.fields).map(([key, type]) => renderField(gi, t, key, type))}
                              {def?.opType === "BOTTLE" ? (
                                <PackagingBoMEditor
                                  options={pickers.materials}
                                  lines={(t.values.packaging as PackagingPlanLine[]) ?? []}
                                  bottles={Number(t.values.packagingBottles) || 0}
                                  onChange={(nextLines, nextBottles) => {
                                    setTaskValue(gi, t.key, "packaging", nextLines);
                                    setTaskValue(gi, t.key, "packagingBottles", nextBottles);
                                  }}
                                />
                              ) : null}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                              <label style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                                Assignee
                                <select style={{ ...field, width: "auto", padding: "4px 8px" }} value={t.assigneeId} onChange={(e) => updateTask(gi, t.key, { assigneeId: e.target.value })}>
                                  <option value="">— lead —</option>
                                  {members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
                                </select>
                              </label>
                              {groups.length > 1 && (
                                <label style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                                  Group
                                  <select style={{ ...field, width: "auto", padding: "4px 8px" }} value={gi} onChange={(e) => moveTaskToGroup(gi, t.key, Number(e.target.value))}>
                                    {groups.map((_, idx) => <option key={idx} value={idx}>{idx + 1}</option>)}
                                  </select>
                                </label>
                              )}
                            </div>
                            {equipment.length > 0 && (
                              <div style={{ marginTop: 8 }}>
                                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Equipment needed (advisory)</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                                  {equipment.map((eq) => {
                                    const on = t.equipmentIds.includes(eq.id);
                                    return (
                                      <button key={eq.id} type="button" onClick={() => toggleEquipment(gi, t.key, eq.id)}
                                        style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, cursor: "pointer",
                                          border: on ? "1px solid var(--accent)" : "1px solid var(--border)",
                                          background: on ? "var(--accent)" : "var(--surface)", color: on ? "#fff" : "var(--text-secondary)" }}>
                                        {eq.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              </React.Fragment>
            );
          })}
          <div>
            <Button variant="secondary" onClick={addGroup}>+ Add group (runs after the ones above)</Button>
          </div>
        </div>
      </div>

      {readiness && (
        <div style={{ marginTop: 16 }}>
          <WorkOrderReadinessPanel proposal={readiness} />
        </div>
      )}

      {error && <div style={{ marginTop: 12, color: "var(--danger)", fontSize: 14 }}>{error}</div>}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <Button onClick={submit} disabled={pending || (isEdit ? totalCount === 0 : taskBuilds.length === 0) || !hasLead}>
          {pending ? (isEdit ? "Saving…" : "Creating…") : !hasLead ? "Pick a lead" : isEdit ? "Save changes" : `Create work order${nonEmptyGroupCount > 1 ? ` (${nonEmptyGroupCount} groups)` : ""}`}
        </Button>
      </div>
    </div>
  );
}
