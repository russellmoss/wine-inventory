// VI-P8 — NASA POWER (global agroclimate point, ~0.5°, keyless, UTC-day). The universal fallback + the
// non-US path (Bhutan → GLOBAL_COARSE). Daily T2M_MAX/T2M_MIN/PRECTOTCORR; missing values are the -999 fill.
// POWER's daily RH is a MEAN (not max/min), so RH is left null here — true RH max/min comes from gridMET.

import { fetchJson, isoToCompact } from "./fetch-util";
import { ProviderFetchError, type ClimateProvider, type DailyRecord, type ProviderSeries } from "./types";

const POWER_FILL = -999;
const clean = (v: unknown): number | null => (typeof v === "number" && v > POWER_FILL ? v : null);

/**
 * POWER reports the elevation of the GRID CELL it answered with, as the third element of
 * `geometry.coordinates` ([lon, lat, elevationM]). That number is the single most important piece of
 * provenance this adapter carries: in Himalayan terrain the cell mean sits 1.0–1.8 km above the
 * vineyard, which is exactly the 4.8–9.7 °C cold bias measured at Bhutan
 * (`docs/analysis/bhutan-nasa-power-elevation-bias.md`). It used to be discarded. It is now surfaced
 * so `source-fidelity-core` can refuse the temperature-derived classifications rather than mislabel them.
 */
export function parsePowerCellElevationM(json: unknown): number | null {
  const coords = (json as { geometry?: { coordinates?: unknown } })?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 3) return null;
  const elev = Number(coords[2]);
  // POWER uses the same -999 fill here as it does for parameters.
  return Number.isFinite(elev) && elev > POWER_FILL ? elev : null;
}

/** Pure normalizer — committed-fixture tested. Parses the POWER JSON into sourceDate-keyed DailyRecords. */
export function normalizePowerResponse(json: unknown): DailyRecord[] {
  const param = (json as { properties?: { parameter?: Record<string, Record<string, number>> } })?.properties
    ?.parameter;
  if (!param || typeof param !== "object") {
    throw new ProviderFetchError("nasa_power", "parse", "missing properties.parameter");
  }
  const tmax = param.T2M_MAX ?? {};
  const tmin = param.T2M_MIN ?? {};
  const precip = param.PRECTOTCORR ?? {};
  const days = new Set<string>([...Object.keys(tmax), ...Object.keys(tmin), ...Object.keys(precip)]);
  const records: DailyRecord[] = [];
  for (const key of [...days].sort()) {
    if (!/^\d{8}$/.test(key)) continue; // skip non-date keys
    const sourceDate = `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`;
    records.push({
      sourceDate,
      tmaxC: clean(tmax[key]),
      tminC: clean(tmin[key]),
      precipMm: clean(precip[key]),
      rhMaxPct: null,
      rhMinPct: null,
    });
  }
  return records;
}

export const nasaPowerProvider: ClimateProvider = {
  key: "nasa_power",
  kind: "grid",
  role: "live",
  obsConvention: "UTC",
  resolutionM: 50_000,
  capabilities: ["tmax", "tmin", "precip"],
  coverageFor: () => "GLOBAL_COARSE", // global — always available as the coarse fallback
  async fetchDailySeries(lat, lon, startIso, endIso): Promise<ProviderSeries> {
    const url =
      `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR` +
      `&community=AG&latitude=${lat}&longitude=${lon}&start=${isoToCompact(startIso)}&end=${isoToCompact(endIso)}&format=JSON`;
    const json = await fetchJson("nasa_power", url);
    const records = normalizePowerResponse(json);
    if (records.length === 0) throw new ProviderFetchError("nasa_power", "empty", "no daily records");
    return {
      providerKey: "nasa_power",
      kind: "grid",
      obsConvention: "UTC",
      resolutionM: 50_000,
      attribution: "NASA POWER (Prediction Of Worldwide Energy Resources)",
      sourceUrl: url,
      records,
      sourceElevationM: parsePowerCellElevationM(json),
    };
  },
};
