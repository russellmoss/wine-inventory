"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Eyebrow } from "@/components/ui";
import { TASK_VOCABULARY, fieldLabel, type TaskTypeDef } from "@/lib/work-orders/template-vocabulary";
import { CUSTOM_LOG_FIELD_TYPES, CUSTOM_LOG_STAGES, CUSTOM_LOG_DIMENSIONS, validateCustomLogFields, type CustomLogFieldSpec } from "@/lib/work-orders/custom-log-fields";
import { hideableFieldsFor } from "@/lib/work-orders/overlays";
import { createUserTaskTypeAction, updateUserTaskTypeAction, archiveUserTaskTypeAction, saveOverlayAction, clearOverlayAction } from "@/lib/work-orders/custom-log-actions";

type CustomLogRow = { id: string; code: string; label: string; fields: CustomLogFieldSpec[]; archivedAt: string | null };
type OverlayRow = { id: string; baseTaskType: string; hiddenFields: string[]; relabels: Record<string, string>; fieldOrder: string[]; archivedAt: string | null };
type FieldDraft = { key: string; label: string; type: string; options: string; required: boolean; dimension: string; stage: string[] };

const field: React.CSSProperties = { fontSize: 14, padding: "6px 8px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface)", width: "100%" };
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 3 };

function emptyField(): FieldDraft {
  return { key: "", label: "", type: "text", options: "", required: false, dimension: "", stage: [...CUSTOM_LOG_STAGES] };
}
function toDraft(f: CustomLogFieldSpec): FieldDraft {
  return { key: f.key, label: f.label, type: f.type, options: (f.options ?? []).join(", "), required: !!f.required, dimension: f.dimension ?? "", stage: f.stage ?? [...CUSTOM_LOG_STAGES] };
}
function draftToSpec(d: FieldDraft): Record<string, unknown> {
  const spec: Record<string, unknown> = { key: d.key.trim(), label: d.label.trim(), type: d.type, stage: d.stage };
  if (d.type === "select") spec.options = d.options.split(",").map((o) => o.trim()).filter(Boolean);
  if (d.required) spec.required = true;
  if (d.type === "number" && d.dimension) spec.dimension = d.dimension;
  return spec;
}

export function TaskTypesClient({ customLogs, overlays, isAdmin }: { customLogs: CustomLogRow[]; overlays: OverlayRow[]; isAdmin: boolean }) {
  const router = useRouter();
  const [tab, setTab] = React.useState<"logs" | "builtin">("logs");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  // ── Custom Logs editor ──
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [drafts, setDrafts] = React.useState<FieldDraft[]>([emptyField()]);

  function resetLog() { setEditingId(null); setName(""); setDrafts([emptyField()]); setError(null); }
  function startEditLog(l: CustomLogRow) { setEditingId(l.id); setName(l.label); setDrafts(l.fields.length ? l.fields.map(toDraft) : [emptyField()]); setError(null); }
  function setDraft(i: number, patch: Partial<FieldDraft>) { setDrafts((prev) => prev.map((d, di) => (di === i ? { ...d, ...patch } : d))); }
  function toggleStage(i: number, s: string) { setDrafts((prev) => prev.map((d, di) => (di === i ? { ...d, stage: d.stage.includes(s) ? d.stage.filter((x) => x !== s) : [...d.stage, s] } : d))); }

  function saveLog() {
    setError(null);
    const fields = drafts.map(draftToSpec);
    const v = validateCustomLogFields(fields);
    if (!name.trim()) { setError("Give the custom log a name."); return; }
    if (!v.ok) { setError(v.errors.join(" ")); return; }
    startTransition(async () => {
      try {
        if (editingId) await updateUserTaskTypeAction({ id: editingId, label: name, fields });
        else await createUserTaskTypeAction({ label: name, fields });
        resetLog();
        router.refresh();
      } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save the custom log."); }
    });
  }
  function toggleArchiveLog(l: CustomLogRow) {
    startTransition(async () => {
      try { await archiveUserTaskTypeAction({ id: l.id, active: !!l.archivedAt }); router.refresh(); }
      catch (e) { setError(e instanceof Error ? e.message : "Couldn't update."); }
    });
  }

  // ── Built-in overlays ──
  const builtins = React.useMemo(() => Object.entries(TASK_VOCABULARY).filter(([, d]) => !(d as TaskTypeDef).isUserDefined), []);
  const overlayByType = React.useMemo(() => new Map(overlays.map((o) => [o.baseTaskType, o])), [overlays]);

  function BuiltinOverlayCard({ code, def }: { code: string; def: TaskTypeDef }) {
    const existing = overlayByType.get(code);
    const hideable = new Set(hideableFieldsFor(code));
    const [hidden, setHidden] = React.useState<Set<string>>(new Set(existing?.hiddenFields ?? []));
    const [relabels, setRelabels] = React.useState<Record<string, string>>(existing?.relabels ?? {});
    const keys = Object.keys(def.fields);
    if (keys.length === 0) return null;
    return (
      <Card style={{ padding: 12, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600 }}>{def.label}</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{code}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: 8, alignItems: "center", marginTop: 8 }}>
          {keys.map((k) => (
            <React.Fragment key={k}>
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, opacity: hideable.has(k) ? 1 : 0.5 }} title={hideable.has(k) ? "" : "Required by the operation — can't hide"}>
                <input type="checkbox" disabled={!isAdmin || !hideable.has(k)} checked={hidden.has(k)} onChange={(e) => setHidden((prev) => { const n = new Set(prev); if (e.target.checked) n.add(k); else n.delete(k); return n; })} />
                hide
              </label>
              <span style={{ fontSize: 13 }}>{fieldLabel(k)}</span>
              <input style={{ ...field }} disabled={!isAdmin} placeholder="rename (optional)" value={relabels[k] ?? ""} onChange={(e) => setRelabels((prev) => ({ ...prev, [k]: e.target.value }))} />
            </React.Fragment>
          ))}
        </div>
        {isAdmin && (
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <Button disabled={pending} onClick={() => startTransition(async () => {
              try {
                const cleanRelabels = Object.fromEntries(Object.entries(relabels).filter(([, v]) => v.trim()));
                await saveOverlayAction({ baseTaskType: code, hiddenFields: [...hidden], relabels: cleanRelabels, fieldOrder: [] });
                router.refresh();
              } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save overlay."); }
            })}>Save</Button>
            {existing && <Button variant="ghost" disabled={pending} onClick={() => startTransition(async () => { try { await clearOverlayAction({ baseTaskType: code }); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Couldn't reset."); } })}>Reset</Button>}
          </div>
        )}
      </Card>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "8px 4px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, margin: "8px 0" }}>Task types</h1>
        <Link href="/work-orders"><Button variant="ghost">Back to work orders</Button></Link>
      </div>
      {!isAdmin && <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>Read-only — task-type authoring is admin/owner only.</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Button variant={tab === "logs" ? "primary" : "secondary"} onClick={() => setTab("logs")}>Custom logs</Button>
        <Button variant={tab === "builtin" ? "primary" : "secondary"} onClick={() => setTab("builtin")}>Built-in fields</Button>
      </div>
      {error && <div style={{ color: "var(--danger)", fontSize: 14, marginBottom: 10 }}>{error}</div>}

      {tab === "logs" ? (
        <>
          {isAdmin && (
            <Card style={{ padding: 16, marginBottom: 16 }}>
              <Eyebrow>{editingId ? "Edit custom log" : "New custom log"}</Eyebrow>
              <div style={{ fontSize: 12, color: "var(--text-warning)", background: "var(--bg-warning, #faf0da)", borderRadius: "var(--radius-md)", padding: "6px 10px", margin: "8px 0" }}>
                Records data only — a custom log never updates inventory, cost, vessel volume, or chemistry.
              </div>
              <label style={{ ...lbl, fontSize: 12 }}>Name<Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Barrel weigh" /></label>
              <div style={{ marginTop: 12 }}>
                <div style={lbl}>Fields</div>
                {drafts.map((d, i) => (
                  <div key={i} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 8, marginBottom: 6 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                      <label style={lbl}>Key<input style={field} value={d.key} onChange={(e) => setDraft(i, { key: e.target.value })} placeholder="weight" /></label>
                      <label style={lbl}>Label<input style={field} value={d.label} onChange={(e) => setDraft(i, { label: e.target.value })} placeholder="Weight" /></label>
                      <label style={lbl}>Type<select style={field} value={d.type} onChange={(e) => setDraft(i, { type: e.target.value })}>{CUSTOM_LOG_FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 6, marginTop: 6 }}>
                      {d.type === "select" && <label style={lbl}>Options (comma-separated)<input style={field} value={d.options} onChange={(e) => setDraft(i, { options: e.target.value })} placeholder="A, B, C" /></label>}
                      {d.type === "number" && <label style={lbl}>Unit<select style={field} value={d.dimension} onChange={(e) => setDraft(i, { dimension: e.target.value })}><option value="">—</option>{CUSTOM_LOG_DIMENSIONS.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
                      <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={d.required} onChange={(e) => setDraft(i, { required: e.target.checked })} /> required</label>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Show at:</span>
                      {CUSTOM_LOG_STAGES.map((s) => <label key={s} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={d.stage.includes(s)} onChange={() => toggleStage(i, s)} />{s}</label>)}
                      <button type="button" onClick={() => setDrafts((prev) => prev.filter((_, di) => di !== i))} style={{ marginLeft: "auto", border: "none", background: "none", color: "var(--text-muted)", cursor: "pointer" }}>remove</button>
                    </div>
                  </div>
                ))}
                <Button variant="secondary" onClick={() => setDrafts((prev) => [...prev, emptyField()])}>+ Add field</Button>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <Button disabled={pending} onClick={saveLog}>{editingId ? "Save changes" : "Create custom log"}</Button>
                {editingId && <Button variant="ghost" onClick={resetLog}>Cancel</Button>}
              </div>
            </Card>
          )}
          <Eyebrow>Custom logs ({customLogs.length})</Eyebrow>
          {customLogs.length === 0 ? <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 8 }}>None yet.</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {customLogs.map((l) => (
                <Card key={l.id} padding="10px 14px" style={{ opacity: l.archivedAt ? 0.6 : 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div><span style={{ fontWeight: 600 }}>{l.label}</span><span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>{l.fields.length} field{l.fields.length === 1 ? "" : "s"} · {l.code}</span></div>
                    {isAdmin && <div style={{ display: "flex", gap: 8 }}><Button variant="ghost" onClick={() => startEditLog(l)}>Edit</Button><Button variant="ghost" onClick={() => toggleArchiveLog(l)}>{l.archivedAt ? "Restore" : "Archive"}</Button></div>}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <Eyebrow>Built-in task fields</Eyebrow>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "4px 0 12px" }}>Hide or rename optional fields on the built-in tasks. Fields a governed operation needs can&apos;t be hidden.</div>
          {builtins.map(([code, def]) => <BuiltinOverlayCard key={code} code={code} def={def as TaskTypeDef} />)}
        </>
      )}
    </div>
  );
}
