"use client";

import React from "react";
import { Badge, Button, Card, Input, Textarea } from "@/components/ui";
import type { DeveloperFeedbackData, DeveloperFeedbackItem, DeveloperTenantSummary } from "@/lib/developer/feedback";
import { parseTriageNotes, type TriageNoteEntry } from "@/lib/developer/triage-notes";
import {
  approveFeedbackAutomation,
  enterSupportTenant,
  exitSupportTenant,
  saveTenantFeedbackModes,
  updateFeedbackItem,
} from "@/lib/developer/actions";

const MODES = [
  ["REPORT_ONLY", "Report only"],
  ["PLAN_MODE", "Plan mode"],
  ["AGENTIC_FIX", "Agentic fix"],
] as const;

// Plan 059: the goalie-assigned disposition (mirror of FeedbackTriageClass). Drives the backlog
// column, the filter, and the item editor. Kept as string literals so the client needs no server enum.
type DispositionTone = "red" | "blue" | "gold" | "neutral" | "maroon";
const DISPOSITIONS: ReadonlyArray<readonly [string, string, DispositionTone]> = [
  ["DEFECT", "Defect", "red"],
  ["MODEL_BEHAVIOR", "Model behavior", "blue"],
  ["PRODUCT_GAP", "Product gap", "gold"],
  ["NOT_A_BUG", "Not a bug", "neutral"],
  ["UNCLEAR", "Unclear", "maroon"],
];
const DISPOSITION_META = new Map<string, { label: string; tone: DispositionTone }>(
  DISPOSITIONS.map(([v, label, tone]) => [v, { label, tone }]),
);
const UNTRIAGED = "UNTRIAGED"; // pseudo-value for null (untriaged) in the filter

function DispositionBadge({ value }: { value: string | null }) {
  if (!value) return <Badge tone="neutral" variant="outline">Untriaged</Badge>;
  const meta = DISPOSITION_META.get(value);
  return <Badge tone={meta?.tone ?? "neutral"}>{meta?.label ?? value}</Badge>;
}

// The disposition token in a triage note is lowercase (`[defect]`); map it to the badge meta.
function dispoToneFor(type: string | null): DispositionTone {
  return (type ? DISPOSITION_META.get(type.toUpperCase())?.tone : undefined) ?? "neutral";
}
function fmtStamp(stamp: string | null): string {
  if (!stamp) return "";
  const t = Date.parse(stamp);
  return Number.isNaN(t) ? stamp : new Date(t).toLocaleString();
}

// Backlog-row cell: the newest outcome, short, so you see what happened without opening the item.
function OutcomePreview({ notes }: { notes: string | null }) {
  const latest = parseTriageNotes(notes)[0];
  if (!latest) return <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>;
  const full = `${latest.type ? `[${latest.type}] ` : ""}${latest.text}`;
  return (
    <div style={{ maxWidth: 240 }} title={`${fmtStamp(latest.stamp)}${latest.stamp ? " · " : ""}${full}`}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span aria-hidden style={{ fontSize: 11 }}>{latest.source === "bug-triage" ? "🤖" : "📝"}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12.5 }}>{full}</span>
      </div>
    </div>
  );
}

// Item-editor panel: the full outcome/triage history, read-only, newest first.
function OutcomeTimeline({ entries }: { entries: TriageNoteEntry[] }) {
  if (entries.length === 0) {
    return <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: 13, margin: 0 }}>No triage outcome recorded yet.</p>;
  }
  return (
    <div style={{ display: "grid", gap: "var(--space-2)" }}>
      {entries.map((e, i) => (
        <div
          key={i}
          style={{
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            background: "var(--surface-sunken)",
            padding: "var(--space-2) var(--space-3)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <Badge tone={e.source === "bug-triage" ? dispoToneFor(e.type) : "neutral"} variant={e.source === "bug-triage" ? "solid" : "outline"}>
              {e.source === "bug-triage" ? (e.type ? DISPOSITION_META.get(e.type.toUpperCase())?.label ?? e.type : "bug-triage") : "You"}
            </Badge>
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{fmtStamp(e.stamp)}</span>
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 13.5, whiteSpace: "pre-wrap" }}>{e.text}</div>
        </div>
      ))}
    </div>
  );
}

function ModeSelect({
  value,
  onChange,
  allowAgentic = true,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  allowAgentic?: boolean;
  label: string;
}) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
      {MODES.filter(([v]) => allowAgentic || v !== "AGENTIC_FIX").map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}

const selectStyle: React.CSSProperties = {
  height: 34,
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-strong)",
  background: "var(--surface-raised)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
};

export function DeveloperClient({ data }: { data: DeveloperFeedbackData }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<DeveloperFeedbackItem | null>(null);

  // Plan 059: client-side disposition filter + sortable columns over the bounded backlog
  // (≤20 tenants × 8 items). The DB index still serves the CLI/triage:list queries.
  type SortCol = "createdAt" | "tenantName" | "kind" | "title" | "severity" | "triageClass" | "status" | "automationStatus";
  const [dispoFilter, setDispoFilter] = React.useState<Set<string>>(new Set()); // empty = all
  const [sort, setSort] = React.useState<{ col: SortCol; dir: "asc" | "desc" }>({ col: "createdAt", dir: "desc" });

  const toggleDispo = (value: string) =>
    setDispoFilter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  const toggleSort = (col: SortCol) =>
    setSort((prev) => (prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" }));

  const shownItems = React.useMemo(() => {
    const filtered =
      dispoFilter.size === 0
        ? data.items
        : data.items.filter((i) => dispoFilter.has(i.triageClass ?? UNTRIAGED));
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = (a[sort.col] ?? "") as string;
      const bv = (b[sort.col] ?? "") as string;
      return av < bv ? -dir : av > bv ? dir : 0;
    });
  }, [data.items, dispoFilter, sort]);

  const dispoCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of data.items) {
      const key = i.triageClass ?? UNTRIAGED;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [data.items]);

  const th = (label: string, col?: SortCol) => (
    <th
      style={{ ...cellStyle, cursor: col ? "pointer" : "default", userSelect: "none", whiteSpace: "nowrap" }}
      onClick={col ? () => toggleSort(col) : undefined}
      aria-sort={col && sort.col === col ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
    >
      {label}
      {col && sort.col === col ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  function openEditor(item: DeveloperFeedbackItem) {
    setError(null);
    setEditing(item);
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-5)" }}>
      <div>
        <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: "var(--text-h2)", margin: 0 }}>
          Developer console
        </h1>
        <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)", marginTop: 6 }}>
          Showing {data.shownTenants} of {data.totalTenants} tenants in this bounded RLS read.
        </p>
      </div>

      {error && !editing ? <div role="alert" style={{ color: "var(--danger)", fontFamily: "var(--font-body)" }}>{error}</div> : null}

      <Card>
        <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, marginTop: 0 }}>Tenant automation</h2>
        <div style={{ display: "grid", gap: "var(--space-3)" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: TENANT_GRID_COLUMNS,
              gap: "var(--space-2)",
              alignItems: "end",
              color: "var(--text-muted)",
              fontFamily: "var(--font-body)",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <span>Tenant</span>
            <span style={{ textAlign: "center" }}>Assistant thumbs-down</span>
            <span style={{ textAlign: "center" }}>Bug reports</span>
            <span style={{ textAlign: "center" }}>Feature requests</span>
            <span style={{ textAlign: "center" }}>Save</span>
            <span style={{ textAlign: "center" }}>Support</span>
          </div>
          {data.tenants.map((tenant) => (
            <TenantModes key={tenant.id} tenant={tenant} busy={busy} run={run} />
          ))}
        </div>
      </Card>

      <Card>
        <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, marginTop: 0 }}>Feedback backlog</h2>

        {/* Plan 059: disposition filter — toggle chips (empty = show all). */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: "var(--space-3)" }}>
          <span style={{ color: "var(--text-muted)", fontSize: 12, fontWeight: 600 }}>Disposition:</span>
          {[...DISPOSITIONS.map(([v, label]) => [v, label] as const), [UNTRIAGED, "Untriaged"] as const].map(([value, label]) => {
            const active = dispoFilter.has(value);
            const count = dispoCounts.get(value) ?? 0;
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggleDispo(value)}
                aria-pressed={active}
                style={{
                  cursor: "pointer",
                  height: 28,
                  padding: "0 10px",
                  borderRadius: "var(--radius-pill, 999px)",
                  border: `1px solid ${active ? "var(--wine-primary)" : "var(--border-strong)"}`,
                  background: active ? "var(--accent-soft)" : "var(--surface-raised)",
                  color: active ? "var(--wine-primary)" : "var(--text-muted)",
                  fontFamily: "var(--font-body)",
                  fontSize: 12.5,
                  fontWeight: active ? 600 : 400,
                }}
              >
                {label} ({count})
              </button>
            );
          })}
          {dispoFilter.size > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => setDispoFilter(new Set())}>Clear</Button>
          ) : null}
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-body)", fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-muted)", fontSize: 12 }}>
                {th("Created", "createdAt")}
                {th("Tenant", "tenantName")}
                {th("Type", "kind")}
                {th("Title", "title")}
                {th("Severity", "severity")}
                {th("Disposition", "triageClass")}
                {th("Status", "status")}
                {th("Automation", "automationStatus")}
                {th("Outcome")}
                {th("Actions")}
              </tr>
            </thead>
            <tbody>
              {shownItems.length === 0 ? (
                <tr>
                  <td style={{ ...cellStyle, color: "var(--text-muted)" }} colSpan={10}>
                    No items match the selected disposition.
                  </td>
                </tr>
              ) : null}
              {shownItems.map((item) => (
                <tr key={`${item.sourceType}-${item.id}`} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={cellStyle}>{new Date(item.createdAt).toLocaleString()}</td>
                  <td style={cellStyle}>{item.tenantName}</td>
                  <td style={cellStyle}>{item.kind}</td>
                  <td style={{ ...cellStyle, maxWidth: 280 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.title}>
                      {item.title}
                    </div>
                    <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{item.id}</div>
                  </td>
                  <td style={cellStyle}><Badge tone={item.severity === "P0" ? "red" : item.severity === "P1" ? "gold" : "neutral"}>{item.severity ?? "Unset"}</Badge></td>
                  <td style={cellStyle}><DispositionBadge value={item.triageClass} /></td>
                  <td style={cellStyle}>{item.status}</td>
                  <td style={cellStyle}>{item.automationStatus}</td>
                  <td style={cellStyle}><OutcomePreview notes={item.developerNotes} /></td>
                  <td style={cellStyle}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Button size="sm" variant="secondary" onClick={() => openEditor(item)}>Open</Button>
                      {item.awaitingRunId ? (
                        <Button
                          size="sm"
                          disabled={busy === item.awaitingRunId}
                          onClick={() => run(item.awaitingRunId!, () => approveFeedbackAutomation({ tenantId: item.tenantId, runId: item.awaitingRunId! }))}
                        >
                          Approve
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {editing ? (
        <ItemEditor item={editing} busy={busy} error={error} run={run} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

const cellStyle: React.CSSProperties = { padding: "10px 8px", verticalAlign: "top" };

// Shared so the header row and every tenant row line up. The last two (Save/Support)
// use fixed widths because `auto` columns size per-grid from their own content — the
// header text and the row buttons differ, so `auto auto` would drift out of alignment.
const TENANT_GRID_COLUMNS = "minmax(180px, 1fr) repeat(3, minmax(130px, 160px)) 80px 80px";

function TenantModes({
  tenant,
  busy,
  run,
}: {
  tenant: DeveloperTenantSummary;
  busy: string | null;
  run: (key: string, fn: () => Promise<void>) => void;
}) {
  const [assistantFeedbackMode, setAssistant] = React.useState(tenant.modes.assistantFeedbackMode);
  const [bugReportMode, setBug] = React.useState(tenant.modes.bugReportMode);
  const [featureRequestMode, setFeature] = React.useState(tenant.modes.featureRequestMode);
  const key = `tenant-${tenant.id}`;
  return (
    <div style={{ display: "grid", gridTemplateColumns: TENANT_GRID_COLUMNS, gap: "var(--space-2)", alignItems: "center" }}>
      <div>
        <div style={{ fontWeight: 600 }}>{tenant.name}</div>
        <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{tenant.id}</div>
      </div>
      <ModeSelect label={`${tenant.name} assistant thumbs-down mode`} value={assistantFeedbackMode} onChange={(value) => setAssistant(value as typeof assistantFeedbackMode)} />
      <ModeSelect label={`${tenant.name} bug report mode`} value={bugReportMode} onChange={(value) => setBug(value as typeof bugReportMode)} />
      <ModeSelect label={`${tenant.name} feature request mode`} value={featureRequestMode} onChange={(value) => setFeature(value as typeof featureRequestMode)} allowAgentic={false} />
      <Button
        size="sm"
        variant="secondary"
        disabled={busy === key}
        onClick={() => run(key, () => saveTenantFeedbackModes({ tenantId: tenant.id, assistantFeedbackMode, bugReportMode, featureRequestMode }))}
      >
        Save
      </Button>
      <Button size="sm" variant="ghost" onClick={() => run(`enter-${tenant.id}`, () => enterSupportTenant(tenant.id))}>
        Enter
      </Button>
    </div>
  );
}

function ItemEditor({
  item,
  busy,
  error,
  run,
  onClose,
}: {
  item: DeveloperFeedbackItem;
  busy: string | null;
  error: string | null;
  run: (key: string, fn: () => Promise<void>) => void;
  onClose: () => void;
}) {
  const [severity, setSeverity] = React.useState(item.severity ?? "");
  const [triageClass, setTriageClass] = React.useState(item.triageClass ?? "");
  const [status, setStatus] = React.useState(item.status);
  const [developerNotes, setDeveloperNotes] = React.useState(item.developerNotes ?? "");
  const timeline = React.useMemo(() => parseTriageNotes(item.developerNotes), [item.developerNotes]);
  const key = `edit-${item.sourceType}-${item.id}`;
  return (
    <Card style={{ position: "fixed", inset: "6vh 4vw", zIndex: 40, overflow: "auto", boxShadow: "var(--shadow-xl)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, margin: 0 }}>{item.title}</h2>
          <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: 13 }}>{item.tenantName} / {item.id}</div>
        </div>
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </div>
      <div style={{ display: "grid", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
        <p style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-body)" }}>{item.body}</p>
        {item.planMarkdown ? (
          <pre style={{ whiteSpace: "pre-wrap", background: "var(--surface-sunken)", padding: "var(--space-3)", borderRadius: "var(--radius-md)", overflow: "auto" }}>{item.planMarkdown}</pre>
        ) : null}
        <section style={{ display: "grid", gap: "var(--space-2)" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "var(--space-3)" }}>
            <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: 400, margin: 0, fontSize: 15 }}>Outcome / triage history</h3>
            {item.resolvedAt ? (
              <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: 12 }}>
                Resolved {new Date(item.resolvedAt).toLocaleString()}
              </span>
            ) : null}
          </div>
          <OutcomeTimeline entries={timeline} />
        </section>
        <div style={{ display: "grid", gridTemplateColumns: "140px 200px 180px 1fr", gap: "var(--space-3)", alignItems: "end" }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Severity</span>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} style={selectStyle}>
              <option value="">Unset</option>
              <option value="P0">P0</option>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Disposition</span>
            <select value={triageClass} onChange={(e) => setTriageClass(e.target.value)} style={selectStyle}>
              <option value="">Untriaged</option>
              {DISPOSITIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <Input label="Status" value={status} onChange={(e) => setStatus(e.target.value)} />
          <Textarea label="Add / edit notes" value={developerNotes} onChange={(e) => setDeveloperNotes(e.target.value)} minRows={3} />
        </div>
        {error ? (
          <div role="alert" style={{ color: "var(--danger)", fontFamily: "var(--font-body)" }}>
            {error}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <Button
            disabled={busy === key}
            onClick={() => run(key, async () => {
              await updateFeedbackItem({ tenantId: item.tenantId, sourceType: item.sourceType, id: item.id, severity: severity as "P0" | "P1" | "P2" | "", triageClass, status, developerNotes, expectedNotesVersion: item.developerNotesVersion });
              onClose();
            })}
          >
            Save item
          </Button>
          {item.githubIssueUrl ? <a href={item.githubIssueUrl}>GitHub issue</a> : null}
          {item.prUrl ? <a href={item.prUrl}>Pull request</a> : null}
          {item.attachmentCount ? <span>{item.attachmentCount} attachment(s)</span> : null}
          <Button variant="ghost" onClick={() => run("exit-support", () => exitSupportTenant())}>Exit support view</Button>
        </div>
      </div>
    </Card>
  );
}
