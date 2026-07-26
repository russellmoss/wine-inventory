// Plan 096 Phase 1 Unit 8 — the rainfall-over-time series, PURE (rows in, chart DTO out). Feeds the
// RainfallChart: one bar per day + a cumulative overlay + the stats rainfall-core already computes
// but the UI never showed (audit §9a). NEVER-BLEND: the series is the PRIMARY provider's rows only —
// a day the primary lacks renders as a GAP (precipMm null), not a fill from another source; the
// count of those gaps is surfaced honestly (missingDays). Range arithmetic is ISO-string only
// (addDaysIso, UTC-anchored) — the caller passes site-local start/end from site-time-core.

import { addDaysIso } from "./obs-time-core";
import { rainfall, type RainfallResult } from "./rainfall-core";

/** Custom ranges cap at 24 months per query (spec §1.3). */
export const RAINFALL_RANGE_MAX_DAYS = 731;

/** A day with a precip reading ≥ this many mm counts as "rain" (matches rainfall-core's wetDayMm). */
const WET_DAY_MM = 1;

export interface RainfallRangeRow {
  providerKey: string;
  localDate: string; // YYYY-MM-DD
  precipMm: number | null;
}

export interface RainfallRangeDay {
  localDate: string;
  /** null = the primary has no reading that day — a GAP in the bars, never a zero. */
  precipMm: number | null;
  /** Running total over the range (missing days contribute 0 — the line is still labeled an estimate). */
  cumulativeMm: number;
}

export interface RainfallRangeResult {
  providerKey: string;
  startIso: string;
  endIso: string;
  days: RainfallRangeDay[];
  stats: RainfallResult & {
    /** Days from endIso back to the last measurable (≥1 mm) rain day, 0 = it rained on endIso; null = none in range. */
    daysSinceLastRain: number | null;
    /** Days in the range with NO reading from the primary — honesty, not an error. */
    missingDays: number;
  };
}

/** Compose the range series from pre-fetched rows. Throws on an invalid or over-cap range. */
export function composeRainfallRangeCore(input: {
  rows: RainfallRangeRow[];
  primaryProviderKey: string;
  startIso: string;
  endIso: string;
}): RainfallRangeResult {
  const { rows, primaryProviderKey, startIso, endIso } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startIso) || !/^\d{4}-\d{2}-\d{2}$/.test(endIso)) {
    throw new Error("Invalid date range.");
  }
  if (endIso < startIso) throw new Error("Range end is before its start.");

  // Span check without Date math: walk is bounded by the cap.
  const byDate = new Map<string, number | null>();
  for (const r of rows) {
    if (r.providerKey !== primaryProviderKey) continue; // never-blend: primary only
    if (r.localDate < startIso || r.localDate > endIso) continue;
    byDate.set(r.localDate, r.precipMm);
  }

  const days: RainfallRangeDay[] = [];
  let cumulative = 0;
  let missingDays = 0;
  let lastRainDate: string | null = null;
  for (let d = startIso; d <= endIso; d = addDaysIso(d, 1)) {
    if (days.length >= RAINFALL_RANGE_MAX_DAYS) {
      throw new Error(`Range too long — the rainfall chart caps at ${RAINFALL_RANGE_MAX_DAYS} days (24 months).`);
    }
    const precipMm = byDate.has(d) ? byDate.get(d)! : null;
    if (precipMm === null) missingDays += 1;
    else {
      cumulative += precipMm;
      if (precipMm >= WET_DAY_MM) lastRainDate = d;
    }
    days.push({ localDate: d, precipMm, cumulativeMm: Math.round(cumulative * 100) / 100 });
  }

  const base = rainfall(
    days.map((d) => ({ localDate: d.localDate, precipMm: d.precipMm, tmaxC: null, tminC: null, rhMaxPct: null, rhMinPct: null })),
    WET_DAY_MM,
  );
  // Days since last measurable rain, counted from endIso (0 = rained on the last day).
  let daysSinceLastRain: number | null = null;
  if (lastRainDate !== null) {
    let n = 0;
    for (let d = lastRainDate; d < endIso; d = addDaysIso(d, 1)) n += 1;
    daysSinceLastRain = n;
  }

  return { providerKey: primaryProviderKey, startIso, endIso, days, stats: { ...base, daysSinceLastRain, missingDays } };
}
