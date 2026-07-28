/**
 * Tank detail facts — the AC-S27 mechanism.
 *
 * AC-S27: "Chart annotations agree with the numeric facts stated elsewhere on the page (no
 * contradiction between a stated delta and the plotted series)."
 *
 * That is a consistency invariant between two independently-computed numbers, and the only
 * durable way to hold it is to make them not independent. So this module is the SOLE source
 * for all three of:
 *
 *   1. the `series` handed to `TimeSeriesChart`,
 *   2. every number stated as text on the page (latest Brix, latest temp, the deltas),
 *   3. the chart's `role="img"` sentence that doc 10 §9 mandates.
 *
 * `formatted` carries the exact strings. The panel renders those strings; it never formats a
 * number itself. The sentence is composed from those same strings. A test then asserts the
 * sentence contains each one, so prose cannot drift from data: there is no second derivation
 * to drift from.
 *
 * Pure. No prisma, no React, no clock.
 */

import type { ChartSeries, SeriesPoint } from "@/components/ui/TimeSeriesChart";

/** One physical reading on the vessel. Both analytes are optional — panels are partial. */
export type TankReading = {
  /** ISO timestamp of `AnalysisPanel.observedAt`. */
  observedAt: string;
  brix: number | null;
  tempC: number | null;
};

export type TankDetailFacts = {
  /** Chart input. Empty when nothing was measured. */
  series: ChartSeries[];
  latestBrix: number | null;
  latestTemp: number | null;
  /** Newest minus the one before it. Null when there is nothing to compare against. */
  brixDelta: number | null;
  tempDelta: number | null;
  firstAt: string | null;
  lastAt: string | null;
  readingCount: number;
  /**
   * The canonical rendering of every stated number. The page renders THESE, never its own
   * `toFixed`. If a value is null it has no string and must not be stated at all.
   */
  formatted: {
    latestBrix: string | null;
    latestTemp: string | null;
    brixDelta: string | null;
    tempDelta: string | null;
    firstBrix: string | null;
    lastBrix: string | null;
  };
  /** The `role="img"` sentence (doc 10 §9), composed from `formatted`. */
  ariaSentence: string;
};

export const BRIX_PRECISION = 1;
export const TEMP_PRECISION = 1;

function round(v: number, places: number): number {
  const f = 10 ** places;
  return Math.round(v * f) / f;
}

function fmt(v: number | null, places: number, unit: string): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  return `${round(v, places).toFixed(places)}${unit}`;
}

function fmtDelta(v: number | null, places: number, unit: string): string | null {
  if (v == null || !Number.isFinite(v)) return null;
  const r = round(v, places);
  // An explicit sign, always. "3.2 Bx" and "-3.2 Bx" read identically at a glance otherwise,
  // and on a ferment the direction is the whole point.
  const sign = r > 0 ? "+" : r < 0 ? "-" : "";
  return `${sign}${Math.abs(r).toFixed(places)}${unit}`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "long", timeZone: "UTC" })}`;
}

function direction(first: number, last: number): string {
  if (last < first) return "falling";
  if (last > first) return "rising";
  return "flat";
}

function pointsOf(readings: TankReading[], pick: (r: TankReading) => number | null): SeriesPoint[] {
  return readings
    .filter((r) => pick(r) != null && Number.isFinite(pick(r) as number))
    .map((r) => ({ date: Date.parse(r.observedAt), value: pick(r) as number }))
    .filter((p) => !Number.isNaN(p.date))
    .sort((a, b) => a.date - b.date);
}

/**
 * `readings` may arrive in any order and may contain partial panels. Oldest-first ordering,
 * per-analyte, is established here so nothing downstream has to think about it.
 */
export function tankDetailFacts(readings: TankReading[]): TankDetailFacts {
  const brixPoints = pointsOf(readings, (r) => r.brix);
  const tempPoints = pointsOf(readings, (r) => r.tempC);

  const series: ChartSeries[] = [];
  if (brixPoints.length > 0) {
    series.push({ id: "brix", label: "Brix", unit: " Bx", points: brixPoints, axis: "left", precision: BRIX_PRECISION, viz: 1 });
  }
  if (tempPoints.length > 0) {
    series.push({ id: "temp", label: "Temperature", unit: " °C", points: tempPoints, axis: "right", precision: TEMP_PRECISION, viz: 3 });
  }

  const last = <T,>(a: T[]): T | null => (a.length > 0 ? a[a.length - 1] : null);
  const prev = <T,>(a: T[]): T | null => (a.length > 1 ? a[a.length - 2] : null);

  const latestBrix = last(brixPoints)?.value ?? null;
  const latestTemp = last(tempPoints)?.value ?? null;
  const brixDelta =
    latestBrix != null && prev(brixPoints) != null ? round(latestBrix - (prev(brixPoints) as SeriesPoint).value, BRIX_PRECISION) : null;
  const tempDelta =
    latestTemp != null && prev(tempPoints) != null ? round(latestTemp - (prev(tempPoints) as SeriesPoint).value, TEMP_PRECISION) : null;

  const allDates = [...brixPoints, ...tempPoints].map((p) => p.date).sort((a, b) => a - b);
  const firstAt = allDates.length > 0 ? new Date(allDates[0]).toISOString() : null;
  const lastAt = allDates.length > 0 ? new Date(allDates[allDates.length - 1]).toISOString() : null;

  const formatted = {
    latestBrix: fmt(latestBrix, BRIX_PRECISION, " Bx"),
    latestTemp: fmt(latestTemp, TEMP_PRECISION, " °C"),
    brixDelta: fmtDelta(brixDelta, BRIX_PRECISION, " Bx"),
    tempDelta: fmtDelta(tempDelta, TEMP_PRECISION, " °C"),
    firstBrix: fmt(brixPoints[0]?.value ?? null, BRIX_PRECISION, " Bx"),
    lastBrix: fmt(latestBrix, BRIX_PRECISION, " Bx"),
  };

  return {
    series,
    latestBrix,
    latestTemp,
    brixDelta,
    tempDelta,
    firstAt,
    lastAt,
    readingCount: readings.length,
    formatted,
    ariaSentence: composeSentence({ brixPoints, tempPoints, formatted, firstAt, lastAt }),
  };
}

function composeSentence(a: {
  brixPoints: SeriesPoint[];
  tempPoints: SeriesPoint[];
  formatted: TankDetailFacts["formatted"];
  firstAt: string | null;
  lastAt: string | null;
}): string {
  if (a.brixPoints.length === 0 && a.tempPoints.length === 0) return "No readings yet for this tank.";

  const clauses: string[] = [];

  if (a.brixPoints.length === 1 && a.formatted.lastBrix) {
    clauses.push(`Brix ${a.formatted.lastBrix} from a single reading`);
  } else if (a.brixPoints.length > 1 && a.formatted.firstBrix && a.formatted.lastBrix) {
    const dir = direction(a.brixPoints[0].value, a.brixPoints[a.brixPoints.length - 1].value);
    clauses.push(`Brix ${dir} from ${a.formatted.firstBrix} to ${a.formatted.lastBrix}`);
  }

  if (a.tempPoints.length >= 1 && a.formatted.latestTemp) {
    const t = a.tempPoints;
    if (t.length === 1) {
      clauses.push(`temperature ${a.formatted.latestTemp}`);
    } else {
      const dir = direction(t[0].value, t[t.length - 1].value);
      clauses.push(`temperature ${dir} to ${a.formatted.latestTemp}`);
    }
  }

  // Compare the DAY LABELS, not the timestamps. Two readings taken an hour apart have
  // different `observedAt` but the same day, and "between 27 July and 27 July" is a sentence
  // no person would write.
  const firstDay = a.firstAt ? dayLabel(a.firstAt) : null;
  const lastDay = a.lastAt ? dayLabel(a.lastAt) : null;
  const span =
    firstDay && lastDay && firstDay !== lastDay
      ? ` between ${firstDay} and ${lastDay}`
      : lastDay
        ? ` on ${lastDay}`
        : "";

  return `${clauses.join(" and ")}${span}.`;
}
