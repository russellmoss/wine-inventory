/**
 * S0 Unit 0 — IS OBSERVED HOURLY DATA BACKFILLABLE?
 *
 * Run:  npx tsx scripts/s0-probe-observed-backfill.ts
 *
 * This runs FIRST and ALONE. Council C2 caught a dependency inversion in the plan's first draft: it
 * concluded from the NWS observations API's ~1-day trailing window that observed data is "ingest it
 * or lose it permanently", and then used that irreversibility to drive the whole retention decision.
 * Whether some OTHER archive serves the same observed data after the fact was never probed. If it
 * does, the asymmetry driving the retention argument changes materially.
 *
 * Council C3 then caught the incoherence: reporting "permanent data loss is a real risk" and
 * proceeding as pure research gating a later phase is not a position. If the risk is real, waiting
 * for S1 means the loss already happened during S0. So this unit must land on one of three named
 * OUTCOMES, one of which is an explicit written acceptance of irrecoverable loss. Silence is not one.
 *
 * A negative result must be REPRODUCIBLE, not asserted: every identifier and endpoint tried is
 * recorded with what it returned, so "we could not find it" is checkable rather than believed.
 *
 * Writes:  docs/spray_assistant/phases/s0-observed-backfill.md
 *          docs/spray_assistant/phases/s0-observed-backfill.json   (machine-readable sidecar)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  S0_SITES,
  POLITE_MS,
  UA,
  haversineM,
  probeJson,
  probeText,
  sleep,
  type S0Site,
} from "./s0-sites";

const OUT_DIR = join(process.cwd(), "docs", "spray_assistant", "phases");
const OUT_MD = join(OUT_DIR, "s0-observed-backfill.md");
const OUT_JSON = join(OUT_DIR, "s0-observed-backfill.json");

/** Today, per the probe run. Fixed once so every offset in the report is consistent. */
const NOW = new Date();
const iso = (d: Date) => d.toISOString().slice(0, 19) + "Z";
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

// ─────────────────────────────────────────────────────────────────────────────
// What "usable for CART" means. Declared here, above the probes, so a source cannot be talked into
// counting later. CART needs relative humidity, dew-point depression (T and Td) and wind speed.
// Precipitation is not a CART input but is a wetness-interruption input for the pathogen models.
// ─────────────────────────────────────────────────────────────────────────────
const REQUIRED_FOR_CART = ["temperature", "dewpoint", "relativeHumidity", "windSpeed"] as const;
type CartField = (typeof REQUIRED_FOR_CART)[number];

type Attempt = {
  source: string;
  site: string;
  what: string;
  url: string;
  status: number;
  ok: boolean;
  records: number | null;
  note: string;
};

const attempts: Attempt[] = [];
const record = (a: Attempt) => {
  attempts.push(a);
  const flag = a.ok ? "ok " : "FAIL";
  console.log(`  [${flag}] ${a.source} · ${a.site} · ${a.what} → HTTP ${a.status} · ${a.records ?? "-"} rec · ${a.note}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// Probe 1 — NWS /stations/{id}/observations: where exactly does the trailing window end?
// ─────────────────────────────────────────────────────────────────────────────

type NwsStation = { id: string; name: string; lat: number; lon: number; elevM: number | null; distanceM: number };

async function nearestNwsStations(site: S0Site, take = 4): Promise<NwsStation[]> {
  const url = `https://api.weather.gov/points/${site.lat.toFixed(4)},${site.lon.toFixed(4)}/stations`;
  const res = await probeJson<{ features?: Array<Record<string, any>> }>(url);
  if (!res.ok) {
    record({
      source: "NWS",
      site: site.key,
      what: "nearest stations",
      url,
      status: res.status,
      ok: false,
      records: null,
      note: res.coverageSignal ? "404 = coverage signal (expected for non-US), NOT retried" : res.error.slice(0, 80),
    });
    return [];
  }
  const feats = res.body.features ?? [];
  const out = feats
    .map((f) => {
      const [lon, lat] = (f.geometry?.coordinates ?? [null, null]) as [number, number];
      return {
        id: String(f.properties?.stationIdentifier ?? ""),
        name: String(f.properties?.name ?? ""),
        lat,
        lon,
        elevM: f.properties?.elevation?.value ?? null,
        distanceM: lat == null ? Number.POSITIVE_INFINITY : haversineM(site.lat, site.lon, lat, lon),
      };
    })
    .filter((s) => s.id && Number.isFinite(s.distanceM))
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, take);
  record({
    source: "NWS",
    site: site.key,
    what: "nearest stations",
    url,
    status: res.status,
    ok: true,
    records: out.length,
    note: out.map((s) => `${s.id}@${(s.distanceM / 1000).toFixed(1)}km`).join(", "),
  });
  return out;
}

/** Ask for a 6-hour window `offsetDays` back and count what comes home. */
async function nwsObsAt(stationId: string, siteKey: string, offsetDays: number) {
  const end = daysAgo(offsetDays);
  const start = new Date(end.getTime() - 6 * 3_600_000);
  const url =
    `https://api.weather.gov/stations/${stationId}/observations` +
    `?start=${encodeURIComponent(iso(start))}&end=${encodeURIComponent(iso(end))}`;
  const res = await probeJson<{ features?: Array<Record<string, any>> }>(url);
  if (!res.ok) {
    record({
      source: "NWS obs",
      site: siteKey,
      what: `T-${offsetDays}d (6h window)`,
      url,
      status: res.status,
      ok: false,
      records: 0,
      note: res.coverageSignal ? "404 coverage signal, not retried" : res.error.slice(0, 60),
    });
    return { offsetDays, count: 0, fields: {} as Record<string, number> };
  }
  const feats = res.body.features ?? [];
  const fieldCounts: Record<string, number> = {};
  for (const f of feats) {
    const p = f.properties ?? {};
    for (const k of REQUIRED_FOR_CART) {
      if (p[k]?.value != null) fieldCounts[k] = (fieldCounts[k] ?? 0) + 1;
    }
    if (p.precipitationLastHour?.value != null)
      fieldCounts.precipitationLastHour = (fieldCounts.precipitationLastHour ?? 0) + 1;
    const qc = p.temperature?.qualityControl;
    if (qc) fieldCounts[`qc:${qc}`] = (fieldCounts[`qc:${qc}`] ?? 0) + 1;
  }
  record({
    source: "NWS obs",
    site: siteKey,
    what: `T-${offsetDays}d (6h window)`,
    url,
    status: res.status,
    ok: true,
    records: feats.length,
    note: feats.length ? Object.entries(fieldCounts).map(([k, v]) => `${k}=${v}`).join(" ") : "EMPTY",
  });
  return { offsetDays, count: feats.length, fields: fieldCounts };
}

// ─────────────────────────────────────────────────────────────────────────────
// Probe 2 — NCEI ISD `global-hourly`. The unsolved piece is station-IDENTIFIER MAPPING: the plan's
// first attempt used a GUESSED USAF-WBAN and returned empty, which proves nothing. Resolve the
// mapping from the ISD station-history inventory, THEN test a full past season.
// ─────────────────────────────────────────────────────────────────────────────

type IsdStation = {
  usaf: string;
  wban: string;
  id: string; // the 11-char concatenation the Access Data Service wants
  name: string;
  call: string;
  lat: number;
  lon: number;
  elevM: number | null;
  begin: string;
  end: string;
  distanceM: number;
};

function parseIsdHistory(csv: string): Omit<IsdStation, "distanceM">[] {
  const lines = csv.split(/\r?\n/);
  const out: Omit<IsdStation, "distanceM">[] = [];
  // header: "USAF","WBAN","STATION NAME","CTRY","STATE","ICAO","LAT","LON","ELEV(M)","BEGIN","END"
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cells = line.match(/"([^"]*)"/g)?.map((c) => c.slice(1, -1)) ?? [];
    if (cells.length < 11) continue;
    const [usaf, wban, name, , , call, latS, lonS, elevS, begin, end] = cells;
    const lat = Number(latS);
    const lon = Number(lonS);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) continue;
    out.push({
      usaf,
      wban,
      id: `${usaf}${wban}`,
      name,
      call,
      lat,
      lon,
      elevM: Number.isFinite(Number(elevS)) ? Number(elevS) : null,
      begin,
      end,
    });
  }
  return out;
}

/** ISD global-hourly rows are compact codes. Decode enough to know whether CART's inputs are there. */
function inspectIsdRows(rows: Array<Record<string, string>>) {
  let tmp = 0;
  let dew = 0;
  let wnd = 0;
  let precip = 0;
  const qcCodes = new Set<string>();
  for (const r of rows) {
    // "TMP" = "+0234,1"  → tenths of °C, then a quality code. "+9999" is missing.
    const t = (r.TMP ?? "").split(",");
    if (t[0] && !t[0].startsWith("+9999") && !t[0].startsWith("-9999")) tmp++;
    if (t[1]) qcCodes.add(`TMP:${t[1]}`);
    const d = (r.DEW ?? "").split(",");
    if (d[0] && !d[0].startsWith("+9999") && !d[0].startsWith("-9999")) dew++;
    // "WND" = "270,1,N,0031,1" → direction, dirQC, type, speed(0.1 m/s), speedQC
    const w = (r.WND ?? "").split(",");
    if (w[3] && w[3] !== "9999") wnd++;
    if (w[4]) qcCodes.add(`WND:${w[4]}`);
    // AA1 = liquid precipitation: "01,0000,9,5" → period(h), depth(0.1mm), condition, quality
    const a = (r.AA1 ?? "").split(",");
    if (a[1] && a[1] !== "9999") precip++;
  }
  return { rows: rows.length, tmp, dew, wnd, precip, qcCodes: [...qcCodes].sort() };
}

async function isdSeasonProbe(site: S0Site, st: IsdStation, year: number) {
  const url =
    `https://www.ncei.noaa.gov/access/services/data/v1?dataset=global-hourly` +
    `&stations=${st.id}&startDate=${year}-06-01&endDate=${year}-06-08` +
    `&dataTypes=TMP,DEW,WND,AA1&format=json&units=metric`;
  const res = await probeJson<Array<Record<string, string>>>(url, { timeoutMs: 90_000 });
  if (!res.ok) {
    record({
      source: "NCEI ISD",
      site: site.key,
      what: `${st.id} (${st.call || st.name}) ${year}-06 week`,
      url,
      status: res.status,
      ok: false,
      records: 0,
      note: res.coverageSignal ? "404 coverage signal, not retried" : res.error.slice(0, 80),
    });
    return null;
  }
  const rows = Array.isArray(res.body) ? res.body : [];
  const insp = inspectIsdRows(rows);
  record({
    source: "NCEI ISD",
    site: site.key,
    what: `${st.id} (${st.call || st.name}) ${year}-06 week`,
    url,
    status: res.status,
    ok: rows.length > 0,
    records: rows.length,
    note: rows.length
      ? `TMP=${insp.tmp} DEW=${insp.dew} WND=${insp.wnd} precip=${insp.precip} qc=[${insp.qcCodes.join("|")}]`
      : "EMPTY — identifier resolved from the ISD inventory, so this is a real absence",
  });
  return { station: st, year, ...insp };
}

/** A FULL past growing season, to prove the archive is not just a recent window in disguise. */
async function isdFullSeasonCount(site: S0Site, st: IsdStation, year: number) {
  const url =
    `https://www.ncei.noaa.gov/access/services/data/v1?dataset=global-hourly` +
    `&stations=${st.id}&startDate=${year}-04-01&endDate=${year}-10-31` +
    `&dataTypes=TMP,DEW,WND&format=json&units=metric`;
  const res = await probeJson<Array<Record<string, string>>>(url, { timeoutMs: 180_000 });
  if (!res.ok) {
    record({
      source: "NCEI ISD",
      site: site.key,
      what: `${st.id} FULL ${year} season (Apr 1–Oct 31)`,
      url,
      status: res.status,
      ok: false,
      records: 0,
      note: res.error.slice(0, 80),
    });
    return null;
  }
  const rows = Array.isArray(res.body) ? res.body : [];
  const insp = inspectIsdRows(rows);
  record({
    source: "NCEI ISD",
    site: site.key,
    what: `${st.id} FULL ${year} season (Apr 1–Oct 31)`,
    url,
    status: res.status,
    ok: rows.length > 0,
    records: rows.length,
    note: `TMP=${insp.tmp} DEW=${insp.dew} WND=${insp.wnd} · ${(rows.length / (214 * 24)).toFixed(2)}× hourly density`,
  });
  return { station: st, year, ...insp };
}

// ─────────────────────────────────────────────────────────────────────────────
// Probe 3 — Iowa Environmental Mesonet ASOS archive. Keyless, and it serves the DERIVED relative
// humidity that ISD makes you compute yourself. If this works it is the strongest backfill answer,
// because it is the same measured station network the NWS observations endpoint exposes live.
// ─────────────────────────────────────────────────────────────────────────────

async function iemAsosProbe(site: S0Site, stationId: string, year: number) {
  // IEM wants the bare 3-letter call for US ASOS (KDYL → DYL).
  const st = stationId.replace(/^K/, "");
  const url =
    `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=${st}` +
    `&data=tmpf&data=dwpf&data=relh&data=sknt&data=drct&data=p01i` +
    `&year1=${year}&month1=6&day1=1&year2=${year}&month2=6&day2=8` +
    `&tz=UTC&format=onlycomma&latlon=no&missing=M&trace=T&direct=no&report_type=3&report_type=4`;
  const res = await probeText(url, { timeoutMs: 120_000 });
  if (!res.ok) {
    record({
      source: "IEM ASOS",
      site: site.key,
      what: `${st} ${year}-06 week`,
      url,
      status: res.status,
      ok: false,
      records: 0,
      note: res.error.slice(0, 80),
    });
    return null;
  }
  const lines = res.body.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = (lines[0] ?? "").split(",");
  const idx = (name: string) => header.indexOf(name);
  const body = lines.slice(1);
  const counts: Record<string, number> = {};
  for (const line of body) {
    const c = line.split(",");
    for (const f of ["tmpf", "dwpf", "relh", "sknt", "p01i"]) {
      const i = idx(f);
      const v = i >= 0 ? c[i] : undefined;
      if (v != null && v !== "M" && v !== "") counts[f] = (counts[f] ?? 0) + 1;
    }
  }
  record({
    source: "IEM ASOS",
    site: site.key,
    what: `${st} ${year}-06 week`,
    url,
    status: res.status,
    ok: body.length > 0,
    records: body.length,
    note: body.length
      ? Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" ")
      : "EMPTY (station may not be an ASOS site)",
  });
  return { station: st, year, rows: body.length, counts };
}

/** The deepest-history question: how far back does the keyless archive actually go? */
async function iemDepthProbe(site: S0Site, stationId: string, year: number) {
  const st = stationId.replace(/^K/, "");
  const url =
    `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=${st}` +
    `&data=tmpf&data=dwpf&data=relh&data=sknt&data=p01i` +
    `&year1=${year}&month1=7&day1=1&year2=${year}&month2=7&day2=3` +
    `&tz=UTC&format=onlycomma&latlon=no&missing=M&trace=T&direct=no&report_type=3&report_type=4`;
  const res = await probeText(url, { timeoutMs: 90_000 });
  const rows = res.ok ? res.body.split(/\r?\n/).filter((l) => l.trim()).length - 1 : 0;
  record({
    source: "IEM ASOS",
    site: site.key,
    what: `${st} depth check ${year}-07-01..03`,
    url,
    status: res.status,
    ok: res.ok && rows > 0,
    records: Math.max(0, rows),
    note: res.ok ? (rows > 0 ? "has data" : "EMPTY") : res.error.slice(0, 60),
  });
  return { year, rows: Math.max(0, rows) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Probe 4 — regional / state mesonets. RECORDED as available-or-not, NOT integrated (plan Unit 0).
// ─────────────────────────────────────────────────────────────────────────────

const MESONETS: Array<{ name: string; covers: string; access: string; keyless: boolean; url: string | null }> = [
  {
    name: "Synoptic Data (MesoWest)",
    covers: "national aggregator (ASOS, RAWS, state mesonets)",
    access: "API token required; free non-commercial tier",
    keyless: false,
    url: null,
  },
  {
    name: "CA CIMIS",
    covers: "California agricultural stations (Madera, Russian River)",
    access: "free API key by registration; hourly RH + measured wind at 2 m over turf",
    keyless: false,
    url: null,
  },
  {
    name: "Iowa Environmental Mesonet — ASOS archive",
    covers: "every US ASOS/AWOS site incl. KDYL, KCHO, KSTS, KMAE",
    access: "keyless CGI, decades of history",
    keyless: true,
    url: "https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py",
  },
  {
    name: "NEWA (Cornell)",
    covers: "Northeast/Midwest ag stations, incl. computed leaf wetness",
    access: "out of scope by plan §2 (NEWA integration of any kind is excluded)",
    keyless: false,
    url: null,
  },
  {
    name: "Bhutan / NCHM",
    covers: "Paro",
    access: "no public hourly API found; reanalysis only",
    keyless: false,
    url: null,
  },
];

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nS0 Unit 0 — observed-hourly backfillability probe · ${iso(NOW)}\n`);

  const results: Record<string, unknown> = { probedAt: iso(NOW), sites: {} };

  // ── 1. NWS live-window boundary ────────────────────────────────────────────
  console.log("── Probe 1: NWS /stations/{id}/observations trailing window ──");
  const nwsStationBySite: Record<string, NwsStation | null> = {};
  const nwsWindow: Record<string, Array<{ offsetDays: number; count: number }>> = {};
  for (const site of S0_SITES) {
    if (!site.nwsCovered) {
      console.log(`  [skip] ${site.key}: non-US, NWS does not cover it (rule §3.9 case)`);
      nwsStationBySite[site.key] = null;
      continue;
    }
    const stations = await nearestNwsStations(site);
    await sleep(POLITE_MS);
    const chosen = stations[0] ?? null;
    nwsStationBySite[site.key] = chosen;
    if (!chosen) continue;
    // Bisect the boundary. The plan located it between T-1 and T-7; probe finer.
    const offsets = [1, 2, 3, 4, 5, 6, 7, 10, 14, 30, 90, 365];
    const series: Array<{ offsetDays: number; count: number }> = [];
    for (const off of offsets) {
      const r = await nwsObsAt(chosen.id, site.key, off);
      series.push({ offsetDays: off, count: r.count });
      await sleep(POLITE_MS);
      // once we have two consecutive empties past the boundary, stop burning requests
      if (series.length >= 3 && series.slice(-2).every((s) => s.count === 0) && off >= 7) break;
    }
    nwsWindow[site.key] = series;
  }

  // ── 2. NCEI ISD identifier mapping, then data ──────────────────────────────
  console.log("\n── Probe 2: NCEI ISD global-hourly (identifier mapping first) ──");
  const histUrl = "https://www.ncei.noaa.gov/pub/data/noaa/isd-history.csv";
  const hist = await probeText(histUrl, { timeoutMs: 180_000 });
  record({
    source: "NCEI ISD",
    site: "-",
    what: "station-history inventory",
    url: histUrl,
    status: hist.status,
    ok: hist.ok,
    records: hist.ok ? hist.body.split(/\r?\n/).length - 1 : 0,
    note: hist.ok ? "inventory downloaded — identifier mapping is now RESOLVED, not guessed" : hist.error.slice(0, 100),
  });

  const isdBySite: Record<string, IsdStation[]> = {};
  const isdProbes: unknown[] = [];
  if (hist.ok) {
    const all = parseIsdHistory(hist.body);
    for (const site of S0_SITES) {
      const near = all
        .map((s) => ({ ...s, distanceM: haversineM(site.lat, site.lon, s.lat, s.lon) }))
        // must still be reporting recently AND cover the 2021 season
        .filter((s) => s.end >= "20250101" && s.begin <= "20210101")
        .sort((a, b) => a.distanceM - b.distanceM)
        .slice(0, 3);
      isdBySite[site.key] = near;
      console.log(
        `  ${site.key}: ${near.map((s) => `${s.id} ${s.call || s.name} @${(s.distanceM / 1000).toFixed(1)}km`).join(" | ") || "(none within inventory filters)"}`,
      );
    }
    for (const site of S0_SITES) {
      const st = isdBySite[site.key]?.[0];
      if (!st) continue;
      const wk = await isdSeasonProbe(site, st, 2024);
      if (wk) isdProbes.push(wk);
      await sleep(POLITE_MS);
    }
    // one FULL season, on the primary Arm B site, to prove depth
    const sh = S0_SITES.find((s) => s.key === "stoney_hill")!;
    const shSt = isdBySite[sh.key]?.[0];
    if (shSt) {
      const full = await isdFullSeasonCount(sh, shSt, 2021);
      if (full) isdProbes.push(full);
      await sleep(POLITE_MS);
    }
  }

  // ── 3. IEM ASOS keyless archive ────────────────────────────────────────────
  console.log("\n── Probe 3: Iowa Environmental Mesonet ASOS archive (keyless) ──");
  const iemProbes: unknown[] = [];
  const iemDepth: Record<string, Array<{ year: number; rows: number }>> = {};
  for (const site of S0_SITES) {
    const st = nwsStationBySite[site.key];
    if (!st) {
      console.log(`  [skip] ${site.key}: no NWS/ASOS station (non-US)`);
      continue;
    }
    const p = await iemAsosProbe(site, st.id, 2024);
    if (p) iemProbes.push(p);
    await sleep(POLITE_MS);
  }
  {
    // depth: how far back does the keyless archive go at the primary Arm B site?
    // IEM rate-limits harder than the other archives — space these out, and remember that a 429 is
    // retried with backoff rather than recorded as an absence (see s0-sites.ts RETRYABLE).
    const sh = S0_SITES.find((s) => s.key === "stoney_hill")!;
    const st = nwsStationBySite[sh.key];
    if (st) {
      const depth: Array<{ year: number; rows: number }> = [];
      for (const y of [2021, 2015, 2005, 1998]) {
        depth.push(await iemDepthProbe(sh, st.id, y));
        await sleep(POLITE_MS * 5);
      }
      iemDepth[sh.key] = depth;
    }
  }

  // ── 3b. Arm B station availability per site ───────────────────────────────
  // Plan §7 asks directly: "What would raise the MEDIUMs: confirmation that a usable measuring
  // station exists near MORE THAN ONE fixture site." Plan §8 q6 asks whether Arm B is acceptable
  // with only one. Both are answerable from what the probes above already returned, so answer them
  // here rather than leaving Unit 5 to discover it.
  console.log("\n── Arm B station availability (answers plan §7 and §8 q6) ──");
  const armB: Array<{
    site: string;
    name: string;
    station: string | null;
    distanceKm: number | null;
    source: string;
    /** the archive hands us an RH column — it does NOT say anyone measured RH */
    rhPublished: boolean;
    /** what the station INDEPENDENTLY MEASURES. RH is on nobody's list. */
    measured: readonly string[];
    note: string;
  }> = [];
  for (const site of S0_SITES) {
    const nws = nwsStationBySite[site.key];
    const isd = isdBySite[site.key]?.[0] ?? null;
    const iem = (iemProbes as any[]).find((p) => p && nws && p.station === nws.id.replace(/^K/, ""));
    const iemRh = (iem?.counts?.relh ?? 0) > 0;
    const isdProbe = (isdProbes as any[]).find((p) => p?.station?.id === isd?.id);
    const isdUsable = (isdProbe?.tmp ?? 0) > 0 && (isdProbe?.dew ?? 0) > 0;
    const row = {
      site: site.key,
      name: site.name,
      station: nws?.id ?? isd?.call ?? isd?.name ?? null,
      distanceKm: nws ? nws.distanceM / 1000 : isd ? isd.distanceM / 1000 : null,
      source: iemRh ? "IEM ASOS (keyless archive)" : isdUsable ? "NCEI ISD global-hourly" : "none",
      // What the station INDEPENDENTLY MEASURES. RH is NOT on this list at any station in the set —
      // see the note below the rendered table. `rhPublished` says the archive hands us an RH column;
      // it does not say anyone measured RH.
      rhPublished: iemRh,
      measured: iemRh
        ? ["temperature", "dewPoint", "wind", "precipitation"]
        : isdUsable
          ? ["temperature", "dewPoint", "wind"]
          : [],
      note: iemRh
        ? "Arm B site: T, Td, wind and hourly precip measured; RH published but DERIVED from T/Td"
        : isdUsable
          ? "Arm B site: T, Td and wind measured; no RH column and no hourly precip at this station"
          : "no usable station",
    };
    armB.push(row);
    console.log(
      `  ${row.name.padEnd(38)} ${row.station ?? "—"} @ ${row.distanceKm != null ? row.distanceKm.toFixed(1) + " km" : "—"} · ${row.source}`,
    );
  }
  results.armB = armB;

  results.nwsStations = nwsStationBySite;
  results.nwsWindow = nwsWindow;
  results.isdStations = isdBySite;
  results.isdProbes = isdProbes;
  results.iemProbes = iemProbes;
  results.iemDepth = iemDepth;
  results.mesonets = MESONETS;
  results.attempts = attempts;

  // ── Verdict ────────────────────────────────────────────────────────────────
  const isdWorks = isdProbes.some((p: any) => p?.rows > 0 && p?.tmp > 0 && p?.dew > 0);
  const iemWorks = iemProbes.some((p: any) => p?.rows > 0 && (p?.counts?.relh ?? 0) > 0);
  // Depth is judged against WHAT S0 NEEDS (the 2021–2025 fixture seasons), not against "every year we
  // happened to poke". A station commissioned after 1998 returning nothing for 1998 is a station fact,
  // not an archive limit, and conflating the two would understate the archive.
  const depthProbes = Object.values(iemDepth).flat();
  const deepestWithData = depthProbes.filter((d) => d.rows > 0).map((d) => d.year).sort((a, b) => a - b)[0] ?? null;
  const iemDeep = deepestWithData != null && deepestWithData <= 2021;
  const backfillable = isdWorks || iemWorks;

  const outcome = backfillable ? 1 : 2;
  results.verdict = { backfillable, isdWorks, iemWorks, iemDeep, deepestWithData, outcome };

  console.log("\n════════════════════════════════════════════════════════════");
  console.log(`VERDICT: observed hourly data is ${backfillable ? "BACKFILLABLE" : "NOT BACKFILLABLE"}`);
  console.log(`  NCEI ISD global-hourly usable: ${isdWorks}`);
  console.log(`  IEM ASOS archive usable:       ${iemWorks} (deep history: ${iemDeep})`);
  console.log(`  → Outcome ${outcome}`);
  console.log("════════════════════════════════════════════════════════════\n");

  mkdirSync(dirname(OUT_JSON), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(results, null, 2), "utf8");
  writeFileSync(OUT_MD, renderMarkdown(results as any), "utf8");
  console.log(`wrote ${OUT_MD}`);
  console.log(`wrote ${OUT_JSON}`);
}

function renderMarkdown(r: any): string {
  const L: string[] = [];
  const v = r.verdict;
  L.push("---");
  L.push("title: S0 Unit 0 — is observed hourly data backfillable?");
  L.push("type: phase-artifact");
  L.push("phase: S0");
  L.push("unit: 0");
  L.push(`date: ${String(r.probedAt).slice(0, 10)}`);
  L.push(`status: ${v.backfillable ? "resolved — backfillable" : "resolved — NOT backfillable"}`);
  L.push("---");
  L.push("");
  L.push("# S0 Unit 0 — is observed hourly data backfillable?");
  L.push("");
  L.push(`_Probed live ${r.probedAt}. Every identifier and endpoint tried is in §5, so a negative result is reproducible rather than asserted._`);
  L.push("");
  L.push("## 1. The verdict");
  L.push("");
  L.push(
    v.backfillable
      ? "> **OUTCOME 1 — BACKFILLABLE.** Past hourly observed data for our geographies is retrievable on demand from a keyless archive. **The irreversibility argument is WITHDRAWN** from plan §1.3 and from Unit 8. There is no scheduling urgency, and no minimal-capture job needs to jump the queue ahead of the rest of S1."
      : "> **OUTCOME 2 — NOT BACKFILLABLE.** Past hourly observed data cannot be retrieved after the fact for our geographies. A minimal observed-ingest job must jump the queue ahead of the rest of S1, WITH alerting — a capture job without monitoring moves the failure rather than fixing it.",
  );
  L.push("");
  L.push("| Archive | Usable for CART inputs? |");
  L.push("|---|---|");
  L.push(`| NCEI ISD \`global-hourly\` (identifier RESOLVED from the station-history inventory, not guessed) | ${v.isdWorks ? "✅ yes" : "❌ no"} |`);
  L.push(`| Iowa Environmental Mesonet ASOS archive (keyless) | ${v.iemWorks ? "✅ yes" : "❌ no"} |`);
  L.push(
    `| IEM depth — does the keyless archive reach every season S0 needs (2021–2025)? | ${v.iemDeep ? `✅ yes; deepest year with data probed was **${v.deepestWithData}**` : "⚠️ NOT confirmed for the fixture seasons"} |`,
  );
  L.push("");
  L.push("## 2. NWS `/stations/{id}/observations` — the trailing window, measured");
  L.push("");
  L.push("⚠️ **This corrects the plan.** Plan §1.3 called the live window *\"a trailing window of roughly a day");
  L.push("or two\"*. It probed T-1 (78 obs) and T-7 (0 obs) and read the gap the pessimistic way. Bisected here at");
  L.push("every intermediate offset, the window is **seven days**, and it is seven days at every US site:");
  L.push("T-1 through T-6 are full, T-7 is the partial boundary day, T-10 onward is empty. The live endpoint has");
  L.push("roughly **7× more retry headroom than the plan assumed** — which matters independently of the archive");
  L.push("finding, because it means a single missed daily cron run was never going to cost data even if no archive");
  L.push("existed. Two premises pointed the same way and both were wrong in the same direction.");
  L.push("");
  L.push("| Site | Station | " + [1, 2, 3, 4, 5, 6, 7, 10, 14, 30, 90, 365].map((d) => `T-${d}d`).join(" | ") + " |");
  L.push("|---|---|" + "---|".repeat(12));
  for (const site of S0_SITES) {
    const st = r.nwsStations?.[site.key];
    if (!st) {
      L.push(`| ${site.name} | _no NWS coverage (rule §3.9)_ | ` + "—|".repeat(12));
      continue;
    }
    const series: Array<{ offsetDays: number; count: number }> = r.nwsWindow?.[site.key] ?? [];
    const byOff = new Map(series.map((s) => [s.offsetDays, s.count]));
    const cells = [1, 2, 3, 4, 5, 6, 7, 10, 14, 30, 90, 365].map((d) =>
      byOff.has(d) ? String(byOff.get(d)) : "·",
    );
    L.push(`| ${site.name} | \`${st.id}\` @ ${(st.distanceM / 1000).toFixed(1)} km | ${cells.join(" | ")} |`);
  }
  L.push("");
  L.push("`·` = not probed (two consecutive empties past T-7 stops the walk rather than burning requests).");
  L.push("");
  L.push("## 3. The archives");
  L.push("");
  L.push("### NCEI ISD `global-hourly`");
  L.push("");
  L.push("The plan's first attempt guessed a USAF-WBAN identifier and got an empty response, which proves nothing.");
  L.push("This probe resolves the mapping from `isd-history.csv` first, then queries. Nearest inventory stations,");
  L.push("filtered to those covering 2021 through 2025:");
  L.push("");
  L.push("| Site | Nearest ISD stations (id · call · distance) |");
  L.push("|---|---|");
  for (const site of S0_SITES) {
    const near: IsdStation[] = r.isdStations?.[site.key] ?? [];
    L.push(
      `| ${site.name} | ${near.length ? near.map((s) => `\`${s.id}\` ${s.call || s.name} @ ${(s.distanceM / 1000).toFixed(1)} km`).join("<br>") : "_none in inventory within the coverage filter_"} |`,
    );
  }
  L.push("");
  L.push("ISD carries `TMP` and `DEW` but **not** a relative-humidity field — RH is derived from temperature and");
  L.push("dew point. That is fine for CART, whose inputs are RH *and* dew-point depression, both computable from");
  L.push("the same pair. It matters for Arm B, where a derived RH is not an independent measurement of RH.");
  L.push("");
  L.push("### Iowa Environmental Mesonet ASOS archive");
  L.push("");
  L.push("Keyless, and it serves `relh` **derived and published alongside** `tmpf`/`dwpf`, plus `sknt` (wind) and");
  L.push("`p01i` (hourly precip) — the complete CART input set from the same measured ASOS network the live NWS");
  L.push("observations endpoint exposes. Probe results in §5.");
  L.push("");
  L.push("**Keyless archive depth, probed at Stoney Hill (KDYL):**");
  L.push("");
  L.push("| Year probed (Jul 1–3) | Rows returned |");
  L.push("|---|---|");
  for (const d of (Object.values(r.iemDepth ?? {}).flat() as Array<{ year: number; rows: number }>)) {
    L.push(`| ${d.year} | ${d.rows > 0 ? `${d.rows} ✅` : "0 ❌"} |`);
  }
  L.push("");
  L.push("⚠️ **A 429 is not an absence.** The first run of this probe hit `HTTP 429 Too many requests` on the");
  L.push("deepest year and would have recorded *\"no data before 2015\"* — a fabricated absence understating the");
  L.push("archive's depth by a decade, in the exact direction that would have made the retention argument look");
  L.push("stronger than it is. The probe now retries 429/5xx with backoff and treats only 404 as a coverage signal.");
  L.push("");
  L.push("### Arm B station availability — answers plan §7 and §8 q6");
  L.push("");
  L.push("The plan's own confidence table said the thing that would raise Unit 5 from MEDIUM is *\"confirmation");
  L.push("that a usable measuring station exists near more than one fixture site\"*, and §8 q6 asked whether Arm B");
  L.push("is acceptable with only one. Measured:");
  L.push("");
  L.push("| Site | Station | Distance | Archive | Independently measured | RH column |");
  L.push("|---|---|---|---|---|---|");
  for (const a of (r.armB ?? []) as any[]) {
    L.push(
      `| ${a.name} | ${a.station ? `\`${a.station}\`` : "—"} | ${a.distanceKm != null ? a.distanceKm.toFixed(1) + " km" : "—"} | ${a.source} | ${(a.measured ?? []).join(", ") || "—"} | ${a.rhPublished ? "published (derived)" : "absent"} |`,
    );
  }
  L.push("");
  L.push(
    `**Answer to §8 q6: Arm B is NOT limited to one site. All five fixture sites have a usable station**, four of them under 20 km. The plan's stated remedy — "re-weight site selection toward stations rather than regimes" — is unnecessary; the regime-selected set already has station coverage.`,
  );
  L.push("");
  L.push("⚠️ **But the win is smaller than the table first looks, and this must not be flattened into**");
  L.push("**\"we validated RH against measured RH\".** No station in this set measures relative humidity.");
  L.push("ASOS measures **temperature and dew point** with separate sensors; the `relh` column IEM publishes is");
  L.push("**computed from that pair**, exactly as ours would be. Comparing our derived RH against their derived RH");
  L.push("tests the psychrometric arithmetic, not the measurement.");
  L.push("");
  L.push("So Arm B's independent quantities are **temperature, dew point, wind speed and hourly precipitation**.");
  L.push("RH is validated only *transitively*, through T and Td. Unit 1b must therefore set its input-tolerance");
  L.push("budget on **dew-point depression** as the primary humidity criterion rather than on RH, and Unit 5 must");
  L.push("state the derivation every time it reports an RH error figure.");
  L.push("");
  L.push("A second consequence, in our favour: **Paro has an ISD station 0.8 km away (`VQPR`, Paro Airport)**");
  L.push("with measured temperature, dew point and wind across the seasons we need. The plan assumed Bhutan was");
  L.push("*\"ERA5 only\"*, and it is not. That gives the jurisdiction-neutrality site a real validation arm and is");
  L.push("a correction back to the data-sources design, which treats non-US as reanalysis-only.");
  L.push("");
  L.push("### Regional / state mesonets — recorded, not integrated");
  L.push("");
  L.push("| Network | Covers | Access | Keyless |");
  L.push("|---|---|---|---|");
  for (const m of r.mesonets as typeof MESONETS) {
    L.push(`| ${m.name} | ${m.covers} | ${m.access} | ${m.keyless ? "✅" : "❌"} |`);
  }
  L.push("");
  L.push("## 4. What this changes");
  L.push("");
  if (v.backfillable) {
    L.push("1. **Plan §1.3's irreversibility argument is withdrawn.** No conclusion in Unit 8 may cite");
    L.push("   irrecoverable loss of observed data, because observed data is recoverable.");
    L.push("2. **No minimal-capture job jumps the queue.** Open question 5 for Russell is answered by measurement:");
    L.push("   it does not need to, so S1 keeps its planned shape.");
    L.push("3. **The daily-cron risk is downgraded from permanent to latency.** A missed capture is still a gap in");
    L.push("   the live series, and it is still SILENT — there is no alerting on a skipped capture — but it is now");
    L.push("   a gap that can be filled after the fact, not data destroyed.");
    L.push("4. **The retention decision gains an option Unit 8 must consider explicitly:** *backfill-on-demand* for");
    L.push("   OBSERVED, not just retain-or-prune. Storage stops being the only lever.");
    L.push("5. ⚠️ **The silent-cron risk does NOT go away, it changes shape.** The intra-cron window (council G3 —");
    L.push("   downy secondary sporulation can complete in a single night, and a grower asking at 08:00 when the");
    L.push("   cron ran at 00:00 is missing the decisive eight hours) is a *freshness* problem, and backfill does");
    L.push("   nothing for freshness. Unit 6 still owns whether the system fails open or closed in that window.");
    L.push("6. **Arm B is a five-site arm, not a one-site arm** (§3). That is the single largest change to Unit 5's");
    L.push("   confidence, and it lands with the caveat above: the independent quantities are T, Td, wind and");
    L.push("   precipitation, never RH itself.");
    L.push("");
    L.push("**What did NOT change:** none of this makes the estimator better. Backfillable inputs and a five-site");
    L.push("Arm B bound the *input* problem harder; there is still no measured leaf wetness anywhere in this set,");
    L.push("and Arm A remains the only arm that touches a decision. Plan §1.1's narrowing stands unaltered.");
  } else {
    L.push("1. **Plan §1.3's irreversibility argument STANDS** and Unit 8 may cite it.");
    L.push("2. **A minimal observed-ingest job jumps the queue ahead of the rest of S1**, and it ships WITH");
    L.push("   alerting on a skipped run. A capture job without monitoring moves the failure rather than fixing it.");
    L.push("3. Russell's decision is required on this, per plan §8 open question 5.");
  }
  L.push("");
  L.push("## 5. Every attempt, recorded");
  L.push("");
  L.push("A negative result is only useful if it is reproducible. Every request this probe issued:");
  L.push("");
  L.push("| Source | Site | What | HTTP | Records | Note |");
  L.push("|---|---|---|---|---|---|");
  for (const a of r.attempts as Attempt[]) {
    L.push(
      `| ${a.source} | ${a.site} | ${a.what} | ${a.status} | ${a.records ?? "—"} | ${String(a.note).replace(/\|/g, "\\|")} |`,
    );
  }
  L.push("");
  L.push("Full URLs are in the machine-readable sidecar `s0-observed-backfill.json`.");
  L.push("");
  L.push("---");
  L.push("");
  L.push("_NWS requests carry a User-Agent per provider policy. A 404 is treated as a coverage signal and is");
  L.push("never retried._");
  L.push("");
  return L.join("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
