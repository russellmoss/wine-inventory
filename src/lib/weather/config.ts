// VI-P8 — env gates + the SSRF provider allowlist. Providers only ever fetch from these fixed hosts; a
// redirect off-allowlist or an oversized body is a typed fault (never followed, never on a render path).

import type { ProviderKey } from "./providers/types";

export const NOAA_CDO_TOKEN = process.env.NOAA_CDO_TOKEN ?? "";
export const isCdoConfigured = (): boolean => NOAA_CDO_TOKEN.length > 0;

/** Fixed host allowlist (SSRF). A provider request URL MUST have one of these hosts. */
export const PROVIDER_HOST_ALLOWLIST: Record<ProviderKey, string> = {
  // gridMET's live point series is fetched via RCC-ACIS GridData (grid 21 = gridMET, keyless JSON — avoids
  // NetCDF/THREDDS). Provenance records "gridMET via RCC-ACIS".
  gridmet: "data.rcc-acis.org",
  daymet: "daymet.ornl.gov",
  nasa_power: "power.larc.nasa.gov",
  rcc_acis: "data.rcc-acis.org",
  noaa_cdo: "www.ncdc.noaa.gov",
  usgs_epqs: "epqs.nationalmap.gov",
};

/** CDO caps: 10k requests/day, 5 req/s (council R1 — the daily-keyed usage counter enforces headroom). */
export const CDO_DAILY_CAP = 10_000;
export const CDO_RATE_LIMIT_PER_SEC = 5;

/** Guard: reject a URL whose host isn't the provider's allowlisted host (blocks SSRF via a redirected URL). */
export function assertAllowedHost(providerKey: ProviderKey, url: string): void {
  const host = new URL(url).host;
  if (host !== PROVIDER_HOST_ALLOWLIST[providerKey]) {
    throw new Error(`SSRF guard: ${providerKey} may only fetch ${PROVIDER_HOST_ALLOWLIST[providerKey]}, got ${host}`);
  }
}

export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024; // 8 MB — a daily point series is tiny; anything larger is wrong.
export const FETCH_TIMEOUT_MS = 30_000;
