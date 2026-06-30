"use client";

import React from "react";
import { scaleLinear, niceAxisBounds } from "@/lib/harvest/chart";
import type { FermentPoint } from "@/lib/ferment/monitor-data";

// Phase 6 fermentation-monitoring chart. Brix on the LEFT y-axis, temperature on the RIGHT
// y-axis (the dual-Y the winemaker reads to watch sugar fall as the ferment heats), with pH on a
// small companion strip below (its 3–4 range is a different scale). Pure SVG, token-driven, no
// chart lib — same scale math as AnalyteTrendChart.

const VB_W = 820;
const PAD = { top: 14, right: 70, bottom: 28, left: 64 };
const BRIX_COLOR = "var(--wine-primary, #722F37)";
const TEMP_COLOR = "var(--golden-yellow, #C99A2E)";
const PH_COLOR = "var(--text-secondary, #555)";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (ms: number) => {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
};

type Row = { t: number; v: number };
function linePath(rows: Row[], xOf: (t: number) => number, yOf: (v: number) => number): string {
  return rows.map((r, i) => `${i === 0 ? "M" : "L"}${xOf(r.t).toFixed(1)},${yOf(r.v).toFixed(1)}`).join(" ");
}

export function FermentChart({ points, height = 240 }: { points: FermentPoint[]; height?: number }) {
  if (points.length === 0) {
    return <p style={{ color: "var(--text-muted)", fontSize: 13.5, margin: 0 }}>No readings yet — log Brix, pH or temp to start the curve.</p>;
  }

  const ts = points.map((p) => new Date(p.observedAt).getTime());
  const tMin = Math.min(...ts);
  const tMax = Math.max(...ts);
  const brix = points.filter((p) => p.brix != null).map((p) => ({ t: new Date(p.observedAt).getTime(), v: p.brix as number }));
  const temp = points.filter((p) => p.temp != null).map((p) => ({ t: new Date(p.observedAt).getTime(), v: p.temp as number }));
  const ph = points.filter((p) => p.ph != null).map((p) => ({ t: new Date(p.observedAt).getTime(), v: p.ph as number }));

  const bMain = height - 40; // main chart plot height (leaving room for the pH strip)
  const phH = 64;
  const xOf = (t: number) => scaleLinear(t, tMin, tMax, PAD.left, VB_W - PAD.right);

  const bBounds = niceAxisBounds(brix.map((r) => r.v));
  const tBounds = niceAxisBounds(temp.map((r) => r.v));
  const yBrix = (v: number) => scaleLinear(v, bBounds.yMin, bBounds.yMax, bMain - PAD.bottom, PAD.top);
  const yTemp = (v: number) => scaleLinear(v, tBounds.yMin, tBounds.yMax, bMain - PAD.bottom, PAD.top);

  const pBounds = niceAxisBounds(ph.map((r) => r.v));
  const yPh = (v: number) => scaleLinear(v, pBounds.yMin, pBounds.yMax, phH - 16, 8);

  const dot = (rows: Row[], yOf: (v: number) => number, color: string) =>
    rows.map((r, i) => <circle key={i} cx={xOf(r.t)} cy={yOf(r.v)} r={2.6} fill={color} />);

  return (
    <div style={{ width: "100%" }}>
      <svg viewBox={`0 0 ${VB_W} ${bMain}`} width="100%" height={bMain} role="img" aria-label="Brix and temperature over time" style={{ overflow: "visible" }}>
        {/* axis titles */}
        <text transform={`rotate(-90 16 ${(bMain - PAD.bottom + PAD.top) / 2})`} x={16} y={(bMain - PAD.bottom + PAD.top) / 2} textAnchor="middle" fontSize={12} fontWeight={600} fill={BRIX_COLOR}>
          Brix (°Bx)
        </text>
        <text transform={`rotate(90 ${VB_W - 14} ${(bMain - PAD.bottom + PAD.top) / 2})`} x={VB_W - 14} y={(bMain - PAD.bottom + PAD.top) / 2} textAnchor="middle" fontSize={12} fontWeight={600} fill={TEMP_COLOR}>
          Temp (°C)
        </text>
        {/* left (Brix) gridlines + labels */}
        {[bBounds.yMin, (bBounds.yMin + bBounds.yMax) / 2, bBounds.yMax].map((v, i) => (
          <g key={`b${i}`}>
            <line x1={PAD.left} y1={yBrix(v)} x2={VB_W - PAD.right} y2={yBrix(v)} stroke="var(--border-subtle, #eee)" strokeWidth={1} />
            <text x={PAD.left - 6} y={yBrix(v) + 3} textAnchor="end" fontSize={11} fill={BRIX_COLOR}>{v.toFixed(0)}</text>
          </g>
        ))}
        {/* right (temp) labels */}
        {[tBounds.yMin, (tBounds.yMin + tBounds.yMax) / 2, tBounds.yMax].map((v, i) => (
          <text key={`t${i}`} x={VB_W - PAD.right + 6} y={yTemp(v) + 3} textAnchor="start" fontSize={11} fill={TEMP_COLOR}>{v.toFixed(0)}°</text>
        ))}
        {brix.length > 1 ? <path d={linePath(brix, xOf, yBrix)} fill="none" stroke={BRIX_COLOR} strokeWidth={2} /> : null}
        {temp.length > 1 ? <path d={linePath(temp, xOf, yTemp)} fill="none" stroke={TEMP_COLOR} strokeWidth={2} strokeDasharray="4 3" /> : null}
        {dot(brix, yBrix, BRIX_COLOR)}
        {dot(temp, yTemp, TEMP_COLOR)}
        {/* x labels (first + last) */}
        <text x={PAD.left} y={bMain - 8} textAnchor="start" fontSize={11} fill="var(--text-muted)">{fmtDate(tMin)}</text>
        <text x={VB_W - PAD.right} y={bMain - 8} textAnchor="end" fontSize={11} fill="var(--text-muted)">{fmtDate(tMax)}</text>
      </svg>
      <div style={{ display: "flex", gap: 18, fontSize: 12.5, margin: "2px 0 8px", alignItems: "center" }}>
        <span style={{ color: BRIX_COLOR, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke={BRIX_COLOR} strokeWidth={2.5} /></svg>
          Brix — left axis
        </span>
        <span style={{ color: TEMP_COLOR, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke={TEMP_COLOR} strokeWidth={2.5} strokeDasharray="4 3" /></svg>
          Temperature — right axis
        </span>
        {ph.length > 0 ? (
          <span style={{ color: PH_COLOR, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke={PH_COLOR} strokeWidth={2} /></svg>
            pH — below
          </span>
        ) : null}
      </div>
      {ph.length > 0 ? (
        <svg viewBox={`0 0 ${VB_W} ${phH}`} width="100%" height={phH} role="img" aria-label="pH over time" style={{ overflow: "visible" }}>
          <text x={PAD.left - 6} y={yPh(pBounds.yMax) + 3} textAnchor="end" fontSize={11} fill={PH_COLOR}>{pBounds.yMax.toFixed(1)}</text>
          <text x={PAD.left - 6} y={yPh(pBounds.yMin) + 3} textAnchor="end" fontSize={11} fill={PH_COLOR}>{pBounds.yMin.toFixed(1)}</text>
          {ph.length > 1 ? <path d={linePath(ph, xOf, yPh)} fill="none" stroke={PH_COLOR} strokeWidth={1.8} /> : null}
          {dot(ph, yPh, PH_COLOR)}
        </svg>
      ) : null}
    </div>
  );
}
