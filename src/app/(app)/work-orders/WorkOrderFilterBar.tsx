"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Card, Button } from "@/components/ui";
import type { WorkOrderFilters } from "@/lib/work-orders/archive-filters";
import { VesselMultiSelect, type VesselOption } from "./new/VesselMultiSelect";

// Phase 9.1: the shared work-order filter bar — used by BOTH the OPEN dashboard and the ARCHIVE. Filters
// (status/date/assignee/template/vessel/search) live in the URL so the view is shareable + server-rendered.
// The two views differ only in the status vocabulary + the "all" label + whether view=archive is set.

type Template = { id: string; name: string };

const fld: React.CSSProperties = { height: 40, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", background: "var(--surface-raised)", fontFamily: "var(--font-body)", fontSize: 14, minWidth: 0 };
const lbl: React.CSSProperties = { fontSize: 12.5, color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: 4 };

export function WorkOrderFilterBar({
  view, filters, vessels, templates, locations, statuses, allLabel, resultCount,
}: {
  view: "open" | "archive";
  filters: WorkOrderFilters;
  vessels: VesselOption[];
  templates: Template[];
  locations: { id: string; name: string }[];
  statuses: readonly string[];
  allLabel: string;
  resultCount?: number;
}) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<WorkOrderFilters>(filters);
  const set = (k: keyof WorkOrderFilters, v: string) => setDraft((p) => ({ ...p, [k]: v || undefined }));

  const navigate = (f: WorkOrderFilters) => {
    const params = new URLSearchParams();
    if (view === "archive") params.set("view", "archive");
    for (const [k, v] of Object.entries(f)) {
      if (!v) continue;
      if (Array.isArray(v)) { if (v.length) params.set("vesselId", v.join(",")); }
      else params.set(k, String(v));
    }
    const qs = params.toString();
    router.push(qs ? `/work-orders?${qs}` : "/work-orders");
  };

  const activeCount = Object.values(filters).filter((v) => (Array.isArray(v) ? v.length : v)).length;

  return (
    <Card style={{ marginTop: 16, padding: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <label style={lbl}>Status
          <select style={fld} value={draft.status ?? ""} onChange={(e) => set("status", e.target.value)}>
            <option value="">{allLabel}</option>
            {statuses.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ").toLowerCase()}</option>)}
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
        <label style={lbl}>Location
          <select style={fld} value={draft.locationId ?? ""} onChange={(e) => set("locationId", e.target.value)}>
            <option value="">Any location</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label style={lbl}>Assignee<input type="text" style={fld} placeholder="email…" value={draft.assigneeEmail ?? ""} onChange={(e) => set("assigneeEmail", e.target.value)} /></label>
        <label style={lbl}>Search<input type="text" style={fld} placeholder="title or #number" value={draft.q ?? ""} onChange={(e) => set("q", e.target.value)} /></label>
      </div>
      <div style={{ ...lbl, marginTop: 10 }}>Vessels
        <VesselMultiSelect
          options={vessels}
          value={draft.vesselIds ?? []}
          onChange={(ids) => setDraft((p) => ({ ...p, vesselIds: ids.length ? ids : undefined }))}
          multiHint={null}
        />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <Button size="sm" onClick={() => navigate(draft)}>Apply filters</Button>
        {activeCount > 0 ? <Button size="sm" variant="secondary" onClick={() => { setDraft({}); navigate({}); }}>Clear</Button> : null}
        {typeof resultCount === "number" ? <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 13, color: "var(--text-muted)" }}>{resultCount} result{resultCount === 1 ? "" : "s"}</span> : null}
      </div>
    </Card>
  );
}
