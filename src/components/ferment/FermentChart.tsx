"use client";

import React from "react";
import { scaleLinear, niceAxisBounds, nearestByX } from "@/lib/harvest/chart";
import type { FermentPoint } from "@/lib/ferment/monitor-data";

// Phase 6 fermentation-monitoring chart. Brix on the LEFT y-axis, temperature on the RIGHT
// y-axis (the dual-Y the winemaker reads to watch sugar fall as the ferment heats), with pH on a
// small companion strip below (its 3–4 range is a different scale). Pure SVG, token-driven, no
// chart lib — same scale math as AnalyteTrendChart.
//
// Interactive (Unit 6): a transparent capture rect over the plot maps pointer X → data-time
// (inverse scaleLinear over the SVG's rendered width), snaps to the nearest reading via
// `nearestByX`, and renders a vertical crosshair, emphasized dots per series, and an HTML
// tooltip. Touch taps pin the tooltip; mouse-leave clears it (pinned taps persist).

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
const fmtDateTime = (ms: number) => {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  const hh = ((h + 11) % 12) + 1;
  const ap = h < 12 ? "am" : "pm";
  return `${fmtDate(ms)}, ${hh}:${String(m).padStart(2, "0")} ${ap}`;
};

type Row = { t: number; v: number };
function linePath(rows: Row[], xOf: (t: number) => number, yOf: (v: number) => number): string {
  return rows.map((r, i) => `${i === 0 ? "M" : "L"}${xOf(r.t).toFixed(1)},${yOf(r.v).toFixed(1)}`).join(" ");
}

export function FermentChart({ points, height = 240 }: { points: FermentPoint[]; height?: number }) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  // Active hover point: the snapped reading index + the container-relative tooltip X, both computed
  // at pointer time (never by reading the ref during render — that's a lint error and a footgun).
  const [active, setActive] = React.useState<{ idx: number; leftPx: number } | null>(null);
  const [pinned, setPinned] = React.useState(false);
  const [reduceMotion, setReduceMotion] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

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

  // Distinct sorted reading timestamps (the shared X the crosshair snaps to), plus a lookup
  // from each timestamp to whatever series values were recorded then.
  const sortedTs = Array.from(new Set(ts)).sort((a, b) => a - b);
  const brixAt = new Map(brix.map((r) => [r.t, r.v]));
  const tempAt = new Map(temp.map((r) => [r.t, r.v]));
  const phAt = new Map(ph.map((r) => [r.t, r.v]));

  const dot = (rows: Row[], yOf: (v: number) => number, color: string, activeT: number | null) =>
    rows.map((r, i) => (
      <circle key={i} cx={xOf(r.t)} cy={yOf(r.v)} r={activeT != null && r.t === activeT ? 4.6 : 2.6} fill={color}>
        <title>{`${fmtDateTime(r.t)} — ${r.v}`}</title>
      </circle>
    ));

  const canCrosshair = sortedTs.length >= 2;
  const activeT = active != null && active.idx >= 0 && active.idx < sortedTs.length ? sortedTs[active.idx] : null;

  // Map a client X coordinate onto the data-time domain, returning the snapped reading index AND the
  // container-relative tooltip X (px). Reads the ref inside the EVENT handler (never during render).
  // The SVG scales its VB_W-wide viewBox to its rendered width, so translate clientX into viewBox
  // units then invert the [tMin,tMax] → [PAD.left, VB_W-right] scaleLinear used for xOf.
  const activeFromClientX = (clientX: number): { idx: number; leftPx: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const vbX = ((clientX - rect.left) / rect.width) * VB_W;
    const plotSpan = VB_W - PAD.right - PAD.left;
    const targetT = tMax === tMin || plotSpan <= 0 ? tMin : tMin + ((vbX - PAD.left) / plotSpan) * (tMax - tMin);
    const idx = nearestByX(sortedTs, targetT);
    if (idx < 0) return null;
    const px = xOf(sortedTs[idx]) * (rect.width / VB_W);
    return { idx, leftPx: Math.min(Math.max(px, 8), rect.width - 8) };
  };

  const handleMove = (e: React.PointerEvent) => {
    if (pinned && e.pointerType !== "mouse") return; // touch: keep the pin until the next tap
    const next = activeFromClientX(e.clientX);
    if (next) setActive(next);
  };

  const handleLeave = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && !pinned) setActive(null);
  };

  const handleDown = (e: React.PointerEvent) => {
    // Tap-to-pin (touch/pen); a mouse click also pins so it survives a subsequent leave.
    const next = activeFromClientX(e.clientX);
    if (!next) return;
    setActive(next);
    if (e.pointerType !== "mouse") setPinned(true);
  };

  // Tooltip position is the container-relative X captured at pointer time (no ref read in render).
  let tooltip: React.ReactNode = null;
  if (activeT != null && active != null) {
    const clampLeft = active.leftPx;
    const bVal = brixAt.get(activeT);
    const tVal = tempAt.get(activeT);
    const pVal = phAt.get(activeT);
    tooltip = (
      <div
        style={{
          position: "absolute",
          top: 0,
          left: clampLeft,
          transform: "translateX(-50%)",
          pointerEvents: "none",
          background: "var(--surface-raised, #fff)",
          border: "1px solid var(--border-default, #ddd)",
          boxShadow: "var(--shadow-md, 0 4px 12px rgba(0,0,0,0.12))",
          borderRadius: 6,
          padding: "6px 9px",
          fontSize: 11.5,
          lineHeight: 1.5,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
          zIndex: 2,
        }}
        role="status"
      >
        <div style={{ color: "var(--text-muted, #777)", marginBottom: 2 }}>{fmtDateTime(activeT)}</div>
        {bVal != null ? (
          <div style={{ color: BRIX_COLOR }}>Brix {bVal.toFixed(1)}°Bx</div>
        ) : null}
        {tVal != null ? (
          <div style={{ color: TEMP_COLOR }}>Temp {tVal.toFixed(1)}°C</div>
        ) : null}
        {pVal != null ? (
          <div style={{ color: PH_COLOR }}>pH {pVal.toFixed(2)}</div>
        ) : null}
      </div>
    );
  }

  const crosshairX = activeT != null ? xOf(activeT) : null;

  return (
    <div style={{ width: "100%" }}>
      <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VB_W} ${bMain}`}
          width="100%"
          height={bMain}
          role="img"
          aria-label="Brix and temperature over time"
          style={{ overflow: "visible", touchAction: "none" }}
        >
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
          {/* crosshair (drawn under the dots so emphasized dots stay on top) */}
          {crosshairX != null ? (
            <line
              x1={crosshairX}
              y1={PAD.top}
              x2={crosshairX}
              y2={bMain - PAD.bottom}
              stroke="var(--border-strong, #999)"
              strokeWidth={1}
              strokeDasharray="3 3"
              style={reduceMotion ? undefined : { transition: "x 80ms linear" }}
            />
          ) : null}
          {brix.length > 1 ? <path d={linePath(brix, xOf, yBrix)} fill="none" stroke={BRIX_COLOR} strokeWidth={2} /> : null}
          {temp.length > 1 ? <path d={linePath(temp, xOf, yTemp)} fill="none" stroke={TEMP_COLOR} strokeWidth={2} strokeDasharray="4 3" /> : null}
          {dot(brix, yBrix, BRIX_COLOR, activeT)}
          {dot(temp, yTemp, TEMP_COLOR, activeT)}
          {/* x labels (first + last) */}
          <text x={PAD.left} y={bMain - 8} textAnchor="start" fontSize={11} fill="var(--text-muted)">{fmtDate(tMin)}</text>
          <text x={VB_W - PAD.right} y={bMain - 8} textAnchor="end" fontSize={11} fill="var(--text-muted)">{fmtDate(tMax)}</text>
          {/* transparent capture surface over the plot — pointer move/leave + tap-to-pin */}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={Math.max(0, VB_W - PAD.right - PAD.left)}
            height={Math.max(0, bMain - PAD.bottom - PAD.top)}
            fill="transparent"
            style={{ cursor: canCrosshair ? "crosshair" : "default" }}
            onPointerMove={handleMove}
            onPointerLeave={handleLeave}
            onPointerDown={handleDown}
          />
        </svg>
        {tooltip}
      </div>
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
          {dot(ph, yPh, PH_COLOR, activeT)}
        </svg>
      ) : null}
    </div>
  );
}
