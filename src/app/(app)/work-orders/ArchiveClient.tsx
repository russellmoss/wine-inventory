"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Badge } from "@/components/ui";
import type { ArchiveRow } from "@/lib/work-orders/data";
import { ARCHIVE_STATUSES, type ArchiveFilters } from "@/lib/work-orders/archive-filters";
import { WorkOrdersTabs } from "./WorkOrdersTabs";
import { VesselMultiSelect, type VesselOption } from "./new/VesselMultiSelect";

// Phase 9.1 (Unit 5): the filterable archive view (D1 — a toggle on /work-orders, not a separate nav item).
// Filter by status / date range / assignee / template / vessel; rows reuse the dashboard list-row and
// surface a completed-note snippet (D4). Filters + pagination live in the URL so the view is shareable and
// server-rendered. No card grid, DESIGN.md tokens throughout.

type Picker = VesselOption;
type Template = { id: string; name: string };

const STATUS_TONE: Record<string, "neutral" | "green"> = { APPROVED: "green", CANCELLED: "neutral" };
const fld: React.CSSProperties = { height: 40, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", background: "var(--surface-raised)", fontFamily: "var(--font-body)", fontSize: 14, minWidth: 0 };
const lbl: React.CSSProperties = { fontSize: 12.5, color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: 4 };

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function ArchiveClient({
  rows, total, page, pageSize, filters, vessels, templates,
}: {
  rows: ArchiveRow[]; total: number; page: number; pageSize: number;
  filters: ArchiveFilters; vessels: Picker[]; templates: Template[];
}) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<ArchiveFilters>(filters);
  const set = (k: keyof ArchiveFilters, v: string) => setDraft((p) => ({ ...p, [k]: v || undefined }));

  // Build a clean URL: always include view=archive, then filters, then page.
  const navigate = (f: ArchiveFilters, p = 1) => {
    const params = new URLSearchParams();
    params.set("view", "archive");
    for (const [k, v] of Object.entries(f)) {
      if (!v) continue;
      // vesselIds is an array → serialize to the comma-joined `vesselId` param the parser reads.
      if (Array.isArray(v)) { if (v.length) params.set("vesselId", v.join(",")); }
      else params.set(k, String(v));
    }
    if (p > 1) params.set("page", String(p));
    router.push(`/work-orders?${params.toString()}`);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const activeCount = Object.values(filters).filter(Boolean).length;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "8px 4px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, margin: 0 }}>Work orders</h1>
        <Link href="/work-orders/new"><Button>New work order</Button></Link>
      </div>

      <div style={{ marginTop: 14 }}><WorkOrdersTabs active="archive" /></div>

      {/* Filter bar — stacks on mobile (D5). */}
      <Card style={{ marginTop: 16, padding: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          <label style={lbl}>Status
            <select style={fld} value={draft.status ?? ""} onChange={(e) => set("status", e.target.value)}>
              <option value="">All finalized</option>
              {ARCHIVE_STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
            </select>
          </label>
          <label style={lbl}>From<input type="date" style={fld} value={draft.from ?? ""} onChange={(e) => set("from", e.target.value)} /></label>
          <label style={lbl}>To<input type="date" style={fld} value={draft.to ?? ""} onChange={(e) => set("to", e.target.value)} /></label>
          <label style={lbl}>Template
            <select style={fld} value={draft.templateId ?? ""} onChange={(e) => set("templateId", e.target.value)}>
              <option value="">Any template</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label style={lbl}>Assignee<input type="text" style={fld} placeholder="email…" value={draft.assigneeEmail ?? ""} onChange={(e) => set("assigneeEmail", e.target.value)} /></label>
          <label style={lbl}>Search<input type="text" style={fld} placeholder="title or #number" value={draft.q ?? ""} onChange={(e) => set("q", e.target.value)} /></label>
        </div>
        {/* Vessel filter — searchable, tank/barrel-filterable multi-select (mirrors the new-WO picker). */}
        <div style={{ ...lbl, marginTop: 10 }}>Vessels
          <VesselMultiSelect
            options={vessels}
            value={draft.vesselIds ?? []}
            onChange={(ids) => setDraft((p) => ({ ...p, vesselIds: ids.length ? ids : undefined }))}
            multiHint={null}
          />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Button size="sm" onClick={() => navigate(draft, 1)}>Apply filters</Button>
          {activeCount > 0 ? <Button size="sm" variant="secondary" onClick={() => { setDraft({}); navigate({}, 1); }}>Clear</Button> : null}
          <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 13, color: "var(--text-muted)" }}>{total} result{total === 1 ? "" : "s"}</span>
        </div>
      </Card>

      {rows.length === 0 ? (
        <Card style={{ marginTop: 20, textAlign: "center", padding: "48px 24px" }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{activeCount > 0 ? "No matching work orders" : "No completed work orders yet"}</div>
          <div style={{ color: "var(--text-muted)", marginTop: 6 }}>
            {activeCount > 0 ? "Try widening the date range or clearing filters." : "Approved and cancelled orders land here."}
          </div>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
          {rows.map((r) => (
            <Link key={r.id} href={`/work-orders/${r.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <Card interactive padding="14px 16px" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>#{r.number} · {r.title}</div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
                    {r.doneCount}/{r.taskCount} tasks{r.assigneeEmail ? ` · ${r.assigneeEmail}` : ""} · {fmtDate(r.finalizedAt)}
                  </div>
                  {r.noteSnippet ? (
                    <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4, fontStyle: "italic" }}>“{r.noteSnippet}”</div>
                  ) : null}
                </div>
                <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status.replace(/_/g, " ").toLowerCase()}</Badge>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 20 }}>
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => navigate(filters, page - 1)}>← Prev</Button>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Page {page} of {totalPages}</span>
          <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => navigate(filters, page + 1)}>Next →</Button>
        </div>
      ) : null}
    </div>
  );
}
