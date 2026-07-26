"use client";

// Plan 097 U5 — the day-detail modal. Opens from a day-card tap; the shared Modal supplies the
// #310 backdrop-origin guard, Escape, scroll lock, and aria. Data comes from stored rows on open
// (async-inside-open-modal per the TimelineEntryDetail precedent — never a live provider fetch).
// The headline line says the crossing in words ("drops below 32 °F ~1 AM"); the chart shows the
// same numbers as reference lines — copy and picture from ONE core, so they can't disagree.
// maxWidth ≈ 720 matches the chart's 680 viewBox (the "don't squash the SVG" note — this is the
// repo's first chart-in-a-modal).

import React from "react";
import { Modal } from "@/components/ui";
import { loadVineyardForecastHours } from "@/lib/weather/actions";
import type { ForecastHourlyDay } from "@/lib/weather/forecast-hourly-read-core";
import { formatPrecip, formatTemp, normalizeUnitSystem } from "@/lib/weather/units-core";
import { HourlyChart, type ThresholdLine } from "./HourlyChart";

const label: React.CSSProperties = { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--text-muted)" };

function dayTitle(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}
function hourPhrase(h: number): string {
  if (h === 0) return "midnight";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "noon";
  return `${h - 12} PM`;
}

export function ForecastDayModal({
  vineyardId,
  targetDate,
  providerName,
  reducedConfidence,
  onClose,
}: {
  vineyardId: string;
  targetDate: string;
  providerName: string;
  reducedConfidence: boolean;
  onClose: () => void;
}) {
  const [state, setState] = React.useState<Awaited<ReturnType<typeof loadVineyardForecastHours>> | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await loadVineyardForecastHours(vineyardId, targetDate);
      if (!cancelled) setState(res);
    })();
    return () => {
      cancelled = true;
    };
  }, [vineyardId, targetDate]);

  const ok = state?.ok ? state : null;
  const day: ForecastHourlyDay | null = ok?.day ?? null;
  const unit = normalizeUnitSystem(ok?.unitSystem);
  const thresholds: ThresholdLine[] = ok
    ? [
        { valueC: ok.thresholds.hardFreezeC, label: "Hard freeze", danger: true },
        { valueC: ok.thresholds.frostWarnC, label: "Frost", danger: true },
        { valueC: ok.thresholds.heatWatchC, label: "Heat", danger: false },
        { valueC: ok.thresholds.extremeHeatC, label: "Extreme heat", danger: true },
      ]
    : [];

  const crossing =
    day?.summary.firstFrostHour !== null && day?.summary.firstFrostHour !== undefined
      ? `drops below ${ok ? formatTemp(ok.thresholds.frostWarnC, unit) : "freezing"} around ${hourPhrase(day.summary.firstFrostHour)}`
      : day?.summary.firstHeatHour !== null && day?.summary.firstHeatHour !== undefined
        ? `reaches ${ok ? formatTemp(ok.thresholds.heatWatchC, unit) : "heat-watch"} around ${hourPhrase(day.summary.firstHeatHour)}`
        : null;

  return (
    <Modal
      open
      onClose={onClose}
      title={dayTitle(targetDate)}
      subtitle={
        <>
          Hour by hour · {providerName}
          {reducedConfidence && " · lower confidence (day 6–7)"}
          {crossing && (
            <>
              {" · "}
              <strong>{crossing}</strong>
            </>
          )}
        </>
      }
      maxWidth={720}
    >
      {!state && <div style={{ ...label, textTransform: "none" }}>Loading hourly detail…</div>}
      {state && !state.ok && <div style={{ color: "var(--danger)", fontSize: 13 }}>{state.error}</div>}
      {ok && !day && (
        <div style={{ ...label, textTransform: "none" }}>
          Hourly detail isn&apos;t in yet for this day — it loads with the forecast refresh (every 6 hours on view).
        </div>
      )}
      {ok && day && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: "8px 24px", flexWrap: "wrap" }}>
            <div>
              <div style={label}>High / Low</div>
              <div style={{ fontWeight: 600 }}>
                {formatTemp(day.summary.maxTempC, unit)} / {formatTemp(day.summary.minTempC, unit)}
              </div>
            </div>
            <div>
              <div style={label}>Expected rain</div>
              <div style={{ fontWeight: 600 }}>{day.summary.totalPrecipMm > 0 ? formatPrecip(day.summary.totalPrecipMm, unit) : "—"}</div>
            </div>
          </div>
          <HourlyChart slots={day.slots} thresholds={thresholds} unitSystem={unit} nowLocalHour={ok.nowLocalHour} />
          <div style={{ ...label, textTransform: "none" }}>
            Forecast, not a measurement — timing shifts as new model runs arrive.
            {day.summary.hasSpanningBucket && " A rain interval continues past midnight (→ on the chart); its full amount is shown on the day it starts."}
          </div>
        </div>
      )}
    </Modal>
  );
}
