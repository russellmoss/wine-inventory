"use client";

import React from "react";
import Link from "next/link";
import { Badge, Button, LocalTime } from "@/components/ui";
import type { TimelineItem, OpItem, TimelineLeg } from "@/lib/lot/timeline";
import { formatL } from "@/lib/lot/timeline";
import {
  TIMELINE_FILTERS,
  type TimelineBucket,
  matchesFilter,
  chipLabel,
  groupByDay,
} from "@/lib/vessel/timeline-view";

// ───────────────────────── Unit 7: the vessel History feed ─────────────────────────
// Renders getVesselTimeline's items (already newest-first from the loader) as a scannable, day-
// grouped, filterable, clickable feed. Each row is a real <button> that calls onOpenEntry(item) →
// the detail modal (Unit 8). WORK_ORDER items and WO-sourced ops show a colored status Badge (color
// + text, never color alone). Token-driven only; 44px min touch targets; <time dateTime>.

export type VesselTimelineProps = {
  vesselCode: string;
  items: TimelineItem[];
  windowStartAt: string | null;
  onOpenEntry: (item: TimelineItem) => void;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
};

type Tone = React.ComponentProps<typeof Badge>["tone"];

// Type-chip tone by bucket — text label always accompanies it (never color-only).
function chipTone(item: TimelineItem): Tone {
  switch (item.kind) {
    case "OP":
      if (item.type === "ADDITION" || item.type === "FINING" || item.type === "CAP_MGMT") return "gold";
      if (item.type === "LOSS" || item.type === "FILTRATION" || item.type === "CORRECTION") return "red";
      if (item.type === "RACK" || item.type === "TOPPING") return "blue";
      if (item.type === "SEED") return "green";
      if (item.type === "BOTTLE") return "maroon";
      return "neutral";
    case "MEASUREMENT":
      return "gold";
    case "TASTING":
      return "maroon";
    case "SAMPLE":
      return "neutral";
    case "VESSEL_ACTIVITY":
      return "neutral";
    case "WORK_ORDER":
      return "blue";
  }
}

function signed(leg: TimelineLeg): string {
  const sign = leg.deltaL >= 0 ? "+" : "−";
  return `${sign}${formatL(Math.abs(leg.deltaL))} L`;
}

// A compact leg line inside a row. Not itself a link (the row is the button); a "view lot"/vessel
// affordance lives on the meta line so it doesn't nest interactive elements inside the row button.
function LegLine({ leg }: { leg: TimelineLeg }) {
  const vol = (
    <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>{signed(leg)}</span>
  );
  if (leg.isExternal) {
    return (
      <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
        → outside the cellar{leg.reason ? ` (${leg.reason})` : ""} {vol}
      </div>
    );
  }
  return (
    <div style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "baseline" }}>
      <span style={{ color: "var(--text-secondary)" }}>{leg.label}</span>
      {vol}
    </div>
  );
}

function metaLine(item: TimelineItem): React.ReactNode {
  const method =
    item.captureMethod && item.captureMethod !== "MANUAL" ? ` · ${item.captureMethod.toLowerCase()}` : "";
  return (
    <>
      <time dateTime={item.observedAt}>{item.timeLabel}</time>
      {" · "}
      {item.enteredBy}
      {method}
    </>
  );
}

// The status badge shown on WORK_ORDER items and WO-sourced ops (shared color language, Unit 1).
function statusBadge(item: TimelineItem): React.ReactNode {
  if (item.kind === "WORK_ORDER") {
    return (
      <Badge tone={item.tone} variant="soft">
        {item.statusLabel}
      </Badge>
    );
  }
  if (item.kind === "OP" && item.workOrder) {
    return (
      <Badge tone={item.workOrder.tone} variant="soft">
        {item.workOrder.statusLabel}
      </Badge>
    );
  }
  return null;
}

function TimelineRow({ item, onOpenEntry }: { item: TimelineItem; onOpenEntry: (i: TimelineItem) => void }) {
  const dim = item.kind === "OP" && item.corrected;
  const legs = item.kind === "OP" ? item.legs : [];
  const badge = statusBadge(item);

  // For OP legs referencing a lot / vessel and for WO items, a small affordance link. We keep links
  // OUT of the row <button> (no nested interactive elements) and render them on a sibling row.
  const workOrderId = item.kind === "WORK_ORDER" ? item.workOrderId : item.kind === "OP" ? item.workOrder?.workOrderId ?? null : null;

  return (
    <li style={{ listStyle: "none", margin: 0 }}>
      <button
        type="button"
        onClick={() => onOpenEntry(item)}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          minHeight: 44,
          background: "transparent",
          border: "none",
          borderRadius: "var(--radius-md)",
          padding: "10px 12px",
          cursor: "pointer",
          color: "inherit",
          font: "inherit",
          opacity: dim ? 0.6 : 1,
          transition: "background var(--duration-fast) var(--ease-standard)",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--paper-100)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
          <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 13, color: "var(--text-muted)", minWidth: 44 }}>
            {item.timeLabel}
          </span>
          <Badge tone={chipTone(item)} variant="soft">
            {chipLabel(item)}
          </Badge>
          {item.kind === "OP" && item.corrected ? (
            <Badge tone="neutral" variant="outline">
              {item.voided ? "voided" : "corrected"}
            </Badge>
          ) : null}
          {badge}
        </div>
        <div style={{ fontSize: 15, color: "var(--text-primary)", marginBottom: 2 }}>{item.summary}</div>
        <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{metaLine(item)}</div>
        {legs.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 6 }}>
            {legs.map((leg, i) => (
              <LegLine key={i} leg={leg} />
            ))}
          </div>
        ) : null}
        {item.note ? (
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6, fontStyle: "italic" }}>{item.note}</div>
        ) : null}
      </button>
      {workOrderId ? (
        <div style={{ padding: "0 12px 4px", fontSize: 12.5 }}>
          <Link href={`/work-orders/${workOrderId}`} style={{ color: "var(--text-accent)" }}>
            View work order ›
          </Link>
        </div>
      ) : null}
    </li>
  );
}

function SkeletonRow() {
  return (
    <li style={{ listStyle: "none", padding: "12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ height: 12, width: "40%", background: "var(--paper-200)", borderRadius: 4 }} />
      <div style={{ height: 14, width: "70%", background: "var(--paper-200)", borderRadius: 4 }} />
      <div style={{ height: 10, width: "30%", background: "var(--paper-100)", borderRadius: 4 }} />
    </li>
  );
}

const DAY_FMT: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: "numeric" };
function prettyDay(dateLabel: string) {
  // dateLabel is YYYY-MM-DD (UTC date-slice); render at noon UTC to avoid a TZ off-by-one.
  return <LocalTime value={`${dateLabel}T12:00:00.000Z`} mode="date" options={DAY_FMT} invalidText={dateLabel} />;
}

export function VesselTimeline({
  vesselCode,
  items,
  windowStartAt,
  onOpenEntry,
  loading = false,
  error = false,
  onRetry,
}: VesselTimelineProps) {
  const [filter, setFilter] = React.useState<TimelineBucket>("all");

  const filtered = React.useMemo(() => items.filter((it) => matchesFilter(it, filter)), [items, filter]);
  const groups = React.useMemo(() => groupByDay(filtered), [filtered]);

  const filledLabel = windowStartAt ? prettyDay(windowStartAt.slice(0, 10)) : null;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 20, margin: 0 }}>History · {vesselCode}</h3>
        {filledLabel ? (
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Filled {filledLabel}</span>
        ) : null}
      </div>

      {/* Filter chips (horizontal-scroll on narrow screens) */}
      {!loading && !error ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {TIMELINE_FILTERS.map((f) => {
            const active = filter === f.bucket;
            return (
              <button
                key={f.bucket}
                type="button"
                onClick={() => setFilter(f.bucket)}
                aria-pressed={active}
                style={{
                  minHeight: 34,
                  padding: "6px 12px",
                  borderRadius: "var(--radius-pill)",
                  borderWidth: 1,
                  borderStyle: "solid",
                  borderColor: active ? "var(--accent)" : "var(--border-strong)",
                  background: active ? "var(--accent-soft)" : "transparent",
                  color: active ? "var(--wine-primary)" : "var(--text-secondary)",
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* States */}
      {loading ? (
        <ul style={{ margin: 0, padding: 0 }}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </ul>
      ) : error ? (
        <div style={{ padding: "24px 12px", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 12 }}>
            Couldn&rsquo;t load history.
          </p>
          {onRetry ? (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </div>
      ) : items.length === 0 ? (
        <div style={{ padding: "28px 12px", textAlign: "center" }}>
          <p style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: 4 }}>
            No activity since this vessel was filled.
          </p>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Log a reading or an action from the Actions tab to start the history.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p style={{ padding: "20px 12px", fontSize: 14, color: "var(--text-muted)", textAlign: "center" }}>
          No entries match this filter.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {groups.map((g) => (
            <div key={g.dateLabel}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: "var(--weight-medium)" as unknown as number,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                  padding: "0 12px 6px",
                  borderBottom: "1px solid var(--border-subtle)",
                  marginBottom: 4,
                }}
              >
                {prettyDay(g.dateLabel)}
              </div>
              <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
                {g.items.map((item) => (
                  <TimelineRow key={`${item.kind}-${item.id}`} item={item} onOpenEntry={onOpenEntry} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
