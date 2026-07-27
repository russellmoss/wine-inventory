// Plan 096 Phase 1 Unit 6 — the year-round-ingest volume bound, as ONE pure decision. Rainfall
// needs off-season days ("last 30 days" in January), but the climate normals only need season
// months — so history keeps ALL months for the most recent FULL_YEAR_WINDOW_YEARS complete years
// and season-only beyond. The season filter in the MATH cores (filterToSeason at compute time) is
// untouched: storing winter rows never changes GDD/Winkler/GST — proven by
// test/weather-offseason-regression.test.ts and the unmodified climate-math/normals test files.

export const FULL_YEAR_WINDOW_YEARS = 3;

/**
 * Rolling current-ingest window (days back from today). Wide enough that the in-season refresh
 * always covers the whole current season AND the recent off-season for the rainfall chart.
 */
export const ROLLING_INGEST_DAYS = 400;

/** Sweep re-runs the (idempotent, one-request) recent-history backfill when the stamp is older than this. */
export const HISTORY_TOP_UP_DAYS = 30;

/**
 * Keep this backfill day? Full-year inside the recent window (calendar years
 * toYear−(N−1) … toYear); season months only beyond (NH Apr–Oct; SH Oct–Apr).
 */
export function keepBackfillDay(sourceDate: string, toYear: number, nh: boolean): boolean {
  const y = Number(sourceDate.slice(0, 4));
  if (y >= toYear - (FULL_YEAR_WINDOW_YEARS - 1)) return true;
  const m = Number(sourceDate.slice(5, 7));
  return nh ? m >= 4 && m <= 10 : m >= 10 || m <= 4;
}
