"use client";

import React from "react";
import { computeDomain, scaleLinear, brixAxisBounds } from "@/lib/harvest/chart";

export type BrixChartSeries = {
  blockId: string;
  label: string;
  color: string;
  points: { date: number; brix: number }[]; // date = epoch ms
};

export type BrixChartMarker = { blockId: string; date: number; brix: number | null };

export interface BrixChartProps {
  series: BrixChartSeries[];
  /** Harvest picks to overlay (rendered where their Brix is known). */
  markers?: BrixChartMarker[];
  /** SVG user-space height; width is responsive. */
  height?: number;
  style?: React.CSSProperties;
}

// viewBox geometry (user-space units, not px — the SVG scales to its container).
const VB_W = 800;
const PAD = { top: 16, right: 18, bottom: 34, left: 44 };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Brix-over-time line chart: one line per block, a dot per reading, with optional
 * harvest-pick markers. Pure-SVG, token-driven (no chart lib). Series colors come
 * from the caller (variety colors). Tooltips use native <title> for v1.
 */
export function BrixChart({ series, markers = [], height = 300, style }: BrixChartProps) {
  const withPoints = series.filter((s) => s.points.length > 0);

  if (withPoints.length === 0) {
    return (
      <p style={{ color: "var(--text-muted)", fontSize: 14, margin: 0 }}>
        No Brix readings yet for this vineyard. Log readings in the manager view and the ripening
        curve will appear here.
      </p>
    );
  }

  const allX = withPoints.flatMap((s) => s.points.map((p) => p.date));
  const allY = withPoints.flatMap((s) => s.points.map((p) => p.brix));
  const domain = computeDomain(allX, allY);

  const plotL = PAD.left;
  const plotR = VB_W - PAD.right;
  const plotT = PAD.top;
  const plotB = height - PAD.bottom;

  const sx = (ms: number) => scaleLinear(ms, domain.xMin, domain.xMax, plotL, plotR);
  const sy = (brix: number) => scaleLinear(brix, domain.yMin, domain.yMax, plotB, plotT); // y inverted

  // Y gridlines at friendly Brix ticks.
  const { yMin, yMax } = brixAxisBounds(allY);
  const yTicks: number[] = [];
  for (let v = yMin; v <= yMax; v += 5) yTicks.push(v);

  // ~4 evenly spaced X (date) labels across the domain.
  const xTickCount = Math.min(4, Math.max(2, allX.length));
  const xTicks: number[] = [];
  for (let i = 0; i < xTickCount; i++) {
    xTicks.push(domain.xMin + ((domain.xMax - domain.xMin) * i) / (xTickCount - 1));
  }

  return (
    <div style={style}>
      <svg
        viewBox={`0 0 ${VB_W} ${height}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label="Brix over time by block"
      >
        {/* Y gridlines + labels */}
        {yTicks.map((v) => {
          const y = sy(v);
          return (
            <g key={`y${v}`}>
              <line
                x1={plotL}
                x2={plotR}
                y1={y}
                y2={y}
                stroke="var(--border-subtle)"
                strokeWidth={1}
              />
              <text
                x={plotL - 8}
                y={y + 4}
                textAnchor="end"
                fontSize={12}
                fontFamily="var(--font-body)"
                fill="var(--text-muted)"
              >
                {v}
              </text>
            </g>
          );
        })}

        {/* X axis baseline + date labels */}
        <line
          x1={plotL}
          x2={plotR}
          y1={plotB}
          y2={plotB}
          stroke="var(--border-default)"
          strokeWidth={1}
        />
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

        {/* Series: line + dots */}
        {withPoints.map((s) => {
          const pts = s.points.map((p) => `${sx(p.date)},${sy(p.brix)}`).join(" ");
          return (
            <g key={s.blockId}>
              <polyline
                points={pts}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {s.points.map((p, i) => (
                <circle key={i} cx={sx(p.date)} cy={sy(p.brix)} r={3.5} fill={s.color}>
                  <title>{`${s.label}: ${p.brix} °Bx · ${fmtDate(p.date)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}

        {/* Pick markers: hollow squares in the block color (where Brix is known) */}
        {markers.map((m, i) => {
          if (m.brix == null) return null;
          const s = withPoints.find((x) => x.blockId === m.blockId);
          const color = s?.color ?? "var(--text-muted)";
          const x = sx(m.date);
          const y = sy(m.brix);
          return (
            <rect
              key={`m${i}`}
              x={x - 4}
              y={y - 4}
              width={8}
              height={8}
              fill="var(--surface-raised)"
              stroke={color}
              strokeWidth={2}
            >
              <title>{`${s?.label ?? "Pick"}: harvested at ${m.brix} °Bx · ${fmtDate(m.date)}`}</title>
            </rect>
          );
        })}
      </svg>

      {/* Legend */}
      <ul
        style={{
          listStyle: "none",
          margin: "10px 0 0",
          padding: 0,
          display: "flex",
          flexWrap: "wrap",
          gap: "6px 18px",
        }}
      >
        {withPoints.map((s) => (
          <li
            key={s.blockId}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              fontSize: 13,
              color: "var(--text-secondary)",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 12,
                height: 12,
                borderRadius: "var(--radius-xs)",
                background: s.color,
                flex: "0 0 auto",
              }}
            />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
