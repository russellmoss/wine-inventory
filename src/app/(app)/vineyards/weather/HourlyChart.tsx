"use client";

// Plan 097 U5 — the day-detail hourly chart, in the house SVG idiom (GddChart/RainfallChart): no
// chart library, tokens for chrome, semantic data colors, crosshair readout. Temperature LINE on
// the left axis with the vineyard's frost/heat THRESHOLD reference lines (only those near the
// day's temp range — a mild day doesn't get five dashed lines); rainfall BARS on the right axis at
// their NATIVE interval width (Open-Meteo 1 h; NWS QPF buckets 3/6 h — S6: a bucket is one wide
// bar, never invented per-hour splits; one spanning past midnight renders clipped with a "→"
// affordance). A "now" line marks the current site-local hour when the day is today.

import React from "react";
import type { ForecastHourSlot } from "@/lib/weather/forecast-hourly-read-core";
import { cToF, formatPrecip, formatSpeed, formatTemp, mmToInches, type UnitSystem } from "@/lib/weather/units-core";

const W = 680;
const H = 300;
const PAD_L = 46;
const PAD_R = 50;
const PAD_T = 14;
const PAD_B = 28;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

const TEMP = "#c0392b"; // temperature line (matches the chart family's warm semantic)
const RAIN = "#2b6cb0";

export interface ThresholdLine {
  valueC: number;
  label: string;
  danger: boolean;
}

function hourLabel(h: number): string {
  if (h === 0) return "12a";
  if (h < 12) return `${h}a`;
  if (h === 12) return "12p";
  return `${h - 12}p`;
}

const dispT = (c: number, u: UnitSystem) => (u === "IMPERIAL" ? cToF(c) : c);
const dispP = (mm: number, u: UnitSystem) => (u === "IMPERIAL" ? mmToInches(mm) : mm);

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * pow) return m * pow;
  return 10 * pow;
}

export function HourlyChart({
  slots,
  thresholds,
  unitSystem,
  nowLocalHour,
}: {
  slots: ForecastHourSlot[];
  thresholds: ThresholdLine[];
  unitSystem: UnitSystem;
  nowLocalHour: number | null;
}) {
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const [hoverHour, setHoverHour] = React.useState<number | null>(null);

  const temps = slots.filter((s) => s.tempC !== null).map((s) => dispT(s.tempC!, unitSystem));
  const hasTemps = temps.length > 0;

  // Threshold lines only when they sit near the day's range (±3 display degrees of headroom).
  const visibleThresholds = hasTemps
    ? thresholds.filter((t) => {
        const v = dispT(t.valueC, unitSystem);
        return v >= Math.min(...temps) - (unitSystem === "IMPERIAL" ? 6 : 3) && v <= Math.max(...temps) + (unitSystem === "IMPERIAL" ? 6 : 3);
      })
    : [];
  const tempDomain = hasTemps
    ? [
        Math.floor(Math.min(...temps, ...visibleThresholds.map((t) => dispT(t.valueC, unitSystem))) - 2),
        Math.ceil(Math.max(...temps, ...visibleThresholds.map((t) => dispT(t.valueC, unitSystem))) + 2),
      ]
    : [0, 1];

  const maxRain = niceCeil(
    Math.max(...slots.map((s) => (s.precipMm === null ? 0 : dispP(s.precipMm, unitSystem))), unitSystem === "IMPERIAL" ? 0.05 : 1),
  );

  const xOf = (hour: number) => PAD_L + ((hour + 0.5) / 24) * PLOT_W;
  const hourW = PLOT_W / 24;
  const yTemp = (v: number) => PAD_T + PLOT_H - ((v - tempDomain[0]) / (tempDomain[1] - tempDomain[0])) * PLOT_H;
  const yRain = (v: number) => PAD_T + PLOT_H - (v / maxRain) * PLOT_H;

  const tempPath = slots
    .filter((s) => s.tempC !== null)
    .map((s, i) => `${i === 0 ? "M" : "L"}${xOf(s.localHour).toFixed(1)},${yTemp(dispT(s.tempC!, unitSystem)).toFixed(1)}`)
    .join(" ");

  const tempTicks = hasTemps
    ? [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(tempDomain[0] + f * (tempDomain[1] - tempDomain[0])))
    : [];

  const idxFromClient = (clientX: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const svgX = ((clientX - r.left) / r.width) * W;
    return Math.max(0, Math.min(23, Math.floor(((svgX - PAD_L) / PLOT_W) * 24)));
  };
  const hover = hoverHour === null ? null : (slots.find((s) => s.localHour === hoverHour) ?? null);
  const tempUnit = unitSystem === "IMPERIAL" ? "°F" : "°C";
  const rainUnit = unitSystem === "IMPERIAL" ? "in" : "mm";

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="Hourly temperature and rainfall — move along the chart to read any hour"
        style={{ touchAction: "pan-y", cursor: "crosshair" }}
        onMouseMove={(e) => setHoverHour(idxFromClient(e.clientX))}
        onMouseLeave={() => setHoverHour(null)}
        onTouchStart={(e) => setHoverHour(idxFromClient(e.touches[0].clientX))}
        onTouchMove={(e) => setHoverHour(idxFromClient(e.touches[0].clientX))}
      >
        {tempTicks.map((v) => (
          <g key={`t${v}`}>
            <line x1={PAD_L} y1={yTemp(v)} x2={W - PAD_R} y2={yTemp(v)} stroke="var(--border-subtle)" strokeWidth={1} />
            <text x={PAD_L - 6} y={yTemp(v) + 3} textAnchor="end" fontSize={10} fill="var(--text-muted)">{v}</text>
          </g>
        ))}
        {[0, 0.5, 1].map((f) => (
          <text key={`r${f}`} x={W - PAD_R + 6} y={PAD_T + PLOT_H * (1 - f) + 3} textAnchor="start" fontSize={10} fill="var(--text-muted)">
            {(maxRain * f).toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </text>
        ))}
        {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
          <text key={`h${h}`} x={xOf(h)} y={H - PAD_B + 14} textAnchor="middle" fontSize={9.5} fill="var(--text-muted)">
            {hourLabel(h)}
          </text>
        ))}
        <text x={12} y={H / 2} transform={`rotate(-90 12 ${H / 2})`} textAnchor="middle" fontSize={10.5} fill="var(--text-secondary)">Temp ({tempUnit})</text>
        <text x={W - 10} y={H / 2} transform={`rotate(90 ${W - 10} ${H / 2})`} textAnchor="middle" fontSize={10.5} fill="var(--text-secondary)">Rain ({rainUnit})</text>

        {/* Rain bars at native interval width (clipped at the day edge, labeled by the readout). */}
        {slots.map((s) =>
          s.precipMm === null || s.precipMm <= 0 ? null : (
            <g key={`b${s.localHour}`}>
              <rect
                x={PAD_L + (s.localHour / 24) * PLOT_W + 1}
                y={yRain(dispP(s.precipMm, unitSystem))}
                width={Math.max(2, Math.min(s.precipDurationH, 24 - s.localHour) * hourW - 2)}
                height={Math.max(1, PAD_T + PLOT_H - yRain(dispP(s.precipMm, unitSystem)))}
                fill={RAIN}
                opacity={hoverHour === null || hoverHour === s.localHour ? 0.55 : 0.3}
              />
              {s.spansPastMidnight && (
                <text x={W - PAD_R - 4} y={yRain(dispP(s.precipMm, unitSystem)) - 3} textAnchor="end" fontSize={9} fill={RAIN}>
                  →
                </text>
              )}
            </g>
          ),
        )}

        {/* Threshold reference lines — the crossing hour is visible where the temp line meets them. */}
        {visibleThresholds.map((t) => (
          <g key={t.label}>
            <line
              x1={PAD_L}
              y1={yTemp(dispT(t.valueC, unitSystem))}
              x2={W - PAD_R}
              y2={yTemp(dispT(t.valueC, unitSystem))}
              stroke={t.danger ? "var(--danger)" : "var(--warning)"}
              strokeWidth={1.25}
              strokeDasharray="5 4"
              opacity={0.75}
            />
            <text x={PAD_L + 4} y={yTemp(dispT(t.valueC, unitSystem)) - 3} fontSize={9.5} fill={t.danger ? "var(--danger)" : "var(--warning)"}>
              {t.label} {formatTemp(t.valueC, unitSystem)}
            </text>
          </g>
        ))}

        {hasTemps && <path d={tempPath} fill="none" stroke={TEMP} strokeWidth={2.25} strokeLinejoin="round" />}

        {nowLocalHour !== null && (
          <g>
            <line x1={xOf(nowLocalHour)} y1={PAD_T} x2={xOf(nowLocalHour)} y2={PAD_T + PLOT_H} stroke="var(--text-primary)" strokeWidth={1.25} opacity={0.5} />
            <text x={xOf(nowLocalHour)} y={PAD_T + 9} textAnchor="middle" fontSize={9} fill="var(--text-secondary)">now</text>
          </g>
        )}

        {hover && (
          <line x1={xOf(hover.localHour)} y1={PAD_T} x2={xOf(hover.localHour)} y2={PAD_T + PLOT_H} stroke="var(--text-primary)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
        )}
      </svg>

      {hover ? (
        <div style={{ border: "1px solid var(--border-default)", borderRadius: 8, padding: "8px 12px", background: "var(--surface-raised)", fontSize: 12.5 }}>
          <strong>{hourLabel(hover.localHour)}</strong>
          {" · "}
          {formatTemp(hover.tempC, unitSystem)}
          {hover.precipMm !== null && hover.precipMm > 0 && (
            <>
              {" · rain "}
              {formatPrecip(hover.precipMm, unitSystem)}
              {hover.precipDurationH > 1 && ` over ${hover.precipDurationH}h${hover.spansPastMidnight ? " (continues past midnight)" : ""}`}
            </>
          )}
          {hover.popPct !== null && hover.popPct > 0 && <span style={{ color: "var(--text-muted)" }}> · {Math.round(hover.popPct)}%</span>}
          {hover.windKph !== null && <span style={{ color: "var(--text-muted)" }}> · wind {formatSpeed(hover.windKph, unitSystem)}</span>}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 18, fontSize: 12.5, color: "var(--text-primary)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 18, height: 3, background: TEMP }} /> Temperature
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 10, height: 10, background: RAIN, opacity: 0.55 }} /> Rain (bar width = forecast interval)
          </span>
        </div>
      )}
    </div>
  );
}
