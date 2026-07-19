"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Button, Badge, LocalTime } from "@/components/ui";
import type { ArchiveRow } from "@/lib/work-orders/data";
import { ARCHIVE_STATUSES, type ArchiveFilters } from "@/lib/work-orders/archive-filters";
import { WorkOrdersTabs } from "./WorkOrdersTabs";
import { WorkOrderFilterBar } from "./WorkOrderFilterBar";
import type { VesselOption } from "./new/VesselMultiSelect";

// Phase 9.1 (Unit 5): the filterable archive view (D1 — a toggle on /work-orders, not a separate nav item).
// Filter by status / date range / assignee / template / vessel; rows reuse the dashboard list-row and
// surface a completed-note snippet (D4). Filters + pagination live in the URL so the view is shareable and
// server-rendered. No card grid, DESIGN.md tokens throughout.

type Picker = VesselOption;
type Template = { id: string; name: string };

const STATUS_TONE: Record<string, "neutral" | "green"> = { APPROVED: "green", CANCELLED: "neutral" };

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return <LocalTime value={iso} mode="date" options={{ year: "numeric", month: "short", day: "numeric" }} />;
}

export function ArchiveClient({
  rows, total, page, pageSize, filters, vessels, templates, locations,
}: {
  rows: ArchiveRow[]; total: number; page: number; pageSize: number;
  filters: ArchiveFilters; vessels: Picker[]; templates: Template[]; locations: { id: string; name: string }[];
}) {
  const router = useRouter();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const activeCount = Object.values(filters).filter((v) => (Array.isArray(v) ? v.length : v)).length;

  // Pagination preserves the current filters (view=archive + serialized filters + page).
  const goPage = (p: number) => {
    const params = new URLSearchParams();
    params.set("view", "archive");
    for (const [k, v] of Object.entries(filters)) { if (!v) continue; if (Array.isArray(v)) { if (v.length) params.set("vesselId", v.join(",")); } else params.set(k, String(v)); }
    if (p > 1) params.set("page", String(p));
    router.push(`/work-orders?${params.toString()}`);
  };

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "8px 4px 60px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, margin: 0 }}>Work orders</h1>
        <Link href="/work-orders/new"><Button>New work order</Button></Link>
      </div>

      <div style={{ marginTop: 14 }}><WorkOrdersTabs active="archive" /></div>

      <WorkOrderFilterBar view="archive" filters={filters} vessels={vessels} templates={templates} locations={locations} statuses={ARCHIVE_STATUSES} allLabel="All finalized" resultCount={total} />

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
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => goPage(page - 1)}>← Prev</Button>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Page {page} of {totalPages}</span>
          <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => goPage(page + 1)}>Next →</Button>
        </div>
      ) : null}
    </div>
  );
}
