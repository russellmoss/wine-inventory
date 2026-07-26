"use client";

// VI-P8b — accumulated Growing Degree Days over the season, WSU/CSF-style: this year against the coolest &
// hottest historical seasons (the envelope), the long-term average, and last year. Dual axes (°F left,
// °C right), month gridlines, and a legend with season totals — built to be read at a glance by a grower.
// Pure SVG; design tokens for chrome, semantic colours (from the data layer) for the lines.

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

export function GddChart({ series }: { series: NamedCurve[] }) {
  const all = series.flatMap((s) => s.curve);
  if (all.length === 0) return null;

  const maxF = Math.max(500, ...all.map((p) => p.cumF));
  const yTop = Math.ceil(maxF / 500) * 500;
  const xOf = (d: number) => PAD_L + (d / MAX_DAY) * (W - PAD_L - PAD_R);
  const yOf = (v: number) => H - PAD_B - (v / yTop) * (H - PAD_T - PAD_B);

  const fTicks: number[] = [];
  for (let v = 0; v <= yTop; v += yTop / 4) fTicks.push(Math.round(v));

  const path = (s: NamedCurve) =>
    s.curve.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.dayIndex).toFixed(1)},${yOf(p.cumF).toFixed(1)}`).join(" ");

  // Draw historical lines first, current year last (on top).
  const ordered = [...series].sort((a) => (a.emphasis ? 1 : -1));

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textAlign: "center" }}>
        Accumulated Growing Degree Days (base 50&nbsp;°F) · Apr 1 – Oct 31
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Accumulated growing degree days: this year vs coolest, hottest, long-term average and last year">
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
        {/* axis captions */}
        <text x={12} y={H / 2} transform={`rotate(-90 12 ${H / 2})`} textAnchor="middle" fontSize={10.5} fill="var(--text-secondary)">Cumulative GDD (°F)</text>
        <text x={W - 10} y={H / 2} transform={`rotate(90 ${W - 10} ${H / 2})`} textAnchor="middle" fontSize={10.5} fill="var(--text-secondary)">Cumulative GDD (°C)</text>
        {/* series */}
        {ordered.map((s) => (
          <path key={s.key} d={path(s)} fill="none" stroke={s.color} strokeWidth={s.emphasis ? 3 : 1.75} strokeDasharray={s.dash} strokeLinejoin="round" opacity={s.emphasis ? 1 : 0.9} />
        ))}
      </svg>
      {/* legend with season totals (WSU-style) */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", fontSize: 12.5 }}>
        {series.map((s) => (
          <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: s.emphasis ? 600 : 400, color: "var(--text-primary)" }}>
            <span style={{ display: "inline-block", width: 18, height: s.emphasis ? 4 : 3, background: s.dash ? undefined : s.color, borderTop: s.dash ? `2px dashed ${s.color}` : undefined }} />
            {s.label} <strong style={{ fontVariantNumeric: "tabular-nums" }}>{s.totalF.toLocaleString()}</strong>&nbsp;°F
          </span>
        ))}
      </div>
    </div>
  );
}
