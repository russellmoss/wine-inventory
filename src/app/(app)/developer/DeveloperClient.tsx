"use client";

import React from "react";
import { Badge, Button, Card, Input, Textarea } from "@/components/ui";
import type { DeveloperFeedbackData, DeveloperFeedbackItem, DeveloperTenantSummary } from "@/lib/developer/feedback";
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

      {error ? <div style={{ color: "var(--danger)", fontFamily: "var(--font-body)" }}>{error}</div> : null}

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
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-body)", fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-muted)", fontSize: 12 }}>
                <th style={cellStyle}>Created</th>
                <th style={cellStyle}>Tenant</th>
                <th style={cellStyle}>Type</th>
                <th style={cellStyle}>Title</th>
                <th style={cellStyle}>Severity</th>
                <th style={cellStyle}>Status</th>
                <th style={cellStyle}>Automation</th>
                <th style={cellStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
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
                  <td style={cellStyle}>{item.status}</td>
                  <td style={cellStyle}>{item.automationStatus}</td>
                  <td style={cellStyle}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Button size="sm" variant="secondary" onClick={() => setEditing(item)}>Open</Button>
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
        <ItemEditor item={editing} busy={busy} run={run} onClose={() => setEditing(null)} />
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
  run,
  onClose,
}: {
  item: DeveloperFeedbackItem;
  busy: string | null;
  run: (key: string, fn: () => Promise<void>) => void;
  onClose: () => void;
}) {
  const [severity, setSeverity] = React.useState(item.severity ?? "");
  const [status, setStatus] = React.useState(item.status);
  const [developerNotes, setDeveloperNotes] = React.useState(item.developerNotes ?? "");
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
        <div style={{ display: "grid", gridTemplateColumns: "160px 180px 1fr", gap: "var(--space-3)", alignItems: "end" }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Severity</span>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} style={selectStyle}>
              <option value="">Unset</option>
              <option value="P0">P0</option>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
            </select>
          </label>
          <Input label="Status" value={status} onChange={(e) => setStatus(e.target.value)} />
          <Textarea label="Developer notes" value={developerNotes} onChange={(e) => setDeveloperNotes(e.target.value)} minRows={3} />
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <Button
            disabled={busy === key}
            onClick={() => run(key, () => updateFeedbackItem({ tenantId: item.tenantId, sourceType: item.sourceType, id: item.id, severity: severity as "P0" | "P1" | "P2" | "", status, developerNotes }))}
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
