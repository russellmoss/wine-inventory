"use client";

// Plan 096 U9 — the "Rainfall over time" section: preset range control (Last 30 days default /
// Last 7 / Custom via native date inputs — no date-picker library), the stats row rainfall-core
// always computed but the UI never showed, the bars+cumulative chart, and the honesty label.
// Last-used range persists in localStorage. The empty state NAMES the empty range and offers to
// widen it — never a bare axis.

import React from "react";
import { loadVineyardRainfallRange } from "@/lib/weather/actions";
import type { RainfallRangeResult } from "@/lib/weather/rainfall-range-core";
import { formatPrecip, type UnitSystem } from "@/lib/weather/units-core";
import { RainfallChart } from "./RainfallChart";

type Preset = "30d" | "7d" | "custom";
const STORE_KEY = "cellarhand.weather.rainfallRange";

const label: React.CSSProperties = { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--text-muted)" };
const card: React.CSSProperties = { border: "1px solid var(--border-default)", borderRadius: 12, padding: 18, background: "var(--surface-raised)" };

function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function Stat({ title, value }: { title: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={label}>{title}</div>
      <div style={{ marginTop: 2, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

/** Last-used range from localStorage (lazy initializers — this component is ssr:false, so no hydration split). */
function readStore(): { preset?: Preset; customStart?: string; customEnd?: string } {
  try {
    if (typeof window === "undefined") return {};
    const raw = window.localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as { preset?: Preset; customStart?: string; customEnd?: string }) : {};
  } catch {
    return {}; // a corrupt store never blocks the chart
  }
}

export function RainfallSection({ vineyardId, unitSystem }: { vineyardId: string; unitSystem: UnitSystem }) {
  const [preset, setPreset] = React.useState<Preset>(() => {
    const p = readStore().preset;
    return p === "30d" || p === "7d" || p === "custom" ? p : "30d";
  });
  const [customStart, setCustomStart] = React.useState<string>(() => readStore().customStart ?? isoDaysAgo(90));
  const [customEnd, setCustomEnd] = React.useState<string>(() => readStore().customEnd ?? todayIso());
  const [data, setData] = React.useState<RainfallRangeResult | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const startIso = preset === "30d" ? isoDaysAgo(29) : preset === "7d" ? isoDaysAgo(6) : customStart;
  const endIso = preset === "custom" ? customEnd : todayIso();

  React.useEffect(() => {
    let cancelled = false;
    if (!vineyardId || !startIso || !endIso) return;
    // Async IIFE (the WeatherCard auto-fetch idiom) — no synchronous setState in the effect body.
    void (async () => {
      setLoading(true);
      setErr(null);
      const res = await loadVineyardRainfallRange(vineyardId, startIso, endIso);
      if (cancelled) return;
      setLoading(false);
      if (res.ok) setData(res.range);
      else {
        setData(null);
        setErr(res.error);
      }
    })();
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ preset, customStart, customEnd }));
    } catch {
      /* storage full/blocked — the chart still works */
    }
    return () => {
      cancelled = true;
    };
  }, [vineyardId, startIso, endIso, preset, customStart, customEnd]);

  const hasAnyReading = data ? data.days.length - data.stats.missingDays > 0 : false;
  const presetBtn = (p: Preset, text: string) => (
    <button
      key={p}
      onClick={() => setPreset(p)}
      style={{ padding: "4px 10px", borderRadius: 6, fontSize: 13, cursor: "pointer", border: "1px solid var(--border-default)", background: preset === p ? "var(--accent)" : "transparent", color: preset === p ? "var(--accent-on)" : "var(--text-secondary)" }}
    >
      {text}
    </button>
  );

  return (
    <div style={{ ...card, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div style={label}>Rainfall over time</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {presetBtn("30d", "Last 30 days")}
          {presetBtn("7d", "Last 7 days")}
          {presetBtn("custom", "Custom")}
          {preset === "custom" && (
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input type="date" value={customStart} max={customEnd} onChange={(e) => setCustomStart(e.target.value)} aria-label="Range start" style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid var(--border-default)", background: "var(--surface-raised)", color: "var(--text-primary)", fontSize: 13 }} />
              <span style={{ color: "var(--text-muted)" }}>→</span>
              <input type="date" value={customEnd} min={customStart} onChange={(e) => setCustomEnd(e.target.value)} aria-label="Range end" style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid var(--border-default)", background: "var(--surface-raised)", color: "var(--text-primary)", fontSize: 13 }} />
            </span>
          )}
        </div>
      </div>

      {err && <div style={{ color: "var(--danger)", fontSize: 13 }}>{err}</div>}
      {loading && !data && <div style={{ ...label, textTransform: "none" }}>Loading rainfall…</div>}

      {data && hasAnyReading && (
        <>
          <div style={{ display: "flex", gap: "10px 26px", flexWrap: "wrap", alignItems: "baseline" }}>
            <div>
              <div style={label}>Period total</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 32, lineHeight: 1.05 }}>{formatPrecip(data.stats.totalMm, unitSystem)}</div>
            </div>
            <Stat title="Rain days" value={data.stats.wetDays} />
            <Stat title="Wettest day" value={formatPrecip(data.stats.wettestDayMm, unitSystem)} />
            <Stat title="Longest dry streak" value={`${data.stats.longestDryStreakDays} days`} />
            <Stat title="Since last rain" value={data.stats.daysSinceLastRain === null ? "—" : `${data.stats.daysSinceLastRain} days`} />
          </div>
          <RainfallChart days={data.days} unitSystem={unitSystem} />
          <div style={{ ...label, textTransform: "none" }}>
            Regional Rainfall Estimate (≈4 km average, not your rain gauge).
            {data.stats.missingDays > 0 && ` ${data.stats.missingDays} of ${data.days.length} days have no reading from the primary source — gaps, not zeros.`}
          </div>
        </>
      )}

      {data && !hasAnyReading && !loading && (
        <div style={{ display: "grid", gap: 8 }}>
          <div>
            No rainfall readings between <strong>{data.startIso}</strong> and <strong>{data.endIso}</strong> from this vineyard&apos;s primary source.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => {
                setPreset("custom");
                setCustomStart(isoDaysAgo(365));
                setCustomEnd(todayIso());
              }}
              style={{ justifySelf: "start", padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border-default)", background: "var(--accent)", color: "var(--accent-on)", cursor: "pointer", fontSize: 13 }}
            >
              Widen to the last 12 months
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
