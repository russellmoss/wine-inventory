/**
 * S0 Unit 3 — HARVEST THE COMMITTED FIXTURE SERIES. Five sites × five seasons × four archive models.
 *
 * Run:  npx tsx scripts/s0-fetch-fixtures.ts
 *       npx tsx scripts/s0-fetch-fixtures.ts --verify-only   (re-run the shape assertions, no fetch)
 *
 * Brief §19 requires LWD to be a pure function tested against a COMMITTED series with no live
 * providers. This produces that series, and it is also the data Unit 5's measurement runs on.
 *
 * Council G5 and G6 expanded this unit, and it is the cheapest expansion in the plan — the archive is
 * free, re-fetchable, and rate-limited only by politeness. One season and four sites would have fixed
 * a global refusal threshold on possibly anomalous weather.
 *
 * ── Storage ──
 * Columnar and gzipped. Times are NOT stored: the archive is contiguous hourly, so `startUtc` plus an
 * index reconstructs every instant exactly, and the shape assertions below prove the contiguity
 * rather than assuming it. That is ~35 kB per site-season-model instead of ~250 kB, which is the
 * difference between a fixture set that can live in the repo and one that cannot.
 *
 * ── Timezones ──
 * Fetched and STORED in UTC. Site-local hour is DERIVED at read time via the IANA zone, so the 23-
 * and 25-hour civil days handle themselves through the zone database rather than through arithmetic.
 * The assertions check exactly that, in both US zones (`Asia/Thimphu` has no DST, which is itself
 * worth asserting so a future refactor cannot quietly introduce one).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { join } from "node:path";
import {
  OPEN_METEO_ATTRIBUTION,
  POLITE_MS,
  S0_SEASONS,
  S0_SITES,
  probeJson,
  seasonWindow,
  sleep,
  type S0Site,
} from "./s0-sites";
import { CANONICAL, assertUnit } from "./s0-units";

const VERIFY_ONLY = process.argv.includes("--verify-only");
const FIX_DIR = join(process.cwd(), "scripts", "fixtures", "s0");
const OUT_MD = join(process.cwd(), "docs", "spray_assistant", "phases", "s0-fixture-manifest.md");

/** The four archive variants. Model choice is a first-class error source (plan §1.2), carried
 *  through the measurement rather than collapsed early. */
export const ARCHIVE_MODELS = ["era5_land", "era5", "era5_seamless", "default"] as const;
export type ArchiveModel = (typeof ARCHIVE_MODELS)[number];

const VARS = [
  "temperature_2m",
  "relative_humidity_2m",
  "dew_point_2m",
  "wind_speed_10m",
  "precipitation",
  "cloud_cover",
  "shortwave_radiation",
] as const;
type Var = (typeof VARS)[number];

/** Expected units AFTER we force SI on the request. Asserted, not trusted — see s0-units.ts. */
const EXPECTED_UNITS: Record<Var, string> = {
  temperature_2m: "°C",
  relative_humidity_2m: "%",
  dew_point_2m: "°C",
  wind_speed_10m: "m/s",
  precipitation: "mm",
  cloud_cover: "%",
  shortwave_radiation: "W/m²",
};

/** Rounding, chosen per variable so the fixture is small without losing anything the estimators can
 *  see. CART's finest node is 0.1 °C of dew-point depression, so 1 decimal on temperature and dew
 *  point is exactly sufficient and no more. */
const ROUND: Record<Var, number> = {
  temperature_2m: 1,
  relative_humidity_2m: 1,
  dew_point_2m: 1,
  wind_speed_10m: 2,
  precipitation: 2,
  cloud_cover: 0,
  shortwave_radiation: 0,
};

export type Fixture = {
  schema: 1;
  siteKey: string;
  siteName: string;
  lat: number;
  lon: number;
  elevationM: number;
  timeZone: string;
  season: number;
  model: ArchiveModel;
  /** the UTC instant of hour index 0 */
  startUtc: string;
  hours: number;
  units: Record<string, string>;
  /** null-preserving; a null here means the provider had no value, never zero */
  data: Record<string, Array<number | null>>;
  attribution: string;
  fetchedAt: string;
  sourceUrl: string;
};

const round = (v: number | null, dp: number): number | null =>
  v == null ? null : Number(v.toFixed(dp));

function fixturePath(siteKey: string, season: number, model: ArchiveModel) {
  return join(FIX_DIR, `${siteKey}__${season}__${model}.json.gz`);
}

export function readFixture(p: string): Fixture {
  return JSON.parse(gunzipSync(readFileSync(p)).toString("utf8")) as Fixture;
}

// ─────────────────────────────────────────────────────────────────────────────
// Site-local time, derived. No dependency, no arithmetic on offsets.
// ─────────────────────────────────────────────────────────────────────────────

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function zoneFormatter(timeZone: string) {
  let f = fmtCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    });
    fmtCache.set(timeZone, f);
  }
  return f;
}

/** → { localDate: "2024-06-01", localHour: 0..23 } in the site's civil time. */
export function siteLocal(utcMs: number, timeZone: string): { localDate: string; localHour: number } {
  const parts = zoneFormatter(timeZone).formatToParts(new Date(utcMs));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  // en-CA hour can render as "24" at midnight in some ICU versions; normalize.
  const h = Number(get("hour")) % 24;
  return { localDate: `${get("year")}-${get("month")}-${get("day")}`, localHour: h };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch
// ─────────────────────────────────────────────────────────────────────────────

async function fetchOne(site: S0Site, season: number, model: ArchiveModel): Promise<Fixture | null> {
  const { start, end } = seasonWindow(site, season);
  const params = new URLSearchParams({
    latitude: String(site.lat),
    longitude: String(site.lon),
    start_date: start,
    end_date: end,
    hourly: VARS.join(","),
    timezone: "UTC",
    // FORCE SI. Then assert it anyway — forcing and trusting are different things.
    wind_speed_unit: "ms",
    temperature_unit: "celsius",
    precipitation_unit: "mm",
  });
  if (model !== "default") params.set("models", model);
  const url = `https://archive-api.open-meteo.com/v1/archive?${params}`;

  const res = await probeJson<any>(url, { timeoutMs: 180_000 });
  if (!res.ok) {
    console.log(`    [FAIL] ${site.key} ${season} ${model} → HTTP ${res.status} ${res.error.slice(0, 60)}`);
    return null;
  }
  const h = res.body.hourly ?? {};
  const u = res.body.hourly_units ?? {};
  const times: string[] = h.time ?? [];
  if (!times.length) {
    console.log(`    [FAIL] ${site.key} ${season} ${model} → empty payload`);
    return null;
  }

  // ── unit assertions, per variable, every time ──
  for (const v of VARS) {
    if ((h[v] ?? []).length === 0) continue; // absent variable (era5_land wind) — not a unit problem
    assertUnit(`${model}.${v}`, EXPECTED_UNITS[v], u[v]);
  }

  const data: Record<string, Array<number | null>> = {};
  for (const v of VARS) {
    const arr: Array<number | null> = h[v] ?? [];
    data[v] = arr.length ? arr.map((x) => round(x, ROUND[v])) : [];
  }

  return {
    schema: 1,
    siteKey: site.key,
    siteName: site.name,
    lat: site.lat,
    lon: site.lon,
    elevationM: site.elevationM,
    timeZone: site.timeZone,
    season,
    model,
    startUtc: new Date(`${times[0]}Z`).toISOString(),
    hours: times.length,
    units: EXPECTED_UNITS,
    data,
    attribution: OPEN_METEO_ATTRIBUTION,
    fetchedAt: new Date().toISOString(),
    sourceUrl: url,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shape assertions. These are the tests for this unit — a fixture that fails is not written.
// ─────────────────────────────────────────────────────────────────────────────

export type ShapeCheck = { name: string; ok: boolean; detail: string };

export function checkFixture(fx: Fixture): ShapeCheck[] {
  const out: ShapeCheck[] = [];
  const site = S0_SITES.find((s) => s.key === fx.siteKey)!;
  const { start, end } = seasonWindow(site, fx.season);

  // 1. Expected hour count for the requested UTC range, inclusive of both end dates.
  const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
  const expected = days * 24;
  out.push({
    name: "hour count matches the requested range",
    ok: fx.hours === expected,
    detail: `${fx.hours} vs expected ${expected} (${days} days × 24)`,
  });

  // 2. Every variable array is either empty (absent) or exactly `hours` long. A short array would
  //    silently misalign every downstream index.
  const badLen = VARS.filter((v) => (fx.data[v] ?? []).length !== 0 && fx.data[v].length !== fx.hours);
  out.push({
    name: "every present variable has exactly `hours` entries",
    ok: badLen.length === 0,
    detail: badLen.length ? `misaligned: ${badLen.join(", ")}` : "aligned",
  });

  // 3. No duplicate and no fabricated hours — the contiguity claim that lets us drop the time array.
  //    Reconstruct the last instant and check it lands on the final hour of the range.
  const lastMs = Date.parse(fx.startUtc) + (fx.hours - 1) * 3_600_000;
  const expectedLast = Date.parse(`${end}T23:00:00Z`);
  out.push({
    name: "contiguity: startUtc + (hours-1)h lands on the range's final hour",
    ok: lastMs === expectedLast,
    detail: `${new Date(lastMs).toISOString()} vs ${new Date(expectedLast).toISOString()}`,
  });

  // 4. DST. Group by SITE-LOCAL civil date and count hours per day. US zones must show a 23-hour day
  //    and a 25-hour day when the season window spans the transitions; Asia/Thimphu must show
  //    neither, ever.
  const perDay = new Map<string, number>();
  for (let i = 0; i < fx.hours; i++) {
    const { localDate } = siteLocal(Date.parse(fx.startUtc) + i * 3_600_000, fx.timeZone);
    perDay.set(localDate, (perDay.get(localDate) ?? 0) + 1);
  }
  // first and last civil days are partial by construction (the window is UTC) — exclude them
  const dates = [...perDay.keys()].sort();
  const interior = dates.slice(1, -1);
  const short = interior.filter((d) => perDay.get(d) === 23);
  const long = interior.filter((d) => perDay.get(d) === 25);
  const odd = interior.filter((d) => ![23, 24, 25].includes(perDay.get(d)!));

  if (fx.timeZone === "Asia/Thimphu") {
    out.push({
      name: "no DST transition in Asia/Thimphu",
      ok: short.length === 0 && long.length === 0 && odd.length === 0,
      detail: `23h days: ${short.length}, 25h days: ${long.length}`,
    });
  } else {
    // Apr 1 – Oct 31 sits INSIDE US DST, so neither transition falls in the window. Assert that
    // positively rather than shrugging: it is the difference between "we handled DST" and "DST
    // never came up and we would not have noticed."
    out.push({
      name: "US season window sits inside DST, so no transition day appears",
      ok: short.length === 0 && long.length === 0 && odd.length === 0,
      detail: `23h: ${short.length}, 25h: ${long.length}, other: ${odd.length} — window ${start}..${end}`,
    });
  }

  // 5. Physical plausibility. Not a weather judgement — a wrong-units / wrong-column detector.
  const t = (fx.data.temperature_2m ?? []).filter((x): x is number => x != null);
  const rh = (fx.data.relative_humidity_2m ?? []).filter((x): x is number => x != null);
  const w = (fx.data.wind_speed_10m ?? []).filter((x): x is number => x != null);
  out.push({
    name: "temperature within [-60, 60] °C",
    ok: t.length === 0 || (Math.min(...t) >= -60 && Math.max(...t) <= 60),
    detail: t.length ? `${Math.min(...t)}..${Math.max(...t)}` : "absent",
  });
  out.push({
    name: "relative humidity within [0, 100] %",
    ok: rh.length === 0 || (Math.min(...rh) >= 0 && Math.max(...rh) <= 100),
    detail: rh.length ? `${Math.min(...rh)}..${Math.max(...rh)}` : "absent",
  });
  // The km/h trap: a season whose max wind is ~30 is m/s-plausible; ~100 means we got km/h anyway.
  out.push({
    name: "wind speed is m/s, not km/h (max < 45)",
    ok: w.length === 0 || Math.max(...w) < 45,
    detail: w.length ? `max ${Math.max(...w)} m/s` : "absent (era5_land carries no wind)",
  });

  // 6. Dew point never exceeds temperature by more than rounding. A violation means the columns are
  //    swapped or the model is internally inconsistent, and CART would read a negative depression.
  const tt = fx.data.temperature_2m ?? [];
  const dd = fx.data.dew_point_2m ?? [];
  let inversions = 0;
  for (let i = 0; i < Math.min(tt.length, dd.length); i++) {
    const a = tt[i];
    const b = dd[i];
    if (a != null && b != null && b - a > 0.2) inversions++;
  }
  out.push({
    name: "dew point never exceeds temperature (beyond rounding)",
    ok: inversions === 0,
    detail: `${inversions} inversions`,
  });

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Season characterization.
//
// ⚠️ DELIBERATE DEVIATION FROM THE PLAN, and worth stating rather than burying.
//
// The plan says to characterize each season "against the 20 years of daily climate already in
// `vineyard_climate_daily` for four of the five sites". That cannot be done uniformly:
//   - Paro's rows belong to `org_bhutan_wine_co`, and this lane's Bhutan discipline is coordinates
//     and timezone ONLY — reading its climate series would breach it for a characterization;
//   - the Monticello site is fixture-only and has no rows at all.
// So a DB-based characterization would cover three of five sites and would be computed differently
// per site, which is exactly the kind of inconsistency that makes a comparison meaningless.
//
// Instead: one 20-season daily baseline per site from the SAME archive the fixtures come from. It is
// uniform across all five sites, needs no database and no tenant context, and compares like with
// like. It is also cheap — one request per site.
// ─────────────────────────────────────────────────────────────────────────────

export type SeasonCharacter = {
  siteKey: string;
  season: number;
  precipMm: number;
  meanTempC: number;
  precipPercentile: number;
  tempPercentile: number;
  /** the label a reader needs: is this a wet year, a dry year, or an ordinary one? */
  wetness: "DRY" | "NORMAL" | "WET";
  warmth: "COOL" | "NORMAL" | "WARM";
};

const BASELINE_YEARS = 20;

async function fetchBaseline(site: S0Site) {
  const firstSeason = Math.min(...S0_SEASONS);
  const y0 = firstSeason - BASELINE_YEARS + 1;
  const y1 = Math.max(...S0_SEASONS);
  const params = new URLSearchParams({
    latitude: String(site.lat),
    longitude: String(site.lon),
    start_date: `${y0}-01-01`,
    end_date: `${y1}-12-31`,
    daily: "temperature_2m_mean,precipitation_sum",
    timezone: site.timeZone,
    temperature_unit: "celsius",
    precipitation_unit: "mm",
  });
  const url = `https://archive-api.open-meteo.com/v1/archive?${params}`;
  const res = await probeJson<any>(url, { timeoutMs: 180_000 });
  if (!res.ok) return null;
  const d = res.body.daily ?? {};
  const times: string[] = d.time ?? [];
  const perSeason = new Map<number, { precip: number; tSum: number; n: number }>();
  for (let i = 0; i < times.length; i++) {
    const date = times[i];
    const year = Number(date.slice(0, 4));
    const { start, end } = seasonWindow(site, year);
    if (date < start || date > end) continue;
    const cur = perSeason.get(year) ?? { precip: 0, tSum: 0, n: 0 };
    cur.precip += d.precipitation_sum?.[i] ?? 0;
    if (d.temperature_2m_mean?.[i] != null) {
      cur.tSum += d.temperature_2m_mean[i];
      cur.n++;
    }
    perSeason.set(year, cur);
  }
  return perSeason;
}

function percentileOf(value: number, population: number[]): number {
  const below = population.filter((v) => v < value).length;
  return population.length ? below / population.length : 0.5;
}

function characterize(siteKey: string, perSeason: Map<number, { precip: number; tSum: number; n: number }>): SeasonCharacter[] {
  const allPrecip = [...perSeason.values()].map((v) => v.precip);
  const allTemp = [...perSeason.values()].filter((v) => v.n > 0).map((v) => v.tSum / v.n);
  return S0_SEASONS.map((season) => {
    const cur = perSeason.get(season);
    const precipMm = cur?.precip ?? 0;
    const meanTempC = cur && cur.n > 0 ? cur.tSum / cur.n : 0;
    const pp = percentileOf(precipMm, allPrecip);
    const tp = percentileOf(meanTempC, allTemp);
    return {
      siteKey,
      season,
      precipMm: Number(precipMm.toFixed(1)),
      meanTempC: Number(meanTempC.toFixed(2)),
      precipPercentile: Number(pp.toFixed(2)),
      tempPercentile: Number(tp.toFixed(2)),
      wetness: pp < 0.3 ? "DRY" : pp > 0.7 ? "WET" : "NORMAL",
      warmth: tp < 0.3 ? "COOL" : tp > 0.7 ? "WARM" : "NORMAL",
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(FIX_DIR, { recursive: true });
  console.log(`\nS0 Unit 3 — fixture harvest${VERIFY_ONLY ? " (verify only)" : ""}`);
  console.log(`${S0_SITES.length} sites × ${S0_SEASONS.length} seasons × ${ARCHIVE_MODELS.length} models = ${S0_SITES.length * S0_SEASONS.length * ARCHIVE_MODELS.length} fixtures\n`);

  const failures: string[] = [];
  const written: Array<{ path: string; bytes: number; hours: number; sha: string }> = [];

  if (!VERIFY_ONLY) {
    for (const site of S0_SITES) {
      for (const season of S0_SEASONS) {
        for (const model of ARCHIVE_MODELS) {
          const p = fixturePath(site.key, season, model);
          if (existsSync(p)) {
            console.log(`  [skip] ${site.key} ${season} ${model} (already present)`);
            continue;
          }
          const fx = await fetchOne(site, season, model);
          await sleep(POLITE_MS);
          if (!fx) {
            failures.push(`fetch failed: ${site.key} ${season} ${model}`);
            continue;
          }
          const checks = checkFixture(fx);
          const bad = checks.filter((c) => !c.ok);
          if (bad.length) {
            failures.push(`${site.key} ${season} ${model}: ${bad.map((b) => `${b.name} [${b.detail}]`).join("; ")}`);
            console.log(`    [BAD ] ${site.key} ${season} ${model} → ${bad.map((b) => b.name).join("; ")}`);
            continue; // a fixture that fails its shape assertions is NOT written
          }
          const buf = gzipSync(Buffer.from(JSON.stringify(fx), "utf8"), { level: 9 });
          writeFileSync(p, buf);
          console.log(`    [ok  ] ${site.key} ${season} ${model} → ${fx.hours}h, ${(buf.length / 1024).toFixed(0)} kB`);
        }
      }
    }
  }

  // ── verify everything on disk, including anything written by a previous run ──
  console.log("\n── verifying every fixture on disk ──");
  const files = readdirSync(FIX_DIR).filter((f) => f.endsWith(".json.gz")).sort();
  let checksRun = 0;
  for (const f of files) {
    const p = join(FIX_DIR, f);
    const fx = readFixture(p);
    const checks = checkFixture(fx);
    checksRun += checks.length;
    const bad = checks.filter((c) => !c.ok);
    if (bad.length) failures.push(`${f}: ${bad.map((b) => `${b.name} [${b.detail}]`).join("; ")}`);
    const raw = readFileSync(p);
    written.push({ path: f, bytes: raw.length, hours: fx.hours, sha: createHash("sha256").update(raw).digest("hex").slice(0, 12) });
  }
  console.log(`  ${files.length} fixtures, ${checksRun} assertions, ${failures.length} failures`);

  // ── season characterization ──
  console.log("\n── season characterization (20-season archive baseline, uniform across all sites) ──");
  const characters: SeasonCharacter[] = [];
  const charPath = join(FIX_DIR, "_season-character.json");
  if (existsSync(charPath) && VERIFY_ONLY) {
    characters.push(...(JSON.parse(readFileSync(charPath, "utf8")) as SeasonCharacter[]));
  } else {
    for (const site of S0_SITES) {
      const base = await fetchBaseline(site);
      await sleep(POLITE_MS);
      if (!base) {
        failures.push(`baseline fetch failed: ${site.key}`);
        continue;
      }
      const cs = characterize(site.key, base);
      characters.push(...cs);
      for (const c of cs) {
        console.log(
          `  ${site.key.padEnd(15)} ${c.season}  ${String(c.precipMm).padStart(7)} mm (p${(c.precipPercentile * 100).toFixed(0)}) ${c.wetness.padEnd(6)}  ${c.meanTempC.toFixed(1)} °C (p${(c.tempPercentile * 100).toFixed(0)}) ${c.warmth}`,
        );
      }
    }
    writeFileSync(charPath, JSON.stringify(characters, null, 2), "utf8");
  }

  writeFileSync(OUT_MD, renderManifest({ written, characters, failures }), "utf8");
  console.log(`\nwrote ${OUT_MD}`);

  const totalMb = written.reduce((a, b) => a + b.bytes, 0) / 1024 / 1024;
  console.log(`fixture set: ${written.length} files, ${totalMb.toFixed(1)} MB on disk`);

  if (failures.length) {
    console.error(`\n❌ ${failures.length} failures:`);
    for (const f of failures.slice(0, 30)) console.error(`   ${f}`);
    process.exit(1);
  }
  console.log("\n✅ every fixture passes every shape assertion");
}

function renderManifest(o: {
  written: Array<{ path: string; bytes: number; hours: number; sha: string }>;
  characters: SeasonCharacter[];
  failures: string[];
}): string {
  const L: string[] = [];
  L.push("---");
  L.push("title: S0 Unit 3 — committed fixture manifest and season characterization");
  L.push("type: phase-artifact");
  L.push("phase: S0");
  L.push("unit: 3");
  L.push(`date: ${new Date().toISOString().slice(0, 10)}`);
  L.push("---");
  L.push("");
  L.push("# S0 Unit 3 — the committed fixture series");
  L.push("");
  L.push(`> ${OPEN_METEO_ATTRIBUTION}`);
  L.push("");
  L.push(
    `${o.written.length} fixtures · ${(o.written.reduce((a, b) => a + b.bytes, 0) / 1024 / 1024).toFixed(1)} MB · ${o.written.reduce((a, b) => a + b.hours, 0).toLocaleString()} site-hours across ${S0_SITES.length} sites × ${S0_SEASONS.length} seasons × ${ARCHIVE_MODELS.length} archive models.`,
  );
  L.push("");
  L.push("Stored columnar and gzipped, in UTC, with the time array dropped — the archive is contiguous");
  L.push("hourly, so `startUtc` plus an index reconstructs every instant, and the contiguity assertion below");
  L.push("proves that rather than assuming it. Site-local hour is derived at read time from the IANA zone.");
  L.push("");
  L.push("## Sites");
  L.push("");
  L.push("| Site | Regime | Coords | Elevation | Zone | Why it earns a slot |");
  L.push("|---|---|---|---|---|---|");
  for (const s of S0_SITES) {
    L.push(
      `| ${s.name} | ${s.regime.replace(/_/g, " ")} | ${s.lat}, ${s.lon} | ${s.elevationM} m | ${s.timeZone} | ${s.rationale} |`,
    );
  }
  L.push("");
  L.push("⚠️ **Gemini proposed dropping Bhutan to make room for the Southeast site. Rejected.** Paro is a live");
  L.push("tenant and runbook rule §3.9 makes non-US first-class and forbids the app bricking outside the US;");
  L.push("that outranks a site slot. The fifth site was added and Paro kept.");
  L.push("");
  L.push("**Bhutan discipline:** Paro is coordinates, elevation and a timezone. Nothing is written to");
  L.push("`org_bhutan_wine_co` and nothing is read from it. The fixture is a flat file.");
  L.push("");
  L.push("## Season characterization");
  L.push("");
  L.push("Council G5: a single season guarantees blind spots — if one year happens to lack a three-day rain");
  L.push("event at 70 °F, downy and black rot pressure are never exercised at all. So each season is");
  L.push("characterized against a 20-season baseline, and the characterization is an **output**, not a note:");
  L.push("a low-pressure fixture set must be visible rather than silent.");
  L.push("");
  L.push("⚠️ **Deviation from the plan, stated rather than buried.** The plan said to characterize against the");
  L.push("20 years of daily climate in `vineyard_climate_daily`. That covers three of five sites — Paro's rows");
  L.push("are Bhutan's and this lane may not read them, and the Monticello site has no rows at all — and would");
  L.push("compute the characterization differently per site. A 20-season baseline pulled from the same archive");
  L.push("the fixtures come from is uniform across all five, needs no tenant context, and compares like with");
  L.push("like.");
  L.push("");
  L.push("| Site | Season | Season precip | Percentile | Wetness | Mean temp | Percentile | Warmth |");
  L.push("|---|---|---|---|---|---|---|---|");
  for (const c of o.characters) {
    L.push(
      `| ${c.siteKey} | ${c.season} | ${c.precipMm} mm | p${(c.precipPercentile * 100).toFixed(0)} | **${c.wetness}** | ${c.meanTempC} °C | p${(c.tempPercentile * 100).toFixed(0)} | ${c.warmth} |`,
    );
  }
  L.push("");

  // ── automatic skew detection ────────────────────────────────────────────────
  // "That characterization is an output, not a note" (plan, Unit 3) is only true if something reads
  // it. A site whose five fixture seasons all sit on one side of its own baseline is a biased
  // sample, and every conclusion drawn at that site inherits the bias. Detected, not left to a
  // reader scanning 25 rows.
  const skews: string[] = [];
  for (const s of S0_SITES) {
    const cs = o.characters.filter((c) => c.siteKey === s.key);
    if (cs.length < 3) continue;
    const ps = cs.map((c) => c.precipPercentile);
    const median = [...ps].sort((a, b) => a - b)[Math.floor(ps.length / 2)];
    if (ps.every((p) => p < 0.35)) {
      skews.push(
        `**${s.name}: all ${cs.length} fixture seasons are DRY against its own 20-season baseline** (percentiles ${ps.map((p) => "p" + (p * 100).toFixed(0)).join(", ")}, median p${(median * 100).toFixed(0)}).`,
      );
    } else if (ps.every((p) => p > 0.65)) {
      skews.push(
        `**${s.name}: all ${cs.length} fixture seasons are WET against its own 20-season baseline** (percentiles ${ps.map((p) => "p" + (p * 100).toFixed(0)).join(", ")}).`,
      );
    }
  }
  if (skews.length) {
    L.push("### ⚠️ Sampling skew detected");
    L.push("");
    L.push("Council G5's whole point is that a low-pressure fixture set must be **visible rather than silent**.");
    L.push("These sites' five seasons all sit on one side of their own baseline, so conclusions drawn there are");
    L.push("drawn on a tail, not on a representative sample:");
    L.push("");
    for (const s of skews) L.push(`- ${s}`);
    L.push("");
    L.push("Two readings, and they have opposite consequences, so neither may be assumed:");
    L.push("");
    L.push("1. **Sampling accident.** 2021–2025 happened to be dry there. The remedy is more seasons.");
    L.push("2. **Climate trend.** The 20-season baseline is dominated by earlier years that no longer describe");
    L.push("   the site, so *every* recent season would score dry and the percentile is measuring drift rather");
    L.push("   than anomaly. The remedy is a shorter, recency-weighted baseline — and the finding matters well");
    L.push("   beyond S0, because a disease model calibrated on a stale normal inherits the same error.");
    L.push("");
    L.push("S0 does not have the evidence to choose between them, and says so rather than picking. What it does");
    L.push("commit to: **Unit 5 reports the affected sites' results per season and never pools them**, and Unit 6");
    L.push("does not set a refusal threshold from a skewed site's numbers alone.");
    L.push("");
  } else {
    L.push("_No site's fixture seasons all fall on one side of its baseline — the set spans wet, dry and normal._");
    L.push("");
  }
  L.push("## Shape assertions");
  L.push("");
  L.push("Run on every fixture, on write AND on every `--verify-only` pass. A fixture that fails is **not");
  L.push("written** — the failure mode this prevents is a silently truncated or misaligned series that every");
  L.push("later unit would then measure with confidence.");
  L.push("");
  L.push("| Assertion | What it catches |");
  L.push("|---|---|");
  L.push("| hour count matches the requested range | a silently truncated season |");
  L.push("| every present variable has exactly `hours` entries | column misalignment, which shifts every hour by an unknown offset |");
  L.push("| contiguity: `startUtc + (hours−1)h` lands on the range's final hour | a duplicated or fabricated hour — and it is what licenses dropping the time array |");
  L.push("| DST behaviour per zone | the US window sits *inside* DST so no transition day should appear; `Asia/Thimphu` must never show one. Asserted positively, so \"we handled DST\" is distinguishable from \"DST never came up\" |");
  L.push("| temperature within [−60, 60] °C, RH within [0, 100] % | a swapped or misread column |");
  L.push("| **wind speed max < 45** | ⚠️ the km/h trap — see below |");
  L.push("| dew point never exceeds temperature | swapped columns, which would give CART a negative depression |");
  L.push("");
  L.push("### ⚠️ The km/h trap");
  L.push("");
  L.push("Open-Meteo's archive returns `wind_speed_10m` in **km/h by default**, and CART's wind node is");
  L.push("**2.5 m/s**. Feeding km/h into an m/s threshold makes a dead calm look windy, which collapses CART's");
  L.push("level 2 and routes the entire season through the RH node. The estimator would still run and still");
  L.push("produce plausible wet-hour counts. Caught while sizing this fetch, before any measurement.");
  L.push("");
  L.push("Every request now forces `wind_speed_unit=ms` **and** asserts the returned unit anyway, because");
  L.push("forcing and trusting are different things. Six of the seven providers in this spike report wind in a");
  L.push("different unit from each other; `scripts/s0-units.ts` is the single place that knows.");
  L.push("");
  if (o.failures.length) {
    L.push("## ❌ Failures");
    L.push("");
    for (const f of o.failures) L.push(`- ${f}`);
    L.push("");
  }
  L.push("## Manifest");
  L.push("");
  L.push("| Fixture | Hours | Size | sha256 (12) |");
  L.push("|---|---|---|---|");
  for (const w of o.written) {
    L.push(`| \`${w.path}\` | ${w.hours.toLocaleString()} | ${(w.bytes / 1024).toFixed(0)} kB | \`${w.sha}\` |`);
  }
  L.push("");
  return L.join("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
