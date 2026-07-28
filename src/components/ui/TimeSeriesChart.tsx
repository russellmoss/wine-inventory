"use client";

import React from "react";
import { scaleLinear, niceAxisBounds } from "@/lib/harvest/chart";

/**
 * TimeSeriesChart — one chart for every measured series over time (v2 §A6, §B-charts).
 *
 * Consolidates `BrixChart` (vineyard ripening) and `AnalyteTrendChart` (lab
 * trends), which were two components doing one job on the same pure scale math.
 *
 * ## Colour is never the only encoding
 * Every series carries a DASH PATTERN and a MARKER SHAPE alongside its `--viz-*`
 * colour. Roughly 1 in 12 men has a colour-vision deficiency, and a winemaker
 * comparing Brix against temperature on a phone in the sun is not going to
 * resolve two similar hues. The dash and the marker do the work; the colour
 * reinforces.
 *
 * ## The data table is not optional
 * A chart with no textual equivalent is unreadable to a screen reader. This
 * renders a real `<table>`, visually hidden by default, containing every plotted
 * value. It is the accessible equivalent, not a fallback.
 */

export type SeriesPoint = { date: number; value: number };

export interface ChartSeries {
  id: string;
  label: string;
  unit?: string;
  points: SeriesPoint[];
  /** 1-6, mapping to --viz-1..--viz-6. Falls back to a cycle. */
  viz?: 1 | 2 | 3 | 4 | 5 | 6;
  /** Explicit colour (variety colours on the vineyard chart). Overrides `viz`. */
  color?: string;
  /** Which Y axis. `right` is for a second unit, e.g. temperature beside Brix. */
  axis?: "left" | "right";
  precision?: number;
}

export interface ChartThreshold {
  value: number;
  /** Must state the value AND what it means — "yeast floor 16 °C", not "threshold". */
  label: string;
  axis?: "left" | "right";
}

export interface ChartMarker {
  seriesId: string;
  date: number;
  value: number | null;
  label?: string;
}

export interface TimeSeriesChartProps {
  series: ChartSeries[];
  thresholds?: ChartThreshold[];
  markers?: ChartMarker[];
  height?: number;
  /** Axis captions, e.g. "Brix" and "°C". */
  leftUnit?: string;
  rightUnit?: string;
  /** Shown when every series is empty. */
  emptyMessage?: string;
  /** Names the chart for assistive tech. Required. */
  caption: string;
  /**
   * Where the data table lives.
   *
   * `sr-only` (default) is the historical behaviour: a complete table, present for assistive
   * tech, invisible to everyone else. `disclosure` renders the SAME table inside a
   * `<details>` so a sighted reader can reach the numbers too — which is what AC-S25 and
   * doc 10 §9 actually ask for ("followed by a complete data table", "in a disclosure
   * titled 'Readings as a table'"). Defaulted, so existing consumers are untouched.
   */
  tableVisibility?: "sr-only" | "disclosure";
  /** The disclosure's summary text. Doc 10 §9 names it; overridable for a lineage table. */
  tableSummary?: string;
  style?: React.CSSProperties;
}

const VB_W = 800;
const PAD = { top: 16, right: 52, bottom: 34, left: 48 };

/** Dash + marker per series slot. The non-colour half of the encoding (v2 §A6). */
const ENCODING: { dash: string; marker: "circle" | "square" | "triangle" | "diamond" | "cross" | "plus" }[] = [
  { dash: "", marker: "circle" },
  { dash: "", marker: "square" },
  { dash: "6 3", marker: "triangle" },
  { dash: "2 3", marker: "diamond" },
  { dash: "8 3 2 3", marker: "cross" },
  { dash: "1 3", marker: "plus" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function marker(shape: string, x: number, y: number, color: string): React.ReactNode {
  const s = 3.2;
  switch (shape) {
    case "square":
      return <rect x={x - s} y={y - s} width={s * 2} height={s * 2} fill={color} />;
    case "triangle":
      return <polygon points={`${x},${y - s * 1.2} ${x + s},${y + s} ${x - s},${y + s}`} fill={color} />;
    case "diamond":
      return <polygon points={`${x},${y - s * 1.3} ${x + s},${y} ${x},${y + s * 1.3} ${x - s},${y}`} fill={color} />;
    case "cross":
      return (
        <g stroke={color} strokeWidth={1.8}>
          <line x1={x - s} y1={y - s} x2={x + s} y2={y + s} />
          <line x1={x - s} y1={y + s} x2={x + s} y2={y - s} />
        </g>
      );
    case "plus":
      return (
        <g stroke={color} strokeWidth={1.8}>
          <line x1={x - s} y1={y} x2={x + s} y2={y} />
          <line x1={x} y1={y - s} x2={x} y2={y + s} />
        </g>
      );
    default:
      return <circle cx={x} cy={y} r={s} fill={color} />;
  }
}

export function TimeSeriesChart({
  series,
  thresholds = [],
  markers = [],
  height = 300,
  leftUnit,
  rightUnit,
  emptyMessage = "No readings yet.",
  caption,
  tableVisibility = "sr-only",
  tableSummary = "Readings as a table",
  style,
}: TimeSeriesChartProps) {
  const tableId = React.useId();
  const withPoints = series.filter((s) => s.points.length > 0);

  if (withPoints.length === 0) {
    return (
      <p style={{ color: "var(--text-muted)", fontSize: 14, margin: 0 }}>{emptyMessage}</p>
    );
  }

  const allX = withPoints.flatMap((s) => s.points.map((p) => p.date));
  const xMin = Math.min(...allX);
  const xMax = Math.max(...allX);

  const leftVals = withPoints.filter((s) => s.axis !== "right").flatMap((s) => s.points.map((p) => p.value));
  const rightVals = withPoints.filter((s) => s.axis === "right").flatMap((s) => s.points.map((p) => p.value));
  const left = niceAxisBounds(leftVals.length ? leftVals : [0, 1]);
  const right = rightVals.length ? niceAxisBounds(rightVals) : null;

  const px = (d: number) => scaleLinear(d, xMin, xMax, PAD.left, VB_W - PAD.right);
  const pyFor = (v: number, axis: "left" | "right") => {
    const b = axis === "right" && right ? right : left;
    return scaleLinear(v, b.yMin, b.yMax, height - PAD.bottom, PAD.top);
  };

  const colorFor = (s: ChartSeries, i: number) => s.color ?? `var(--viz-${s.viz ?? ((i % 6) + 1)})`;
  const encFor = (s: ChartSeries, i: number) => ENCODING[(s.viz ? s.viz - 1 : i) % ENCODING.length];

  // ONE table node, rendered either sr-only or inside a disclosure. Never two: the svg's
  // `aria-describedby` points at this id, and a duplicate id would break that association
  // and read the whole series out twice.
  const table = (
    <table id={tableId} className={tableVisibility === "disclosure" ? undefined : "sr-only"} data-rt="scroll">
      <caption className={tableVisibility === "disclosure" ? undefined : "sr-only"}>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Series</th>
          <th scope="col">Date</th>
          <th scope="col">Value</th>
        </tr>
      </thead>
      <tbody>
        {withPoints.flatMap((s) =>
          s.points.map((p) => (
            <tr key={`${s.id}-${p.date}`}>
              <th scope="row">{s.label}</th>
              <td>{fmtDate(p.date)}</td>
              <td>
                {Number(p.value.toFixed(s.precision ?? 1))}
                {s.unit ? ` ${s.unit}` : ""}
              </td>
            </tr>
          )),
        )}
      </tbody>
    </table>
  );

  return (
    <div style={style}>
      <svg
        viewBox={`0 0 ${VB_W} ${height}`}
        role="img"
        aria-labelledby={`${tableId}-cap`}
        aria-describedby={tableId}
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        <title id={`${tableId}-cap`}>{caption}</title>

        {/* Grid + axes */}
        <line x1={PAD.left} y1={height - PAD.bottom} x2={VB_W - PAD.right} y2={height - PAD.bottom} stroke="var(--viz-axis)" strokeWidth={1} />
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={height - PAD.bottom} stroke="var(--viz-axis)" strokeWidth={1} />
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const v = left.yMin + (left.yMax - left.yMin) * f;
          const y = pyFor(v, "left");
          return (
            <g key={f}>
              <line x1={PAD.left} y1={y} x2={VB_W - PAD.right} y2={y} stroke="var(--viz-grid)" strokeWidth={1} />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end" fontSize={10} fill="var(--text-meta)">
                {Number(v.toFixed(1))}
              </text>
            </g>
          );
        })}
        {leftUnit ? (
          <text x={PAD.left - 6} y={PAD.top - 5} textAnchor="end" fontSize={10} fill="var(--text-meta)">
            {leftUnit}
          </text>
        ) : null}
        {right && rightUnit ? (
          <text x={VB_W - PAD.right + 6} y={PAD.top - 5} fontSize={10} fill="var(--text-meta)">
            {rightUnit}
          </text>
        ) : null}

        {/* Thresholds — always dashed, always labelled with value AND meaning. */}
        {thresholds.map((t) => {
          const y = pyFor(t.value, t.axis ?? "left");
          return (
            <g key={`${t.label}-${t.value}`}>
              <line x1={PAD.left} y1={y} x2={VB_W - PAD.right} y2={y} stroke="var(--viz-threshold)" strokeWidth={1.5} strokeDasharray="5 4" />
              <text x={VB_W - PAD.right} y={y - 4} textAnchor="end" fontSize={10} fill="var(--viz-threshold)">
                {t.label}
              </text>
            </g>
          );
        })}

        {/* Series */}
        {withPoints.map((s, i) => {
          const color = colorFor(s, i);
          const enc = encFor(s, i);
          const axis = s.axis ?? "left";
          const pts = [...s.points].sort((a, b) => a.date - b.date);
          const d = pts.map((p) => `${px(p.date)},${pyFor(p.value, axis)}`).join(" ");
          return (
            <g key={s.id}>
              {pts.length > 1 ? (
                <polyline points={d} fill="none" stroke={color} strokeWidth={1.8} strokeDasharray={enc.dash || undefined} />
              ) : null}
              {pts.map((p) => (
                <g key={p.date}>{marker(enc.marker, px(p.date), pyFor(p.value, axis), color)}</g>
              ))}
            </g>
          );
        })}

        {/* Optional event markers (harvest picks) */}
        {markers
          .filter((m) => m.value != null)
          .map((m, i) => {
            const s = withPoints.find((x) => x.id === m.seriesId);
            const axis = s?.axis ?? "left";
            return (
              <line
                key={`${m.seriesId}-${m.date}-${i}`}
                x1={px(m.date)}
                y1={pyFor(m.value!, axis) - 8}
                x2={px(m.date)}
                y2={pyFor(m.value!, axis) + 8}
                stroke="var(--accent)"
                strokeWidth={2}
              />
            );
          })}

        {/* X labels */}
        <text x={PAD.left} y={height - PAD.bottom + 16} fontSize={10} fill="var(--text-meta)">
          {fmtDate(xMin)}
        </text>
        <text x={VB_W - PAD.right} y={height - PAD.bottom + 16} textAnchor="end" fontSize={10} fill="var(--text-meta)">
          {fmtDate(xMax)}
        </text>
      </svg>

      {/* Legend: names every series AND its non-colour encoding. */}
      <ul style={{ display: "flex", flexWrap: "wrap", gap: 14, listStyle: "none", margin: "10px 0 0", padding: 0, fontSize: 12.5 }}>
        {withPoints.map((s, i) => {
          const color = colorFor(s, i);
          const enc = encFor(s, i);
          return (
            <li key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-secondary)" }}>
              <svg width={26} height={10} aria-hidden="true">
                <line x1={0} y1={5} x2={26} y2={5} stroke={color} strokeWidth={1.8} strokeDasharray={enc.dash || undefined} />
                <g transform="translate(13,5)">{marker(enc.marker, 0, 0, color)}</g>
              </svg>
              {s.label}
              {s.unit ? <span style={{ color: "var(--text-meta)" }}>({s.unit})</span> : null}
            </li>
          );
        })}
        {thresholds.map((t) => (
          <li key={`th-${t.label}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--viz-threshold)" }}>
            <svg width={26} height={10} aria-hidden="true">
              <line x1={0} y1={5} x2={26} y2={5} stroke="var(--viz-threshold)" strokeWidth={1.5} strokeDasharray="5 4" />
            </svg>
            {t.label}
          </li>
        ))}
      </ul>

      {/* The accessible equivalent. A chart with no textual form is unreadable to
          a screen reader, so this is a real table of every plotted value. */}
      {tableVisibility === "disclosure" ? (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--text-secondary)" }}>{tableSummary}</summary>
          {table}
        </details>
      ) : (
        table
      )}
    </div>
  );
}
