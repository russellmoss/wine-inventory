"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Textarea, Eyebrow, Badge, Modal } from "@/components/ui";
import { TASK_VOCABULARY, fieldLabel, validateTemplateSpec, type TemplateSpec, type TemplateTaskSpec, type FieldType } from "@/lib/work-orders/template-vocabulary";
import { createTemplateAction, updateTemplateSpecAction } from "@/lib/work-orders/actions";

// Plan 034 Unit 8: the structural builder. Compose blocks from the vocabulary (grouped picker), name +
// order them, and set OPTIONAL "what" defaults (material/rate/unit/medium/gas) — NEVER vessels/lots (the
// WHERE stays run-time, council). Max ~25 blocks. Reorder via ↑/↓ (keyboard-operable). Save creates a new
// template or a new immutable version, then lands on the detail (no dead-end).

type Material = { id: string; label: string; unit?: string | null };
type Block = TemplateTaskSpec & { _key: number };
const MAX_BLOCKS = 25;

const GROUPS: { label: string; kinds: string[] }[] = [
  { label: "Operations", kinds: ["OPERATION"] },
  { label: "Maintenance", kinds: ["MAINTENANCE"] },
  { label: "Observations", kinds: ["OBSERVATION"] },
  { label: "Checklist", kinds: ["NOTE"] },
];

// The WHERE (vessel/lot) is always chosen at run time — never a template default.
const isWhereField = (type: FieldType) => type === "vessel" || type === "lot";

export function TemplateEditorClient({
  mode,
  templateId,
  initial,
  materials,
}: {
  mode: "create" | "edit";
  templateId?: string;
  initial?: { name: string; description: string | null; category: string | null; tasks: TemplateTaskSpec[] };
  materials: Material[];
}) {
  const router = useRouter();
  // Seed the key counter above the initial blocks' keys (computed from props, not read during render).
  const keyRef = React.useRef((initial?.tasks?.length ?? 0) + 1);
  const [name, setName] = React.useState(initial?.name ?? "");
  const [description, setDescription] = React.useState(initial?.description ?? "");
  const [category, setCategory] = React.useState(initial?.category ?? "");
  const [blocks, setBlocks] = React.useState<Block[]>(() => (initial?.tasks ?? []).map((t, i) => ({ ...t, _key: i + 1 })));
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function addBlock(taskType: string) {
    const def = TASK_VOCABULARY[taskType];
    setBlocks((b) => [...b, { _key: keyRef.current++, taskType, title: def?.label ?? taskType, defaults: {} }]);
    setPickerOpen(false);
  }
  function removeBlock(key: number) { setBlocks((b) => b.filter((x) => x._key !== key)); }
  function move(key: number, dir: -1 | 1) {
    setBlocks((b) => {
      const i = b.findIndex((x) => x._key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= b.length) return b;
      const copy = [...b];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }
  function setField(key: number, patch: Partial<TemplateTaskSpec>) {
    setBlocks((b) => b.map((x) => (x._key === key ? { ...x, ...patch } : x)));
  }
  function setDefault(key: number, field: string, value: unknown) {
    setBlocks((b) => b.map((x) => (x._key === key ? { ...x, defaults: { ...(x.defaults ?? {}), [field]: value } } : x)));
  }

  function buildSpec(): TemplateSpec {
    return {
      tasks: blocks.map((b) => {
        const cleanDefaults: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(b.defaults ?? {})) {
          if (v !== "" && v !== undefined && v !== null) cleanDefaults[k] = v;
        }
        const t: TemplateTaskSpec = { taskType: b.taskType, title: b.title.trim() || TASK_VOCABULARY[b.taskType]?.label || b.taskType };
        if (b.instructions?.trim()) t.instructions = b.instructions.trim();
        if (Object.keys(cleanDefaults).length > 0) t.defaults = cleanDefaults;
        return t;
      }),
    };
  }

  function save() {
    setError(null);
    if (!name.trim()) { setError("Give the template a name."); return; }
    if (blocks.length === 0) { setError("Add at least one block."); return; }
    if (blocks.length > MAX_BLOCKS) { setError(`Keep it under ${MAX_BLOCKS} blocks.`); return; }
    const spec = buildSpec();
    const v = validateTemplateSpec(spec);
    if (!v.ok) { setError(v.errors.join(" ")); return; }
    startTransition(async () => {
      try {
        if (mode === "create") {
          const res = await createTemplateAction({ name: name.trim(), description: description.trim() || undefined, category: category.trim() || undefined, spec });
          router.push(`/work-orders/templates/${res.templateId}`);
        } else if (templateId) {
          await updateTemplateSpecAction({ templateId, spec });
          router.push(`/work-orders/templates/${templateId}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save the template.");
      }
    });
  }

  const lbl: React.CSSProperties = { fontSize: 13, color: "var(--text-muted)", display: "block", marginBottom: 4 };
  const field: React.CSSProperties = { padding: "9px 10px", minHeight: 40, borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface)", width: "100%" };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "8px 4px 80px" }}>
      <Link href={mode === "edit" && templateId ? `/work-orders/templates/${templateId}` : "/work-orders/templates"} style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none" }}>← Templates</Link>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, margin: "4px 0 16px" }}>{mode === "create" ? "New template" : "Edit template"}</h1>

      <Card style={{ display: "flex", flexDirection: "column", gap: 14, padding: 20 }}>
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekly barrel care" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Input label="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Cellar" />
        </div>
        <Textarea label="Description (optional)" minRows={2} value={description} onChange={(e) => setDescription(e.target.value)} />

        <div>
          <Eyebrow>Blocks ({blocks.length})</Eyebrow>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4 }}>The vessel and lot are chosen when a work order is run. Any value you set here is an optional default the operator can override.</div>
        </div>

        {blocks.length === 0 ? (
          <Card style={{ padding: 20, textAlign: "center", background: "var(--paper-100)" }}>
            <div style={{ color: "var(--text-muted)", marginBottom: 10 }}>No blocks yet.</div>
            <Button variant="secondary" onClick={() => setPickerOpen(true)}>Add your first block</Button>
          </Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {blocks.map((b, i) => {
              const def = TASK_VOCABULARY[b.taskType];
              const whatFields = def ? Object.entries(def.fields).filter(([, type]) => !isWhereField(type)) : [];
              return (
                <div key={b._key} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Badge tone="neutral">{def?.label ?? b.taskType}</Badge>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <Button size="sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(b._key, -1)}>↑</Button>
                      <Button size="sm" variant="ghost" aria-label="Move down" disabled={i === blocks.length - 1} onClick={() => move(b._key, 1)}>↓</Button>
                      <Button size="sm" variant="ghost" aria-label="Remove block" onClick={() => removeBlock(b._key)}>Remove</Button>
                    </div>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <Input label={b.taskType === "NOTE" ? "Checklist item" : "Title"} value={b.title} onChange={(e) => setField(b._key, { title: e.target.value })} placeholder={def?.label} />
                  </div>
                  {whatFields.length > 0 ? (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                      {whatFields.map(([fkey, ftype]) => {
                        const cur = (b.defaults ?? {})[fkey] ?? "";
                        if (fkey === "note") {
                          return <label key={fkey} style={{ ...lbl, gridColumn: "1 / -1" }}>{fieldLabel(fkey)} (optional)<input type="text" style={field} value={String(cur)} onChange={(e) => setDefault(b._key, fkey, e.target.value)} /></label>;
                        }
                        if (ftype === "material") {
                          return (
                            <label key={fkey} style={lbl}>{fieldLabel(fkey)} (optional)
                              <select style={field} value={String(cur)} onChange={(e) => setDefault(b._key, fkey, e.target.value)}>
                                <option value="">Ask at run time</option>
                                {materials.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                              </select>
                            </label>
                          );
                        }
                        if (ftype === "select") {
                          const opts = def?.fieldOptions?.[fkey] ?? [];
                          return (
                            <label key={fkey} style={lbl}>{fieldLabel(fkey)} (optional)
                              <select style={field} value={String(cur)} onChange={(e) => setDefault(b._key, fkey, e.target.value)}>
                                <option value="">Ask at run time</option>
                                {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                              </select>
                            </label>
                          );
                        }
                        if (ftype === "number") {
                          return <label key={fkey} style={lbl}>{fieldLabel(fkey)} (optional)<input type="number" inputMode="decimal" step="any" style={field} placeholder="Ask at run time" value={cur === "" ? "" : String(cur)} onChange={(e) => { const n = Number(e.target.value); setDefault(b._key, fkey, e.target.value === "" || Number.isNaN(n) ? "" : n); }} /></label>;
                        }
                        return <label key={fkey} style={lbl}>{fieldLabel(fkey)} (optional)<input type="text" style={field} placeholder="Ask at run time" value={String(cur)} onChange={(e) => setDefault(b._key, fkey, e.target.value)} /></label>;
                      })}
                    </div>
                  ) : null}
                  <div style={{ marginTop: 10 }}>
                    <Textarea label="Instructions (optional)" minRows={2} value={b.instructions ?? ""} onChange={(e) => setField(b._key, { instructions: e.target.value })} />
                  </div>
                </div>
              );
            })}
            <div>
              <Button variant="secondary" size="sm" disabled={blocks.length >= MAX_BLOCKS} onClick={() => setPickerOpen(true)}>+ Add block</Button>
              {blocks.length >= MAX_BLOCKS ? <span style={{ fontSize: 12.5, color: "var(--text-muted)", marginLeft: 8 }}>Max {MAX_BLOCKS} blocks.</span> : null}
            </div>
          </div>
        )}

        {error ? <div style={{ color: "var(--danger)", fontSize: 14 }}>{error}</div> : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={() => router.push(mode === "edit" && templateId ? `/work-orders/templates/${templateId}` : "/work-orders/templates")}>Cancel</Button>
          <Button disabled={pending} onClick={save}>{pending ? "Saving…" : mode === "create" ? "Create template" : "Save new version"}</Button>
        </div>
      </Card>

      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="Add a block" subtitle="Pick an operation, a maintenance task, an observation, or a free-text checklist item.">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {GROUPS.map((g) => {
            const entries = Object.entries(TASK_VOCABULARY).filter(([, def]) => g.kinds.includes(def.kind));
            if (entries.length === 0) return null;
            return (
              <div key={g.label}>
                <Eyebrow>{g.label}</Eyebrow>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                  {entries.map(([key, def]) => (
                    <button key={key} type="button" onClick={() => addBlock(key)} style={{ textAlign: "left", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface)", cursor: "pointer", minHeight: 44 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{def.label}</div>
                      {def.hint ? <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{def.hint}</div> : null}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
