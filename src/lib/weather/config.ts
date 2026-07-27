// VI-P8 — env gates + the SSRF provider allowlist. Providers only ever fetch from these fixed hosts; a
// redirect off-allowlist or an oversized body is a typed fault (never followed, never on a render path).

import type { WeatherSourceKey } from "./providers/types";

export const NOAA_CDO_TOKEN = process.env.NOAA_CDO_TOKEN ?? "";
export const isCdoConfigured = (): boolean => NOAA_CDO_TOKEN.length > 0;

/**
 * User-Agent on EVERY outbound weather request (plan 096 U4). NWS enforces this — a UA-less request
 * gets a 403 (live-verified) — and RCC-ACIS/USGS publish a UA expectation the audit flagged as unmet.
 * NWS-recommended format: (app-identifier, contact-email).
 */
export const WEATHER_USER_AGENT = "(cellarhand, russellmoss87@gmail.com)";

/**
 * Open-Meteo base URL + optional key (plan 096 — free non-commercial tier today, user-confirmed).
 * The paid swap is env-only: set OPEN_METEO_BASE_URL=https://customer-api.open-meteo.com and
 * OPEN_METEO_API_KEY; the host is already allowlisted below.
 */
export const OPEN_METEO_BASE_URL = process.env.OPEN_METEO_BASE_URL ?? "https://api.open-meteo.com";
export const OPEN_METEO_API_KEY = process.env.OPEN_METEO_API_KEY ?? "";

/** Fixed host allowlist (SSRF). A source's request URL MUST have one of its listed hosts. */
export const PROVIDER_HOST_ALLOWLIST: Record<WeatherSourceKey, string | readonly string[]> = {
  // gridMET's live point series is fetched via RCC-ACIS GridData (grid 21 = gridMET, keyless JSON — avoids
  // NetCDF/THREDDS). Provenance records "gridMET via RCC-ACIS".
  gridmet: "data.rcc-acis.org",
  daymet: "daymet.ornl.gov",
  nasa_power: "power.larc.nasa.gov",
  // ERA5 archive (elevation-downscaled observations). Same vendor as the forecast adapter, own host.
  open_meteo_archive: ["archive-api.open-meteo.com", "customer-api.open-meteo.com"],
  rcc_acis: "data.rcc-acis.org",
  noaa_cdo: "www.ncdc.noaa.gov",
  usgs_epqs: "epqs.nationalmap.gov",
  // Forecast sources (plan 096 Phase 2; elevation fallback uses open_meteo in Phase 0 U5).
  nws: "api.weather.gov",
  open_meteo: ["api.open-meteo.com", "archive-api.open-meteo.com", "customer-api.open-meteo.com"],
};

/** CDO caps: 10k requests/day, 5 req/s (council R1 — the daily-keyed usage counter enforces headroom). */
export const CDO_DAILY_CAP = 10_000;
export const CDO_RATE_LIMIT_PER_SEC = 5;

/** Guard: reject a URL whose host isn't on the source's allowlist (blocks SSRF via a redirected URL). */
export function assertAllowedHost(providerKey: WeatherSourceKey, url: string): void {
  const host = new URL(url).host;
  const allowed = PROVIDER_HOST_ALLOWLIST[providerKey];
  const ok = typeof allowed === "string" ? host === allowed : allowed.includes(host);
  if (!ok) {
    throw new Error(`SSRF guard: ${providerKey} may only fetch ${[allowed].flat().join("/")}, got ${host}`);
  }
}

export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024; // 8 MB — a daily point series is tiny; anything larger is wrong.
export const FETCH_TIMEOUT_MS = 30_000;
