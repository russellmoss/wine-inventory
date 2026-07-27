// VI-P8 council R5 — Growing Degree Days. Daily GDD = MAX(0, MIN(capC, (Tmax+Tmin)/2) − baseC).
// CAP THE AVERAGE, not Tmax (the common mistake). base 10 °C; cap optional (30 °C default when enabled).
// Baskerville-Emin single-sine is a documented Later option (growers comparing to UC Davis will ask).
// Pure. Aggregation is strictly per-source with a day count — never blended across providers (R3).

import type { LocalDailyRecord } from "./obs-time-core";

export interface GddOptions {
  baseC?: number; // default 10
  capC?: number | null; // optional upper cap on the daily MEAN; null/undefined = uncapped
}

/** Daily GDD for one day. Returns null when either temp is missing (never treated as 0). */
export function dailyGdd(tmaxC: number | null, tminC: number | null, opts: GddOptions = {}): number | null {
  if (tmaxC === null || tminC === null) return null;
  const baseC = opts.baseC ?? 10;
  let mean = (tmaxC + tminC) / 2;
  if (opts.capC !== null && opts.capC !== undefined) mean = Math.min(opts.capC, mean);
  return Math.max(0, mean - baseC);
}

export interface GddAccumulation {
  gddTotal: number;
  daysCounted: number; // days that contributed (both temps present)
}

/** Accumulate GDD over a series (already filtered to the window of interest). Per-source; no gap-fill. */
export function accumulateGdd(records: LocalDailyRecord[], opts: GddOptions = {}): GddAccumulation {
  let gddTotal = 0;
  let daysCounted = 0;
  for (const r of records) {
    const g = dailyGdd(r.tmaxC, r.tminC, opts);
    if (g !== null) {
      gddTotal += g;
      daysCounted += 1;
    }
  }
  return { gddTotal: Math.round(gddTotal * 100) / 100, daysCounted };
}
