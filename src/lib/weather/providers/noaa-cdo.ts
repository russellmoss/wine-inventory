// VI-P8 — NOAA CDO v2 (history + 1991–2020 normals). Token-gated (NOAA_CDO_TOKEN) → hidden when unset. Caps:
// 10k requests/DAY, 5 req/s → the daily-keyed WeatherProviderUsage enforces headroom (council R1). Used for
// history/normals, NOT the daily hot path. GHCND daily values arrive in tenths (°C ×10, mm ×10).

import { fetchJson } from "./fetch-util";
import { isCdoConfigured, NOAA_CDO_TOKEN } from "../config";
import { ProviderFetchError, type ClimateProvider, type DailyRecord, type ProviderSeries } from "./types";

/**
 * Pure: fold CDO's long-format `results` (one row per {date, datatype, value}) into wide DailyRecords.
 * TMAX/TMIN are °C×10; PRCP is mm×10. Committed-fixture tested.
 */
export function normalizeCdoResults(json: unknown): DailyRecord[] {
  const results = (json as { results?: Array<{ date?: string; datatype?: string; value?: number }> })?.results;
  if (!Array.isArray(results)) throw new ProviderFetchError("noaa_cdo", "parse", "missing results array");
  const byDate = new Map<string, DailyRecord>();
  for (const r of results) {
    if (!r.date || typeof r.value !== "number") continue;
    const sourceDate = r.date.slice(0, 10);
    let rec = byDate.get(sourceDate);
    if (!rec) {
      rec = { sourceDate, tmaxC: null, tminC: null, precipMm: null, rhMaxPct: null, rhMinPct: null };
      byDate.set(sourceDate, rec);
    }
    if (r.datatype === "TMAX") rec.tmaxC = r.value / 10;
    else if (r.datatype === "TMIN") rec.tminC = r.value / 10;
    else if (r.datatype === "PRCP") rec.precipMm = r.value / 10;
  }
  return [...byDate.values()].sort((a, b) => (a.sourceDate < b.sourceDate ? -1 : 1));
}

export const noaaCdoProvider: ClimateProvider = {
  key: "noaa_cdo",
  kind: "station",
  obsConvention: "AM_LST",
  resolutionM: null,
  capabilities: ["tmax", "tmin", "precip"],
  coverageFor: (lat, lon) => (isCdoConfigured() && lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66 ? "US_HIGH_RES" : "UNAVAILABLE"),
  async fetchDailySeries(lat, lon, startIso, endIso): Promise<ProviderSeries> {
    if (!isCdoConfigured()) throw new ProviderFetchError("noaa_cdo", "not_configured", "NOAA_CDO_TOKEN unset");
    const ext = `${lat - 0.4},${lon - 0.4},${lat + 0.4},${lon + 0.4}`;
    const url =
      `https://www.ncdc.noaa.gov/cdo-web/api/v2/data?datasetid=GHCND&datatypeid=TMAX&datatypeid=TMIN&datatypeid=PRCP` +
      `&units=metric&extent=${ext}&startdate=${startIso}&enddate=${endIso}&limit=1000`;
    const json = await fetchJson("noaa_cdo", url, { headers: { token: NOAA_CDO_TOKEN } });
    const records = normalizeCdoResults(json);
    if (records.length === 0) throw new ProviderFetchError("noaa_cdo", "empty", "no CDO records");
    return {
      providerKey: "noaa_cdo",
      kind: "station",
      obsConvention: "AM_LST",
      resolutionM: null,
      attribution: "NOAA NCEI Climate Data Online (GHCN-Daily)",
      sourceUrl: url,
      records,
    };
  },
};
