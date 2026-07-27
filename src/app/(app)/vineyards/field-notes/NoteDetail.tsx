"use client";

import React from "react";
import { Badge } from "@/components/ui";
import {
  type ParsedFieldNote,
  type InputApplication,
  type BlockStatus,
} from "@/lib/fieldnotes/types";
import { scoutingLabel } from "@/lib/phenology/labels";
import { formatShootLength } from "@/lib/phenology/units";
import { formatPrecip, formatTemp, precipUnitSystem, tempUnitSystem } from "@/lib/units/display";
import { useUnitPrefs } from "@/components/units/UnitsProvider";
import type { ShootLengthBand } from "@/lib/phenology/observation-types";

/** Band chip text. Mirrors the authoring labels in BlockCard so read-back matches what was tapped. */
const SHOOT_BAND_TEXT: Record<ShootLengthBand, string> = {
  LT_10: "< 10 cm",
  CM_10_30: "10–30 cm",
  CM_30_60: "30–60 cm",
  GT_60: "> 60 cm",
};

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
  // Plan 098: shoot length follows the winery's master system (no per-dimension override exists).
  const prefs = useUnitPrefs();
  const chips: { text: string; tone: "neutral" | "red" | "green" | "gold" }[] = [];
  if (status.phenoStage)
    chips.push({
      text:
        status.phenoStagePct != null
          ? `${pretty(status.phenoStage)} ${status.phenoStagePct}%`
          : pretty(status.phenoStage),
      tone: "neutral",
    });
  if (status.canopyDensity) chips.push({ text: `Canopy: ${pretty(status.canopyDensity)}`, tone: "neutral" });
  if (status.waterStress) chips.push({ text: `Water: ${pretty(status.waterStress)}`, tone: "neutral" });
  if (status.weedPressure) chips.push({ text: `Weeds: ${pretty(status.weedPressure)}`, tone: "neutral" });
  // ── S4 ────────────────────────────────────────────────────────────────────────────────────
  // This is a REPORT read-back, so it shows what was recorded that week, not a live estimate —
  // no provenance badge belongs here (the estimate surfaces through the read seam). Every check
  // is an explicit `!== null`, so a recorded `0 cm` or `hedged: no` shows up instead of vanishing.
  if (status.shootLengthCm !== null) {
    chips.push({ text: `Shoots ${formatShootLength(status.shootLengthCm, prefs.system)} (measured)`, tone: "neutral" });
  }
  if (status.shootLengthBand !== null) {
    chips.push({ text: `Shoots ${SHOOT_BAND_TEXT[status.shootLengthBand]}`, tone: "neutral" });
  }
  if (status.shootTip) chips.push({ text: `Shoot tip: ${pretty(status.shootTip)}`, tone: "neutral" });
  if (status.hedgedThisWeek !== null) {
    chips.push({ text: status.hedgedThisWeek ? "Hedged this week" : "Not hedged", tone: "neutral" });
  }
  if (status.fruitZoneLeafRemoval !== null) {
    chips.push({ text: `Fruit-zone leaves: ${pretty(status.fruitZoneLeafRemoval)}`, tone: "neutral" });
  }
  // The scouting pair renders its three states as three different chips. A gap is AMBER and says
  // "didn't check" in words — never green, never silently absent, never read as "none".
  if (status.clusterDamage !== null) {
    chips.push({
      text: scoutingLabel("clusterDamage", status.clusterDamage),
      tone: status.clusterDamage === "NONE" ? "green" : status.clusterDamage === "NOT_ASSESSED" ? "gold" : "red",
    });
  }
  if (status.vinegarFlyPressure !== null) {
    chips.push({
      text: scoutingLabel("vinegarFlyPressure", status.vinegarFlyPressure),
      tone: status.vinegarFlyPressure === "NONE" ? "green" : status.vinegarFlyPressure === "NOT_ASSESSED" ? "gold" : "red",
    });
  }
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
  // Plan 098: the recorded weekly weather (stored metric) renders in the winery's display units.
  const prefs = useUnitPrefs();
  const tempSys = tempUnitSystem(prefs);
  const precipSys = precipUnitSystem(prefs);
  return (
    <div>
      <div style={{ display: "flex", gap: "var(--space-5)", flexWrap: "wrap", marginBottom: "var(--space-4)" }}>
        <div>
          <div style={sub}>Rainfall</div>
          <div style={{ fontSize: 18 }}>{formatPrecip(w.rainfallMm, precipSys)}</div>
        </div>
        <div>
          <div style={sub}>Max temp</div>
          <div style={{ fontSize: 18 }}>{formatTemp(w.maxTempC, tempSys, 1)}</div>
        </div>
        <div>
          <div style={sub}>Min temp</div>
          <div style={{ fontSize: 18 }}>{formatTemp(w.minTempC, tempSys, 1)}</div>
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
