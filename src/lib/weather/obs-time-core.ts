// VI-P8 council R2 — observation-time normalization, the "Y-FLIP of weather".
// Maps each provider record's SOURCE day into the canonical vineyard-LOCAL civil day (`localDate`) BEFORE
// storage, so cross-provider daily joins line up and "frost last night" resolves to the right day. Pure:
// (records + obsConvention) in, localDate-keyed wide records out. Invoked at ingest (Unit 5), where the
// vineyard tz is known; providers themselves stay tz-agnostic.
//
// The load-bearing case is AM-observation stations (COOP/ACIS): a value stamped ~7–8am LST covers the PRIOR
// 24h, so the standard met shift assigns Tmax (and the prior-24h precip) to date−1 and Tmin to the obs date.
// Get this wrong and a frost lands a day off. Grids are already civil-day bucketed → pass through.

import type { DailyRecord, ObsConvention, ProviderSeries } from "./providers/types";

/** A daily observation already keyed by the canonical vineyard-local civil day. */
export interface LocalDailyRecord {
  localDate: string; // ISO YYYY-MM-DD, vineyard-local civil day
  tmaxC: number | null;
  tminC: number | null;
  precipMm: number | null;
  rhMaxPct: number | null;
  rhMinPct: number | null;
}

/** Pure ISO-day arithmetic (UTC-anchored so no tz/DST drift in the civil-day index). */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function emptyLocal(localDate: string): LocalDailyRecord {
  return { localDate, tmaxC: null, tminC: null, precipMm: null, rhMaxPct: null, rhMinPct: null };
}

/**
 * Map one provider's records into vineyard-local civil days.
 * - `AM_LST`   → met shift: Tmax + prior-24h precip → date−1; Tmin → date. (RH, if any, stays on the obs date.)
 * - `MIDNIGHT_LOCAL` / `UTC` → the source day already IS the local civil day (screening-grade; sub-daily
 *   reconstruction for large UTC offsets is a documented Later item). Pass through 1:1.
 *
 * Returns records sorted ascending by localDate. Partial edge days (a leading Tmin-only or trailing Tmax-only)
 * are legitimate nulls — season math carries a completeness % rather than fabricating the missing half.
 */
export function mapRecordsToLocalDaily(records: DailyRecord[], obsConvention: ObsConvention): LocalDailyRecord[] {
  const byLocal = new Map<string, LocalDailyRecord>();
  const ensure = (localDate: string): LocalDailyRecord => {
    let r = byLocal.get(localDate);
    if (!r) {
      r = emptyLocal(localDate);
      byLocal.set(localDate, r);
    }
    return r;
  };

  for (const rec of records) {
    if (obsConvention === "AM_LST") {
      const prev = addDaysIso(rec.sourceDate, -1);
      if (rec.tmaxC !== null) ensure(prev).tmaxC = rec.tmaxC;
      if (rec.precipMm !== null) ensure(prev).precipMm = rec.precipMm;
      if (rec.tminC !== null) ensure(rec.sourceDate).tminC = rec.tminC;
      if (rec.rhMaxPct !== null) ensure(rec.sourceDate).rhMaxPct = rec.rhMaxPct;
      if (rec.rhMinPct !== null) ensure(rec.sourceDate).rhMinPct = rec.rhMinPct;
    } else {
      // Grid: source day is the civil day. Merge (last write wins on a duplicate source day).
      const dst = ensure(rec.sourceDate);
      dst.tmaxC = rec.tmaxC;
      dst.tminC = rec.tminC;
      dst.precipMm = rec.precipMm;
      dst.rhMaxPct = rec.rhMaxPct;
      dst.rhMinPct = rec.rhMinPct;
    }
  }

  return [...byLocal.values()].sort((a, b) => (a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0));
}

/** Convenience: map a whole ProviderSeries. */
export function mapSeriesToLocalDaily(series: ProviderSeries): LocalDailyRecord[] {
  return mapRecordsToLocalDaily(series.records, series.obsConvention);
}
