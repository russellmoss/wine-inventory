"use client";

// Plan 096 U16 — the 7-day forecast strip. Seven cards: day + date, condition icon, high dominant /
// low secondary, expected rainfall AMOUNT (probability secondary), a badge slot (Phase 3). Days 6–7
// render de-emphasized with an explicit "lower confidence" label — precip skill degrades sharply
// past a week and this section never overstates. Horizontal scroll + snap on mobile (Gemini DQ2 —
// never crush the viewport), grid on desktop. STALE data still renders, labeled with its issuedAt —
// a six-hour-old forecast beats a spinner; the on-view refresh replaces it in the background.
// Day-1 with a missing high (evening NWS fetch) shows "—", honestly. Cross-provider disagreement
// is a one-line spread note — never an average. Open-Meteo attribution (CC BY) renders when it's
// the displayed source.

import React from "react";
import { loadVineyardForecast, refreshVineyardForecast } from "@/lib/weather/actions";
import type { ForecastView } from "@/lib/weather/forecast-read-core";
import type { NwsActiveAlert } from "@/lib/weather/providers/nws-alerts";
import { tierLabel } from "@/lib/weather/alert-core";
import { formatPrecip, formatTemp, gddCToF, normalizeUnitSystem } from "@/lib/weather/units-core";
import { ConditionIcon, conditionLabel } from "./ConditionIcon";
import type { ConditionCode } from "@/lib/weather/providers/forecast-types";

const label: React.CSSProperties = { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--text-muted)" };

function dayName(iso: string, todayIso: string): string {
  if (iso === todayIso) return "Today";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}
function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Badge chip styling by tier family (tokens; dormant frost renders muted — info, not emergency). */
function badgeStyle(tier: string, dormant: boolean): React.CSSProperties {
  const danger = tier === "FROST_WARNING" || tier === "HARD_FREEZE" || tier === "EXTREME_HEAT";
  const color = dormant ? "var(--text-muted)" : danger ? "var(--danger)" : "var(--warning)";
  return { fontSize: 9.5, fontWeight: 700, color, border: `1px solid ${color}`, borderRadius: 5, padding: "1px 5px", textTransform: "uppercase", letterSpacing: 0.4 };
}

export function ForecastStrip({ vineyardId }: { vineyardId: string }) {
  const [view, setView] = React.useState<ForecastView | null>(null);
  const [unitRaw, setUnitRaw] = React.useState<string>("METRIC");
  const [alerts, setAlerts] = React.useState<NwsActiveAlert[]>([]);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const tried = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setErr(null);
      const res = await loadVineyardForecast(vineyardId);
      if (cancelled) return;
      if (!res.ok) {
        setLoading(false);
        setErr(res.error);
        return;
      }
      setView(res.view);
      setUnitRaw(res.unitSystem);
      setAlerts(res.activeAlerts);
      setLoading(false);
      // Forecast should "just be there" and stay fresh: fetch when empty or older than the 6-hour
      // cadence — ONCE per vineyard per mount (a failure renders the stored copy, not an error).
      if ((res.view === null || res.stale) && !tried.current.has(vineyardId)) {
        tried.current.add(vineyardId);
        const refreshed = await refreshVineyardForecast(vineyardId);
        if (cancelled || !refreshed.ok) return;
        const again = await loadVineyardForecast(vineyardId);
        if (!cancelled && again.ok) {
          setView(again.view);
          setUnitRaw(again.unitSystem);
          setAlerts(again.activeAlerts);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vineyardId]);

  const unit = normalizeUnitSystem(unitRaw);
  if (loading && !view) return <div style={{ ...label, textTransform: "none" }}>Loading forecast…</div>;
  if (!view) {
    return err ? <div style={{ ...label, textTransform: "none" }}>Forecast unavailable right now — showing climate data below.</div> : null;
  }

  const todayIso = view.days[0]?.targetDate ?? "";
  const issuedLabel = new Date(view.issuedAt).toLocaleString();

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {/* Official NWS active alerts (U22) — VERBATIM, authoritative-voice, above everything. */}
      {alerts.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {alerts.map((a, i) => (
            <div key={`${a.event}-${i}`} style={{ border: "1px solid var(--danger)", borderLeftWidth: 4, borderRadius: 8, padding: "8px 12px", background: "var(--surface-raised)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--danger)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Official NWS alert{a.severity ? ` · ${a.severity}` : ""}
              </div>
              <div style={{ fontSize: 13.5, marginTop: 2 }}>{a.headline ?? a.event}</div>
              {a.url && (
                <a href={a.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--accent)" }}>
                  Full advisory
                </a>
              )}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <div style={label}>7-day forecast · {view.providerKey === "nws" ? "US National Weather Service" : "Open-Meteo"}</div>
        <div style={{ ...label, textTransform: "none" }}>Issued {issuedLabel}</div>
      </div>
      <div
        style={{
          display: "grid",
          gridAutoFlow: "column",
          gridAutoColumns: "minmax(96px, 1fr)",
          gap: 8,
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          paddingBottom: 4,
        }}
      >
        {view.days.map((d) => (
          <div
            key={d.targetDate}
            style={{
              border: "1px solid var(--border-default)",
              borderRadius: 10,
              padding: "10px 8px",
              background: "var(--surface-raised)",
              display: "grid",
              gap: 4,
              justifyItems: "center",
              textAlign: "center",
              scrollSnapAlign: "start",
              opacity: d.reducedConfidence ? 0.62 : 1,
            }}
            title={conditionLabel(d.conditionCode as ConditionCode)}
          >
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{dayName(d.targetDate, todayIso)}</div>
            <div style={{ ...label, textTransform: "none", fontSize: 11 }}>{shortDate(d.targetDate)}</div>
            <ConditionIcon code={d.conditionCode as ConditionCode} size={30} />
            <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatTemp(d.tmaxC, unit)}</div>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{formatTemp(d.tminC, unit)}</div>
            <div style={{ fontSize: 11.5, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
              {d.precipMm !== null && d.precipMm > 0 ? formatPrecip(d.precipMm, unit) : "—"}
              {d.precipProbabilityPct !== null && d.precipProbabilityPct > 0 && (
                <span style={{ color: "var(--text-muted)" }}> · {Math.round(d.precipProbabilityPct)}%</span>
              )}
            </div>
            {d.badge && (
              <div style={badgeStyle(d.badge.tier, d.badge.dormant)} title={d.badge.dormant ? "Outside the frost-vulnerable window — information, not an emergency" : undefined}>
                {tierLabel(d.badge.tier)}
              </div>
            )}
            {d.reducedConfidence && <div style={{ fontSize: 10, color: "var(--text-muted)" }}>lower confidence</div>}
          </div>
        ))}
      </div>
      <div style={{ ...label, textTransform: "none", display: "flex", gap: 12, flexWrap: "wrap" }}>
        {view.spread && (
          <span>
            {/* A DELTA scales by 1.8 (like GDD), never the +32 affine map — 3 °C apart is 5.4 °F apart. */}
            Sources differ by up to {unit === "IMPERIAL" ? `${(gddCToF(view.spread.maxTmaxDeltaC)).toFixed(1)} °F` : `${view.spread.maxTmaxDeltaC.toFixed(1)} °C`} on highs across {view.spread.days} overlapping days — we show one source, never an average.
          </span>
        )}
        {view.days.some((d) => d.badge) && (
          <span>Badges are Cellarhand computed thresholds — official advisories show above when issued.</span>
        )}
        {view.providerKey === "open_meteo" && (
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
            Weather data by Open-Meteo.com
          </a>
        )}
      </div>
    </div>
  );
}
