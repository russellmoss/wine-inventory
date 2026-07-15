"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Badge, Eyebrow } from "@/components/ui";
import type { TemplateDetail } from "@/lib/work-orders/data";
import { TASK_VOCABULARY, fieldLabel, type TemplateTaskSpec } from "@/lib/work-orders/template-vocabulary";
import { cloneTemplateAction, archiveTemplateAction, unarchiveTemplateAction } from "@/lib/work-orders/actions";
import { unwrap } from "@/lib/action-result";

// Plan 034 Unit 7: template detail — read-only block list (what the operator fills at run time), version
// history, and the actions (Edit/Clone/Archive gated so system templates are Clone-only). The primary CTA
// closes the loop to the real job: create a work order from this template.

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function BlockCard({ t }: { t: TemplateTaskSpec }) {
  const def = TASK_VOCABULARY[t.taskType];
  const defaults = t.defaults ?? {};
  const runtimeFields = def ? Object.keys(def.fields).filter((k) => k !== "note") : [];
  return (
    <Card padding="12px 14px">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <div style={{ fontWeight: 600 }}>{t.title}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{def?.label ?? t.taskType}</div>
      </div>
      {t.instructions ? <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{t.instructions}</div> : null}
      {Object.keys(defaults).length > 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {Object.entries(defaults).map(([k, v]) => (
            <span key={k}><span style={{ color: "var(--text-muted)" }}>{fieldLabel(k)}:</span> <strong style={{ fontWeight: 600 }}>{String(v)}</strong></span>
          ))}
        </div>
      ) : null}
      {def && runtimeFields.length > 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>Filled in when run: {runtimeFields.map(fieldLabel).join(", ")}</div>
      ) : null}
    </Card>
  );
}

export function TemplateDetailClient({ template, isAdmin }: { template: TemplateDetail; isAdmin: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const spec = (template.spec ?? { tasks: [] }) as { tasks: TemplateTaskSpec[] };
  const isArchived = template.archivedAt != null;

  function run(label: string, fn: () => Promise<void>) {
    setError(null);
    setBusy(label);
    fn().catch((e) => { setError(e instanceof Error ? e.message : "Something went wrong."); }).finally(() => setBusy(null));
  }

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "8px 4px 60px" }}>
      <Link href="/work-orders/templates" style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none" }}>← Templates</Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, margin: 0 }}>{template.name}</h1>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
            <Badge tone={template.isSystem ? "blue" : "green"}>{template.isSystem ? "system" : "custom"}</Badge>
            {isArchived ? <Badge tone="neutral">archived</Badge> : null}
            <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>v{template.currentVersion}</span>
            {template.category ? <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>· {template.category}</span> : null}
          </div>
          {template.description ? <div style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 8, maxWidth: 560 }}>{template.description}</div> : null}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!isArchived ? <Button onClick={() => router.push(`/work-orders/new?template=${template.id}`)}>Create a work order from this</Button> : null}
        </div>
      </div>

      {error ? <div style={{ color: "var(--danger)", fontSize: 14, marginTop: 12 }}>{error}</div> : null}

      {isAdmin ? (
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {!template.isSystem && !isArchived ? <Button size="sm" variant="secondary" onClick={() => router.push(`/work-orders/templates/${template.id}/edit`)}>Edit</Button> : null}
          <Button size="sm" variant="secondary" disabled={busy === "clone"} onClick={() => run("clone", async () => { const res = unwrap(await cloneTemplateAction({ templateId: template.id })); router.push(`/work-orders/templates/${res.templateId}/edit`); })}>{busy === "clone" ? "Cloning…" : "Clone"}</Button>
          {!template.isSystem && !isArchived ? <Button size="sm" variant="ghost" disabled={busy === "archive"} onClick={() => run("archive", async () => { unwrap(await archiveTemplateAction({ templateId: template.id })); router.push("/work-orders/templates"); })}>{busy === "archive" ? "Archiving…" : "Archive"}</Button> : null}
          {!template.isSystem && isArchived ? <Button size="sm" variant="secondary" disabled={busy === "unarchive"} onClick={() => run("unarchive", async () => { unwrap(await unarchiveTemplateAction({ templateId: template.id })); router.refresh(); })}>{busy === "unarchive" ? "Restoring…" : "Restore"}</Button> : null}
        </div>
      ) : null}

      <section style={{ marginTop: 22 }}>
        <Eyebrow>Blocks ({spec.tasks.length})</Eyebrow>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {spec.tasks.map((t, i) => <BlockCard key={i} t={t} />)}
        </div>
      </section>

      {template.versions.length > 1 ? (
        <section style={{ marginTop: 22 }}>
          <Eyebrow>Version history</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
            {template.versions.map((v) => (
              <div key={v.version} style={{ fontSize: 13, color: "var(--text-muted)", display: "flex", gap: 10 }}>
                <span style={{ fontWeight: v.version === template.currentVersion ? 600 : 400, color: v.version === template.currentVersion ? "var(--text-primary)" : undefined }}>v{v.version}{v.version === template.currentVersion ? " (current)" : ""}</span>
                <span>{fmtDate(v.createdAt)}</span>
                {v.createdByEmail ? <span>· {v.createdByEmail}</span> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
