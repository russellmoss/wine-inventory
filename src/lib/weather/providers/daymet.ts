// VI-P8 — Daymet (ORNL 1 km NA daily, single-pixel CSV). Historical/baseline only (annual release lags ~3
// months → cannot drive in-season GDD). Council R7: Daymet uses a 365-DAY calendar and DROPS Dec 31 in leap
// years → null-pad Dec 31 at ingest so cross-provider daily joins don't skew. Bucketed on local civil day.

import { fetchText } from "./fetch-util";
import { ProviderFetchError, type ClimateProvider, type DailyRecord, type ProviderSeries } from "./types";

/** ISO for Dec 31 of a leap year, else null. */
export function leapDec31(year: number): string | null {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return isLeap ? `${year}-12-31` : null;
}

function yearDayToIso(year: number, yday: number): string {
  // Daymet yday is 1..365 on a NO-LEAP calendar (Dec 31 dropped in leap years).
  const d = new Date(`${year}-01-01T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + (yday - 1));
  return d.toISOString().slice(0, 10);
}

/**
 * Pure: parse Daymet single-pixel CSV → DailyRecords, and NULL-PAD Dec 31 in leap years so downstream daily
 * joins line up. Header row names include `year`, `yday`, `tmax (deg c)`, `tmin (deg c)`, `prcp (mm/day)`.
 */
export function normalizeDaymetCsv(csv: string): DailyRecord[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const headerIdx = lines.findIndex((l) => /^year,/i.test(l) || /\byear\b.*\byday\b/i.test(l));
  if (headerIdx < 0) throw new ProviderFetchError("daymet", "parse", "no header row");
  const cols = lines[headerIdx].split(",").map((c) => c.trim().toLowerCase());
  const iYear = cols.findIndex((c) => c === "year");
  const iYday = cols.findIndex((c) => c === "yday");
  const iTmax = cols.findIndex((c) => c.startsWith("tmax"));
  const iTmin = cols.findIndex((c) => c.startsWith("tmin"));
  const iPrcp = cols.findIndex((c) => c.startsWith("prcp"));
  if (iYear < 0 || iYday < 0) throw new ProviderFetchError("daymet", "parse", "missing year/yday columns");

  const records: DailyRecord[] = [];
  const leapYears = new Set<number>();
  for (const line of lines.slice(headerIdx + 1)) {
    const f = line.split(",");
    const year = Number(f[iYear]);
    const yday = Number(f[iYday]);
    if (!Number.isFinite(year) || !Number.isFinite(yday)) continue;
    leapYears.add(year);
    records.push({
      sourceDate: yearDayToIso(year, yday),
      tmaxC: iTmax >= 0 ? num(f[iTmax]) : null,
      tminC: iTmin >= 0 ? num(f[iTmin]) : null,
      precipMm: iPrcp >= 0 ? num(f[iPrcp]) : null,
      rhMaxPct: null,
      rhMinPct: null,
    });
  }
  // R7: pad the dropped Dec 31 for any leap year present so the calendar isn't short a day.
  const present = new Set(records.map((r) => r.sourceDate));
  for (const year of leapYears) {
    const dec31 = leapDec31(year);
    if (dec31 && !present.has(dec31)) {
      records.push({ sourceDate: dec31, tmaxC: null, tminC: null, precipMm: null, rhMaxPct: null, rhMinPct: null });
    }
  }
  return records.sort((a, b) => (a.sourceDate < b.sourceDate ? -1 : a.sourceDate > b.sourceDate ? 1 : 0));
}

function num(s: string | undefined): number | null {
  if (s === undefined) return null;
  const n = Number(s.trim());
  return Number.isFinite(n) ? n : null;
}

export const daymetProvider: ClimateProvider = {
  key: "daymet",
  kind: "grid",
  role: "history",
  obsConvention: "MIDNIGHT_LOCAL",
  resolutionM: 1_000,
  capabilities: ["tmax", "tmin", "precip"],
  coverageFor: (lat, lon) => (lat >= 14 && lat <= 72 && lon >= -145 && lon <= -52 ? "US_HIGH_RES" : "UNAVAILABLE"),
  async fetchDailySeries(lat, lon, startIso, endIso): Promise<ProviderSeries> {
    const url =
      `https://daymet.ornl.gov/single-pixel/api/data?lat=${lat}&lon=${lon}` +
      `&vars=tmax,tmin,prcp&start=${startIso}&end=${endIso}`;
    const csv = await fetchText("daymet", url);
    // Daymet's single-pixel API ignores start/end when the range isn't in its published years (it lags ~3
    // months) and returns its FULL period of record → window it here so a caller never gets 40 years back.
    const records = normalizeDaymetCsv(csv).filter((r) => r.sourceDate >= startIso && r.sourceDate <= endIso);
    if (records.length === 0) throw new ProviderFetchError("daymet", "empty", "no Daymet records in window");
    return {
      providerKey: "daymet",
      kind: "grid",
      obsConvention: "MIDNIGHT_LOCAL",
      resolutionM: 1_000,
      attribution: "Daymet (ORNL DAAC)",
      sourceUrl: url,
      records,
    };
  },
};
