"use client";

import React from "react";
import { Badge } from "@/components/ui";
import {
  type ParsedFieldNote,
  type InputApplication,
  type BlockStatus,
} from "@/lib/fieldnotes/types";

// Shared read-only renderer for a submitted field note: weather, spray/fert
// timeline, per-block statuses, photos, general notes. Used by the manager's
// "most recent" card and the admin drill-in modal so the layout never drifts.

function pretty(v: string): string {
  return v
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const sub: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 12.5,
  fontWeight: "var(--weight-medium)" as unknown as number,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 6,
};

function blockLabelFor(blockId: string, labels: Record<string, string>): string {
  return labels[blockId] ?? blockId.slice(0, 8);
}

function InputList({
  apps,
  labels,
}: {
  apps: InputApplication[];
  labels: Record<string, string>;
}) {
  if (apps.length === 0) return <p style={{ color: "var(--text-muted)", fontSize: 14, margin: 0 }}>None.</p>;
  return (
    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
      {apps.map((a, i) => (
        <li key={`${a.name}-${i}`} style={{ marginBottom: 4 }}>
          <strong>{a.name}</strong>{" "}
          <span style={{ color: "var(--text-muted)" }}>
            {a.scope === "WHOLE"
              ? "— whole vineyard"
              : `— ${a.blockIds.map((b) => blockLabelFor(b, labels)).join(", ") || "no blocks"}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function BlockRow({ label, status }: { label: string; status: BlockStatus }) {
  const chips: { text: string; tone: "neutral" | "red" | "green" }[] = [];
  if (status.phenoStage) chips.push({ text: pretty(status.phenoStage), tone: "neutral" });
  if (status.canopyDensity) chips.push({ text: `Canopy: ${pretty(status.canopyDensity)}`, tone: "neutral" });
  if (status.waterStress) chips.push({ text: `Water: ${pretty(status.waterStress)}`, tone: "neutral" });
  if (status.weedPressure) chips.push({ text: `Weeds: ${pretty(status.weedPressure)}`, tone: "neutral" });
  for (const lc of status.leafConditions) chips.push({ text: pretty(lc), tone: "red" });
  if (status.diseasePestSpotted) chips.push({ text: "Disease/pest", tone: "red" });

  return (
    <div style={{ borderTop: "1px solid var(--border-strong)", padding: "var(--space-3) 0" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <strong style={{ fontSize: 15 }}>{label}</strong>
        {status.leafConditions.length === 0 && !status.diseasePestSpotted ? (
          <Badge tone="green" variant="soft">healthy</Badge>
        ) : null}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {chips.length === 0 ? (
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>No data</span>
        ) : (
          chips.map((c, i) => (
            <Badge key={i} tone={c.tone} variant="soft">
              {c.text}
            </Badge>
          ))
        )}
      </div>
      {status.diseasePestSpotted && status.diseaseDescription ? (
        <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: "8px 0 0" }}>
          {status.diseaseDescription}
        </p>
      ) : null}
      {status.photoUrls.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {status.photoUrls.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt="Field photo"
              style={{
                width: 96,
                height: 96,
                objectFit: "cover",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-strong)",
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function NoteDetail({
  note,
  blockLabels,
}: {
  note: ParsedFieldNote;
  blockLabels: Record<string, string>;
}) {
  const w = note.weatherData;
  return (
    <div>
      <div style={{ display: "flex", gap: "var(--space-5)", flexWrap: "wrap", marginBottom: "var(--space-4)" }}>
        <div>
          <div style={sub}>Rainfall</div>
          <div style={{ fontSize: 18 }}>{w.rainfallMm == null ? "—" : `${w.rainfallMm} mm`}</div>
        </div>
        <div>
          <div style={sub}>Max temp</div>
          <div style={{ fontSize: 18 }}>{w.maxTempC == null ? "—" : `${w.maxTempC} °C`}</div>
        </div>
        <div>
          <div style={sub}>Min temp</div>
          <div style={{ fontSize: 18 }}>{w.minTempC == null ? "—" : `${w.minTempC} °C`}</div>
        </div>
      </div>

      <div style={{ marginBottom: "var(--space-4)" }}>
        <div style={sub}>Sprays</div>
        <InputList apps={note.spraysApplied} labels={blockLabels} />
      </div>
      <div style={{ marginBottom: "var(--space-4)" }}>
        <div style={sub}>Fertilizers</div>
        <InputList apps={note.fertilizersApplied} labels={blockLabels} />
      </div>

      <div style={{ marginBottom: "var(--space-4)" }}>
        <div style={sub}>Blocks</div>
        {Object.entries(note.blockLevelStatuses).map(([blockId, status]) => (
          <BlockRow key={blockId} label={blockLabelFor(blockId, blockLabels)} status={status} />
        ))}
      </div>

      {note.generalNotes ? (
        <div>
          <div style={sub}>General notes</div>
          <p style={{ fontSize: 14.5, color: "var(--text-secondary)", margin: 0, whiteSpace: "pre-wrap" }}>
            {note.generalNotes}
          </p>
        </div>
      ) : null}
    </div>
  );
}
