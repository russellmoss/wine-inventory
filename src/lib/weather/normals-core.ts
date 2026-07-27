// VI-P8b — climate NORMALS: the long-term view the Winkler index actually requires. Winkler classifies a
// site on its AVERAGE full-season (Apr 1–Oct 31 NH) GDD over many years, NOT a single partial season. This
// core computes, from stored daily rows: per-year full-season GDD, the moving-window average (10/20 yr), the
// Winkler region on that average, and the cumulative-GDD curves (current year + historical average) for the
// graph. GDD is base 10 °C (= 50 °F); display is °F (×1.8) per US viticulture convention. Pure + testable.

import type { LocalDailyRecord } from "./obs-time-core";
import { dailyGdd } from "./gdd-core";
import { filterToSeason, seasonWindowFor, windowDayCount } from "./season-core";
import { winklerRegion, type WinklerResult } from "./winkler-core";

export const C_TO_F_GDD = 1.8; // a °C growing-degree-day is 1.8 °F growing-degree-days.

export interface YearGdd {
  seasonYear: number;
  gddC: number;
  gddF: number;
  daysCounted: number;
  windowDays: number;
  complete: boolean; // ≥95% of the Apr–Oct window has paired temps
}

/** Full-season GDD for every SeasonYear present in the records (one provider's rows, already single-source). */
export function perYearSeasonGdd(records: LocalDailyRecord[], latitude: number): YearGdd[] {
  const years = new Set<number>();
  for (const r of records) years.add(Number(r.localDate.slice(0, 4)));
  // In the SH a season spans two calendar years; include both the year and year+1 as candidate SeasonYears.
  const candidates = new Set<number>();
  for (const y of years) {
    candidates.add(y);
    candidates.add(y + 1);
  }
  const out: YearGdd[] = [];
  for (const seasonYear of [...candidates].sort((a, b) => a - b)) {
    const season = filterToSeason(records, latitude, seasonYear);
    if (season.length === 0) continue;
    let gddC = 0;
    let daysCounted = 0;
    for (const r of season) {
      const g = dailyGdd(r.tmaxC, r.tminC);
      if (g !== null) {
        gddC += g;
        daysCounted += 1;
      }
    }
    const { startIso, endIso } = seasonWindowFor(latitude, seasonYear);
    const windowDays = windowDayCount(startIso, endIso);
    out.push({
      seasonYear,
      gddC: Math.round(gddC * 10) / 10,
      gddF: Math.round(gddC * C_TO_F_GDD),
      daysCounted,
      windowDays,
      complete: daysCounted >= windowDays * 0.95,
    });
  }
  return out;
}

export interface WinklerNormal {
  window: number; // 10 or 20
  yearsUsed: number; // complete years actually averaged (may be < window if history is short)
  avgGddF: number;
  avgGddC: number;
  region: WinklerResult["region"];
  winkler: WinklerResult;
  years: number[]; // the SeasonYears averaged
}

/**
 * Winkler on the moving-window average of COMPLETE past seasons (excludes the current, still-running season).
 * `window` = 10 or 20. Averages the most recent `window` complete years before `currentSeasonYear`.
 */
export function winklerNormal(perYear: YearGdd[], window: number, currentSeasonYear: number): WinklerNormal | null {
  const complete = perYear.filter((y) => y.complete && y.seasonYear < currentSeasonYear).sort((a, b) => b.seasonYear - a.seasonYear);
  const used = complete.slice(0, window);
  if (used.length === 0) return null;
  const avgGddC = used.reduce((s, y) => s + y.gddC, 0) / used.length;
  const winkler = winklerRegion(avgGddC);
  return {
    window,
    yearsUsed: used.length,
    avgGddF: Math.round(avgGddC * C_TO_F_GDD),
    avgGddC: Math.round(avgGddC * 10) / 10,
    region: winkler.region,
    winkler,
    years: used.map((y) => y.seasonYear).sort((a, b) => a - b),
  };
}

export interface CurvePoint {
  dayIndex: number; // 0-based day offset from Apr 1 (NH) / season start
  cumF: number; // cumulative GDD in °F to this day
}

/** Cumulative GDD curve (°F) for ONE SeasonYear, indexed by day-of-season. */
export function cumulativeCurve(records: LocalDailyRecord[], latitude: number, seasonYear: number): CurvePoint[] {
  const season = filterToSeason(records, latitude, seasonYear);
  const { startIso } = seasonWindowFor(latitude, seasonYear);
  const start = Date.parse(`${startIso}T00:00:00Z`);
  let cumC = 0;
  const out: CurvePoint[] = [];
  for (const r of season) {
    const g = dailyGdd(r.tmaxC, r.tminC);
    if (g === null) continue;
    cumC += g;
    const dayIndex = Math.round((Date.parse(`${r.localDate}T00:00:00Z`) - start) / 86_400_000);
    out.push({ dayIndex, cumF: Math.round(cumC * C_TO_F_GDD) });
  }
  return out;
}

/**
 * Average cumulative curve across several years' curves: at each day-index, the mean cumulative GDD across the
 * years that have a value there. Produces the smooth "10-yr / 20-yr average" line for the graph.
 */
export function averageCurve(curves: CurvePoint[][]): CurvePoint[] {
  const byDay = new Map<number, { sum: number; n: number }>();
  for (const curve of curves) {
    for (const p of curve) {
      const acc = byDay.get(p.dayIndex) ?? { sum: 0, n: 0 };
      acc.sum += p.cumF;
      acc.n += 1;
      byDay.set(p.dayIndex, acc);
    }
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dayIndex, { sum, n }]) => ({ dayIndex, cumF: Math.round(sum / n) }));
}

/** One labelled curve for the WSU-style comparison chart (a season line + its running-total °F). */
export interface NamedCurve {
  key: "longterm" | "cool" | "hot" | "last" | "current";
  label: string;
  totalF: number; // season-to-date (current) or full-season (historical) °F GDD — shown in the legend
  color: string;
  dash?: string; // SVG stroke-dasharray for the long-term line
  emphasis?: boolean; // the current year, drawn heavier
  curve: CurvePoint[];
}

/**
 * The WSU/CSF-style comparison set: long-term average, the coolest and hottest historical seasons (the
 * envelope), last complete year, and the current year. Farmers read "am I tracking hot or cool, ahead or
 * behind normal" at a glance. Colours are semantic (cool=blue, hot=red) — a data-viz exception to tokens.
 */
export function comparisonSeries(records: LocalDailyRecord[], latitude: number, currentSeasonYear: number): NamedCurve[] {
  const perYear = perYearSeasonGdd(records, latitude);
  const complete = perYear.filter((y) => y.complete && y.seasonYear < currentSeasonYear);
  const curveFor = (yr: number) => cumulativeCurve(records, latitude, yr);
  const out: NamedCurve[] = [];

  if (complete.length > 0) {
    const recent = [...complete].sort((a, b) => b.seasonYear - a.seasonYear).slice(0, 20);
    const avgF = Math.round(recent.reduce((s, y) => s + y.gddF, 0) / recent.length);
    out.push({ key: "longterm", label: `Long-term avg (${recent.length} yr)`, totalF: avgF, color: "#1f7a6b", dash: "7 4", curve: averageCurve(recent.map((y) => curveFor(y.seasonYear))) });

    const coolest = complete.reduce((a, b) => (b.gddF < a.gddF ? b : a));
    const hottest = complete.reduce((a, b) => (b.gddF > a.gddF ? b : a));
    out.push({ key: "cool", label: `Coolest (${coolest.seasonYear})`, totalF: coolest.gddF, color: "#2b6cb0", curve: curveFor(coolest.seasonYear) });
    out.push({ key: "hot", label: `Hottest (${hottest.seasonYear})`, totalF: hottest.gddF, color: "#c0392b", curve: curveFor(hottest.seasonYear) });

    const lastY = recent[0];
    if (lastY && lastY.seasonYear !== coolest.seasonYear && lastY.seasonYear !== hottest.seasonYear) {
      out.push({ key: "last", label: `${lastY.seasonYear}`, totalF: lastY.gddF, color: "#dd8452", curve: curveFor(lastY.seasonYear) });
    }
  }

  const cur = perYear.find((y) => y.seasonYear === currentSeasonYear);
  out.push({ key: "current", label: `${currentSeasonYear} (this year)`, totalF: cur?.gddF ?? 0, color: "#111111", emphasis: true, curve: curveFor(currentSeasonYear) });
  return out;
}

/** Build the graph payload: the current (partial) year + the 10-yr and 20-yr average curves. */
export function gddGraphCurves(records: LocalDailyRecord[], latitude: number, currentSeasonYear: number) {
  const perYear = perYearSeasonGdd(records, latitude);
  const completeYears = perYear.filter((y) => y.complete && y.seasonYear < currentSeasonYear).map((y) => y.seasonYear).sort((a, b) => b - a);
  const curveFor = (yr: number) => cumulativeCurve(records, latitude, yr);
  const avgOverLast = (n: number) => averageCurve(completeYears.slice(0, n).map(curveFor));
  return {
    current: curveFor(currentSeasonYear),
    avg10: completeYears.length ? avgOverLast(10) : [],
    avg20: completeYears.length ? avgOverLast(20) : [],
    avg10Years: completeYears.slice(0, 10).length,
    avg20Years: completeYears.slice(0, 20).length,
  };
}
