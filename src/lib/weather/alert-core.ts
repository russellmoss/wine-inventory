// VI-P8 Unit 9 — pure frost/heat crossing detection for the sweep's thin inbox alert. Framed "elevated risk
// → check", never "damage occurred". Dedup (don't re-alert the same date) is the caller's job via
// `alreadyAlerted`. Pure + tested.

import type { LocalDailyRecord } from "./obs-time-core";

export type WeatherAlertKind = "FROST" | "HEAT";

export interface WeatherAlert {
  kind: WeatherAlertKind;
  localDate: string;
  valueC: number; // the Tmin (frost) or Tmax (heat) that crossed
}

export interface AlertThresholds {
  frostC?: number; // Tmin ≤ this → FROST (default 0)
  heatC?: number; // Tmax ≥ this → HEAT (default 38)
}

/**
 * Detect frost/heat crossings in a series, excluding dates already alerted. Returns one alert per crossing
 * date (frost takes precedence if a day somehow crosses both — it won't, but be deterministic).
 */
export function detectWeatherAlertsCore(
  series: LocalDailyRecord[],
  thresholds: AlertThresholds = {},
  alreadyAlerted: ReadonlySet<string> = new Set(),
): WeatherAlert[] {
  const frostC = thresholds.frostC ?? 0;
  const heatC = thresholds.heatC ?? 38;
  const out: WeatherAlert[] = [];
  for (const r of series) {
    if (alreadyAlerted.has(r.localDate)) continue;
    if (r.tminC !== null && r.tminC <= frostC) {
      out.push({ kind: "FROST", localDate: r.localDate, valueC: r.tminC });
    } else if (r.tmaxC !== null && r.tmaxC >= heatC) {
      out.push({ kind: "HEAT", localDate: r.localDate, valueC: r.tmaxC });
    }
  }
  return out;
}

/** Grower-facing copy for an alert — risk framing, never a damage claim. */
export function alertMessage(a: WeatherAlert, vineyardName: string): string {
  if (a.kind === "FROST") {
    const severity = a.valueC <= -2 ? "killing-range" : "light";
    return `Frost risk at ${vineyardName}: ${a.valueC.toFixed(1)} °C low on ${a.localDate} (${severity}). Elevated risk — check the vines; this is not a damage report.`;
  }
  return `Heat stress at ${vineyardName}: ${a.valueC.toFixed(1)} °C high on ${a.localDate}. Check irrigation and canopy exposure.`;
}
