// VI-P8 — RCC-ACIS station data (keyless US daily). The "trusted nearby NOAA station" the grower already
// uses. AM-observation convention (COOP reports ~7–8am LST for the prior 24h) → obs-time-core applies the met
// shift at ingest. Finds the nearest station to the vineyard via StnMeta, then pulls its daily series.

import { postJson } from "./fetch-util";
import { normalizeAcisRows } from "./gridmet";
import { ProviderFetchError, type ClimateProvider, type ProviderSeries } from "./types";

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface AcisStation {
  sid: string;
  name: string;
  lat: number;
  lon: number;
  elevM: number | null;
  distanceM: number;
}

/** Pure: pick the nearest station from a StnMeta response to the target point. */
export function nearestStation(json: unknown, lat: number, lon: number): AcisStation | null {
  const metas = (json as { meta?: Array<{ name?: string; ll?: [number, number]; sids?: string[]; elev?: number }> })
    ?.meta;
  if (!Array.isArray(metas)) return null;
  let best: AcisStation | null = null;
  for (const m of metas) {
    if (!m.ll || !Array.isArray(m.sids) || m.sids.length === 0) continue;
    const [sLon, sLat] = m.ll;
    // Prefer a GHCN-Daily sid ("...6" network) but any works for StnData.
    const sid = (m.sids.find((s) => s.endsWith(" 2") || s.endsWith(" 6")) ?? m.sids[0]).split(" ")[0];
    const distanceM = haversineM(lat, lon, sLat, sLon);
    const elevM = typeof m.elev === "number" ? m.elev * 0.3048 : null; // ACIS elev is feet
    if (!best || distanceM < best.distanceM) {
      best = { sid, name: m.name ?? sid, lat: sLat, lon: sLon, elevM, distanceM };
    }
  }
  return best;
}

/** ~0.4° box around the point (~40 km) to search for stations. */
function bboxAround(lat: number, lon: number, pad = 0.4): string {
  return `${lon - pad},${lat - pad},${lon + pad},${lat + pad}`;
}

export async function findNearestAcisStation(lat: number, lon: number): Promise<AcisStation | null> {
  const url = "https://data.rcc-acis.org/StnMeta";
  const json = await postJson("rcc_acis", url, {
    bbox: bboxAround(lat, lon),
    meta: ["name", "ll", "sids", "elev"],
    elems: "maxt",
  });
  return nearestStation(json, lat, lon);
}

export const rccAcisProvider: ClimateProvider = {
  key: "rcc_acis",
  kind: "station",
  role: "live",
  obsConvention: "AM_LST",
  resolutionM: null,
  capabilities: ["tmax", "tmin", "precip"],
  coverageFor: (lat, lon) => (lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66 ? "US_HIGH_RES" : "UNAVAILABLE"),
  async fetchDailySeries(lat, lon, startIso, endIso): Promise<ProviderSeries> {
    const station = await findNearestAcisStation(lat, lon);
    if (!station) throw new ProviderFetchError("rcc_acis", "empty", "no station near the vineyard");
    const url = "https://data.rcc-acis.org/StnData";
    const json = await postJson("rcc_acis", url, {
      sid: station.sid,
      sdate: startIso,
      edate: endIso,
      elems: [
        { name: "maxt", units: "degreeC" },
        { name: "mint", units: "degreeC" },
        { name: "pcpn", units: "mm" },
      ],
    });
    const records = normalizeAcisRows(json, false);
    if (records.length === 0) throw new ProviderFetchError("rcc_acis", "empty", `no data for station ${station.sid}`);
    return {
      providerKey: "rcc_acis",
      kind: "station",
      obsConvention: "AM_LST",
      resolutionM: null,
      attribution: `RCC-ACIS station ${station.name}`,
      sourceUrl: url,
      records,
      stationId: station.sid,
      stationName: station.name,
      stationLat: station.lat,
      stationLon: station.lon,
    };
  },
};
