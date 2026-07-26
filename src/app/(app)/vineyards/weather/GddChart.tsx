"use client";

// VI-P8b — accumulated Growing Degree Days over the season, WSU/CSF-style: this year vs the coolest & hottest
// historical seasons (the envelope), the long-term average, and last year. Dual axes (°F left, °C right),
// month gridlines, a legend with season totals. INTERACTIVE: a crosshair reads every line's cumulative GDD at
// any date; ZOOM in to a few days with ± buttons, trackpad pinch (ctrl+wheel / wheel), or two-finger pinch on
// a phone; PAN by dragging when zoomed. Pure SVG; tokens for chrome, semantic colours for the lines.

import React from "react";
import type { NamedCurve } from "@/lib/weather/normals-core";

const W = 680;
const H = 360;
const PAD_L = 52;
const PAD_R = 52;
const PAD_T = 16;
const PAD_B = 34;
const MAX_DAY = 213; // Apr 1 (0) → Oct 31
const PLOT_W = W - PAD_L - PAD_R;
const MIN_SPAN = 5; // don't zoom tighter than ~5 days
const FULL: [number, number] = [0, MAX_DAY];

const NH_MONTHS: Array<{ d: number; label: string }> = [
  { d: 0, label: "Apr" }, { d: 30, label: "May" }, { d: 61, label: "Jun" }, { d: 91, label: "Jul" },
  { d: 122, label: "Aug" }, { d: 153, label: "Sep" }, { d: 183, label: "Oct" }, { d: 213, label: "" },
];

function dayLabel(dayIndex: number): string {
  const d = new Date(Date.UTC(2001, 3, 1));
  d.setUTCDate(d.getUTCDate() + Math.round(dayIndex));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function valueAt(curve: NamedCurve["curve"], dayIndex: number): number | null {
  if (curve.length === 0 || dayIndex > curve[curve.length - 1].dayIndex) return null;
  let v: number | null = null;
  for (const p of curve) {
    if (p.dayIndex <= dayIndex) v = p.cumF;
    else break;
  }
  return v;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function GddChart({ series }: { series: NamedCurve[] }) {
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const [hoverDay, setHoverDay] = React.useState<number | null>(null);
  const [domain, setDomain] = React.useState<[number, number]>(FULL);
  const drag = React.useRef<{ startX: number; startDomain: [number, number] } | null>(null);
  const pinch = React.useRef<{ startDist: number; startSpan: number; center: number } | null>(null);

  const all = series.flatMap((s) => s.curve);
  const [d0, d1] = domain;
  const span = d1 - d0;
  const zoomed = span < MAX_DAY - 0.5;

  if (all.length === 0) return null;
  const maxF = Math.max(500, ...all.map((p) => p.cumF));
  const yTop = Math.ceil(maxF / 500) * 500;
  const xOf = (d: number) => PAD_L + ((d - d0) / span) * PLOT_W;
  const yOf = (v: number) => H - PAD_B - (v / yTop) * (H - PAD_T - PAD_B);
  const clientToDay = (clientX: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const svgX = ((clientX - r.left) / r.width) * W;
    return clamp(d0 + ((svgX - PAD_L) / PLOT_W) * span, 0, MAX_DAY);
  };

  // Functional updaters so rapid successive zooms compound (each reads the LATEST domain, not the closure).
  function setSpanAround(center: number, newSpan: number) {
    setDomain(([pd0, pd1]) => {
      const pspan = pd1 - pd0;
      const s = clamp(newSpan, MIN_SPAN, MAX_DAY);
      const frac = pspan > 0 ? clamp((center - pd0) / pspan, 0, 1) : 0.5;
      const nd0 = clamp(center - frac * s, 0, MAX_DAY - s);
      return [nd0, nd0 + s];
    });
  }
  const zoomBy = (factor: number, center?: number) => {
    setDomain(([pd0, pd1]) => {
      const pspan = pd1 - pd0;
      const c = center ?? (pd0 + pd1) / 2;
      const s = clamp(pspan * factor, MIN_SPAN, MAX_DAY);
      const frac = pspan > 0 ? clamp((c - pd0) / pspan, 0, 1) : 0.5;
      const nd0 = clamp(c - frac * s, 0, MAX_DAY - s);
      return [nd0, nd0 + s];
    });
  };

  const fTicks: number[] = [];
  for (let v = 0; v <= yTop; v += yTop / 4) fTicks.push(Math.round(v));
  const visibleMonths = NH_MONTHS.filter((m) => m.d >= d0 - 0.5 && m.d <= d1 + 0.5 && m.label);

  const pathD = (s: NamedCurve) => {
    const pts = s.curve.filter((p) => p.dayIndex >= d0 - 3 && p.dayIndex <= d1 + 3);
    return pts.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.dayIndex).toFixed(1)},${yOf(p.cumF).toFixed(1)}`).join(" ");
  };
  const ordered = [...series].sort((a) => (a.emphasis ? 1 : -1));
  const hoverX = hoverDay === null ? null : xOf(hoverDay);
  const readout = hoverDay === null ? null
    : series.map((s) => ({ s, v: valueAt(s.curve, hoverDay) })).filter((r) => r.v !== null).sort((a, b) => (b.v as number) - (a.v as number));

  // pointer (mouse): hover = scrub, drag = pan
  function onMouseMove(e: React.MouseEvent) {
    if (drag.current) {
      const r = svgRef.current!.getBoundingClientRect();
      const dxDays = ((e.clientX - drag.current.startX) / r.width) * W / PLOT_W * span;
      let nd0 = clamp(drag.current.startDomain[0] - dxDays, 0, MAX_DAY - span);
      setDomain([nd0, nd0 + span]);
    } else {
      setHoverDay(clientToDay(e.clientX));
    }
  }
  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    zoomBy(e.deltaY > 0 ? 1.2 : 0.83, clientToDay(e.clientX));
  }
  // touch: 2-finger pinch = zoom; 1-finger = scrub (full view) or pan (zoomed)
  function touchDist(t: React.TouchList) { const dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY; return Math.hypot(dx, dy); }
  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length >= 2) {
      const mid = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      pinch.current = { startDist: touchDist(e.touches), startSpan: span, center: clientToDay(mid) };
    } else if (e.touches.length === 1) {
      if (zoomed) drag.current = { startX: e.touches[0].clientX, startDomain: [d0, d1] };
      else setHoverDay(clientToDay(e.touches[0].clientX));
    }
  }
  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length >= 2 && pinch.current) {
      const scale = touchDist(e.touches) / pinch.current.startDist;
      setSpanAround(pinch.current.center, pinch.current.startSpan / Math.max(0.2, scale));
    } else if (e.touches.length === 1) {
      if (drag.current) {
        const r = svgRef.current!.getBoundingClientRect();
        const dxDays = ((e.touches[0].clientX - drag.current.startX) / r.width) * W / PLOT_W * span;
        let nd0 = clamp(drag.current.startDomain[0] - dxDays, 0, MAX_DAY - span);
        setDomain([nd0, nd0 + span]);
      } else setHoverDay(clientToDay(e.touches[0].clientX));
    }
  }
  const endGesture = () => { drag.current = null; pinch.current = null; };

  const btn: React.CSSProperties = { width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border-default)", background: "var(--surface-raised)", color: "var(--text-primary)", cursor: "pointer", fontSize: 16, lineHeight: 1 };

  return (
    <div style={{ display: "grid", gap: 8, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>
          Accumulated GDD (base 50&nbsp;°F){zoomed ? <span style={{ fontWeight: 400, color: "var(--text-muted)" }}> · {dayLabel(d0)} – {dayLabel(d1)}</span> : <span style={{ fontWeight: 400, color: "var(--text-muted)" }}> · drag / pinch / ± to zoom in on a few days</span>}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button aria-label="Zoom out" onClick={() => zoomBy(1.4)} style={btn}>−</button>
          <button aria-label="Zoom in" onClick={() => zoomBy(0.6)} style={btn}>+</button>
          {zoomed && <button onClick={() => setDomain(FULL)} style={{ ...btn, width: "auto", padding: "0 10px", fontSize: 12.5 }}>Reset</button>}
        </div>
      </div>
      <svg
        ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label="Accumulated growing degree days — drag to read, pinch or ± to zoom into a few days"
        style={{ touchAction: "none", cursor: drag.current ? "grabbing" : zoomed ? "grab" : "crosshair" }}
        onMouseMove={onMouseMove} onMouseDown={(e) => { drag.current = { startX: e.clientX, startDomain: [d0, d1] }; setHoverDay(null); }}
        onMouseUp={endGesture} onMouseLeave={() => { endGesture(); setHoverDay(null); }}
        onWheel={onWheel} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={endGesture}
      >
        <clipPath id="gddplot"><rect x={PAD_L} y={PAD_T} width={PLOT_W} height={H - PAD_T - PAD_B} /></clipPath>
        {fTicks.map((v) => (
          <g key={v}>
            <line x1={PAD_L} y1={yOf(v)} x2={W - PAD_R} y2={yOf(v)} stroke="var(--border-subtle)" strokeWidth={1} />
            <text x={PAD_L - 7} y={yOf(v) + 3} textAnchor="end" fontSize={10} fill="var(--text-muted)">{v.toLocaleString()}</text>
            <text x={W - PAD_R + 7} y={yOf(v) + 3} textAnchor="start" fontSize={10} fill="var(--text-muted)">{Math.round(v / 1.8).toLocaleString()}</text>
          </g>
        ))}
        {visibleMonths.map((m) => (
          <g key={m.d}>
            <line x1={xOf(m.d)} y1={PAD_T} x2={xOf(m.d)} y2={H - PAD_B} stroke="var(--border-subtle)" strokeWidth={0.75} opacity={0.6} />
            <text x={xOf(m.d)} y={H - PAD_B + 15} textAnchor="middle" fontSize={10} fill="var(--text-muted)">{m.label}</text>
          </g>
        ))}
        <text x={12} y={H / 2} transform={`rotate(-90 12 ${H / 2})`} textAnchor="middle" fontSize={10.5} fill="var(--text-secondary)">Cumulative GDD (°F)</text>
        <text x={W - 10} y={H / 2} transform={`rotate(90 ${W - 10} ${H / 2})`} textAnchor="middle" fontSize={10.5} fill="var(--text-secondary)">Cumulative GDD (°C)</text>
        <g clipPath="url(#gddplot)">
          {ordered.map((s) => (
            <path key={s.key} d={pathD(s)} fill="none" stroke={s.color} strokeWidth={s.emphasis ? 3 : 1.75} strokeDasharray={s.dash} strokeLinejoin="round" opacity={s.emphasis ? 1 : 0.9} />
          ))}
          {hoverX !== null && !drag.current && (
            <>
              <line x1={hoverX} y1={PAD_T} x2={hoverX} y2={H - PAD_B} stroke="var(--text-primary)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
              {readout?.map(({ s, v }) => (
                <circle key={s.key} cx={hoverX} cy={yOf(v as number)} r={s.emphasis ? 4.5 : 3.5} fill={s.color} stroke="var(--surface-raised)" strokeWidth={1.5} />
              ))}
            </>
          )}
        </g>
      </svg>

      {hoverDay !== null && readout && !drag.current ? (
        <div style={{ border: "1px solid var(--border-default)", borderRadius: 8, padding: "8px 12px", background: "var(--surface-raised)" }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6, color: "var(--text-primary)" }}>
            {dayLabel(hoverDay)} <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(day {Math.round(hoverDay) + 1} of season)</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 18px", fontSize: 12.5 }}>
            {readout.map(({ s, v }) => (
              <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: s.emphasis ? 600 : 400, color: "var(--text-primary)" }}>
                <span style={{ display: "inline-block", width: 14, height: s.emphasis ? 4 : 3, background: s.dash ? undefined : s.color, borderTop: s.dash ? `2px dashed ${s.color}` : undefined }} />
                {s.label}: <strong style={{ fontVariantNumeric: "tabular-nums" }}>{(v as number).toLocaleString()}</strong>&nbsp;°F ({Math.round((v as number) / 1.8).toLocaleString()}&nbsp;°C)
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", fontSize: 12.5 }}>
          {series.map((s) => (
            <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: s.emphasis ? 600 : 400, color: "var(--text-primary)" }}>
              <span style={{ display: "inline-block", width: 18, height: s.emphasis ? 4 : 3, background: s.dash ? undefined : s.color, borderTop: s.dash ? `2px dashed ${s.color}` : undefined }} />
              {s.label} <strong style={{ fontVariantNumeric: "tabular-nums" }}>{s.totalF.toLocaleString()}</strong>&nbsp;°F
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
