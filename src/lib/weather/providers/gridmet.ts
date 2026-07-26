// VI-P8 — gridMET (4 km CONUS daily, ~14h latency). Fetched via RCC-ACIS GridData grid 21 (keyless JSON —
// avoids NetCDF/THREDDS). Bucketed on local civil day (MIDNIGHT_LOCAL). NOTE: ACIS GridData grid 21 exposes
// maxt/mint/pcpn but NOT rmax/rmin (verified live — `bad args`), so this adapter doesn't carry RH. True
// gridMET RH (for 4B disease inputs) needs a direct-gridMET adapter — a documented Later plug-in.

import { postJson } from "./fetch-util";
import { ProviderFetchError, type ClimateProvider, type DailyRecord, type ProviderSeries } from "./types";

/** ACIS cell value: number, or "M" (missing) / "T" (trace → 0) / -999 (fill). */
export function cleanAcis(v: unknown): number | null {
  if (typeof v === "number") return v <= -999 ? null : v;
  if (v === "T") return 0; // trace precipitation
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) && n > -999 ? n : null;
  }
  return null;
}

/**
 * Pure normalizer for an ACIS GridData/StnData `data` array of rows [date, maxt, mint, pcpn, rmax?, rmin?].
 * Committed-fixture tested.
 */
export function normalizeAcisRows(json: unknown, withRh = false): DailyRecord[] {
  const data = (json as { data?: unknown[] })?.data;
  if (!Array.isArray(data)) throw new ProviderFetchError("gridmet", "parse", "missing data array");
  const records: DailyRecord[] = [];
  for (const row of data) {
    if (!Array.isArray(row) || typeof row[0] !== "string") continue;
    records.push({
      sourceDate: row[0],
      tmaxC: cleanAcis(row[1]),
      tminC: cleanAcis(row[2]),
      precipMm: cleanAcis(row[3]),
      rhMaxPct: withRh ? cleanAcis(row[4]) : null,
      rhMinPct: withRh ? cleanAcis(row[5]) : null,
    });
  }
  return records;
}

// CONUS bbox (rough) — gridMET coverage. Outside → not this provider.
function inConus(lat: number, lon: number): boolean {
  return lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66;
}

export const gridmetProvider: ClimateProvider = {
  key: "gridmet",
  kind: "grid",
  role: "live",
  obsConvention: "MIDNIGHT_LOCAL",
  resolutionM: 4_000,
  capabilities: ["tmax", "tmin", "precip"],
  coverageFor: (lat, lon) => (inConus(lat, lon) ? "US_HIGH_RES" : "UNAVAILABLE"),
  async fetchDailySeries(lat, lon, startIso, endIso): Promise<ProviderSeries> {
    const url = "https://data.rcc-acis.org/GridData";
    const params = {
      loc: `${lon},${lat}`,
      grid: "21", // gridMET
      sdate: startIso,
      edate: endIso,
      elems: [
        { name: "maxt", units: "degreeC" },
        { name: "mint", units: "degreeC" },
        { name: "pcpn", units: "mm" },
      ],
    };
    const json = await postJson("gridmet", url, params);
    const records = normalizeAcisRows(json, false);
    if (records.length === 0) throw new ProviderFetchError("gridmet", "empty", "no gridMET records");
    return {
      providerKey: "gridmet",
      kind: "grid",
      obsConvention: "MIDNIGHT_LOCAL",
      resolutionM: 4_000,
      attribution: "gridMET (Climatology Lab, U. Idaho) via RCC-ACIS",
      sourceUrl: url,
      records,
    };
  },
};
