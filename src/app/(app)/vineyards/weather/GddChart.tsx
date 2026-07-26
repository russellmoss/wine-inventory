"use client";

// VI-P8b — cumulative Growing Degree Days (°F, base 50 °F) over the growing season, with the current year
// against the 10-yr and 20-yr average curves (CSF-style). Pure SVG, design tokens. April 1 → October 31 (NH).

import React from "react";
import type { CurvePoint } from "@/lib/weather/normals-core";

const W = 640;
const H = 260;
const PAD_L = 48;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 28;

// NH month tick day-indexes from Apr 1 (0). Apr,May,Jun,Jul,Aug,Sep,Oct,end.
const NH_TICKS: Array<{ d: number; label: string }> = [
  { d: 0, label: "Apr" },
  { d: 30, label: "May" },
  { d: 61, label: "Jun" },
  { d: 91, label: "Jul" },
  { d: 122, label: "Aug" },
  { d: 153, label: "Sep" },
  { d: 183, label: "Oct" },
  { d: 213, label: "" },
];

function line(points: CurvePoint[], xOf: (d: number) => number, yOf: (v: number) => number): string {
  if (points.length === 0) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.dayIndex).toFixed(1)},${yOf(p.cumF).toFixed(1)}`).join(" ");
}

export function GddChart({
  current,
  avg10,
  avg20,
}: {
  current: CurvePoint[];
  avg10: CurvePoint[];
  avg20: CurvePoint[];
}) {
  const all = [...current, ...avg10, ...avg20];
  if (all.length === 0) return null;
  const maxDay = 213;
  const maxY = Math.max(100, ...all.map((p) => p.cumF));
  const yTop = Math.ceil(maxY / 500) * 500;
  const xOf = (d: number) => PAD_L + (d / maxDay) * (W - PAD_L - PAD_R);
  const yOf = (v: number) => H - PAD_B - (v / yTop) * (H - PAD_T - PAD_B);

  const yTicks: number[] = [];
  for (let v = 0; v <= yTop; v += yTop / 4) yTicks.push(Math.round(v));

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Cumulative growing degree days: this year vs 10 and 20 year averages" style={{ maxWidth: W }}>
        {/* Y grid + labels */}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD_L} y1={yOf(v)} x2={W - PAD_R} y2={yOf(v)} stroke="var(--border-subtle)" strokeWidth={1} />
            <text x={PAD_L - 6} y={yOf(v) + 3} textAnchor="end" fontSize={10} fill="var(--text-muted)">{v.toLocaleString()}</text>
          </g>
        ))}
        {/* X month ticks */}
        {NH_TICKS.map((t) => (
          <text key={t.d} x={xOf(t.d)} y={H - PAD_B + 14} textAnchor="middle" fontSize={10} fill="var(--text-muted)">{t.label}</text>
        ))}
        {/* 20-yr avg (dotted), 10-yr avg (dashed), current (solid accent) */}
        <path d={line(avg20, xOf, yOf)} fill="none" stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="2 3" />
        <path d={line(avg10, xOf, yOf)} fill="none" stroke="var(--wine-primary)" strokeWidth={1.5} strokeDasharray="6 3" opacity={0.7} />
        <path d={line(current, xOf, yOf)} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
      </svg>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "var(--text-secondary)" }}>
        <span><span style={{ display: "inline-block", width: 14, height: 3, background: "var(--accent)", verticalAlign: "middle", marginRight: 5 }} />This year</span>
        {avg10.length > 0 && <span><span style={{ display: "inline-block", width: 14, height: 2, background: "var(--wine-primary)", verticalAlign: "middle", marginRight: 5 }} />10-yr avg</span>}
        {avg20.length > 0 && <span><span style={{ display: "inline-block", width: 14, height: 2, background: "var(--text-muted)", verticalAlign: "middle", marginRight: 5 }} />20-yr avg</span>}
      </div>
    </div>
  );
}
