"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Eyebrow, Badge } from "@/components/ui";
import { fieldLabel, type ResolvedTaskVocabulary, type TaskTypeDef, type TaskBuild } from "@/lib/work-orders/template-vocabulary";
import { createWorkOrderFromBuildsAction } from "@/lib/work-orders/actions";
import { previewWorkOrderReadinessAction } from "@/lib/work-orders/proposal-readiness-actions";
import type { WorkOrderReadinessProposal } from "@/lib/work-orders/proposal-readiness";
import { WorkOrderReadinessPanel } from "@/components/work-orders/WorkOrderReadinessPanel";
import { MaterialFilterPicker } from "@/components/work-orders/MaterialFilterPicker";
import { materialScopeForTask } from "@/lib/cellar/material-taxonomy";
import { WORK_ORDER_PRIORITIES } from "@/lib/work-orders/planning";

type Picker = { id: string; label: string; unit?: string | null; kind?: string | null; category?: string | null; subcategory?: string | null; onHand?: number | null; volumeL?: number | null; capacityL?: number | null };
type Member = { userId: string; name: string; email: string };
type DependableWo = { id: string; number: number; title: string; status: string };
type BuilderTask = { key: string; taskType: string; title: string; values: Record<string, unknown>; assigneeId: string };

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
  vocab,
}: {
  pickers: { vessels: Picker[]; materials: Picker[]; lots: Picker[] };
  members: Member[];
  dependableWorkOrders: DependableWo[];
  vocab: ResolvedTaskVocabulary;
}) {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [dueAt, setDueAt] = React.useState(todayLocal());
  const [leadEmail, setLeadEmail] = React.useState("");
  const [priority, setPriority] = React.useState("NORMAL");
  const [groups, setGroups] = React.useState<BuilderTask[][]>([[]]);
  const [dependsOn, setDependsOn] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

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
      next[next.length - 1].push({ key: newKey(), taskType, title: "", values: {}, assigneeId: "" });
      return next;
    });
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
        const def = vocab[t.taskType];
        builds.push({
          taskType: t.taskType,
          title: t.title.trim() || def?.label || t.taskType,
          values: cleanValues(t.values),
          groupSeq: gi,
          assigneeId: t.assigneeId || undefined,
          taskKey: t.key,
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
        const res = await previewWorkOrderReadinessAction({ source: "manual", title: title || "Work order", assigneeEmail: leadEmail || null, dueDate: dueAt || null, taskBuilds });
        if (req === reqRef.current) setReadiness(res);
      } catch { /* preview is best-effort */ }
    }, 350);
    return () => clearTimeout(handle);
  }, [taskBuilds, title, leadEmail, dueAt]);

  function renderField(groupIdx: number, task: BuilderTask, key: string, type: string) {
    const def = vocab[task.taskType];
    const current = task.values[key] ?? "";
    if (type === "block") return null; // vineyard block target is chosen at run time (execute sub-form)
    if (type === "select") {
      const options = def?.fieldOptions?.[key] ?? [];
      return (
        <label key={key} style={labelStyle}>
          {fieldLabel(key)}
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
          <div style={labelStyle}>{fieldLabel(key)}</div>
          <MaterialFilterPicker options={pickers.materials} value={String(current)} onChange={(id) => setTaskValue(groupIdx, task.key, key, id)} categoryScope={scope} />
        </div>
      );
    }
    if (type === "vessel" || type === "lot") {
      const opts = type === "vessel" ? pickers.vessels : pickers.lots;
      return (
        <label key={key} style={labelStyle}>
          {fieldLabel(key)}
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
          {fieldLabel(key)}
          <input type="number" inputMode="decimal" step="any" style={field} value={String(current)} onChange={(e) => setTaskValue(groupIdx, task.key, key, e.target.value === "" ? "" : Number(e.target.value))} />
        </label>
      );
    }
    if (key === "note" || key === "instructions") {
      return (
        <label key={key} style={{ ...labelStyle, gridColumn: "1 / -1" }}>
          {fieldLabel(key)}
          <textarea rows={2} style={{ ...field, minHeight: 56, resize: "vertical", lineHeight: 1.5 }} value={String(current)} onChange={(e) => setTaskValue(groupIdx, task.key, key, e.target.value)} />
        </label>
      );
    }
    return (
      <label key={key} style={labelStyle}>
        {fieldLabel(key)}
        <input type="text" style={field} value={String(current)} onChange={(e) => setTaskValue(groupIdx, task.key, key, e.target.value)} />
      </label>
    );
  }

  function submit() {
    setError(null);
    if (taskBuilds.length === 0) { setError("Add at least one task."); return; }
    startTransition(async () => {
      try {
        const res = await createWorkOrderFromBuildsAction({
          title: title.trim() || undefined,
          assigneeEmail: leadEmail || null,
          priority,
          // Parse the yyyy-mm-dd as LOCAL midnight (not UTC) so the due date doesn't shift a day back.
          dueAt: dueAt ? new Date(`${dueAt}T00:00:00`) : null,
          taskBuilds,
          dependsOnWorkOrderIds: dependsOn,
          readinessFingerprint: readiness?.fingerprint ?? null,
        });
        router.push(`/work-orders/${res.workOrderId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't create the work order.");
      }
    });
  }

  const nonEmptyGroupCount = groups.filter((g) => g.length > 0).length;

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 4px" }}>
      {/* Responsive: stack the header + palette/canvas grids on narrow viewports (phones/tablets). */}
      <style>{`@media (max-width: 760px){.wob-header-grid{grid-template-columns:1fr !important}.wob-main-grid{grid-template-columns:1fr !important}}`}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 300, margin: 0 }}>New work order</h1>
        <Link href="/work-orders"><Button variant="ghost">Cancel</Button></Link>
      </div>

      <Card style={{ padding: 16, marginBottom: 16 }}>
        <div className="wob-header-grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 12 }}>
          <label style={labelStyle}>Title
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Racking + topping — Block 12" />
          </label>
          <label style={labelStyle}>Lead
            <select style={field} value={leadEmail} onChange={(e) => setLeadEmail(e.target.value)}>
              <option value="">— unassigned —</option>
              {members.map((m) => <option key={m.userId} value={m.email}>{m.name}</option>)}
            </select>
          </label>
          <label style={labelStyle}>Priority
            <select style={field} value={priority} onChange={(e) => setPriority(e.target.value)}>
              {WORK_ORDER_PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
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
        <Button onClick={submit} disabled={pending || taskBuilds.length === 0}>
          {pending ? "Creating…" : `Create work order${nonEmptyGroupCount > 1 ? ` (${nonEmptyGroupCount} groups)` : ""}`}
        </Button>
      </div>
    </div>
  );
}
