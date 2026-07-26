// Plan 096 Phase 2 Unit 12 — the NWS forecast adapter (api.weather.gov, keyless, free for
// commercial use; UA mandatory — fetch-util sets it). Three endpoints:
//   /points/{lat},{lon}            → grid mapping + IANA timeZone (cached on the config row — it
//                                    never changes for a fixed coordinate)
//   /gridpoints/{o}/{x},{y}/forecast?units=si → 14 half-day periods (day/night), paired here into
//                                    daily cards; ?units=si is live-verified but OpenAPI-only
//                                    documented, so temps are defensively re-checked per period
//   /gridpoints/{o}/{x},{y}        → quantitativePrecipitation (wmoUnit:mm) in ISO8601
//                                    start/duration buckets — summed into vineyard-local civil days
//                                    by the day each interval ENDS (council S6: no pro-rata
//                                    midnight split — that invents uniform-rain precision)
// Pairing convention (council S5): a card is DAY + FOLLOWING NIGHT — "Mon 24°/−2°" where the low is
// Monday night (physically Tuesday ~5 a.m.), like every consumer forecast product. An evening fetch
// whose first period is a night yields day-1 with a low and NO high — emitted honestly as null.
// A non-US point 404s (`InvalidPoint`, live-verified) → ProviderFetchError; the ingest falls
// through to Open-Meteo.

import { zonedDateKey } from "@/lib/work-orders/due-at";
import { conditionFromNws, worseCondition } from "../condition-core";
import { isUsForecastCoverage } from "../us-coverage";
import { fetchJson } from "./fetch-util";
import { ProviderFetchError } from "./types";
import type { ConditionCode, ForecastDailyRecord, ForecastProvider, ForecastSeries } from "./forecast-types";

export const NWS_ATTRIBUTION = "US National Weather Service (weather.gov)";

export interface NwsGrid {
  gridId: string;
  gridX: number;
  gridY: number;
  timeZone: string | null;
}

/** Resolve the /points grid mapping (caller caches it on the config row — U15). */
export async function resolveNwsGrid(lat: number, lon: number, deps: { fetch?: typeof fetchJson } = {}): Promise<NwsGrid> {
  const f = deps.fetch ?? fetchJson;
  const json = (await f("nws", `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`)) as {
    properties?: { gridId?: string; gridX?: number; gridY?: number; timeZone?: string };
  };
  const p = json?.properties;
  if (!p?.gridId || p.gridX === undefined || p.gridY === undefined) {
    throw new ProviderFetchError("nws", "parse", "points response missing grid mapping");
  }
  return { gridId: p.gridId, gridX: p.gridX, gridY: p.gridY, timeZone: p.timeZone ?? null };
}

// ── Pure parsing helpers (unit-tested directly) ──

export interface NwsPeriod {
  startTime: string; // ISO with local offset — slice(0,10) IS the local civil date
  endTime: string;
  isDaytime: boolean;
  temperature: number | null;
  temperatureUnit: string; // "C" with units=si; defensively handle "F"
  probabilityOfPrecipitation?: { value: number | null } | null;
  windSpeed?: string | null; // "15 to 20 km/h" (si) or "10 to 15 mph"
  icon?: string | null;
  shortForecast?: string | null;
}

const fToC = (f: number) => (f - 32) * (5 / 9);

function periodTempC(p: NwsPeriod): number | null {
  if (p.temperature === null || !Number.isFinite(p.temperature)) return null;
  return p.temperatureUnit === "F" ? Math.round(fToC(p.temperature) * 10) / 10 : p.temperature;
}

/** "15 to 20 km/h" / "10 mph" → max km/h, or null. */
export function parseWindMaxKph(windSpeed: string | null | undefined): number | null {
  if (!windSpeed) return null;
  const nums = [...windSpeed.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  if (nums.length === 0) return null;
  const max = Math.max(...nums);
  return /mph/i.test(windSpeed) ? Math.round(max * 1.609344 * 10) / 10 : max;
}

/**
 * Pair 14 half-day periods into daily cards keyed by the DAY period's local civil date; a night
 * period attaches its low to the card of the date its own startTime falls on (day + FOLLOWING
 * night — an evening fetch's leading night period lands on today's card as a low with no high).
 */
export function pairNwsPeriods(periods: NwsPeriod[]): Array<Omit<ForecastDailyRecord, "precipMm">> {
  const byDate = new Map<string, { tmaxC: number | null; tminC: number | null; pop: number | null; dayCond?: ConditionCode; nightCond?: ConditionCode }>();
  const order: string[] = [];
  for (const p of periods) {
    const date = p.startTime.slice(0, 10);
    if (!byDate.has(date)) {
      byDate.set(date, { tmaxC: null, tminC: null, pop: null });
      order.push(date);
    }
    const card = byDate.get(date)!;
    const temp = periodTempC(p);
    const pop = p.probabilityOfPrecipitation?.value ?? null;
    if (pop !== null) card.pop = card.pop === null ? pop : Math.max(card.pop, pop);
    const cond = conditionFromNws(p.icon, p.shortForecast);
    if (p.isDaytime) {
      card.tmaxC = temp;
      card.dayCond = cond;
    } else {
      // The night starting on this date is this card's low (the consumer-forecast convention).
      card.tminC = temp;
      card.nightCond = cond;
    }
  }
  return order.map((targetDate) => {
    const c = byDate.get(targetDate)!;
    const condition =
      c.dayCond && c.nightCond ? worseCondition(c.dayCond, c.nightCond) : (c.dayCond ?? c.nightCond ?? "UNKNOWN");
    return { targetDate, tmaxC: c.tmaxC, tminC: c.tminC, precipProbabilityPct: c.pop, conditionCode: condition, windMaxKph: null };
  });
}

/** ISO8601 duration → hours (supports P#DT#H#M forms NWS emits; PT6H usual, PT1H observed live). */
export function parseIsoDurationHours(d: string): number {
  const m = d.match(/P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/);
  if (!m) return 0;
  const days = Number(m[1] ?? 0);
  const hours = Number(m[2] ?? 0);
  const mins = Number(m[3] ?? 0);
  return days * 24 + hours + mins / 60;
}

/**
 * Sum QPF buckets (wmoUnit:mm, `validTime: "<ISO start>/<ISO8601 duration>"`) into vineyard-local
 * civil days. Council S6: each interval's WHOLE amount goes to the day the interval ENDS (the
 * climatological norm) — never pro-rata split at midnight.
 */
export function sumQpfToLocalDays(
  values: Array<{ validTime: string; value: number | null }>,
  timeZone: string,
): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const v of values) {
    if (v.value === null || !Number.isFinite(v.value) || v.value <= 0) continue;
    const [startIso, duration] = v.validTime.split("/");
    const start = new Date(startIso);
    if (Number.isNaN(start.getTime())) continue;
    const end = new Date(start.getTime() + parseIsoDurationHours(duration ?? "PT0H") * 3_600_000);
    const day = zonedDateKey(end, timeZone);
    byDay.set(day, Math.round(((byDay.get(day) ?? 0) + v.value) * 100) / 100);
  }
  return byDay;
}

// ── The adapter ──

export async function fetchNwsForecast(
  args: { lat: number; lon: number },
  opts: { grid?: NwsGrid | null; fetch?: typeof fetchJson; now?: Date } = {},
): Promise<ForecastSeries & { grid: NwsGrid }> {
  const f = opts.fetch ?? fetchJson;
  const grid = opts.grid ?? (await resolveNwsGrid(args.lat, args.lon, { fetch: f }));
  const base = `https://api.weather.gov/gridpoints/${grid.gridId}/${grid.gridX},${grid.gridY}`;

  const forecastJson = (await f("nws", `${base}/forecast?units=si`)) as { properties?: { periods?: NwsPeriod[] } };
  const periods = forecastJson?.properties?.periods ?? [];
  if (periods.length === 0) throw new ProviderFetchError("nws", "empty", "forecast returned no periods");

  // QPF from the raw gridpoint (amounts are NOT on /forecast — it only carries probability).
  let qpfByDay = new Map<string, number>();
  try {
    const rawJson = (await f("nws", base)) as {
      properties?: { quantitativePrecipitation?: { values?: Array<{ validTime: string; value: number | null }> } };
    };
    const values = rawJson?.properties?.quantitativePrecipitation?.values ?? [];
    qpfByDay = sumQpfToLocalDays(values, grid.timeZone ?? "UTC");
  } catch {
    // QPF is enrich-only: probability + temps still render honestly without amounts.
  }

  const paired = pairNwsPeriods(periods);
  const records: ForecastDailyRecord[] = paired.map((r, i) => ({
    ...r,
    windMaxKph: parseWindMaxKph(periods.find((p) => p.startTime.slice(0, 10) === r.targetDate && p.isDaytime)?.windSpeed ?? periods[i]?.windSpeed),
    precipMm: qpfByDay.get(r.targetDate) ?? null,
  }));

  return {
    providerKey: "nws",
    issuedAt: opts.now ?? new Date(),
    timeZone: grid.timeZone,
    records,
    attribution: NWS_ATTRIBUTION,
    sourceUrl: `${base}/forecast`,
    grid,
  };
}

export const nwsForecastProvider: ForecastProvider = {
  key: "nws",
  coverageFor: (lat, lon) => (isUsForecastCoverage(lat, lon) ? "US_HIGH_RES" : "UNAVAILABLE"),
  fetchForecast: ({ lat, lon }) => fetchNwsForecast({ lat, lon }),
};
