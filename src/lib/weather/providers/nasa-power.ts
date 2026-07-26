// VI-P8 — NASA POWER (global agroclimate point, ~0.5°, keyless, UTC-day). The universal fallback + the
// non-US path (Bhutan → GLOBAL_COARSE). Daily T2M_MAX/T2M_MIN/PRECTOTCORR; missing values are the -999 fill.
// POWER's daily RH is a MEAN (not max/min), so RH is left null here — true RH max/min comes from gridMET.

import { fetchJson, isoToCompact } from "./fetch-util";
import { ProviderFetchError, type ClimateProvider, type DailyRecord, type ProviderSeries } from "./types";

const POWER_FILL = -999;
const clean = (v: unknown): number | null => (typeof v === "number" && v > POWER_FILL ? v : null);

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
    };
  },
};
