// Plan 096 Phase 2 Unit 14 — condition-code mapping, PURE. Two tables into the 13-value
// ConditionCode vocabulary: (a) Open-Meteo's WMO weather_code — ALL 28 documented codes
// (live-verified list, 2026-07-26); (b) NWS icon-URL token (primary) with shortForecast text as
// fallback. An unmapped input NEVER silently disappears: the caller gets UNKNOWN plus a structured
// log line (the repo's `evt:` idiom) so gaps surface in production instead of rendering as quiet
// question marks forever.

import type { ConditionCode } from "./providers/forecast-types";

// ── Open-Meteo: WMO weather interpretation codes (complete — every documented code) ──
const WMO_TO_CONDITION: Record<number, ConditionCode> = {
  0: "CLEAR",
  1: "MOSTLY_CLEAR",
  2: "PARTLY_CLOUDY",
  3: "CLOUDY",
  45: "FOG",
  48: "FOG", // depositing rime fog
  51: "LIGHT_RAIN", // drizzle: light
  53: "LIGHT_RAIN", // drizzle: moderate
  55: "RAIN", // drizzle: dense
  56: "SLEET", // freezing drizzle: light
  57: "SLEET", // freezing drizzle: dense
  61: "LIGHT_RAIN", // rain: slight
  63: "RAIN", // rain: moderate
  65: "HEAVY_RAIN", // rain: heavy
  66: "SLEET", // freezing rain: light
  67: "SLEET", // freezing rain: heavy
  71: "SNOW", // snow fall: slight
  73: "SNOW", // snow fall: moderate
  75: "SNOW", // snow fall: heavy
  77: "SNOW", // snow grains
  80: "LIGHT_RAIN", // rain showers: slight
  81: "RAIN", // rain showers: moderate
  82: "HEAVY_RAIN", // rain showers: violent
  85: "SNOW", // snow showers: slight
  86: "SNOW", // snow showers: heavy
  95: "THUNDERSTORM", // slight or moderate
  96: "THUNDERSTORM", // with slight hail
  99: "THUNDERSTORM", // with heavy hail
};

/** Structured unmapped-value log (evt: idiom) — injectable so tests can assert it fires. */
export type UnmappedLogger = (payload: { evt: "weather.condition.unmapped"; source: "wmo" | "nws"; value: string }) => void;
const defaultLogger: UnmappedLogger = (p) => console.info(JSON.stringify(p));

/** Open-Meteo WMO weather_code → ConditionCode. Unmapped → UNKNOWN + one structured log line. */
export function conditionFromWmo(code: number | null | undefined, log: UnmappedLogger = defaultLogger): ConditionCode {
  if (code === null || code === undefined || !Number.isFinite(code)) return "UNKNOWN";
  const mapped = WMO_TO_CONDITION[code];
  if (mapped) return mapped;
  log({ evt: "weather.condition.unmapped", source: "wmo", value: String(code) });
  return "UNKNOWN";
}

// ── NWS: icon-URL token primary, shortForecast text fallback ──
// Icon URLs look like https://api.weather.gov/icons/land/{day|night}/{token}[,{pop}][/{token2}...]
// The token set is NWS's own condition vocabulary (skc, few, sct, bkn, ovc, rain, tsra, …).
const NWS_TOKEN_TO_CONDITION: Record<string, ConditionCode> = {
  skc: "CLEAR",
  few: "MOSTLY_CLEAR",
  sct: "PARTLY_CLOUDY",
  bkn: "CLOUDY",
  ovc: "CLOUDY",
  wind_skc: "WINDY",
  wind_few: "WINDY",
  wind_sct: "WINDY",
  wind_bkn: "WINDY",
  wind_ovc: "WINDY",
  rain: "RAIN",
  rain_showers: "RAIN",
  rain_showers_hi: "LIGHT_RAIN",
  tsra: "THUNDERSTORM",
  tsra_sct: "THUNDERSTORM",
  tsra_hi: "THUNDERSTORM",
  snow: "SNOW",
  blizzard: "SNOW",
  rain_snow: "SLEET",
  rain_sleet: "SLEET",
  snow_sleet: "SLEET",
  sleet: "SLEET",
  fzra: "SLEET", // freezing rain
  rain_fzra: "SLEET",
  snow_fzra: "SLEET",
  fog: "FOG",
  haze: "FOG",
  smoke: "FOG",
  dust: "FOG",
  hot: "CLEAR",
  cold: "CLEAR",
  hurricane: "HEAVY_RAIN",
  tropical_storm: "HEAVY_RAIN",
  tornado: "THUNDERSTORM",
};

/** Pull the first condition token out of an NWS icon URL, or null. */
export function nwsIconToken(iconUrl: string | null | undefined): string | null {
  if (!iconUrl) return null;
  const m = iconUrl.match(/\/icons\/land\/(?:day|night)\/([a-z_]+)/i);
  return m ? m[1].toLowerCase() : null;
}

const SHORT_FORECAST_RULES: Array<[RegExp, ConditionCode]> = [
  [/thunder/i, "THUNDERSTORM"],
  [/blizzard|snow/i, "SNOW"],
  [/sleet|freezing|wintry mix|ice/i, "SLEET"],
  [/heavy rain|downpour/i, "HEAVY_RAIN"],
  [/light rain|drizzle|slight chance.*rain|chance.*showers/i, "LIGHT_RAIN"],
  [/rain|showers/i, "RAIN"],
  [/fog|haze|smoke|mist/i, "FOG"],
  [/windy|breezy|blustery/i, "WINDY"],
  [/mostly cloudy|overcast|cloudy/i, "CLOUDY"],
  [/partly/i, "PARTLY_CLOUDY"],
  [/mostly sunny|mostly clear/i, "MOSTLY_CLEAR"],
  [/sunny|clear/i, "CLEAR"],
];

/** NWS period → ConditionCode: icon token primary, shortForecast fallback, UNKNOWN + log last. */
export function conditionFromNws(
  iconUrl: string | null | undefined,
  shortForecast: string | null | undefined,
  log: UnmappedLogger = defaultLogger,
): ConditionCode {
  const token = nwsIconToken(iconUrl);
  if (token && NWS_TOKEN_TO_CONDITION[token]) return NWS_TOKEN_TO_CONDITION[token];
  if (shortForecast) {
    for (const [re, code] of SHORT_FORECAST_RULES) if (re.test(shortForecast)) return code;
  }
  log({ evt: "weather.condition.unmapped", source: "nws", value: token ?? shortForecast ?? "(empty)" });
  return "UNKNOWN";
}

/** Of two half-day conditions (day + night), pick the more consequential for the day card. */
const SEVERITY: ConditionCode[] = [
  "THUNDERSTORM", "HEAVY_RAIN", "SNOW", "SLEET", "RAIN", "LIGHT_RAIN", "FOG", "WINDY", "CLOUDY", "PARTLY_CLOUDY", "MOSTLY_CLEAR", "CLEAR", "UNKNOWN",
];
export function worseCondition(a: ConditionCode, b: ConditionCode): ConditionCode {
  return SEVERITY.indexOf(a) <= SEVERITY.indexOf(b) ? a : b;
}
