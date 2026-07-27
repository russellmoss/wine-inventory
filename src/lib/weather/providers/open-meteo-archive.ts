// The Open-Meteo ERA5 archive adapter — the ELEVATION-CORRECTED global daily series.
//
// Why this exists: `nasa_power` is a ~50 km grid and returns the temperature of its cell's MEAN
// elevation. At the Bhutan vineyards that cell sits 1.0–1.8 km above the site, so the stored series
// ran 4.8–9.7 °C cold and the grower was shown Winkler Region I where the site is Region V
// (`docs/analysis/bhutan-nasa-power-elevation-bias.md`). The FORECAST half of the same card was
// already fixed for exactly this — `forecast-open-meteo.ts` passes `elevation=` and its header names
// "the Bhutan-at-2,302 m case". This adapter applies that same, already-decided correction to the
// OBSERVED half, so history and forecast finally describe the same place.
//
// `elevation=` drives Open-Meteo's statistical downscaling; omitted, it defaults to a 90 m DEM lookup
// at the coordinate (live-verified: the response `elevation` came back equal to the DEM endpoint's
// value at every site tested). We pass the resolved site elevation when we have one so the downscale
// target is OUR recorded elevation rather than a second, possibly-disagreeing lookup — and echo the
// response's `elevation` back as `sourceElevationM` so `source-fidelity-core` can check our work.
//
// Obs convention: `timezone=` is passed, so days are bucketed on the vineyard-LOCAL civil midnight —
// unlike POWER, which is UTC-bucketed. Attribution is CC BY 4.0 and mandatory.

import { OPEN_METEO_API_KEY, OPEN_METEO_BASE_URL } from "../config";
import { fetchJsonRetry } from "./fetch-util";
import { ProviderFetchError, type ClimateProvider, type DailyRecord, type ProviderSeries } from "./types";

export const OPEN_METEO_ARCHIVE_ATTRIBUTION = "ERA5 reanalysis via Open-Meteo.com (CC BY 4.0)";

/** The archive host is separate from the forecast host; both are already on the SSRF allowlist. */
const ARCHIVE_BASE = "https://archive-api.open-meteo.com";

interface ArchiveDaily {
  time?: string[];
  temperature_2m_max?: Array<number | null>;
  temperature_2m_min?: Array<number | null>;
  precipitation_sum?: Array<number | null>;
  relative_humidity_2m_max?: Array<number | null>;
  relative_humidity_2m_min?: Array<number | null>;
}

const at = (arr: Array<number | null> | undefined, i: number): number | null => {
  const v = arr?.[i];
  return v === undefined || v === null || !Number.isFinite(v) ? null : v;
};

/**
 * Pure normalizer — fixture-tested. Open-Meteo returns parallel arrays keyed by `daily.time`; a missing
 * slot is `null`, never 0 (R11: we do not fabricate a value we were not given).
 */
export function normalizeArchiveResponse(json: unknown): { records: DailyRecord[]; sourceElevationM: number | null } {
  const root = json as { daily?: ArchiveDaily; elevation?: unknown };
  const daily = root?.daily;
  if (!daily || !Array.isArray(daily.time)) {
    throw new ProviderFetchError("open_meteo_archive", "parse", "missing daily.time");
  }
  const records: DailyRecord[] = daily.time.map((sourceDate, i) => ({
    sourceDate,
    tmaxC: at(daily.temperature_2m_max, i),
    tminC: at(daily.temperature_2m_min, i),
    precipMm: at(daily.precipitation_sum, i),
    rhMaxPct: at(daily.relative_humidity_2m_max, i),
    rhMinPct: at(daily.relative_humidity_2m_min, i),
  }));
  const elev = Number(root?.elevation);
  return { records, sourceElevationM: Number.isFinite(elev) ? elev : null };
}

const DAILY_VARS = [
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "relative_humidity_2m_max",
  "relative_humidity_2m_min",
].join(",");

export function buildArchiveUrl(
  lat: number,
  lon: number,
  startIso: string,
  endIso: string,
  opts: { siteElevationM?: number | null; timeZone?: string } = {},
): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: startIso,
    end_date: endIso,
    daily: DAILY_VARS,
    // Local civil-day bucketing at the site (declared as MIDNIGHT_LOCAL below). `auto` resolves the
    // zone from the coordinate, so this never depends on a stored tz that may not be set yet.
    timezone: opts.timeZone ?? "auto",
  });
  if (opts.siteElevationM !== null && opts.siteElevationM !== undefined && Number.isFinite(opts.siteElevationM)) {
    params.set("elevation", String(Math.round(opts.siteElevationM)));
  }
  if (OPEN_METEO_API_KEY) params.set("apikey", OPEN_METEO_API_KEY);
  // The paid swap sets OPEN_METEO_BASE_URL; the free archive lives on its own host.
  const base = OPEN_METEO_BASE_URL.includes("customer-api") ? OPEN_METEO_BASE_URL : ARCHIVE_BASE;
  return `${base}/v1/archive?${params.toString()}`;
}

export const openMeteoArchiveProvider: ClimateProvider = {
  key: "open_meteo_archive",
  kind: "grid",
  role: "live",
  // ERA5 is bucketed to the requested timezone — the vineyard-local civil day, no shift needed.
  obsConvention: "MIDNIGHT_LOCAL",
  // ERA5's native cell is ~31 km, but the delivered series is statistically downscaled to a 90 m DEM
  // elevation, so the EFFECTIVE vertical resolution at the site is far finer than the horizontal cell.
  resolutionM: 31_000,
  capabilities: ["tmax", "tmin", "precip", "rhMax", "rhMin"],
  coverageFor: () => "GLOBAL_COARSE", // global, like POWER — but elevation-corrected.
  async fetchDailySeries(lat, lon, startIso, endIso, opts): Promise<ProviderSeries> {
    const url = buildArchiveUrl(lat, lon, startIso, endIso, { siteElevationM: opts?.siteElevationM ?? null });
    // RETRIES, unlike the other observation adapters. Their no-retry stance rests on "the daily
    // cadence absorbs a transient miss" — which is false here: a 20-year history request is one-shot,
    // Open-Meteo's free tier 429s under it, and the fallback on failure is `nasa_power`, the very
    // source whose elevation bias this adapter exists to replace. A miss is not absorbed; it silently
    // reinstates the wrong series. (The fidelity guard then withholds the classifications rather than
    // showing wrong ones, so the failure is safe — but it is still a failure worth retrying past.)
    const { records, sourceElevationM } = normalizeArchiveResponse(
      await fetchJsonRetry("open_meteo_archive", url, { retries: 4 }),
    );
    if (records.length === 0) throw new ProviderFetchError("open_meteo_archive", "empty", "no daily records");
    return {
      providerKey: "open_meteo_archive",
      kind: "grid",
      obsConvention: "MIDNIGHT_LOCAL",
      resolutionM: 31_000,
      attribution: OPEN_METEO_ARCHIVE_ATTRIBUTION,
      sourceUrl: url,
      records,
      sourceElevationM,
    };
  },
};
