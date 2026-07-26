"use client";

// Plan 096 U14 — condition icons: one small inline-SVG glyph per ConditionCode, sized by prop,
// colored from design tokens (semantic sun/rain hues are the documented data-viz exception, like
// the chart palettes). No icon library — consistent with the hand-rolled chart idiom.

import React from "react";
import type { ConditionCode } from "@/lib/weather/providers/forecast-types";

const SUN = "#e8a33d";
const CLOUD = "var(--text-muted)";
const RAIN = "#2b6cb0";
const SNOW = "#7aa7d8";
const BOLT = "#c99700";

function Sun({ r = 5, cx = 12, cy = 12 }: { r?: number; cx?: number; cy?: number }) {
  return (
    <g stroke={SUN} strokeWidth={1.6} strokeLinecap="round">
      <circle cx={cx} cy={cy} r={r} fill={SUN} stroke="none" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return <line key={i} x1={cx + Math.cos(a) * (r + 2)} y1={cy + Math.sin(a) * (r + 2)} x2={cx + Math.cos(a) * (r + 4.5)} y2={cy + Math.sin(a) * (r + 4.5)} />;
      })}
    </g>
  );
}

function Cloud({ y = 0, fill = CLOUD }: { y?: number; fill?: string }) {
  return <path transform={`translate(0 ${y})`} d="M7 16a4 4 0 0 1 .6-7.96A5 5 0 0 1 17.3 9.6 3.5 3.5 0 0 1 17 16.5H7z" fill={fill} opacity={0.9} />;
}

function Drops({ n = 3, heavy = false }: { n?: number; heavy?: boolean }) {
  const xs = n === 2 ? [9, 15] : [8, 12, 16];
  return (
    <g stroke={RAIN} strokeWidth={heavy ? 2 : 1.5} strokeLinecap="round">
      {xs.map((x) => (
        <line key={x} x1={x} y1={18.5} x2={x - 1.2} y2={heavy ? 22.5 : 21.5} />
      ))}
    </g>
  );
}

function Flakes() {
  return (
    <g fill={SNOW} fontSize={5.4} fontFamily="serif">
      <text x={7} y={22}>*</text>
      <text x={12} y={23}>*</text>
      <text x={16.5} y={22}>*</text>
    </g>
  );
}

const GLYPHS: Record<ConditionCode, React.ReactNode> = {
  CLEAR: <Sun />,
  MOSTLY_CLEAR: (
    <>
      <Sun r={4} cx={9.5} cy={9.5} />
      <Cloud y={2} />
    </>
  ),
  PARTLY_CLOUDY: (
    <>
      <Sun r={3.6} cx={16} cy={8} />
      <Cloud y={1.5} />
    </>
  ),
  CLOUDY: <Cloud y={1} />,
  LIGHT_RAIN: (
    <>
      <Cloud />
      <Drops n={2} />
    </>
  ),
  RAIN: (
    <>
      <Cloud />
      <Drops />
    </>
  ),
  HEAVY_RAIN: (
    <>
      <Cloud />
      <Drops heavy />
    </>
  ),
  THUNDERSTORM: (
    <>
      <Cloud />
      <path d="M12 17l-2.4 3.4h2l-1.2 3.2 3.8-4.4h-2l1.4-2.2z" fill={BOLT} />
    </>
  ),
  SNOW: (
    <>
      <Cloud />
      <Flakes />
    </>
  ),
  SLEET: (
    <>
      <Cloud />
      <g stroke={SNOW} strokeWidth={1.5} strokeLinecap="round">
        <line x1={9} y1={18.5} x2={8} y2={21.5} />
        <line x1={15} y1={18.5} x2={14} y2={21.5} />
      </g>
      <circle cx={12} cy={20.5} r={1.1} fill={SNOW} />
    </>
  ),
  FOG: (
    <g stroke={CLOUD} strokeWidth={1.6} strokeLinecap="round">
      <line x1={5} y1={10} x2={19} y2={10} />
      <line x1={4} y1={13.5} x2={20} y2={13.5} />
      <line x1={6} y1={17} x2={18} y2={17} />
    </g>
  ),
  WINDY: (
    <g stroke={CLOUD} strokeWidth={1.7} strokeLinecap="round" fill="none">
      <path d="M4 10h9a2.5 2.5 0 1 0-2.4-3.2" />
      <path d="M4 14h13a2.5 2.5 0 1 1-2.4 3.2" />
    </g>
  ),
  UNKNOWN: (
    <text x={12} y={17} textAnchor="middle" fontSize={13} fill={CLOUD}>
      ?
    </text>
  ),
};

const LABELS: Record<ConditionCode, string> = {
  CLEAR: "Clear",
  MOSTLY_CLEAR: "Mostly clear",
  PARTLY_CLOUDY: "Partly cloudy",
  CLOUDY: "Cloudy",
  LIGHT_RAIN: "Light rain",
  RAIN: "Rain",
  HEAVY_RAIN: "Heavy rain",
  THUNDERSTORM: "Thunderstorm",
  SNOW: "Snow",
  SLEET: "Sleet / freezing",
  FOG: "Fog",
  WINDY: "Windy",
  UNKNOWN: "Conditions unavailable",
};

export function conditionLabel(code: ConditionCode): string {
  return LABELS[code];
}

export function ConditionIcon({ code, size = 28 }: { code: ConditionCode; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={LABELS[code]}>
      {GLYPHS[code]}
    </svg>
  );
}
