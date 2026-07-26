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
import { fetchJsonRetry, type JsonFetcher } from "./fetch-util";
import { ProviderFetchError } from "./types";
import type { ForecastDailyRecord, ForecastProvider, ForecastSeries } from "./forecast-types";

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

interface OpenMeteoDaily {
  time?: string[];
  weather_code?: Array<number | null>;
  temperature_2m_max?: Array<number | null>;
  temperature_2m_min?: Array<number | null>;
  precipitation_sum?: Array<number | null>;
  precipitation_probability_max?: Array<number | null>;
  wind_speed_10m_max?: Array<number | null>;
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
    forecast_days: "7",
    timezone: "auto",
  });
  // True site elevation → statistical downscaling to the vineyard, not the gridcell mean.
  if (args.elevationM !== null && Number.isFinite(args.elevationM)) params.set("elevation", String(Math.round(args.elevationM)));
  if (OPEN_METEO_API_KEY) params.set("apikey", OPEN_METEO_API_KEY);
  const url = `${OPEN_METEO_BASE_URL}/v1/forecast?${params.toString()}`;

  const json = (await f("open_meteo", url)) as { timezone?: string; daily?: OpenMeteoDaily };
  const records = parseOpenMeteoDaily(json?.daily ?? {});
  if (records.length === 0) throw new ProviderFetchError("open_meteo", "empty", "forecast returned no days");

  return {
    providerKey: "open_meteo",
    issuedAt: deps.now ?? new Date(),
    timeZone: json?.timezone ?? null,
    records,
    attribution: OPEN_METEO_ATTRIBUTION,
    sourceUrl: url,
  };
}

export const openMeteoForecastProvider: ForecastProvider = {
  key: "open_meteo",
  coverageFor: () => "GLOBAL_COARSE",
  fetchForecast: (args) => fetchOpenMeteoForecast(args),
};
