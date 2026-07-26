// VI-P8 council R4 — hemisphere-aware growing season + SeasonYear.
// The Northern growing season (Apr 1–Oct 31) sits inside one calendar year; the Southern season (Oct 1–Apr 30)
// CROSSES the calendar year, so year-over-year comparison MUST key off SeasonYear, never the calendar year.
// SeasonYear follows the vintage convention: the year the season ENDS (a SH season Oct 2023–Apr 2024 = 2024).
// Equatorial / continuous-growth sites are a documented known gap (they get the NH window as a default).
// Pure; every Winkler/GST/frost/YoY read derives its window from here.

import type { LocalDailyRecord } from "./obs-time-core";

export type Hemisphere = "N" | "S";

export function hemisphereFor(latitude: number): Hemisphere {
  return latitude < 0 ? "S" : "N";
}

/** The SeasonYear a given local civil day belongs to (labelled by the season's END year). */
export function seasonYearFor(latitude: number, localDate: string): number {
  const year = Number(localDate.slice(0, 4));
  const month = Number(localDate.slice(5, 7));
  if (hemisphereFor(latitude) === "S") {
    // SH season spans Oct(Y-1) .. Apr(Y). Oct–Dec belong to the NEXT year's season.
    return month >= 10 ? year + 1 : year;
  }
  return year;
}

/** Inclusive [start, end] ISO bounds of the growing-season window for a SeasonYear. */
export function seasonWindowFor(latitude: number, seasonYear: number): { startIso: string; endIso: string } {
  if (hemisphereFor(latitude) === "S") {
    // Ends Apr 30 of seasonYear; starts Oct 1 of the prior year.
    return { startIso: `${seasonYear - 1}-10-01`, endIso: `${seasonYear}-04-30` };
  }
  return { startIso: `${seasonYear}-04-01`, endIso: `${seasonYear}-10-31` };
}

export function isInGrowingSeason(latitude: number, localDate: string): boolean {
  const { startIso, endIso } = seasonWindowFor(latitude, seasonYearFor(latitude, localDate));
  return localDate >= startIso && localDate <= endIso;
}

/** Keep only the records inside one SeasonYear's growing-season window, sorted ascending. */
export function filterToSeason(records: LocalDailyRecord[], latitude: number, seasonYear: number): LocalDailyRecord[] {
  const { startIso, endIso } = seasonWindowFor(latitude, seasonYear);
  return records
    .filter((r) => r.localDate >= startIso && r.localDate <= endIso)
    .sort((a, b) => (a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0));
}

/** Inclusive count of civil days in a window (for completeness %). */
export function windowDayCount(startIso: string, endIso: string): number {
  const a = new Date(`${startIso}T00:00:00.000Z`).getTime();
  const b = new Date(`${endIso}T00:00:00.000Z`).getTime();
  return Math.floor((b - a) / 86_400_000) + 1;
}

/**
 * Completeness of a series against a window: fraction of window days that have BOTH temps present (the pair
 * GDD needs). Council R3 — every aggregate carries this so a partial station total is never silently compared
 * to a complete grid total.
 */
export function seasonCompleteness(
  records: LocalDailyRecord[],
  latitude: number,
  seasonYear: number,
  today?: string,
): { daysWithTemps: number; windowDays: number; fraction: number } {
  const { startIso, endIso } = seasonWindowFor(latitude, seasonYear);
  // Season-to-date: cap the window at `today` if the season is still running.
  const effEnd = today && today < endIso && today >= startIso ? today : endIso;
  const inWindow = records.filter((r) => r.localDate >= startIso && r.localDate <= effEnd);
  const daysWithTemps = inWindow.filter((r) => r.tmaxC !== null && r.tminC !== null).length;
  const windowDays = windowDayCount(startIso, effEnd);
  return { daysWithTemps, windowDays, fraction: windowDays === 0 ? 0 : daysWithTemps / windowDays };
}
