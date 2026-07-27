"use client";

import React from "react";
import { Card, Button, Eyebrow } from "@/components/ui";
import { setUnitPrefs } from "@/lib/settings/actions";
import { resolveUnitPrefs, type UnitPrefsRow } from "@/lib/units/display";

/**
 * Plan 098 — the tenant's display-unit preferences. One master system ("Metric (SI)" /
 * "US customary") plus six per-dimension overrides; a NULL dimension follows the master, so the
 * presets simply set the master and clear the overrides. Display-only: canonical storage stays
 * metric, dosing rates stay mg/L / g/hL, TTB stays gallons — this card touches none of that.
 */

type DimensionField = keyof typeof DIMENSIONS;

const DIMENSIONS = {
  unitTemperature: {
    label: "Temperature",
    options: [
      { value: "C", label: "°C (Celsius)" },
      { value: "F", label: "°F (Fahrenheit)" },
    ],
  },
  unitPrecipitation: {
    label: "Rainfall",
    options: [
      { value: "MM", label: "Millimetres (mm)" },
      { value: "IN", label: "Inches (in)" },
    ],
  },
  unitVolume: {
    label: "Tank & lot volume",
    options: [
      { value: "L", label: "Litres (L)" },
      { value: "HL", label: "Hectolitres (hL)" },
      { value: "GAL", label: "US gallons (gal)" },
    ],
  },
  unitArea: {
    label: "Area",
    options: [
      { value: "HA", label: "Hectares (ha)" },
      { value: "ACRES", label: "Acres" },
    ],
  },
  unitLength: {
    label: "Length & spacing",
    options: [
      { value: "M", label: "Metres (m)" },
      { value: "FT", label: "Feet (ft)" },
    ],
  },
  unitWeight: {
    label: "Fruit weight",
    options: [
      { value: "KG", label: "Kilograms / tonnes" },
      { value: "LB", label: "Pounds / short tons" },
    ],
  },
} as const;

const DIMENSION_FIELDS = Object.keys(DIMENSIONS) as DimensionField[];

type Choices = { unitSystem: string } & Record<DimensionField, string>;

function toChoices(row: UnitPrefsRow): Choices {
  return {
    unitSystem: row.unitSystem ?? "",
    unitTemperature: row.unitTemperature ?? "",
    unitPrecipitation: row.unitPrecipitation ?? "",
    unitVolume: row.unitVolume ?? "",
    unitArea: row.unitArea ?? "",
    unitLength: row.unitLength ?? "",
    unitWeight: row.unitWeight ?? "",
  };
}

export function UnitPreferencesCard({ initial }: { initial: UnitPrefsRow }) {
  const [saved, setSaved] = React.useState<Choices>(() => toChoices(initial));
  const [choices, setChoices] = React.useState<Choices>(() => toChoices(initial));
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const dirty = DIMENSION_FIELDS.some((f) => choices[f] !== saved[f]) || choices.unitSystem !== saved.unitSystem;

  // What a "follow the master" dimension currently resolves to — shown inside the default option.
  const resolved = resolveUnitPrefs({
    unitSystem: choices.unitSystem || null,
    unitTemperature: null,
    unitPrecipitation: null,
    unitVolume: null,
    unitArea: null,
    unitLength: null,
    unitWeight: null,
  });
  const masterLabelFor: Record<DimensionField, string> = {
    unitTemperature: resolved.temperature === "F" ? "°F" : "°C",
    unitPrecipitation: resolved.precipitation === "IN" ? "in" : "mm",
    unitVolume: resolved.volume === "GAL" ? "gal" : "L",
    unitArea: resolved.area === "ACRES" ? "acres" : "ha",
    unitLength: resolved.length === "FT" ? "ft" : "m",
    unitWeight: resolved.weight === "LB" ? "lb" : "kg",
  };

  function applyPreset(system: "METRIC" | "IMPERIAL") {
    setChoices({
      unitSystem: system,
      unitTemperature: "",
      unitPrecipitation: "",
      unitVolume: "",
      unitArea: "",
      unitLength: "",
      unitWeight: "",
    });
    setMessage(null);
    setError(null);
  }

  function save() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await setUnitPrefs({
          unitSystem: choices.unitSystem || null,
          unitTemperature: choices.unitTemperature || null,
          unitPrecipitation: choices.unitPrecipitation || null,
          unitVolume: choices.unitVolume || null,
          unitArea: choices.unitArea || null,
          unitLength: choices.unitLength || null,
          unitWeight: choices.unitWeight || null,
        });
        const next = toChoices(res);
        setSaved(next);
        setChoices(next);
        setMessage("Saved. Every screen and the assistant now read in these units.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save the unit preferences.");
      }
    });
  }

  const selectStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    marginTop: 6,
    padding: "8px 10px",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--border)",
    background: "var(--paper-0)",
    color: "var(--text-primary)",
    fontSize: 14,
  };

  return (
    <Card style={{ maxWidth: 560, marginTop: 16 }}>
      <Eyebrow>Display units</Eyebrow>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 8, lineHeight: 1.55 }}>
        How this winery reads quantities — on every screen and from the assistant. Records are stored
        in metric either way; this only changes what is shown. Dosing rates (mg/L, g/hL) and TTB
        reporting keep their required units regardless.
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <Button variant="ghost" disabled={pending} onClick={() => applyPreset("METRIC")}>
          Metric (SI)
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => applyPreset("IMPERIAL")}>
          US customary
        </Button>
      </div>

      <label style={{ display: "block", marginTop: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Master system</span>
        <select
          value={choices.unitSystem}
          onChange={(e) => setChoices((c) => ({ ...c, unitSystem: e.target.value }))}
          disabled={pending}
          style={selectStyle}
        >
          <option value="">— not set (metric, today&apos;s behavior) —</option>
          <option value="METRIC">Metric (SI)</option>
          <option value="IMPERIAL">US customary</option>
        </select>
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", marginTop: 6 }}>
        {DIMENSION_FIELDS.map((field) => (
          <label key={field} style={{ display: "block", marginTop: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>
              {DIMENSIONS[field].label}
            </span>
            <select
              value={choices[field]}
              onChange={(e) => setChoices((c) => ({ ...c, [field]: e.target.value }))}
              disabled={pending}
              style={selectStyle}
            >
              <option value="">Winery default ({masterLabelFor[field]})</option>
              {DIMENSIONS[field].options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 10, lineHeight: 1.5 }}>
        Wind speed, shoot length, and the weather &amp; climate pages (including alert notifications)
        follow the master system. A vineyard&apos;s own weather or geometry override, where set, still
        wins for that vineyard.
      </p>

      {error ? <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{error}</div> : null}
      {message && !error ? <div style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 10 }}>{message}</div> : null}

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <Button disabled={pending || !dirty} onClick={save}>
          {pending ? "Saving…" : "Save display units"}
        </Button>
      </div>
    </Card>
  );
}
