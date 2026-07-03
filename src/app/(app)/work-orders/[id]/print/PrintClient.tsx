"use client";

import React from "react";
import Link from "next/link";
import type { WorkOrderDetail, WorkOrderTaskView } from "@/lib/work-orders/data";

// Phase 9.1 (Unit 6): the printable / Save-as-PDF work-order sheet. Token-driven (print.css), one WO per
// sheet, page-break-inside:avoid per task box (A12). Each task shows planned values + a note area: any
// captured completion note/deviation, THEN blank ruled lines for hand notes (D2). window.print() → native
// Save-as-PDF; no new deps. Screen-only chrome (.wo-print-hide) drops out when printing.

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

const HIDE_KEYS = new Set(["note"]);
function plannedEntries(t: WorkOrderTaskView): [string, string][] {
  const p = (t.plannedPayload ?? {}) as Record<string, unknown>;
  return Object.entries(p)
    .filter(([k, v]) => !HIDE_KEYS.has(k) && v !== "" && v != null)
    .map(([k, v]) => [k, String(v)]);
}

function typeLine(t: WorkOrderTaskView): string {
  if (t.kind === "OPERATION") return `Operation · ${t.opType ?? ""}`;
  if (t.kind === "MAINTENANCE") return `Maintenance · ${(t.activityType ?? "").replace(/_/g, " ").toLowerCase()}`;
  return `Observation · ${t.observationType ?? ""}`;
}

const box: React.CSSProperties = { border: "1px solid #c9bfb4", borderRadius: 6, padding: "12px 14px", marginTop: 10 };
const metaCell: React.CSSProperties = { fontSize: 12.5 };
const metaLabel: React.CSSProperties = { color: "#7a6f63", textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 10.5 };

function TaskBox({ t }: { t: WorkOrderTaskView }) {
  const entries = plannedEntries(t);
  const captured = [t.deviationReason?.trim(), t.completionNote?.trim()].filter(Boolean).join(" — ");
  return (
    <div className="wo-print-task" style={box}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{t.seq}. {t.title}</div>
        <div style={{ fontSize: 11.5, color: "#7a6f63" }}>{typeLine(t)}</div>
      </div>
      {t.instructions ? <div style={{ fontSize: 12.5, marginTop: 4 }}>{t.instructions}</div> : null}
      {entries.length ? (
        <div style={{ fontSize: 12.5, marginTop: 6, color: "#3a3129" }}>
          {entries.map(([k, v]) => (
            <span key={k} style={{ marginRight: 14 }}><span style={{ color: "#7a6f63" }}>{k}:</span> {v}</span>
          ))}
        </div>
      ) : null}
      <div style={{ marginTop: 10 }}>
        <div style={metaLabel}>Notes</div>
        {captured ? <div style={{ fontSize: 12.5, margin: "4px 0" }}>{captured}</div> : null}
        {/* Blank ruled lines for hand-written floor notes (D2). */}
        <div className="wo-print-rule" />
        <div className="wo-print-rule" />
        <div className="wo-print-rule" />
      </div>
    </div>
  );
}

export function PrintClient({ wo, printedAt }: { wo: WorkOrderDetail; printedAt: string }) {
  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "16px 12px 60px" }}>
      {/* Screen-only controls — hidden when printing. */}
      <div className="wo-print-hide" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Link href={`/work-orders/${wo.id}`} style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none" }}>← Back to work order</Link>
        <button
          onClick={() => window.print()}
          style={{ padding: "9px 18px", background: "var(--wine-primary)", color: "var(--surface-raised)", border: "none", borderRadius: "var(--radius-md)", fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
        >
          Print / Save as PDF
        </button>
      </div>

      <div className="wo-print-sheet" style={{ padding: 24 }}>
        {/* Header */}
        <div style={{ borderBottom: "2px solid #7a1f2b", paddingBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <div className="wo-print-title" style={{ fontSize: 24, fontWeight: 700 }}>Work Order #{wo.number}</div>
            <div style={{ fontSize: 12.5, textTransform: "uppercase", letterSpacing: "0.05em", color: "#7a1f2b", fontWeight: 700 }}>{wo.status.replace(/_/g, " ")}</div>
          </div>
          <div style={{ fontSize: 15, marginTop: 2 }}>{wo.title}</div>
        </div>

        {/* Meta grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginTop: 14 }}>
          <div style={metaCell}><div style={metaLabel}>Issued by</div>{wo.issuedByEmail ?? "—"}</div>
          <div style={metaCell}><div style={metaLabel}>Assigned to</div>{wo.assigneeEmail ?? "—"}</div>
          <div style={metaCell}><div style={metaLabel}>Issued</div>{fmtDate(wo.issuedAt)}</div>
          <div style={metaCell}><div style={metaLabel}>Due</div>{fmtDate(wo.dueAt)}</div>
        </div>

        {wo.instructions ? (
          <div style={{ ...box, background: "#faf7f2" }}>
            <div style={metaLabel}>Instructions</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>{wo.instructions}</div>
          </div>
        ) : null}

        {/* Tasks */}
        <div style={{ marginTop: 14 }}>
          {wo.tasks.map((t) => <TaskBox key={t.id} t={t} />)}
        </div>

        {/* Footer: printed stamp + signature line */}
        <div style={{ marginTop: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24 }}>
          <div style={{ fontSize: 11, color: "#7a6f63" }}>Printed {fmtDate(printedAt)}</div>
          <div style={{ flex: 1, maxWidth: 280 }}>
            <div style={{ borderBottom: "1px solid #1a1412", height: 28 }} />
            <div style={{ fontSize: 10.5, color: "#7a6f63", marginTop: 2 }}>Completed by / signature / date</div>
          </div>
        </div>
      </div>
    </div>
  );
}
