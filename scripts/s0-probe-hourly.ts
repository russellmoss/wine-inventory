/**
 * S0 Unit 2 — LIVE HOURLY FIELD INVENTORY, with series-kind classification.
 *
 * Run:  npx tsx scripts/s0-probe-hourly.ts
 *       npx tsx scripts/s0-probe-hourly.ts --quick     (skips the issuance-cadence sampling)
 *
 * Answers runbook question 1 with evidence, and turns council C3 from a schema note into a MEASURED
 * provider taxonomy. Every field is classified OBSERVED / FORECAST / REANALYSIS with the three
 * timestamps council C4 requires — `validTime`, `providerIssuedAt`, `ingestedAt` — because
 * seriesKind + issuedAt + validTime is NOT sufficient bitemporality for "facts as of then". A delayed
 * cron run, a QC revision, or a later provider revision of the same valid hour all break replay if
 * you store only provider issuance and valid time.
 *
 * The probe FAILS LOUDLY if a field the data-sources design marked ✅ is absent, so the doc's claims
 * are re-verified rather than trusted.
 *
 * Writes:  docs/spray_assistant/phases/s0-hourly-field-inventory.md
 *          docs/spray_assistant/phases/s0-hourly-field-inventory.json   (the sidecar Units 3 and 5 import)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  OPEN_METEO_ATTRIBUTION,
  POLITE_MS,
  S0_SITES,
  haversineM,
  probeJson,
  sleep,
  type S0Site,
} from "./s0-sites";

const QUICK = process.argv.includes("--quick");
const OUT_DIR = join(process.cwd(), "docs", "spray_assistant", "phases");
const OUT_MD = join(OUT_DIR, "s0-hourly-field-inventory.md");
const OUT_JSON = join(OUT_DIR, "s0-hourly-field-inventory.json");

// ─────────────────────────────────────────────────────────────────────────────
// Council C3 + C4 vocabulary. THREE timestamps, not two.
// ─────────────────────────────────────────────────────────────────────────────

/** What a row IS, not merely where it came from. The three are different ACQUISITION MODES with
 *  different economics — observe forward, forecast forward, reanalyze backward — and a schema that
 *  merely tags rows with a kind misses that. */
export type SeriesKind = "OBSERVED" | "FORECAST" | "REANALYSIS";

export type FieldRecord = {
  field: string;
  present: boolean;
  units: string | null;
  /** share of sampled slots where the value was null/missing */
  nullDensity: number | null;
  /** native reporting interval in hours; sub-hourly sources report < 1 */
  nativeIntervalH: number | null;
  kind: SeriesKind;
  /** does the payload carry a per-slot valid time? (all three kinds should) */
  hasValidTime: boolean;
  /** does the payload carry a DISTINCT provider issuance timestamp, separate from valid time? */
  hasProviderIssuedAt: boolean;
  /** our own capture time — always synthesizable, recorded for completeness */
  ingestedAtSynthesizable: true;
  /** is this re-fetchable later, or lost if not captured now? (Unit 0 answers this for OBSERVED) */
  refetchable: boolean | null;
  note: string;
};

export type ProviderReport = {
  providerKey: string;
  endpoint: string;
  kind: SeriesKind;
  siteKey: string;
  ok: boolean;
  httpStatus: number;
  fields: FieldRecord[];
  /** measured retained horizon in hours — §1.4's ceiling is derived from this, not assumed */
  retainedHorizonH: number | null;
  /** measured, per property where the payload distinguishes them */
  intervalWidthsH: Record<string, number[]> | null;
  providerIssuedAt: string | null;
  note: string;
};

const reports: ProviderReport[] = [];
const failures: string[] = [];

const push = (r: ProviderReport) => {
  reports.push(r);
  const n = r.fields.filter((f) => f.present).length;
  console.log(
    `  [${r.ok ? "ok " : "FAIL"}] ${r.providerKey.padEnd(22)} ${r.siteKey.padEnd(14)} ${r.kind.padEnd(10)} ${n}/${r.fields.length} fields · horizon ${r.retainedHorizonH ?? "—"}h · ${r.note}`,
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// What the data-sources design CLAIMS. The probe asserts against this, so a stale doc fails loudly
// rather than being inherited. (design §2.3 / §2.4; the CART input set is the first four.)
// ─────────────────────────────────────────────────────────────────────────────
const DESIGN_CLAIMS: Record<string, string[]> = {
  "nws:gridpoints-raw": ["temperature", "dewpoint", "relativeHumidity", "windSpeed", "skyCover", "quantitativePrecipitation"],
  "open_meteo:forecast-default": ["temperature_2m", "relative_humidity_2m", "dew_point_2m", "wind_speed_10m", "precipitation", "cloud_cover"],
  "open_meteo:archive-era5": ["temperature_2m", "relative_humidity_2m", "dew_point_2m", "wind_speed_10m", "precipitation", "cloud_cover"],
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. NWS raw gridpoint — FORECAST. The endpoint `forecast-nws.ts` ALREADY calls for
//    `quantitativePrecipitation`, discarding everything else in the response.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Minimal named shapes for the provider payloads. Typed rather than `any`: every other
// script in `scripts/` is `any`-free and these are stable, documented response shapes.
// ─────────────────────────────────────────────────────────────────────────────

type NwsIntervalValue = { validTime: string; value: number | null };
type NwsSeries = { uom?: string | null; values?: NwsIntervalValue[] };
/** The raw gridpoint's `properties`: two scalars plus one series per weather variable. */
type NwsGridpointProps = { updateTime?: string; generatedAt?: string } & Record<string, unknown>;
const seriesOf = (p: NwsGridpointProps, key: string): NwsSeries | undefined =>
  p[key] as NwsSeries | undefined;

type NwsQuantity = { value: number | null; unitCode?: string; qualityControl?: string };
type NwsHourlyPeriodRaw = Record<string, number | string | NwsQuantity | null | undefined>;
type NwsFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, unknown>;
};

type OpenMeteoPayload = {
  hourly?: Record<string, Array<number | null> | string[]>;
  hourly_units?: Record<string, string>;
  elevation?: number;
  generationtime_ms?: number;
};

type NasaPowerPayload = {
  properties?: { parameter?: Record<string, Record<string, number>> };
  parameters?: Record<string, { units?: string }>;
};

type StationSummary = {
  stationId: string;
  distanceM: number;
  stationElevM: number | null;
  qcVocab: string[];
  obsPer24h: number;
};

type HourlyInventoryOut = {
  probedAt: string;
  attribution: string;
  grids: Record<string, NwsGrid | null>;
  stations: Record<string, StationSummary | null>;
  reports: ProviderReport[];
  cadence: CadenceSample | null;
  updateTimeEvidence: UpdateTimeEvidence | null;
  era5LandWindAllNull: boolean;
  designClaimFailures: string[];
  rollupRule: typeof ROLLUP_RULE;
};

type CadenceSample = {
  site: string;
  samples: Array<{ at: string; updateTime: string | null }>;
  distinctIssuances: string[];
  gapsMin: number[];
  windowMin: number;
};

type UpdateTimeEvidence = { site: string; startSpreadMin: number; updateTime?: string; generatedAt?: string };

type NwsGrid = { gridId: string; gridX: number; gridY: number; stationsUrl: string };

async function nwsGrid(site: S0Site): Promise<NwsGrid | null> {
  const res = await probeJson<{ properties?: Record<string, unknown> }>(
    `https://api.weather.gov/points/${site.lat.toFixed(4)},${site.lon.toFixed(4)}`,
  );
  if (!res.ok) return null;
  const p = (res.body.properties ?? {}) as Record<string, unknown>;
  return {
    gridId: String(p.gridId),
    gridX: Number(p.gridX),
    gridY: Number(p.gridY),
    stationsUrl: String(p.observationStations),
  };
}

/** ISO8601 interval "2026-07-26T18:00:00+00:00/PT6H" → hours. Widths DIFFER PER PROPERTY — the
 *  plan-097 lesson, and the reason this is measured per property rather than assumed globally. */
function intervalHours(validTime: string): number | null {
  const dur = validTime.split("/")[1];
  if (!dur) return null;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(dur);
  if (!m) return null;
  const [, d, h, min] = m;
  return (Number(d ?? 0) * 24) + Number(h ?? 0) + Number(min ?? 0) / 60;
}

const NWS_GRID_FIELDS = [
  "temperature",
  "dewpoint",
  "relativeHumidity",
  "windSpeed",
  "windDirection",
  "windGust",
  "skyCover",
  "quantitativePrecipitation",
  "probabilityOfPrecipitation",
  "apparentTemperature",
] as const;

async function probeNwsGridpoint(site: S0Site, grid: NwsGrid) {
  const url = `https://api.weather.gov/gridpoints/${grid.gridId}/${grid.gridX},${grid.gridY}`;
  const res = await probeJson<{ properties?: NwsGridpointProps }>(url);
  if (!res.ok) {
    push({
      providerKey: "nws:gridpoints-raw",
      endpoint: url,
      kind: "FORECAST",
      siteKey: site.key,
      ok: false,
      httpStatus: res.status,
      fields: [],
      retainedHorizonH: null,
      intervalWidthsH: null,
      providerIssuedAt: null,
      note: res.coverageSignal ? "404 coverage signal (non-US), not retried" : res.error.slice(0, 70),
    });
    return null;
  }
  const p: NwsGridpointProps = res.body.properties ?? {};
  const fields: FieldRecord[] = [];
  const widths: Record<string, number[]> = {};
  let maxEndMs = 0;
  const nowMs = Date.now();

  for (const f of NWS_GRID_FIELDS) {
    const node = seriesOf(p, f);
    const values: NwsIntervalValue[] = node?.values ?? [];
    const present = values.length > 0;
    if (present) {
      const w = values.map((v) => intervalHours(v.validTime)).filter((x): x is number => x != null);
      widths[f] = [...new Set(w)].sort((a, b) => a - b);
      for (const v of values) {
        const startMs = Date.parse(v.validTime.split("/")[0]);
        const h = intervalHours(v.validTime) ?? 1;
        maxEndMs = Math.max(maxEndMs, startMs + h * 3_600_000);
      }
    }
    const nulls = values.filter((v) => v.value == null).length;
    fields.push({
      field: f,
      present,
      units: node?.uom ?? null,
      nullDensity: present ? nulls / values.length : null,
      nativeIntervalH: present ? (widths[f]?.[0] ?? null) : null,
      kind: "FORECAST",
      hasValidTime: true,
      // `updateTime` is a SINGLE product-level timestamp, not per-property. See the note below.
      hasProviderIssuedAt: Boolean(p.updateTime),
      ingestedAtSynthesizable: true,
      refetchable: false, // a past issuance is NOT retrievable from this endpoint
      note: present ? `${values.length} slots, widths ${widths[f]?.join("/")}h` : "ABSENT",
    });
  }

  // The council design question: is `updateTime` a meaningful issuedAt, or just "last changed" on a
  // stitched product? Evidence: do different properties' series START at different times? If the
  // product were issued as one unit, every property would begin at the same instant.
  const starts = NWS_GRID_FIELDS.map((f) => {
    const v = seriesOf(p, f)?.values?.[0]?.validTime;
    return v ? Date.parse(v.split("/")[0]) : null;
  }).filter((x): x is number => x != null);
  const startSpreadMin = starts.length ? (Math.max(...starts) - Math.min(...starts)) / 60_000 : 0;

  push({
    providerKey: "nws:gridpoints-raw",
    endpoint: url,
    kind: "FORECAST",
    siteKey: site.key,
    ok: true,
    httpStatus: res.status,
    fields,
    retainedHorizonH: maxEndMs > 0 ? Math.round((maxEndMs - nowMs) / 3_600_000) : null,
    intervalWidthsH: widths,
    providerIssuedAt: p.updateTime ?? null,
    note: `updateTime=${p.updateTime ?? "—"} · property start spread ${startSpreadMin.toFixed(0)} min`,
  });
  return { site: site.key, startSpreadMin, updateTime: p.updateTime, generatedAt: p.generatedAt };
}

/** The `/forecast/hourly` endpoint production already parses — 156 strictly-one-hour periods,
 *  and NO humidity, NO dew point. Included so the inventory shows why the RAW endpoint is the one. */
async function probeNwsHourly(site: S0Site, grid: NwsGrid) {
  const url = `https://api.weather.gov/gridpoints/${grid.gridId}/${grid.gridX},${grid.gridY}/forecast/hourly?units=si`;
  const res = await probeJson<{ properties?: { periods?: NwsHourlyPeriodRaw[]; updateTime?: string } }>(url);
  if (!res.ok) {
    push({
      providerKey: "nws:forecast-hourly",
      endpoint: url,
      kind: "FORECAST",
      siteKey: site.key,
      ok: false,
      httpStatus: res.status,
      fields: [],
      retainedHorizonH: null,
      intervalWidthsH: null,
      providerIssuedAt: null,
      note: res.coverageSignal ? "404 coverage signal" : res.error.slice(0, 70),
    });
    return;
  }
  const periods: NwsHourlyPeriodRaw[] = res.body.properties?.periods ?? [];
  const keys = ["temperature", "dewpoint", "relativeHumidity", "windSpeed", "probabilityOfPrecipitation"];
  const fields: FieldRecord[] = keys.map((k) => {
    const vals = periods.map((pd) => {
      const cell = pd[k];
      return cell !== null && typeof cell === "object" ? (cell as NwsQuantity).value : cell;
    });
    const nonNull = vals.filter((v) => v != null).length;
    return {
      field: k,
      present: nonNull > 0,
      units:
        periods[0]?.[k] !== null && typeof periods[0]?.[k] === "object"
          ? ((periods[0][k] as NwsQuantity).unitCode ?? null)
          : null,
      nullDensity: periods.length ? 1 - nonNull / periods.length : null,
      nativeIntervalH: 1,
      kind: "FORECAST",
      hasValidTime: true,
      hasProviderIssuedAt: Boolean(res.body.properties?.updateTime),
      ingestedAtSynthesizable: true,
      refetchable: false,
      note: nonNull > 0 ? `${nonNull}/${periods.length} non-null` : "ABSENT — this is why the RAW gridpoint is the CART source",
    };
  });
  push({
    providerKey: "nws:forecast-hourly",
    endpoint: url,
    kind: "FORECAST",
    siteKey: site.key,
    ok: true,
    httpStatus: res.status,
    fields,
    retainedHorizonH: periods.length,
    intervalWidthsH: { all: [1] },
    providerIssuedAt: res.body.properties?.updateTime ?? null,
    note: `${periods.length} one-hour periods`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. NWS station observations — OBSERVED. Council G2: station wind height and terrain exposure feed
//    the confidence band, so they are measured here rather than hand-waved in Unit 6.
// ─────────────────────────────────────────────────────────────────────────────

async function probeNwsObservations(site: S0Site, stationsUrl: string) {
  const stRes = await probeJson<{ features?: NwsFeature[] }>(stationsUrl);
  if (!stRes.ok || !(stRes.body.features ?? []).length) return null;
  const f0 = (stRes.body.features ?? [])
    .map((f) => {
      const [lon, lat] = f.geometry?.coordinates ?? [NaN, NaN];
      return { f, d: Number.isFinite(lat) ? haversineM(site.lat, site.lon, lat, lon) : Infinity, lat, lon };
    })
    .sort((a, b) => a.d - b.d)[0];
  const stationId = String(f0.f.properties?.stationIdentifier ?? "");
  const stationElevM = (f0.f.properties?.elevation as { value?: number } | undefined)?.value ?? null;

  const end = new Date();
  const start = new Date(end.getTime() - 24 * 3_600_000);
  const url = `https://api.weather.gov/stations/${stationId}/observations?start=${encodeURIComponent(start.toISOString().slice(0, 19) + "Z")}&end=${encodeURIComponent(end.toISOString().slice(0, 19) + "Z")}`;
  const res = await probeJson<{ features?: NwsFeature[] }>(url);
  if (!res.ok) return null;
  const obs: NwsFeature[] = res.body.features ?? [];
  const keys = ["temperature", "dewpoint", "relativeHumidity", "windSpeed", "windDirection", "precipitationLastHour", "barometricPressure"];
  const qcVocab = new Set<string>();
  const fields: FieldRecord[] = keys.map((k) => {
    let nonNull = 0;
    for (const o of obs) {
      const node = o.properties?.[k] as NwsQuantity | undefined;
      if (node?.value != null) nonNull++;
      if (node?.qualityControl) qcVocab.add(node.qualityControl);
    }
    return {
      field: k,
      present: nonNull > 0,
      units: (obs[0]?.properties?.[k] as NwsQuantity | undefined)?.unitCode ?? null,
      nullDensity: obs.length ? 1 - nonNull / obs.length : null,
      nativeIntervalH: obs.length > 1 ? 24 / obs.length : null,
      kind: "OBSERVED",
      hasValidTime: true,
      // an observation's valid time IS its issuance; there is no separate issuance concept
      hasProviderIssuedAt: false,
      ingestedAtSynthesizable: true,
      refetchable: true, // Unit 0: YES via NCEI ISD / IEM ASOS
      note: `${nonNull}/${obs.length} non-null`,
    };
  });
  const cadenceMin = obs.length > 1 ? (24 * 60) / obs.length : null;
  push({
    providerKey: "nws:station-observations",
    endpoint: url,
    kind: "OBSERVED",
    siteKey: site.key,
    ok: true,
    httpStatus: res.status,
    fields,
    retainedHorizonH: -168, // negative: this is a 7-day TRAILING window (Unit 0, measured)
    intervalWidthsH: cadenceMin ? { observation: [Number((cadenceMin / 60).toFixed(3))] } : null,
    providerIssuedAt: null,
    note: `${stationId} @ ${(f0.d / 1000).toFixed(1)}km · Δelev ${stationElevM != null ? (stationElevM - site.elevationM).toFixed(0) + "m" : "?"} · ${obs.length} obs/24h (~${cadenceMin?.toFixed(0)}min) · QC=[${[...qcVocab].sort().join("|")}]`,
  });
  return { stationId, distanceM: f0.d, stationElevM, qcVocab: [...qcVocab].sort(), obsPer24h: obs.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Open-Meteo forecast + archive.
// ─────────────────────────────────────────────────────────────────────────────

const OM_HOURLY = [
  "temperature_2m",
  "relative_humidity_2m",
  "dew_point_2m",
  "wind_speed_10m",
  "precipitation",
  "cloud_cover",
  "shortwave_radiation",
] as const;

async function probeOpenMeteo(
  site: S0Site,
  which: "forecast" | "archive",
  model: string | null,
  seasonYear?: number,
) {
  const host = which === "forecast" ? "https://api.open-meteo.com/v1/forecast" : "https://archive-api.open-meteo.com/v1/archive";
  const params = new URLSearchParams({
    latitude: String(site.lat),
    longitude: String(site.lon),
    hourly: OM_HOURLY.join(","),
    timezone: "UTC",
  });
  if (which === "forecast") params.set("forecast_days", "7");
  else {
    const y = seasonYear ?? 2024;
    params.set("start_date", `${y}-06-01`);
    params.set("end_date", `${y}-06-07`);
  }
  if (model) params.set("models", model);
  const url = `${host}?${params}`;
  const key = `open_meteo:${which}${model ? `-${model}` : "-default"}`;
  const res = await probeJson<OpenMeteoPayload>(url, { timeoutMs: 90_000 });
  if (!res.ok) {
    push({
      providerKey: key,
      endpoint: url,
      kind: which === "forecast" ? "FORECAST" : "REANALYSIS",
      siteKey: site.key,
      ok: false,
      httpStatus: res.status,
      fields: [],
      retainedHorizonH: null,
      intervalWidthsH: null,
      providerIssuedAt: null,
      note: res.coverageSignal ? "404 coverage signal" : res.error.slice(0, 70),
    });
    return;
  }
  const h = res.body.hourly ?? {};
  const units = res.body.hourly_units ?? {};
  const n = ((h.time as string[] | undefined) ?? []).length;
  const fields: FieldRecord[] = OM_HOURLY.map((v) => {
    const arr = (h[v] as Array<number | null> | undefined) ?? [];
    const nonNull = arr.filter((x) => x != null).length;
    return {
      field: v,
      present: arr.length > 0 && nonNull > 0,
      units: units[v] ?? null,
      nullDensity: arr.length ? 1 - nonNull / arr.length : null,
      nativeIntervalH: 1,
      kind: which === "forecast" ? "FORECAST" : "REANALYSIS",
      hasValidTime: true,
      // Open-Meteo exposes NO issuance timestamp on either endpoint — only `generationtime_ms`,
      // which is how long THIS request took to compute, not when the product was issued.
      hasProviderIssuedAt: false,
      ingestedAtSynthesizable: true,
      refetchable: which === "archive", // the archive is re-fetchable by definition; a past forecast issuance is not
      note: arr.length === 0 ? "ABSENT" : nonNull === 0 ? `ALL NULL (${arr.length} slots)` : `${nonNull}/${arr.length}`,
    };
  });
  push({
    providerKey: key,
    endpoint: url,
    kind: which === "forecast" ? "FORECAST" : "REANALYSIS",
    siteKey: site.key,
    ok: true,
    httpStatus: res.status,
    fields,
    retainedHorizonH: which === "forecast" ? n : null,
    intervalWidthsH: { all: [1] },
    providerIssuedAt: null,
    note: `${n} hourly slots · elevation=${res.body.elevation ?? "?"}m · gen ${res.body.generationtime_ms ?? "?"}ms`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. NASA POWER hourly — REANALYSIS. Bhutan's current primary.
// ─────────────────────────────────────────────────────────────────────────────

async function probeNasaPower(site: S0Site) {
  const params = new URLSearchParams({
    parameters: "T2M,RH2M,T2MDEW,WS2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN",
    community: "AG",
    longitude: String(site.lon),
    latitude: String(site.lat),
    start: "20240601",
    end: "20240607",
    format: "JSON",
    "time-standard": "UTC",
  });
  const url = `https://power.larc.nasa.gov/api/temporal/hourly/point?${params}`;
  const res = await probeJson<NasaPowerPayload>(url, { timeoutMs: 120_000 });
  if (!res.ok) {
    push({
      providerKey: "nasa_power:hourly",
      endpoint: url,
      kind: "REANALYSIS",
      siteKey: site.key,
      ok: false,
      httpStatus: res.status,
      fields: [],
      retainedHorizonH: null,
      intervalWidthsH: null,
      providerIssuedAt: null,
      note: res.error.slice(0, 70),
    });
    return;
  }
  const params_ = res.body?.properties?.parameter ?? {};
  const fields: FieldRecord[] = ["T2M", "RH2M", "T2MDEW", "WS2M", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN"].map((p) => {
    const obj: Record<string, number> = params_[p] ?? {};
    void obj;
    const vals = Object.values(obj);
    // NASA POWER's fill value is -999
    const good = vals.filter((v) => v > -900).length;
    return {
      field: p,
      present: vals.length > 0 && good > 0,
      units: res.body?.parameters?.[p]?.units ?? null,
      nullDensity: vals.length ? 1 - good / vals.length : null,
      nativeIntervalH: 1,
      kind: "REANALYSIS",
      hasValidTime: true,
      hasProviderIssuedAt: false,
      ingestedAtSynthesizable: true,
      refetchable: true,
      note: vals.length === 0 ? "ABSENT" : `${good}/${vals.length} (fill=-999 excluded)`,
    };
  });
  push({
    providerKey: "nasa_power:hourly",
    endpoint: url,
    kind: "REANALYSIS",
    siteKey: site.key,
    ok: true,
    httpStatus: res.status,
    fields,
    retainedHorizonH: null,
    intervalWidthsH: { all: [1] },
    providerIssuedAt: null,
    note: `wind is WS2M (2 m), NOT 10 m — a different quantity from every other provider here`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. NWS issuance-cadence sampling. §1.4's forecast ceiling must be DERIVED from measured cadence
//    and retained horizon, not from the withdrawn "~170×" guess (council C5).
// ─────────────────────────────────────────────────────────────────────────────

async function sampleIssuanceCadence(site: S0Site, grid: NwsGrid, samples: number, spacingMs: number) {
  const url = `https://api.weather.gov/gridpoints/${grid.gridId}/${grid.gridX},${grid.gridY}`;
  const seen: Array<{ at: string; updateTime: string | null }> = [];
  for (let i = 0; i < samples; i++) {
    const res = await probeJson<{ properties?: NwsGridpointProps }>(url);
    const ut = res.ok ? (res.body.properties?.updateTime ?? null) : null;
    seen.push({ at: new Date().toISOString(), updateTime: ut });
    console.log(`    cadence sample ${i + 1}/${samples}: updateTime=${ut}`);
    if (i < samples - 1) await sleep(spacingMs);
  }
  const distinct = [...new Set(seen.map((s) => s.updateTime).filter(Boolean))] as string[];
  distinct.sort();
  const gapsMin: number[] = [];
  for (let i = 1; i < distinct.length; i++) {
    gapsMin.push((Date.parse(distinct[i]) - Date.parse(distinct[i - 1])) / 60_000);
  }
  const windowMin = (Date.parse(seen[seen.length - 1].at) - Date.parse(seen[0].at)) / 60_000;
  return { site: site.key, samples: seen, distinctIssuances: distinct, gapsMin, windowMin };
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nS0 Unit 2 — live hourly field inventory${QUICK ? " (quick)" : ""}\n`);
  const probedAt = new Date().toISOString();
  const grids: Record<string, NwsGrid | null> = {};
  const stations: Record<string, StationSummary | null> = {};
  let updateTimeEvidence: UpdateTimeEvidence | null = null;

  console.log("── NWS raw gridpoint (FORECAST) + /forecast/hourly + station observations (OBSERVED) ──");
  for (const site of S0_SITES) {
    if (!site.nwsCovered) {
      console.log(`  [skip] ${site.key}: non-US — the rule §3.9 jurisdiction case. Reanalysis only.`);
      grids[site.key] = null;
      continue;
    }
    const g = await nwsGrid(site);
    grids[site.key] = g;
    if (!g) continue;
    await sleep(POLITE_MS);
    const ev = await probeNwsGridpoint(site, g);
    if (ev && !updateTimeEvidence) updateTimeEvidence = ev;
    await sleep(POLITE_MS);
    await probeNwsHourly(site, g);
    await sleep(POLITE_MS);
    stations[site.key] = await probeNwsObservations(site, g.stationsUrl);
    await sleep(POLITE_MS);
  }

  console.log("\n── Open-Meteo forecast (FORECAST) ──");
  for (const site of S0_SITES) {
    await probeOpenMeteo(site, "forecast", null);
    await sleep(POLITE_MS);
  }

  console.log("\n── Open-Meteo archive (REANALYSIS) — every model variant, every site ──");
  for (const model of ["era5_land", "era5", "era5_seamless", null]) {
    for (const site of S0_SITES) {
      await probeOpenMeteo(site, "archive", model, 2024);
      await sleep(POLITE_MS);
    }
  }

  console.log("\n── NASA POWER hourly (REANALYSIS) ──");
  for (const site of S0_SITES) {
    await probeNasaPower(site);
    await sleep(POLITE_MS);
  }

  let cadence: CadenceSample | null = null;
  if (!QUICK) {
    console.log("\n── NWS issuance cadence (measured, not assumed — council C5) ──");
    const site = S0_SITES.find((s) => s.key === "stoney_hill")!;
    const g = grids[site.key];
    if (g) cadence = await sampleIssuanceCadence(site, g, 7, 5 * 60_000);
  }

  // ── design-doc claim assertions: fail loudly on a stale ✅ ──────────────────
  console.log("\n── asserting the data-sources design's claims ──");
  for (const [key, claimed] of Object.entries(DESIGN_CLAIMS)) {
    const rel = reports.filter((r) => r.providerKey === key && r.ok);
    if (!rel.length) {
      failures.push(`design claims ${key} but NO successful probe returned for it`);
      continue;
    }
    for (const c of claimed) {
      const anywherePresent = rel.some((r) => r.fields.find((f) => f.field === c)?.present);
      if (!anywherePresent) failures.push(`design marks ${key}.${c} as available — it is ABSENT at every site probed`);
      else console.log(`  ✅ ${key}.${c}`);
    }
  }
  // era5_land's null wind/precip is a KNOWN finding, asserted so a silent provider change is caught
  const landReports = reports.filter((r) => r.providerKey === "open_meteo:archive-era5_land" && r.ok);
  const landWindAllNull = landReports.length > 0 && landReports.every((r) => !r.fields.find((f) => f.field === "wind_speed_10m")?.present);
  console.log(`  ${landWindAllNull ? "✅" : "⚠️ "} era5_land wind is ${landWindAllNull ? "null at every site (finding CONFIRMED across all 5 sites and a full week)" : "PRESENT — plan §1.2's finding no longer holds, re-decide the archive"}`);

  const out: HourlyInventoryOut = {
    probedAt,
    attribution: OPEN_METEO_ATTRIBUTION,
    grids,
    stations,
    reports,
    cadence,
    updateTimeEvidence,
    era5LandWindAllNull: landWindAllNull,
    designClaimFailures: failures,
    rollupRule: ROLLUP_RULE,
  };
  mkdirSync(dirname(OUT_JSON), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(out, null, 2), "utf8");
  writeFileSync(OUT_MD, render(out), "utf8");
  console.log(`\nwrote ${OUT_MD}`);
  console.log(`wrote ${OUT_JSON}`);

  if (failures.length) {
    console.error("\n❌ DESIGN-DOC CLAIMS FAILED:");
    for (const f of failures) console.error(`   ${f}`);
    process.exit(1);
  }
  console.log("\n✅ every design-doc claim re-verified live");
}

// ─────────────────────────────────────────────────────────────────────────────
// Council C8 — THE ALIGNMENT RULE, pre-declared HERE, before Unit 5 can tune it.
//
// Station observations are sub-hourly and QC-tagged; model products are hourly bins with their own
// interval semantics. Without fixing this in advance, the Arm B comparison can be tuned after the
// fact until it passes. So it is frozen in this unit and Unit 5 imports it.
// ─────────────────────────────────────────────────────────────────────────────

export const ROLLUP_RULE = {
  version: 1,
  declaredIn: "S0 Unit 2, before any Unit 5 measurement (council C8)",

  /** An hourly bin is the half-open interval [HH:00, HH+1:00) in UTC. Local-time bucketing happens
   *  ONLY at the estimator boundary (CART's dew-eligible night window), never at the rollup. */
  binDefinition: "[HH:00, HH+1:00) UTC, half-open",

  /** Which sub-hourly observations belong to a bin. METAR reports at :51–:56 describe the hour that
   *  is ENDING, so a naive floor() assigns them to the wrong bin. Assign by the observation's own
   *  timestamp floored to the hour, EXCEPT that observations at or after :45 are assigned to the
   *  NEXT hour — matching the aviation convention the reports are issued under. */
  inclusionWindow: "obs timestamp floored to the hour; obs at minute >= 45 roll into the following hour",

  /** State variables (temperature, dew point, RH, wind) take the observation NEAREST the bin's
   *  centre, not the mean. A mean of two observations 40 minutes apart is a value that never
   *  occurred, and CART is a threshold model: fabricated intermediate values create fabricated
   *  threshold crossings. */
  stateVariableRollup: "nearest-to-bin-centre single observation, never a mean",

  /** Precipitation is an ACCUMULATION, not a state. It is SUMMED over the bin — but only over
   *  non-overlapping reports. `precipitationLastHour` is itself an hour-long accumulation, so
   *  summing several of them within one hour double-counts. Take the LAST non-null
   *  `precipitationLastHour` in the bin instead. */
  precipitationRollup: "last non-null hourly-accumulation report in the bin (NOT summed — the field is already an hour accumulation)",

  /** Ragged gaps. A bin with no admissible observation is MISSING, never interpolated and never
   *  zero. Rule §3.6: a coverage gap must never render as no-restriction, and the same discipline
   *  applies upstream — a gap silently filled at rollup is a gap that can never be surfaced later. */
  gapHandling: "a bin with no admissible observation is MISSING; never interpolated, never defaulted to zero",

  /** QC admissibility. NWS `qualityControl` values seen live: V (validated), Z (preliminary/unchecked),
   *  and others. ADMIT only V and Z; Z is admitted because rejecting it would empty recent hours
   *  wholesale, but it is TAGGED so Unit 5 can report the split. Anything else is inadmissible. */
  qcAdmissible: ["V", "Z"],
  qcNote: "Z (preliminary) is admitted but tagged; Unit 5 reports the V/Z split so the reader can discount accordingly",

  /** ISD's own quality codes: 0,1,4,5,9 pass; 2,3,6,7 are erroneous/suspect and are dropped. */
  isdQcAdmissible: ["0", "1", "4", "5", "9"],

  /** DST. All alignment is done in UTC. Local civil time is applied ONLY when bucketing to a site's
   *  night window, using the IANA zone, so the 23-hour and 25-hour days are handled by the zone
   *  database rather than by arithmetic. `Asia/Thimphu` has no DST; the two US zones do. */
  dstHandling: "align in UTC; convert to site-local via the IANA zone only at the estimator's night-window boundary",
} as const;

function render(o: HourlyInventoryOut): string {
  const L: string[] = [];
  const sitesWithGrid = S0_SITES.filter((s) => o.grids[s.key]);
  L.push("---");
  L.push("title: S0 Unit 2 — live hourly field inventory with series-kind classification");
  L.push("type: phase-artifact");
  L.push("phase: S0");
  L.push("unit: 2");
  L.push(`date: ${String(o.probedAt).slice(0, 10)}`);
  L.push("status: measured");
  L.push("---");
  L.push("");
  L.push("# S0 Unit 2 — live hourly field inventory");
  L.push("");
  L.push(`_Probed live ${o.probedAt} against the five Unit 3 sites. Machine-readable sidecar: \`s0-hourly-field-inventory.json\`._`);
  L.push("");
  L.push(`> ${o.attribution}`);
  L.push("> NWS requests carry a User-Agent per provider policy. A 404 is a coverage signal and is never retried.");
  L.push("");
  L.push("## 1. Series kinds are three ACQUISITION MODES, not three labels");
  L.push("");
  L.push("Council C3 asked for every field to be classified OBSERVED / FORECAST / REANALYSIS. The classification");
  L.push("below does that, but the more useful finding is *why* the tag alone is insufficient: the three kinds");
  L.push("differ in **direction of acquisition**, and that drives different economics, different retention and a");
  L.push("different replay story.");
  L.push("");
  L.push("| Kind | Direction | Re-fetchable after the fact? | Consequence |");
  L.push("|---|---|---|---|");
  L.push("| OBSERVED | observe forward | ✅ **yes** — Unit 0 established NCEI ISD and the IEM ASOS archive both serve it | retention is a *convenience* decision, not a preservation one |");
  L.push("| FORECAST | forecast forward | ❌ **no** — a past issuance is gone the moment it is superseded | the ONLY kind where not capturing is irreversible |");
  L.push("| REANALYSIS | reanalyze backward | ✅ yes, and it *improves* — a reanalysis is revised | storing it is caching; a stored copy can go STALER than the source |");
  L.push("");
  L.push("⚠️ **The irreversibility sits with FORECAST, not with OBSERVED — the opposite of where the plan put it.**");
  L.push("Plan §1.3 built the retention urgency around observed data being lost if not captured. Unit 0 disproved");
  L.push("that. What actually cannot be recovered is *what the forecast said at the moment a grower acted on it*,");
  L.push("which is precisely the decision-replay input. Unit 8 must carry this reversal.");
  L.push("");
  L.push("⚠️ **REANALYSIS being revisable is a hazard nobody has named yet.** A stored ERA5 row can drift out of");
  L.push("agreement with the live archive, so a recomputation months later can legitimately produce a different");
  L.push("answer from the same code. That is a replay-integrity problem hiding in the kind that looks safest.");
  L.push("");
  L.push("## 2. The three timestamps (council C4)");
  L.push("");
  L.push("`seriesKind` + `issuedAt` + `validTime` is **not** sufficient bitemporality for facts-as-of-then. A");
  L.push("delayed cron run, a QC revision, or a later provider revision of the same valid hour all break replay if");
  L.push("only provider issuance and valid time are stored. Measured, per provider:");
  L.push("");
  L.push("| Provider | `validTime` | `providerIssuedAt` | `ingestedAt` |");
  L.push("|---|---|---|---|");
  const seenProv = new Set<string>();
  for (const r of o.reports as ProviderReport[]) {
    if (!r.ok || seenProv.has(r.providerKey)) continue;
    seenProv.add(r.providerKey);
    const f = r.fields.find((x) => x.present) ?? r.fields[0];
    L.push(
      `| \`${r.providerKey}\` | ${f?.hasValidTime ? "✅ per slot" : "—"} | ${f?.hasProviderIssuedAt ? "✅ `" + (r.providerIssuedAt ?? "") + "`" : "❌ **not exposed**"} | ✅ ours |`,
    );
  }
  L.push("");
  L.push("⚠️ **Open-Meteo exposes no issuance timestamp on either endpoint.** `generationtime_ms` is how long");
  L.push("*this request* took to compute, not when the product was issued. So for Open-Meteo forecasts,");
  L.push("`providerIssuedAt` is **unknowable** and `ingestedAt` is the only capture time we have. That is a");
  L.push("concrete schema consequence for S1: `providerIssuedAt` must be **nullable**, and a null must mean");
  L.push("*\"the provider does not tell us\"* rather than *\"we failed to record it\"* — two states that a nullable");
  L.push("column conflates unless the distinction is made explicit.");
  L.push("");
  if (o.updateTimeEvidence) {
    const e = o.updateTimeEvidence;
    L.push("### Is NWS `updateTime` a meaningful `issuedAt`?");
    L.push("");
    L.push("The council asked directly, because if different gridpoint properties come from different update");
    L.push("streams then the forecast replay model is wrong before storage is even considered.");
    L.push("");
    L.push(`Measured at ${e.site}: the raw gridpoint carries **one** product-level \`updateTime\` (\`${e.updateTime ?? "—"}\`),`);
    L.push(`and the ten property series **start within ${Number(e.startSpreadMin).toFixed(0)} minutes of each other**.`);
    L.push("");
    L.push(
      Number(e.startSpreadMin) <= 60
        ? "> **Verdict: `updateTime` is usable as a product-level `providerIssuedAt`**, because the properties are aligned to a single issuance rather than stitched from independent streams. It is still a *last-changed* stamp for the whole product, so it cannot attribute a change to a particular property — which is fine, since we capture whole rows."
        : "> ⚠️ **Verdict: `updateTime` is NOT a clean issuance stamp** — the property series start far enough apart that the product is stitched. S1 must not treat it as a single issuance instant.",
    );
    L.push("");
  }
  if (o.cadence) {
    const c = o.cadence;
    L.push("### Measured re-issuance cadence — §1.4's ceiling input");
    L.push("");
    L.push("Council C5 withdrew the plan's \"~170×\" forecast-row multiplier as false precision computed before");
    L.push("anything was measured. Here is the measurement it must be replaced with.");
    L.push("");
    L.push(`Sampled the Stoney Hill gridpoint ${c.samples.length} times over ${Number(c.windowMin).toFixed(0)} minutes:`);
    L.push("");
    L.push(`- distinct issuances observed: **${c.distinctIssuances.length}**`);
    L.push(`- gaps between them: ${c.gapsMin.length ? c.gapsMin.map((g: number) => `${g.toFixed(0)} min`).join(", ") : "_(only one issuance seen in the window)_"}`);
    L.push("");
    L.push("Combined with the retained horizon in §3, the forecast-row ceiling is:");
    L.push("");
    L.push("```");
    L.push("rows/vineyard/year  =  8760 valid hours  ×  (issuances that still cover a given valid hour)");
    L.push("                    =  8760  ×  ceil(retainedHorizonH / cadenceH)");
    L.push("```");
    L.push("");
    L.push("Unit 7 prices both branches of that with the measured numbers. **The multiplier is derived, never assumed.**");
    L.push("");
  }
  L.push("## 3. The field inventory");
  L.push("");
  L.push("Presence, units, null density and native interval per field. `∅` = absent from the payload entirely.");
  L.push("");
  const byProvider = new Map<string, ProviderReport[]>();
  for (const r of o.reports as ProviderReport[]) {
    if (!byProvider.has(r.providerKey)) byProvider.set(r.providerKey, []);
    byProvider.get(r.providerKey)!.push(r);
  }
  for (const [key, rs] of byProvider) {
    const okRs = rs.filter((r) => r.ok);
    L.push(`### \`${key}\` — ${rs[0].kind}`);
    L.push("");
    if (!okRs.length) {
      L.push(`_No successful probe. ${rs.map((r) => `${r.siteKey}: HTTP ${r.httpStatus} (${r.note})`).join("; ")}_`);
      L.push("");
      continue;
    }
    L.push(`Endpoint: \`${okRs[0].endpoint.split("?")[0]}\` · sites returning data: ${okRs.length}/${S0_SITES.length}`);
    L.push("");
    L.push("| Field | Present | Units | Null density | Native interval | Note |");
    L.push("|---|---|---|---|---|---|");
    const fieldNames = [...new Set(okRs.flatMap((r) => r.fields.map((f) => f.field)))];
    for (const fn of fieldNames) {
      const fs = okRs.map((r) => r.fields.find((f) => f.field === fn)).filter(Boolean) as FieldRecord[];
      const anyPresent = fs.some((f) => f.present);
      const nd = fs.filter((f) => f.nullDensity != null).map((f) => f.nullDensity!);
      const avgNd = nd.length ? nd.reduce((a, b) => a + b, 0) / nd.length : null;
      const iv = [...new Set(fs.map((f) => f.nativeIntervalH).filter((x) => x != null))];
      L.push(
        `| \`${fn}\` | ${anyPresent ? `✅ ${fs.filter((f) => f.present).length}/${fs.length} sites` : "∅ **absent**"} | ${fs.find((f) => f.units)?.units ?? "—"} | ${avgNd != null ? (avgNd * 100).toFixed(1) + "%" : "—"} | ${iv.length ? iv.join(" / ") + " h" : "—"} | ${fs[0]?.note ?? ""} |`,
      );
    }
    L.push("");
    const horizons = okRs.map((r) => r.retainedHorizonH).filter((x): x is number => x != null);
    if (horizons.length) {
      L.push(`Retained horizon: ${[...new Set(horizons)].map((h) => (h < 0 ? `${-h} h TRAILING` : `${h} h forward`)).join(", ")}`);
      L.push("");
    }
    for (const r of okRs) L.push(`- \`${r.siteKey}\`: ${r.note}`);
    L.push("");
  }
  L.push("## 4. The findings that change other phases");
  L.push("");
  L.push(`### 4.1 ERA5-Land carries no wind — ${o.era5LandWindAllNull ? "**CONFIRMED across all five sites and a full week**" : "⚠️ NOT confirmed, re-decide"}`);
  L.push("");
  L.push("The data-sources design §2.3 recommends ERA5-Land (0.1°, ~11 km) over ERA5 (0.25°, ~25 km) on resolution.");
  L.push("The plan spot-checked two sites; this probe checks all five over a full week. **CART is RH + dew-point");
  L.push("depression + wind. The archive the design doc prefers cannot run the estimator the design doc prefers.**");
  L.push("");
  L.push("⚠️ **And the second consumer of wind is the more serious one (council G4).** The label is the law, and");
  L.push("labels dictate maximum wind speeds for drift. **A provider carrying null wind cannot support an");
  L.push("application-window answer at all.** Rendering that as anything other than *cannot determine safely*");
  L.push("would advise a grower toward a label violation. **Wind availability is a hard input to the S7b legality");
  L.push("gate**, not merely a confidence input to the LWD estimator. S0 does not build that gate; Unit 9 writes");
  L.push("the requirement into the output shape so S7b cannot miss it.");
  L.push("");
  L.push("### 4.2 NWS `/forecast/hourly` has no humidity — the raw gridpoint is the only NWS CART source");
  L.push("");
  L.push("`forecast-nws.ts` already calls both endpoints. It parses 156 one-hour periods from `/forecast/hourly`");
  L.push("(temp, PoP, condition, wind — **no humidity, no dew point**), and separately calls the raw gridpoint but");
  L.push("reads exactly one property off it, `quantitativePrecipitation`, discarding the rest. **The CART inputs");
  L.push("are already being fetched and thrown away.** S1's NWS work is a parse, not a request.");
  L.push("");
  L.push("### 4.3 NASA POWER's wind is 2 m, not 10 m");
  L.push("");
  L.push("`WS2M` is a different physical quantity from every other provider's 10 m wind, and CART was developed");
  L.push("against standard 10 m station data. Mixing them silently would inject a systematic bias into exactly the");
  L.push("input council G2 already flagged as CART's weakest. Since NASA POWER is **Bhutan's current primary**,");
  L.push("this lands on the one site with no NWS coverage. S1 must either convert with a documented wind profile");
  L.push("or carry the measurement height in the confidence band. **Do not silently treat them as the same field.**");
  L.push("");
  L.push("## 5. The alignment and QC-admissibility rule — pre-declared (council C8)");
  L.push("");
  L.push("Station observations are sub-hourly and QC-tagged; model products are hourly bins with their own");
  L.push("interval semantics. This rule is fixed **here, in Unit 2**, before Unit 5 can tune it. Without that,");
  L.push("the Arm B comparison could be adjusted after the fact until it passed.");
  L.push("");
  L.push("| Aspect | Rule |");
  L.push("|---|---|");
  L.push(`| Bin definition | ${ROLLUP_RULE.binDefinition} |`);
  L.push(`| Inclusion window | ${ROLLUP_RULE.inclusionWindow} |`);
  L.push(`| State variables (T, Td, RH, wind) | ${ROLLUP_RULE.stateVariableRollup} |`);
  L.push(`| Precipitation | ${ROLLUP_RULE.precipitationRollup} |`);
  L.push(`| Ragged gaps | ${ROLLUP_RULE.gapHandling} |`);
  L.push(`| QC admissible (NWS) | ${ROLLUP_RULE.qcAdmissible.join(", ")} — ${ROLLUP_RULE.qcNote} |`);
  L.push(`| QC admissible (ISD) | ${ROLLUP_RULE.isdQcAdmissible.join(", ")} |`);
  L.push(`| DST | ${ROLLUP_RULE.dstHandling} |`);
  L.push("");
  L.push("Two of these are not obvious and are worth the sentence:");
  L.push("");
  L.push("- **State variables take the nearest observation, never a mean.** A mean of two observations 40 minutes");
  L.push("  apart is a value that never occurred. CART is a threshold model, so fabricated intermediate values");
  L.push("  create fabricated threshold crossings.");
  L.push("- **Precipitation is not summed.** `precipitationLastHour` is already an hour-long accumulation, so");
  L.push("  adding several reports inside one hour double-counts. Take the last non-null report in the bin.");
  L.push("");
  L.push("## 6. Station provenance for the confidence band (council G2)");
  L.push("");
  L.push("Station wind is measured at 10 m in open terrain, usually an airport; canopy microclimate is 1–2 m and");
  L.push("blocked by topography, windbreaks and the trellis. That provenance enters the confidence band, so it is");
  L.push("measured here rather than asserted in Unit 6.");
  L.push("");
  L.push("| Site | Station | Distance | Δ elevation (station − site) | Observation cadence | QC vocabulary |");
  L.push("|---|---|---|---|---|---|");
  for (const s of S0_SITES) {
    const st = (o.stations ?? {})[s.key];
    if (!st) {
      L.push(`| ${s.name} | — | — | — | — | _no NWS station (rule §3.9)_ |`);
      continue;
    }
    L.push(
      `| ${s.name} | \`${st.stationId}\` | ${(st.distanceM / 1000).toFixed(1)} km | ${st.stationElevM != null ? (st.stationElevM - s.elevationM).toFixed(0) + " m" : "?"} | ${st.obsPer24h}/24h | ${st.qcVocab.join(", ")} |`,
    );
  }
  L.push("");
  L.push("⚠️ **The elevation delta is not decoration.** Dew point is far more conserved across an elevation change");
  L.push("than temperature is, so a station several hundred metres off the site biases dew-point *depression*");
  L.push("mostly through the temperature term. Unit 5 reports the delta alongside every Arm B figure.");
  L.push("");
  L.push("## 7. What Unit 3 and Unit 5 inherit from this");
  L.push("");
  L.push("1. Fetch the archive under **every** model variant — model choice is a first-class error source, carried");
  L.push("   through the measurement rather than collapsed early.");
  L.push("2. The rollup rule in §5 is frozen. Unit 5 imports it; it does not re-derive it.");
  L.push("3. `providerIssuedAt` is unknowable for Open-Meteo. Any replay design that assumes every provider");
  L.push("   supplies one is wrong.");
  L.push("4. NASA POWER wind is 2 m. Paro's fixtures carry that caveat into every wind-sensitivity number.");
  L.push("");
  if (sitesWithGrid.length < S0_SITES.length) {
    L.push(
      `_${S0_SITES.length - sitesWithGrid.length} of ${S0_SITES.length} sites have no NWS grid (non-US). That is the rule §3.9 jurisdiction case working as intended, not a gap._`,
    );
    L.push("");
  }
  return L.join("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
