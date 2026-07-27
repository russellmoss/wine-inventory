// Plan 096 Phase 1 Unit 8 — the rainfall-over-time series, PURE (rows in, chart DTO out). Feeds the
// RainfallChart: one bar per day + a cumulative overlay + the stats rainfall-core already computes
// but the UI never showed (audit §9a). NEVER-BLEND, day-labeled: each day comes from exactly ONE
// source — the PRIMARY where it has a reading, else the designated HISTORY provider (gridMET /
// NASA POWER — the only sources that carry deep off-season history), stamped `source:"history"`
// (the gapFillCore idiom: a labeled read-time composition, never an average, never a stored row).
// Without the labeled fallback a station-primary vineyard's chart is EMPTY beyond the station's
// ingested window — measured on Russian River Ranch (rcc_acis primary: 0 January readings; the
// winter rows live under gridmet). Days neither source covers stay GAPS (null), counted honestly.
// Range arithmetic is ISO-string only (addDaysIso, UTC-anchored); caller passes site-local dates.

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
  /** null = NEITHER source has a reading that day — a GAP in the bars, never a zero. */
  precipMm: number | null;
  /** Which single source this day's reading came from (absent when precipMm is null). */
  source?: "primary" | "history";
  /** Running total over the range (missing days contribute 0 — the line is still labeled an estimate). */
  cumulativeMm: number;
}

export interface RainfallRangeResult {
  providerKey: string;
  /** The history provider that labeled fills came from, when any did. */
  historyProviderKey: string | null;
  startIso: string;
  endIso: string;
  days: RainfallRangeDay[];
  stats: RainfallResult & {
    /** Days from endIso back to the last measurable (≥1 mm) rain day, 0 = it rained on endIso; null = none in range. */
    daysSinceLastRain: number | null;
    /** Days in the range with NO reading from either source — honesty, not an error. */
    missingDays: number;
    /** Days whose reading came from the labeled history provider, not the primary. */
    filledDays: number;
  };
}

/** Compose the range series from pre-fetched rows. Throws on an invalid or over-cap range. */
export function composeRainfallRangeCore(input: {
  rows: RainfallRangeRow[];
  primaryProviderKey: string;
  /** The deep-history source (gridmet US / nasa_power global) — labeled per-day fallback, never an average. */
  historyProviderKey?: string | null;
  startIso: string;
  endIso: string;
}): RainfallRangeResult {
  const { rows, primaryProviderKey, startIso, endIso } = input;
  const historyProviderKey = input.historyProviderKey && input.historyProviderKey !== primaryProviderKey ? input.historyProviderKey : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startIso) || !/^\d{4}-\d{2}-\d{2}$/.test(endIso)) {
    throw new Error("Invalid date range.");
  }
  if (endIso < startIso) throw new Error("Range end is before its start.");

  const primaryByDate = new Map<string, number | null>();
  const historyByDate = new Map<string, number | null>();
  for (const r of rows) {
    if (r.localDate < startIso || r.localDate > endIso) continue;
    if (r.providerKey === primaryProviderKey) primaryByDate.set(r.localDate, r.precipMm);
    else if (historyProviderKey && r.providerKey === historyProviderKey) historyByDate.set(r.localDate, r.precipMm);
  }

  const days: RainfallRangeDay[] = [];
  let cumulative = 0;
  let missingDays = 0;
  let filledDays = 0;
  let lastRainDate: string | null = null;
  for (let d = startIso; d <= endIso; d = addDaysIso(d, 1)) {
    if (days.length >= RAINFALL_RANGE_MAX_DAYS) {
      throw new Error(`Range too long — the rainfall chart caps at ${RAINFALL_RANGE_MAX_DAYS} days (24 months).`);
    }
    // ONE source per day, primary first — a labeled pick, never a mix.
    let precipMm: number | null = null;
    let source: "primary" | "history" | undefined;
    if (primaryByDate.has(d) && primaryByDate.get(d) !== null) {
      precipMm = primaryByDate.get(d)!;
      source = "primary";
    } else if (historyByDate.has(d) && historyByDate.get(d) !== null) {
      precipMm = historyByDate.get(d)!;
      source = "history";
      filledDays += 1;
    }
    if (precipMm === null) missingDays += 1;
    else {
      cumulative += precipMm;
      if (precipMm >= WET_DAY_MM) lastRainDate = d;
    }
    days.push({ localDate: d, precipMm, ...(source ? { source } : {}), cumulativeMm: Math.round(cumulative * 100) / 100 });
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

  return {
    providerKey: primaryProviderKey,
    historyProviderKey: filledDays > 0 ? historyProviderKey : null,
    startIso,
    endIso,
    days,
    stats: { ...base, daysSinceLastRain, missingDays, filledDays },
  };
}
