// Plan 096 Phase 2 Unit 13 — the Open-Meteo forecast adapter: global coverage (the path Bhutan
// actually runs today), keyless free tier (non-commercial, user-confirmed; 10k/day + 300k/mo — we
// use ~50/day). The base URL + optional apikey come from config, so the paid swap
// (customer-api.open-meteo.com) is an env change only. `elevation=` feeds Open-Meteo's statistical
// downscaling — docs: "manually set the elevation to correctly match mountain peaks" — which is
// exactly the Bhutan-at-2,302 m case (U5 persisted the true site elevation for this). The response
// `timezone` (from timezone=auto) is captured for the config timeZone column (U1/U2 — site-local
// "today"). Attribution is CC BY 4.0 and MANDATORY: "Weather data by Open-Meteo.com" linked —
// rendered through the card's existing attribution path.

import { OPEN_METEO_API_KEY, OPEN_METEO_BASE_URL } from "../config";
import { conditionFromWmo } from "../condition-core";
import { zonedWallClockToUtc } from "@/lib/work-orders/due-at";
import { fetchJsonRetry, type JsonFetcher } from "./fetch-util";
import { ProviderFetchError } from "./types";
import type { ForecastDailyRecord, ForecastHourlyRecord, ForecastProvider, ForecastSeries } from "./forecast-types";

export const OPEN_METEO_ATTRIBUTION = "Weather data by Open-Meteo.com (CC BY 4.0)";
export const OPEN_METEO_ATTRIBUTION_URL = "https://open-meteo.com/";

const DAILY_VARS = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "precipitation_probability_max",
  "wind_speed_10m_max",
].join(",");

// Plan 097 U1 — hourly rides the SAME request (live-verified: hourly+daily combine in one ~6 KB
// response; forecast_days=7 → exactly 168 slots; elevation= downscales the hourly temps too).
const HOURLY_VARS = ["temperature_2m", "precipitation", "precipitation_probability", "weather_code", "wind_speed_10m"].join(",");

interface OpenMeteoDaily {
  time?: string[];
  weather_code?: Array<number | null>;
  temperature_2m_max?: Array<number | null>;
  temperature_2m_min?: Array<number | null>;
  precipitation_sum?: Array<number | null>;
  precipitation_probability_max?: Array<number | null>;
  wind_speed_10m_max?: Array<number | null>;
}

interface OpenMeteoHourly {
  time?: string[]; // LOCAL ISO wall clocks ("2026-07-27T13:00"), no offset suffix (timezone=auto)
  temperature_2m?: Array<number | null>;
  precipitation?: Array<number | null>;
  precipitation_probability?: Array<number | null>;
  weather_code?: Array<number | null>;
  wind_speed_10m?: Array<number | null>;
}

/**
 * Pure: normalize the hourly arrays. Open-Meteo's `time` entries are LOCAL wall clocks in the
 * response tz — the UTC instant is resolved via the tested DST-safe converter, and
 * localDate/localHour come straight off the string (computed AT INGEST, never re-derived at read).
 */
export function parseOpenMeteoHourly(hourly: OpenMeteoHourly, timeZone: string): ForecastHourlyRecord[] {
  const time = hourly.time ?? [];
  const at = (arr: Array<number | null> | undefined, i: number): number | null => {
    const v = arr?.[i];
    return v === undefined || v === null || !Number.isFinite(v) ? null : v;
  };
  return time.map((local, i) => {
    const year = Number(local.slice(0, 4));
    const month = Number(local.slice(5, 7));
    const day = Number(local.slice(8, 10));
    const hour = Number(local.slice(11, 13));
    return {
      hourStartUtc: zonedWallClockToUtc(year, month, day, hour, 0, timeZone).toISOString(),
      localDate: local.slice(0, 10),
      localHour: hour,
      tempC: at(hourly.temperature_2m, i),
      popPct: at(hourly.precipitation_probability, i),
      precipMm: at(hourly.precipitation, i),
      precipDurationH: 1, // true per-hour amounts (live-verified mm per hourly interval)
      conditionCode: conditionFromWmo(at(hourly.weather_code, i)),
      windKph: at(hourly.wind_speed_10m, i),
    };
  });
}

/** Pure: normalize the parallel daily arrays into records (any missing slot → null, never 0). */
export function parseOpenMeteoDaily(daily: OpenMeteoDaily): ForecastDailyRecord[] {
  const time = daily.time ?? [];
  const at = <T>(arr: Array<T | null> | undefined, i: number): T | null => {
    const v = arr?.[i];
    return v === undefined || v === null || (typeof v === "number" && !Number.isFinite(v)) ? null : v;
  };
  return time.map((targetDate, i) => ({
    targetDate,
    tmaxC: at(daily.temperature_2m_max, i),
    tminC: at(daily.temperature_2m_min, i),
    precipMm: at(daily.precipitation_sum, i),
    precipProbabilityPct: at(daily.precipitation_probability_max, i),
    conditionCode: conditionFromWmo(at(daily.weather_code, i)),
    windMaxKph: at(daily.wind_speed_10m_max, i),
  }));
}

export async function fetchOpenMeteoForecast(
  args: { lat: number; lon: number; elevationM: number | null },
  deps: { fetch?: JsonFetcher; now?: Date } = {},
): Promise<ForecastSeries> {
  const f = deps.fetch ?? fetchJsonRetry; // U24 retry on transient faults
  const params = new URLSearchParams({
    latitude: String(args.lat),
    longitude: String(args.lon),
    daily: DAILY_VARS,
    hourly: HOURLY_VARS, // plan 097 — same request, no extra call
    forecast_days: "7",
    timezone: "auto",
  });
  // True site elevation → statistical downscaling to the vineyard, not the gridcell mean.
  if (args.elevationM !== null && Number.isFinite(args.elevationM)) params.set("elevation", String(Math.round(args.elevationM)));
  if (OPEN_METEO_API_KEY) params.set("apikey", OPEN_METEO_API_KEY);
  const url = `${OPEN_METEO_BASE_URL}/v1/forecast?${params.toString()}`;

  const json = (await f("open_meteo", url)) as { timezone?: string; daily?: OpenMeteoDaily; hourly?: OpenMeteoHourly };
  const records = parseOpenMeteoDaily(json?.daily ?? {});
  if (records.length === 0) throw new ProviderFetchError("open_meteo", "empty", "forecast returned no days");
  const timeZone = json?.timezone ?? null;
  const hourly = parseOpenMeteoHourly(json?.hourly ?? {}, timeZone ?? "UTC");

  return {
    providerKey: "open_meteo",
    issuedAt: deps.now ?? new Date(),
    timeZone,
    records,
    hourly,
    attribution: OPEN_METEO_ATTRIBUTION,
    sourceUrl: url,
  };
}

export const openMeteoForecastProvider: ForecastProvider = {
  key: "open_meteo",
  coverageFor: () => "GLOBAL_COARSE",
  fetchForecast: (args) => fetchOpenMeteoForecast(args),
};
