"use client";

// VI-P8b — accumulated Growing Degree Days over the season, WSU/CSF-style: this year against the coolest &
// hottest historical seasons (the envelope), the long-term average, and last year. Dual axes (°F left,
// °C right), month gridlines, a legend with season totals — and an INTERACTIVE crosshair: hover / drag along
// the chart to read every line's cumulative GDD at that day-of-season plus the date. Pointer + touch (a grower
// on a tablet in the field). Pure SVG; tokens for chrome, semantic colours for the lines.

import React from "react";
import type { NamedCurve } from "@/lib/weather/normals-core";

const W = 680;
const H = 360;
const PAD_L = 52;
const PAD_R = 52;
const PAD_T = 16;
const PAD_B = 34;
const MAX_DAY = 213; // Apr 1 (0) → Oct 31

const NH_MONTHS: Array<{ d: number; label: string }> = [
  { d: 0, label: "Apr" },
  { d: 30, label: "May" },
  { d: 61, label: "Jun" },
  { d: 91, label: "Jul" },
  { d: 122, label: "Aug" },
  { d: 153, label: "Sep" },
  { d: 183, label: "Oct" },
];

// Day-of-season index (0 = Apr 1, NH) → "Mon D" label (year-agnostic; a non-leap ref year).
function dayLabel(dayIndex: number): string {
  const d = new Date(Date.UTC(2001, 3, 1));
  d.setUTCDate(d.getUTCDate() + dayIndex);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// Cumulative GDD of a curve at a day-of-season: the last point on/before that day (running total to there).
// Returns null PAST the curve's last day — so the current, still-running year drops out of the readout for
// dates it hasn't reached yet (rather than reporting a misleading flat value into the future).
function valueAt(curve: NamedCurve["curve"], dayIndex: number): number | null {
  if (curve.length === 0 || dayIndex > curve[curve.length - 1].dayIndex) return null;
  let v: number | null = null;
  for (const p of curve) {
    if (p.dayIndex <= dayIndex) v = p.cumF;
    else break;
  }
  return v;
}

export function GddChart({ series }: { series: NamedCurve[] }) {
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const [hoverDay, setHoverDay] = React.useState<number | null>(null);

  const all = series.flatMap((s) => s.curve);
  if (all.length === 0) return null;

  const maxF = Math.max(500, ...all.map((p) => p.cumF));
  const yTop = Math.ceil(maxF / 500) * 500;
  const xOf = (d: number) => PAD_L + (d / MAX_DAY) * (W - PAD_L - PAD_R);
  const yOf = (v: number) => H - PAD_B - (v / yTop) * (H - PAD_T - PAD_B);

  const fTicks: number[] = [];
  for (let v = 0; v <= yTop; v += yTop / 4) fTicks.push(Math.round(v));

  const pathD = (s: NamedCurve) =>
    s.curve.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.dayIndex).toFixed(1)},${yOf(p.cumF).toFixed(1)}`).join(" ");
  const ordered = [...series].sort((a) => (a.emphasis ? 1 : -1)); // current year drawn last (on top)

  // Pointer → day-of-season (viewBox-aware, since the SVG scales to the container width).
  function updateHover(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * W;
    const day = Math.round(((svgX - PAD_L) / (W - PAD_L - PAD_R)) * MAX_DAY);
    setHoverDay(Math.max(0, Math.min(MAX_DAY, day)));
  }

  const hoverX = hoverDay === null ? null : xOf(hoverDay);
  const readout =
    hoverDay === null
      ? null
      : series
          .map((s) => ({ s, v: valueAt(s.curve, hoverDay) }))
          .filter((r) => r.v !== null)
          .sort((a, b) => (b.v as number) - (a.v as number));

  return (
    <div style={{ display: "grid", gap: 10, position: "relative" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textAlign: "center" }}>
        Accumulated Growing Degree Days (base 50&nbsp;°F) · Apr 1 – Oct 31
        <span style={{ fontWeight: 400, color: "var(--text-muted)" }}> · drag across the chart to read any date</span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="Accumulated growing degree days: this year vs coolest, hottest, long-term average and last year — drag to read values"
        style={{ touchAction: "none", cursor: "crosshair" }}
        onMouseMove={(e) => updateHover(e.clientX)}
        onMouseLeave={() => setHoverDay(null)}
        onTouchStart={(e) => e.touches[0] && updateHover(e.touches[0].clientX)}
        onTouchMove={(e) => e.touches[0] && updateHover(e.touches[0].clientX)}
      >
        {/* horizontal gridlines + dual-axis labels */}
        {fTicks.map((v) => (
          <g key={v}>
            <line x1={PAD_L} y1={yOf(v)} x2={W - PAD_R} y2={yOf(v)} stroke="var(--border-subtle)" strokeWidth={1} />
            <text x={PAD_L - 7} y={yOf(v) + 3} textAnchor="end" fontSize={10} fill="var(--text-muted)">{v.toLocaleString()}</text>
            <text x={W - PAD_R + 7} y={yOf(v) + 3} textAnchor="start" fontSize={10} fill="var(--text-muted)">{Math.round(v / 1.8).toLocaleString()}</text>
          </g>
        ))}
        {/* vertical month gridlines + labels */}
        {NH_MONTHS.map((m) => (
          <g key={m.d}>
            <line x1={xOf(m.d)} y1={PAD_T} x2={xOf(m.d)} y2={H - PAD_B} stroke="var(--border-subtle)" strokeWidth={0.75} opacity={0.6} />
            <text x={xOf(m.d)} y={H - PAD_B + 15} textAnchor="middle" fontSize={10} fill="var(--text-muted)">{m.label}</text>
          </g>
        ))}
        <text x={12} y={H / 2} transform={`rotate(-90 12 ${H / 2})`} textAnchor="middle" fontSize={10.5} fill="var(--text-secondary)">Cumulative GDD (°F)</text>
        <text x={W - 10} y={H / 2} transform={`rotate(90 ${W - 10} ${H / 2})`} textAnchor="middle" fontSize={10.5} fill="var(--text-secondary)">Cumulative GDD (°C)</text>
        {/* series */}
        {ordered.map((s) => (
          <path key={s.key} d={pathD(s)} fill="none" stroke={s.color} strokeWidth={s.emphasis ? 3 : 1.75} strokeDasharray={s.dash} strokeLinejoin="round" opacity={s.emphasis ? 1 : 0.9} />
        ))}
        {/* crosshair + per-line dots */}
        {hoverX !== null && (
          <>
            <line x1={hoverX} y1={PAD_T} x2={hoverX} y2={H - PAD_B} stroke="var(--text-primary)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
            {readout?.map(({ s, v }) => (
              <circle key={s.key} cx={hoverX} cy={yOf(v as number)} r={s.emphasis ? 4.5 : 3.5} fill={s.color} stroke="var(--surface-raised)" strokeWidth={1.5} />
            ))}
          </>
        )}
      </svg>

      {/* readout — the date + every line's cumulative GDD at the crosshair (or the legend totals at rest) */}
      {hoverDay !== null && readout ? (
        <div style={{ border: "1px solid var(--border-default)", borderRadius: 8, padding: "8px 12px", background: "var(--surface-raised)" }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6, color: "var(--text-primary)" }}>
            {dayLabel(hoverDay)} <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(day {hoverDay + 1} of season)</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 18px", fontSize: 12.5 }}>
            {readout.map(({ s, v }) => (
              <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: s.emphasis ? 600 : 400, color: "var(--text-primary)" }}>
                <span style={{ display: "inline-block", width: 14, height: s.emphasis ? 4 : 3, background: s.dash ? undefined : s.color, borderTop: s.dash ? `2px dashed ${s.color}` : undefined }} />
                {s.label}: <strong style={{ fontVariantNumeric: "tabular-nums" }}>{(v as number).toLocaleString()}</strong>&nbsp;°F ({Math.round((v as number) / 1.8).toLocaleString()}&nbsp;°C)
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", fontSize: 12.5 }}>
          {series.map((s) => (
            <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: s.emphasis ? 600 : 400, color: "var(--text-primary)" }}>
              <span style={{ display: "inline-block", width: 18, height: s.emphasis ? 4 : 3, background: s.dash ? undefined : s.color, borderTop: s.dash ? `2px dashed ${s.color}` : undefined }} />
              {s.label} <strong style={{ fontVariantNumeric: "tabular-nums" }}>{s.totalF.toLocaleString()}</strong>&nbsp;°F
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
