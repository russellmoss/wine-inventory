"use client";

// Plan 096 U9 — rainfall over time, in the GddChart idiom: hand-rolled inline SVG, DESIGN.md tokens
// for chrome, crosshair readout, no charting library. Daily rainfall as BARS on the left axis;
// CUMULATIVE total as a line on the right axis (growers reason in accumulated inches over a
// period). Missing primary days are visible GAPS (no bar), never zeros — the section's honesty
// framing carries into the geometry.

import React from "react";
import type { RainfallRangeDay } from "@/lib/weather/rainfall-range-core";
import { formatPrecip, mmToInches, type UnitSystem } from "@/lib/weather/units-core";

const W = 680;
const H = 280;
const PAD_L = 52;
const PAD_R = 56;
const PAD_T = 14;
const PAD_B = 30;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

// Semantic data colours (the documented tokens exception, like GddChart's line palette).
const BAR = "#2b6cb0"; // daily rain
const CUM = "#1f7a6b"; // cumulative line

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Display-scale value (in or mm) for axis math. */
function disp(mm: number, u: UnitSystem): number {
  return u === "IMPERIAL" ? mmToInches(mm) : mm;
}

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * pow) return m * pow;
  return 10 * pow;
}

export function RainfallChart({ days, unitSystem }: { days: RainfallRangeDay[]; unitSystem: UnitSystem }) {
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null);

  const n = days.length;
  if (n === 0) return null;
  const unitLabel = unitSystem === "IMPERIAL" ? "in" : "mm";

  const maxDaily = niceCeil(Math.max(...days.map((d) => (d.precipMm === null ? 0 : disp(d.precipMm, unitSystem))), unitSystem === "IMPERIAL" ? 0.1 : 2));
  const maxCum = niceCeil(Math.max(disp(days[n - 1].cumulativeMm, unitSystem), unitSystem === "IMPERIAL" ? 0.1 : 2));

  const xOf = (i: number) => PAD_L + ((i + 0.5) / n) * PLOT_W;
  const barW = Math.max(1, Math.min(14, (PLOT_W / n) * 0.72));
  const yBar = (v: number) => H - PAD_B - (v / maxDaily) * PLOT_H;
  const yCum = (v: number) => H - PAD_B - (v / maxCum) * PLOT_H;

  const cumPath = days.map((d, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yCum(disp(d.cumulativeMm, unitSystem)).toFixed(1)}`).join(" ");

  // X tick labels: ~6 evenly spaced dates.
  const tickEvery = Math.max(1, Math.round(n / 6));
  const xTicks = days.map((d, i) => ({ d, i })).filter(({ i }) => i % tickEvery === 0 || i === n - 1);

  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  const idxFromClient = (clientX: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const svgX = ((clientX - r.left) / r.width) * W;
    return Math.max(0, Math.min(n - 1, Math.round(((svgX - PAD_L) / PLOT_W) * n - 0.5)));
  };

  const hover = hoverIdx === null ? null : days[hoverIdx];

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="Daily rainfall bars with a cumulative total line — move along the chart to read any day"
        style={{ touchAction: "pan-y", cursor: "crosshair" }}
        onMouseMove={(e) => setHoverIdx(idxFromClient(e.clientX))}
        onMouseLeave={() => setHoverIdx(null)}
        onTouchStart={(e) => setHoverIdx(idxFromClient(e.touches[0].clientX))}
        onTouchMove={(e) => setHoverIdx(idxFromClient(e.touches[0].clientX))}
      >
        {yTicks.map((f) => (
          <g key={f}>
            <line x1={PAD_L} y1={PAD_T + PLOT_H * (1 - f)} x2={W - PAD_R} y2={PAD_T + PLOT_H * (1 - f)} stroke="var(--border-subtle)" strokeWidth={1} />
            <text x={PAD_L - 6} y={PAD_T + PLOT_H * (1 - f) + 3} textAnchor="end" fontSize={10} fill="var(--text-muted)">
              {(maxDaily * f).toLocaleString("en-US", { maximumFractionDigits: 2 })}
            </text>
            <text x={W - PAD_R + 6} y={PAD_T + PLOT_H * (1 - f) + 3} textAnchor="start" fontSize={10} fill="var(--text-muted)">
              {(maxCum * f).toLocaleString("en-US", { maximumFractionDigits: 1 })}
            </text>
          </g>
        ))}
        {xTicks.map(({ d, i }) => (
          <text key={d.localDate} x={xOf(i)} y={H - PAD_B + 14} textAnchor="middle" fontSize={9.5} fill="var(--text-muted)">
            {shortDate(d.localDate)}
          </text>
        ))}
        <text x={12} y={H / 2} transform={`rotate(-90 12 ${H / 2})`} textAnchor="middle" fontSize={10.5} fill="var(--text-secondary)">Daily rain ({unitLabel})</text>
        <text x={W - 10} y={H / 2} transform={`rotate(90 ${W - 10} ${H / 2})`} textAnchor="middle" fontSize={10.5} fill="var(--text-secondary)">Cumulative ({unitLabel})</text>

        {days.map((d, i) =>
          d.precipMm === null || d.precipMm <= 0 ? null : (
            <rect
              key={d.localDate}
              x={xOf(i) - barW / 2}
              y={yBar(disp(d.precipMm, unitSystem))}
              width={barW}
              height={Math.max(1, H - PAD_B - yBar(disp(d.precipMm, unitSystem)))}
              fill={BAR}
              opacity={hoverIdx === null || hoverIdx === i ? 0.9 : 0.45}
            />
          ),
        )}
        <path d={cumPath} fill="none" stroke={CUM} strokeWidth={2.25} strokeLinejoin="round" />
        {hover && hoverIdx !== null && (
          <>
            <line x1={xOf(hoverIdx)} y1={PAD_T} x2={xOf(hoverIdx)} y2={H - PAD_B} stroke="var(--text-primary)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
            <circle cx={xOf(hoverIdx)} cy={yCum(disp(hover.cumulativeMm, unitSystem))} r={4} fill={CUM} stroke="var(--surface-raised)" strokeWidth={1.5} />
          </>
        )}
      </svg>

      {hover ? (
        <div style={{ border: "1px solid var(--border-default)", borderRadius: 8, padding: "8px 12px", background: "var(--surface-raised)", fontSize: 12.5 }}>
          <strong>{shortDate(hover.localDate)}</strong>
          {" · "}
          {hover.precipMm === null ? "no reading from the primary source this day" : `rain ${formatPrecip(hover.precipMm, unitSystem)}`}
          {" · "}
          cumulative <strong style={{ fontVariantNumeric: "tabular-nums" }}>{formatPrecip(hover.cumulativeMm, unitSystem)}</strong>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 18, fontSize: 12.5, color: "var(--text-primary)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 10, height: 10, background: BAR }} /> Daily rain
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 18, height: 3, background: CUM }} /> Cumulative total
          </span>
        </div>
      )}
    </div>
  );
}
