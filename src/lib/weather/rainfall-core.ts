// VI-P8 — rainfall accumulation + dry/wet spells. Always low-confidence for a gridded estimate (council R12:
// "Regional Rainfall Estimate — 4 km average, not your rain gauge"). The card copy carries that framing; this
// core just computes. Pure.

import type { LocalDailyRecord } from "./obs-time-core";

export interface RainfallResult {
  totalMm: number;
  daysCounted: number; // days with a (non-null) precip reading
  wetDays: number; // days with precip ≥ wetDayMm
  wettestDayMm: number | null;
  longestDryStreakDays: number; // consecutive days (with readings) below wetDayMm
  /** Always true for gridded data — the UI must not present precip as gauge-accurate. */
  lowConfidence: boolean;
}

export function rainfall(records: LocalDailyRecord[], wetDayMm = 1): RainfallResult {
  const sorted = [...records].sort((a, b) => (a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0));
  let totalMm = 0;
  let daysCounted = 0;
  let wetDays = 0;
  let wettestDayMm: number | null = null;
  let longestDryStreakDays = 0;
  let currentDry = 0;
  for (const r of sorted) {
    if (r.precipMm === null) continue;
    daysCounted += 1;
    totalMm += r.precipMm;
    if (wettestDayMm === null || r.precipMm > wettestDayMm) wettestDayMm = r.precipMm;
    if (r.precipMm >= wetDayMm) {
      wetDays += 1;
      currentDry = 0;
    } else {
      currentDry += 1;
      if (currentDry > longestDryStreakDays) longestDryStreakDays = currentDry;
    }
  }
  return {
    totalMm: Math.round(totalMm * 100) / 100,
    daysCounted,
    wetDays,
    wettestDayMm: wettestDayMm === null ? null : Math.round(wettestDayMm * 100) / 100,
    longestDryStreakDays,
    lowConfidence: true,
  };
}
