"use client";

import React from "react";
import { Badge, Button, Card, Tabs } from "@/components/ui";
import type { SoilUnitDetail } from "@/lib/soil/read";
import type { Unit } from "@/lib/vineyard/units";
import { formatAreaHa } from "@/lib/units/display";

// VI-P4 — the click-to-inspect soil detail panel. Opened when a soil polygon is clicked on the map;
// breaks the map unit's data into tabs (Overview / Chemistry / Physical / Source) so it reads easily
// instead of a wall of fields. Every value is the NRCS-published one, cited to its level — no blending.

// Plan 098: through the display authority (also fixes the "ac"/"acres" label inconsistency).
function area(sqM: number, unit: Unit): string {
  return formatAreaHa(sqM / 10_000, unit === "metric" ? "HA" : "ACRES");
}
const pct = (n: number) => `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`;

function Field({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string | null }) {
  const empty = value == null || value === "";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "6px 0" }}>
      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ fontSize: 14.5, color: empty ? "var(--text-muted)" : "var(--text-primary)" }}>{empty ? "—" : value}</span>
      {sub ? <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{sub}</span> : null}
    </div>
  );
}

const CLASS_LABEL: Record<string, string> = {
  soil: "Soil",
  mixed: "Soil (mixed map unit)",
  water: "Water — not a soil",
  "non-soil": "Non-soil (rock / urban / pit)",
};

export function SoilUnitPanel({ unit, displayUnit, onClose }: { unit: SoilUnitDetail; displayUnit: Unit; onClose: () => void }) {
  const isSoil = unit.class === "soil" || unit.class === "mixed";
  const tabs = [
    {
      id: "overview",
      label: "Overview",
      content: (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0 16px" }}>
          <Field label="Map unit" value={unit.muname} />
          <Field label="Type" value={CLASS_LABEL[unit.class] ?? unit.class} />
          <Field label="Share of block" value={pct(unit.areaPct)} sub="polygon-derived" />
          <Field label="Area" value={area(unit.areaSqM, displayUnit)} sub="polygon-derived, not planted acreage" />
          {unit.comppct != null ? <Field label="Major component" value={`${unit.comppct}%`} /> : null}
        </div>
      ),
    },
    {
      id: "chemistry",
      label: "Chemistry",
      content: isSoil ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0 16px" }}>
          <Field label="pH (water)" value={unit.ph != null ? unit.ph : null} sub={unit.phBasis} />
        </div>
      ) : (
        <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: 0 }}>Not a soil — no chemistry is reported for this map unit.</p>
      ),
    },
    {
      id: "physical",
      label: "Physical",
      content: isSoil ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0 16px" }}>
          <Field label="Drainage class" value={unit.drainageClass} sub={unit.drainageBasis} />
          <Field label="Available water" value={unit.awc != null ? `${unit.awc}` : null} sub={unit.awcUnit} />
          <Field label="Restrictive layer" value={unit.restrictiveDepthCm != null ? `${unit.restrictiveDepthCm} cm` : "None reported"} />
        </div>
      ) : (
        <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: 0 }}>Not a soil — no physical properties are reported.</p>
      ),
    },
    {
      id: "source",
      label: "Source",
      content: (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0 16px" }}>
          <Field label="Map unit key (mukey)" value={unit.mukey} />
          <Field label="Survey area" value={unit.surveyAreaSymbol} sub={unit.surveyAreaVersion} />
          <Field label="Pulled" value={unit.pulledAt.toLocaleDateString()} />
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Attribution" value={unit.attribution} />
          </div>
        </div>
      ),
    },
  ];

  return (
    <Card style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {unit.musym ? <Badge tone="neutral" variant="soft">{unit.musym}</Badge> : null}
          <span style={{ fontSize: 15, fontWeight: 600, fontFamily: "var(--font-display)" }}>{unit.muname}</span>
        </span>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close soil details">
          Close
        </Button>
      </div>
      <Tabs tabs={tabs} />
    </Card>
  );
}
