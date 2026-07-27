// VI-P8 — heat stress as day counts over thresholds (Tmax ≥ threshold). Pure. Screening-grade.

import type { LocalDailyRecord } from "./obs-time-core";

export interface HeatResult {
  thresholdsC: number[];
  /** Day counts keyed by threshold, e.g. { "30": 42, "35": 11, "38": 2 }. */
  daysOverByThreshold: Record<string, number>;
  hottestDayC: number | null;
  daysCounted: number;
}

export function heatDays(records: LocalDailyRecord[], thresholdsC: number[] = [30, 35, 38]): HeatResult {
  const daysOverByThreshold: Record<string, number> = {};
  for (const t of thresholdsC) daysOverByThreshold[String(t)] = 0;
  let hottestDayC: number | null = null;
  let daysCounted = 0;
  for (const r of records) {
    if (r.tmaxC === null) continue;
    daysCounted += 1;
    if (hottestDayC === null || r.tmaxC > hottestDayC) hottestDayC = r.tmaxC;
    for (const t of thresholdsC) if (r.tmaxC >= t) daysOverByThreshold[String(t)] += 1;
  }
  return { thresholdsC, daysOverByThreshold, hottestDayC, daysCounted };
}
