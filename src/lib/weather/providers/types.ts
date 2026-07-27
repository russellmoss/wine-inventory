// VI-P8 (Release 4A weather/climate) — the ClimateProvider contract + normalized record shape.
// Council R1/R2: providers stay tz-AGNOSTIC. Each adapter returns a normalized daily series keyed by its own
// SOURCE day (`sourceDate`) plus the `obsConvention` needed to map that into the vineyard-local civil day at
// ingest (obs-time-core). The impure fetch edge is kept separate from pure normalization so normalization is
// unit-testable against committed fixture responses (no live calls in CI).

/** The metrics a provider can carry. RH comes from grids only (COOP stations don't measure it). */
export type WeatherMetric = "tmax" | "tmin" | "precip" | "rhMax" | "rhMin";

/** How a provider stamps its daily value in time — drives the obs-time shift to a vineyard-local civil day. */
export type ObsConvention =
  | "AM_LST" // AM-observation station (COOP/ACIS): a value stamped ~7–8am LST covers the PRIOR 24h.
  | "MIDNIGHT_LOCAL" // grid product bucketed on the local civil midnight.
  | "UTC"; // grid product bucketed on UTC midnight.

/** Where a vineyard falls in the coverage tiers (design §6.1). Never a blank for a real vineyard. */
export type CoverageState = "US_HIGH_RES" | "GLOBAL_COARSE" | "UNAVAILABLE";

/** Provider identity keys — also the `providerKey` stored on each VineyardClimateDaily row. */
export type ProviderKey =
  | "gridmet"
  | "daymet"
  | "nasa_power"
  | "open_meteo_archive"
  | "rcc_acis"
  | "noaa_cdo"
  | "usgs_epqs";

/**
 * One normalized daily observation from a single provider. `sourceDate` is the provider's OWN calendar day
 * (ISO `YYYY-MM-DD`); it is NOT yet the vineyard-local `localDate` — obs-time-core maps it at ingest.
 * All temps °C, precip mm, RH %. A metric the provider doesn't carry is `null` (never fabricated as 0).
 */
export interface DailyRecord {
  sourceDate: string; // ISO YYYY-MM-DD, the provider's own day
  tmaxC: number | null;
  tminC: number | null;
  precipMm: number | null;
  rhMaxPct: number | null;
  rhMinPct: number | null;
}

/** A provider's fetched series + the metadata needed to attribute + obs-time-map it. */
export interface ProviderSeries {
  providerKey: ProviderKey;
  kind: "grid" | "station";
  obsConvention: ObsConvention;
  resolutionM: number | null; // nominal grid resolution (m); null for a point station
  attribution: string;
  sourceUrl: string; // the endpoint hit (provenance; never rendered to the grower)
  records: DailyRecord[];
  /**
   * The elevation (m) the series ACTUALLY DESCRIBES — not the vineyard's.
   *
   * A ~50 km grid product reports the temperature of its cell's MEAN elevation. In flat terrain that
   * is the site; in mountains it is a different place. At Bhutan Bajo, NASA POWER self-reports a cell
   * elevation of 3,038 m for a vineyard at 1,229 m, and the stored series runs 9.7 °C cold as a result
   * (`docs/analysis/bhutan-nasa-power-elevation-bias.md`). Providers that publish this MUST surface it
   * so `source-fidelity-core` can refuse a classification instead of mislabelling one (rule §3.6).
   * `null` = the provider does not publish it → fidelity is UNKNOWN, never silently "fine".
   */
  sourceElevationM?: number | null;
  // Station-only context (used by source selection + the config row).
  stationId?: string;
  stationName?: string;
  stationLat?: number;
  stationLon?: number;
}

/** A typed provider fault — a failed fetch throws this, never a partial/fabricated record (council R11). */
/**
 * Every outbound weather source, observation OR forecast (plan 096 U4). The fetch edge + SSRF
 * allowlist key on this so the Phase-2 forecast adapters (nws/open_meteo) share the same guarded
 * pipe as the observation providers instead of growing a second fetch path.
 */
export type WeatherSourceKey = ProviderKey | "nws" | "open_meteo";

export class ProviderFetchError extends Error {
  constructor(
    public providerKey: WeatherSourceKey,
    public reason: "http" | "parse" | "empty" | "oversized" | "redirect" | "timeout" | "not_configured",
    message: string,
    /** HTTP status when reason is "http" — the retry policy keys on it (plan 096 U24). */
    public status?: number,
  ) {
    super(`[${providerKey}] ${reason}: ${message}`);
    this.name = "ProviderFetchError";
  }
}

/**
 * The provider adapter. `coverageFor` is pure (lat/lon → tier). `fetchDailySeries` is the impure edge.
 * `capabilities` declares which metrics the provider carries (RH only on grids).
 */
export interface ClimateProvider {
  key: ProviderKey;
  kind: "grid" | "station";
  /**
   * `live` = usable for the current/in-season window (gridMET ~14h latency, ACIS daily, POWER).
   * `history` = baseline/normals only, lags too far to drive in-season GDD/frost (Daymet ~3mo release;
   * NOAA CDO history/normals). The in-season sweep uses `live`; history is opt-in.
   */
  role: "live" | "history";
  obsConvention: ObsConvention;
  resolutionM: number | null;
  capabilities: WeatherMetric[];
  /** Pure: does this provider cover the point, and at what tier. */
  coverageFor(lat: number, lon: number): CoverageState;
  /**
   * Impure: fetch + normalize a daily series for [startIso, endIso]. Throws ProviderFetchError on failure.
   * `opts.siteElevationM` is the resolved vineyard elevation; a provider that supports statistical
   * downscaling (Open-Meteo archive) uses it, and every other adapter ignores it.
   */
  fetchDailySeries(
    lat: number,
    lon: number,
    startIso: string,
    endIso: string,
    opts?: { siteElevationM?: number | null },
  ): Promise<ProviderSeries>;
}
