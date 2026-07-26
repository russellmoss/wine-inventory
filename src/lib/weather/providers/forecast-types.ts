// Plan 096 Phase 2 Unit 10 — the FORECAST provider contract, deliberately PARALLEL to (not an
// extension of) ClimateProvider. Observation providers fetch a PAST window and accumulate immutable
// daily facts; a forecast is future-dated, REPLACED wholesale on every issue, and carries condition/
// probability/wind that no observation record has. Forcing both through one interface would bend the
// observation contract's guarantees (never-blend tests, obs-time mapping) around fields they must
// never carry. Never-blend applies here too: rows store per-provider; ONE primary series is
// displayed; disagreement is spread, never an average.

/**
 * The 13-value display condition vocabulary. Both adapters map INTO this (Open-Meteo's 28 WMO codes,
 * NWS icon tokens + shortForecast) — the UI and icons only ever see these.
 */
export type ConditionCode =
  | "CLEAR"
  | "MOSTLY_CLEAR"
  | "PARTLY_CLOUDY"
  | "CLOUDY"
  | "LIGHT_RAIN"
  | "RAIN"
  | "HEAVY_RAIN"
  | "THUNDERSTORM"
  | "SNOW"
  | "SLEET"
  | "FOG"
  | "WINDY"
  | "UNKNOWN";

export type ForecastProviderKey = "nws" | "open_meteo";

/**
 * One forecast day on the vineyard-local civil calendar. ALL value fields are nullable end-to-end
 * (council C7): an evening NWS fetch's day-1 has a low and NO high — that's a first-class record,
 * never a zero, never dropped.
 */
export interface ForecastDailyRecord {
  targetDate: string; // YYYY-MM-DD, vineyard-local civil day
  tmaxC: number | null;
  tminC: number | null;
  precipMm: number | null;
  precipProbabilityPct: number | null;
  conditionCode: ConditionCode;
  windMaxKph: number | null;
}

/**
 * One hourly forecast slot (plan 097). One row per slot per provider; for NWS, rain AMOUNTS only
 * exist as raw-gridpoint QPF buckets (PT3H/PT6H, live-verified) — a bucket becomes ONE record at
 * its start hour with `precipDurationH` = the bucket length, and the chart draws the bar at that
 * native width (the S6 honesty rule: never split a bucket into invented uniform hours). Open-Meteo
 * is true per-hour (`precipDurationH` 1). `localDate`/`localHour` are computed AT INGEST from the
 * vineyard tz — never recomputed at read. All value fields nullable (the C7 rule).
 */
export interface ForecastHourlyRecord {
  hourStartUtc: string; // ISO instant
  localDate: string; // vineyard-local civil day (YYYY-MM-DD)
  localHour: number; // 0–23 in the vineyard tz
  tempC: number | null;
  popPct: number | null;
  precipMm: number | null;
  precipDurationH: number; // 1 = per-hour; 3/6 = an NWS QPF bucket starting at this hour
  conditionCode: ConditionCode;
  windKph: number | null;
}

export interface ForecastSeries {
  providerKey: ForecastProviderKey;
  issuedAt: Date;
  /** Provider-reported IANA zone (NWS points.timeZone / Open-Meteo timezone=auto) — persisted to config (U1). */
  timeZone: string | null;
  records: ForecastDailyRecord[];
  /** Hourly slots (plan 097) — optional; both adapters fill it when available. */
  hourly?: ForecastHourlyRecord[];
  attribution: string;
  sourceUrl: string;
}

/** Coverage tiers reuse the observation vocabulary (registry sorts best-first the same way). */
export type ForecastCoverageState = "US_HIGH_RES" | "GLOBAL_COARSE" | "UNAVAILABLE";

export interface ForecastProvider {
  key: ForecastProviderKey;
  coverageFor(lat: number, lon: number): ForecastCoverageState;
  fetchForecast(args: { lat: number; lon: number; elevationM: number | null }): Promise<ForecastSeries>;
}
