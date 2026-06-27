"use client";

import React from "react";
import Link from "next/link";
import { Card, Eyebrow, Badge, Metric } from "@/components/ui";
import { formatL, type TimelineEvent, type TimelineLeg } from "@/lib/lot/timeline";
import type { LotDetail } from "@/lib/lot/data";

type Tone = React.ComponentProps<typeof Badge>["tone"];

function formLabel(form: string): string {
  const s = form.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function formTone(form: string): Tone {
  if (form === "FINISHED") return "green";
  if (form === "BOTTLED_IN_PROCESS") return "maroon";
  return "neutral";
}
function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}
function statusTone(status: string): Tone {
  return status === "ACTIVE" ? "green" : "neutral";
}

// Operation type -> Badge tone. Type is ALSO shown as text, so this is never color-only.
function opTone(type: string): Tone {
  switch (type) {
    case "SEED":
      return "green";
    case "RACK":
      return "blue";
    case "BOTTLE":
      return "maroon";
    case "LOSS":
      return "red";
    case "CORRECTION":
      return "red";
    default:
      return "neutral"; // ADJUST, DEPLETE
  }
}

function signed(leg: TimelineLeg): string {
  const sign = leg.deltaL >= 0 ? "+" : "−";
  return `${sign}${formatL(Math.abs(leg.deltaL))} L`;
}

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
      {leg.vesselId ? (
        <Link href={`/vessels#vessel-${leg.vesselId}`} style={{ color: "var(--text-accent)" }}>
          {leg.label}
        </Link>
      ) : (
        <span style={{ color: "var(--text-secondary)" }}>{leg.label}</span>
      )}
      {vol}
    </div>
  );
}

function TimelineItem({ event }: { event: TimelineEvent }) {
  const dim = event.corrected;
  return (
    <li
      style={{
        position: "relative",
        listStyle: "none",
        borderLeft: "1px solid var(--border-strong)",
        padding: "0 0 24px 20px",
        marginLeft: 4,
        opacity: dim ? 0.6 : 1,
      }}
    >
      {/* node on the rail */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: -5,
          top: 4,
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: "var(--surface-page)",
          border: "1.5px solid var(--border-strong)",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <Badge tone={opTone(event.type)} variant="soft" uppercase>
          {event.type}
        </Badge>
        {event.corrected ? (
          <Badge tone="neutral" variant="outline">
            corrected
          </Badge>
        ) : null}
      </div>
      <div style={{ fontSize: 15.5, color: "var(--text-primary)", marginBottom: 4 }}>{event.summary}</div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: event.legs.length ? 8 : 0 }}>
        <time dateTime={event.observedAt}>{event.dateLabel}</time>
        {" · "}
        {event.enteredBy}
        {event.captureMethod && event.captureMethod !== "MANUAL" ? ` · ${event.captureMethod.toLowerCase()}` : ""}
      </div>
      {event.legs.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {event.legs.map((leg, i) => (
            <LegLine key={i} leg={leg} />
          ))}
        </div>
      ) : null}
      {event.note ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6, fontStyle: "italic" }}>{event.note}</div>
      ) : null}
    </li>
  );
}

function LineageRefs({ label, refs }: { label: string; refs: { lotId: string; code: string }[] }) {
  if (refs.length === 0) return null;
  return (
    <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
      {label}:{" "}
      {refs.map((r, i) => (
        <React.Fragment key={r.lotId}>
          {i > 0 ? ", " : ""}
          <Link href={`/lots/${r.lotId}`} style={{ color: "var(--text-accent)" }}>
            {r.code}
          </Link>
        </React.Fragment>
      ))}
    </div>
  );
}

export function LotDetailClient({ lot }: { lot: LotDetail }) {
  const origin = [lot.varietyName, lot.vineyardName, lot.vintageYear != null ? String(lot.vintageYear) : null].filter(
    (x): x is string => !!x,
  );
  const empty = lot.current.locations.length === 0;

  return (
    <div>
      <Link href="/lots" style={{ fontSize: 13.5, color: "var(--text-accent)" }}>
        ‹ All lots
      </Link>

      {/* 1 — What it is */}
      <div style={{ marginTop: 10 }}>
        <Eyebrow rule>Lot</Eyebrow>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "10px 0 6px" }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: 0 }}>{lot.code}</h1>
          <Badge tone={formTone(lot.form)} variant="soft">
            {formLabel(lot.form)}
          </Badge>
          <Badge tone={statusTone(lot.status)} variant="soft">
            {statusLabel(lot.status)}
          </Badge>
          {lot.isLegacy ? (
            <Badge tone="neutral" variant="soft">
              legacy
            </Badge>
          ) : null}
        </div>
      </div>

      {/* 2 — Where it is now + 3 — Provenance */}
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "stretch", margin: "16px 0 28px" }}>
        <Card style={{ flex: "1 1 280px" }}>
          {empty ? (
            <div>
              <Eyebrow tone="ink">Where it is now</Eyebrow>
              <p style={{ marginTop: 10, color: "var(--text-secondary)" }}>Not currently in any vessel.</p>
            </div>
          ) : (
            <>
              <Metric value={`${formatL(lot.current.totalL)} L`} caption="currently in the cellar" />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
                {lot.current.locations.map((l) => (
                  <Link key={l.vesselId} href={`/vessels#vessel-${l.vesselId}`}>
                    <Badge tone="neutral" variant="soft">
                      {l.label} · {formatL(l.volumeL)} L
                    </Badge>
                  </Link>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card style={{ flex: "1 1 280px" }}>
          <Eyebrow tone="ink">Provenance</Eyebrow>
          <p style={{ marginTop: 10, fontSize: 16, color: "var(--text-primary)" }}>
            {origin.length ? origin.join(" · ") : "—"}
          </p>
          {lot.lineage.parents.length || lot.lineage.children.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
              <LineageRefs label="Blended from" refs={lot.lineage.parents} />
              <LineageRefs label="Split into" refs={lot.lineage.children} />
            </div>
          ) : null}
        </Card>
      </div>

      {/* Timeline rail */}
      <Eyebrow rule>History</Eyebrow>
      <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 24, margin: "10px 0 18px" }}>
        Operation timeline
      </h2>
      <ol style={{ margin: 0, padding: 0 }}>
        {lot.events.map((e) => (
          <TimelineItem key={e.id} event={e} />
        ))}
      </ol>
    </div>
  );
}
