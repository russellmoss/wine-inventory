"use client";

import React from "react";
import { scaleLinear, niceAxisBounds } from "@/lib/harvest/chart";

// Per-analyte trend chart (Phase 4). A generalized sibling of BrixChart built on the SAME
// pure scale math (scaleLinear + niceAxisBounds — which, unlike brixAxisBounds, never floors
// pH to 0). One analyte = one series. Pure-SVG, token-driven, no chart lib. Degenerate states:
// 0 points → empty message (no axes); 1 point → a single dot + value label, no polyline. An
// optional target band draws as a shaded rect (for SO₂ / molecular-SO₂ targets). BrixChart
// (vineyard) is untouched.

export type TrendPoint = { date: number; value: number }; // date = epoch ms

export interface AnalyteTrendChartProps {
  label: string;
  unit: string;
  points: TrendPoint[];
  /** Optional target band (e.g. free-SO₂ target range) drawn as a shaded rect. */
  targetBand?: { min?: number; max?: number };
  /** Decimal places for value labels/tooltips. */
  precision?: number;
  height?: number;
  style?: React.CSSProperties;
}

const VB_W = 800;
const PAD = { top: 16, right: 18, bottom: 34, left: 48 };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function AnalyteTrendChart({
  label,
  unit,
  points,
  targetBand,
  precision = 2,
  height = 220,
  style,
}: AnalyteTrendChartProps) {
  const fmtVal = (v: number) => v.toFixed(precision);

  if (points.length === 0) {
    return (
      <p style={{ color: "var(--text-muted)", fontSize: 13.5, margin: 0 }}>
        No {label.toLowerCase()} readings yet — log one to start the trend.
      </p>
    );
  }

  const xs = points.map((p) => p.date);
  const ys = points.map((p) => p.value);
  // Fold the target band into the Y domain so it stays visible.
  const yDomainValues = [...ys];
  if (targetBand?.min != null) yDomainValues.push(targetBand.min);
  if (targetBand?.max != null) yDomainValues.push(targetBand.max);
  const { yMin, yMax, step } = niceAxisBounds(yDomainValues);

  const xMin = Math.min(...xs);
  const xMaxRaw = Math.max(...xs);
  const xMax = xMaxRaw === xMin ? xMin + 1 : xMaxRaw;

  const plotL = PAD.left;
  const plotR = VB_W - PAD.right;
  const plotT = PAD.top;
  const plotB = height - PAD.bottom;

  const sx = (ms: number) => scaleLinear(ms, xMin, xMax, plotL, plotR);
  const sy = (v: number) => scaleLinear(v, yMin, yMax, plotB, plotT); // y inverted

  const yTicks: number[] = [];
  for (let v = yMin; v <= yMax + 1e-9; v += step) yTicks.push(Math.round(v * 1e4) / 1e4);

  const xTickCount = Math.min(4, Math.max(2, xs.length));
  const xTicks: number[] = [];
  for (let i = 0; i < xTickCount; i++) xTicks.push(xMin + ((xMax - xMin) * i) / (xTickCount - 1));

  const single = points.length === 1;
  const linePts = points.map((p) => `${sx(p.date)},${sy(p.value)}`).join(" ");

  // Target band rect (clamped to the plot).
  const bandTop = targetBand?.max != null ? sy(Math.min(targetBand.max, yMax)) : null;
  const bandBottom = targetBand?.min != null ? sy(Math.max(targetBand.min, yMin)) : null;

  return (
    <div style={style}>
      <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 4 }}>
        {label} <span style={{ fontVariantNumeric: "tabular-nums" }}>({unit})</span>
      </div>
      <svg
        viewBox={`0 0 ${VB_W} ${height}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label={`${label} over time, in ${unit}`}
      >
        {/* Target band */}
        {bandTop != null || bandBottom != null ? (
          <g>
            <rect
              x={plotL}
              width={plotR - plotL}
              y={bandTop ?? plotT}
              height={(bandBottom ?? plotB) - (bandTop ?? plotT)}
              fill="var(--accent-soft)"
            />
            <text x={plotR - 2} y={(bandTop ?? plotT) + 12} textAnchor="end" fontSize={11} fontFamily="var(--font-body)" fill="var(--text-muted)">
              target
            </text>
          </g>
        ) : null}

        {/* Y gridlines + labels */}
        {yTicks.map((v) => {
          const y = sy(v);
          return (
            <g key={`y${v}`}>
              <line x1={plotL} x2={plotR} y1={y} y2={y} stroke="var(--border-subtle)" strokeWidth={1} />
              <text x={plotL - 8} y={y + 4} textAnchor="end" fontSize={12} fontFamily="var(--font-body)" fill="var(--text-muted)" style={{ fontVariantNumeric: "tabular-nums" }}>
                {v}
              </text>
            </g>
          );
        })}

        {/* X axis baseline + date labels */}
        <line x1={plotL} x2={plotR} y1={plotB} y2={plotB} stroke="var(--border-default)" strokeWidth={1} />
        {xTicks.map((ms, i) => (
          <text
            key={`x${i}`}
            x={sx(ms)}
            y={plotB + 20}
            textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
            fontSize={12}
            fontFamily="var(--font-body)"
            fill="var(--text-muted)"
          >
            {fmtDate(ms)}
          </text>
        ))}

        {/* Series: polyline (multi only) + dots */}
        {!single ? (
          <polyline points={linePts} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ) : null}
        {points.map((p, i) => (
          <circle key={i} cx={sx(p.date)} cy={sy(p.value)} r={3.5} fill="var(--accent)">
            <title>{`${label}: ${fmtVal(p.value)} ${unit} · ${fmtDate(p.date)}`}</title>
          </circle>
        ))}

        {/* Single-point value label */}
        {single ? (
          <text
            x={sx(points[0].date) + 8}
            y={sy(points[0].value) + 4}
            fontSize={12.5}
            fontFamily="var(--font-body)"
            fill="var(--text-secondary)"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {fmtVal(points[0].value)} {unit}
          </text>
        ) : null}
      </svg>
    </div>
  );
}
