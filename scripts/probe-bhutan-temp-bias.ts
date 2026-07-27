/**
 * INVESTIGATION (read-only) — Bhutan nasa_power daily-temperature bias.
 *
 * Independently reproduces the S5a Unit 0 finding and isolates the CAUSE.
 *
 * The decisive diagnostic: Open-Meteo's ERA5 archive statistically downscales temperature to the
 * requested point's 90 m DEM elevation, and accepts an explicit `&elevation=` override. So we can ask
 * ERA5 for the SAME grid cell at TWO elevations — the vineyard's true DEM elevation, and NASA POWER's
 * reported grid-cell elevation. If POWER agrees with the latter and not the former, the entire bias is
 * a grid-cell-elevation artifact, not a model disagreement.
 *
 * READ-ONLY. No writes to any tenant. Run from the MAIN checkout (needs .env):
 *   npx tsx --env-file=.env scripts/probe-bhutan-temp-bias.ts
 */
import { runAsTenant } from "../src/lib/tenant/context";
import { prisma } from "../src/lib/prisma";

const BHUTAN = "org_bhutan_wine_co";
const DEMO = "org_demo_winery";
const START = "2020-04-01";
const END = "2025-09-30";

type Daily = { date: string; tmaxC: number | null; tminC: number | null };

/** NASA POWER daily-point response — `geometry.coordinates` is [lon, lat, gridCellElevationM]. */
interface PowerJson {
  properties?: { parameter?: Record<string, Record<string, number>> };
  geometry?: { coordinates?: number[] };
}

/** Open-Meteo archive response — `elevation` is the downscale target actually used. */
interface ArchiveJson {
  elevation?: number;
  daily?: { time?: string[]; temperature_2m_max?: Array<number | null>; temperature_2m_min?: Array<number | null> };
}

const num = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null;
const f = (x: number | null, p = 2) => (x !== null && Number.isFinite(x) ? x.toFixed(p) : "n/a");

async function getJson<T>(url: string): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { "user-agent": "wine-inventory-investigation/1.0" } });
    if (res.ok) return (await res.json()) as T;
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    throw new Error(`${res.status} ${res.statusText} — ${url}`);
  }
  throw new Error(`retries exhausted — ${url}`);
}

// ---------------------------------------------------------------- providers (fetched fresh, not via src/)

async function fetchPower(lat: number, lon: number) {
  const compact = (iso: string) => iso.replace(/-/g, "");
  const url =
    `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN&community=AG` +
    `&latitude=${lat}&longitude=${lon}&start=${compact(START)}&end=${compact(END)}&format=JSON`;
  const json = await getJson<PowerJson>(url);
  const p = json?.properties?.parameter ?? {};
  const tmax = p.T2M_MAX ?? {};
  const tmin = p.T2M_MIN ?? {};
  const clean = (v: number | undefined) => (typeof v === "number" && v > -999 ? v : null);
  const rows: Daily[] = Object.keys(tmax)
    .filter((k) => /^\d{8}$/.test(k))
    .sort()
    .map((k) => ({
      date: `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`,
      tmaxC: clean(tmax[k]),
      tminC: clean(tmin[k]),
    }));
  const coords = json?.geometry?.coordinates as number[] | undefined;
  return { rows, cellElevationM: coords?.[2] ?? null, snappedLon: coords?.[0] ?? null, snappedLat: coords?.[1] ?? null };
}

async function fetchArchive(lat: number, lon: number, tz: string, opts: { elevation?: number; model?: string } = {}) {
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=${START}&end_date=${END}&daily=temperature_2m_max,temperature_2m_min&timezone=${encodeURIComponent(tz)}` +
    (opts.elevation !== undefined ? `&elevation=${opts.elevation}` : "") +
    (opts.model ? `&models=${opts.model}` : "");
  const json = await getJson<ArchiveJson>(url);
  const d = json?.daily ?? {};
  const rows: Daily[] = (d.time ?? []).map((t: string, i: number) => ({
    date: t,
    tmaxC: num(d.temperature_2m_max?.[i]),
    tminC: num(d.temperature_2m_min?.[i]),
  }));
  return { rows, elevation: num(json?.elevation) };
}

// ---------------------------------------------------------------- stats

type Pairing = { date: string; a: number; b: number };

function pair(a: Daily[], b: Daily[], field: "tmaxC" | "tminC" | "tmeanC"): Pairing[] {
  const mean = (r: Daily) => (r.tmaxC !== null && r.tminC !== null ? (r.tmaxC + r.tminC) / 2 : null);
  const val = (r: Daily) => (field === "tmeanC" ? mean(r) : r[field]);
  const bm = new Map(b.map((r) => [r.date, r]));
  const out: Pairing[] = [];
  for (const r of a) {
    const o = bm.get(r.date);
    if (!o) continue;
    const x = val(r);
    const y = val(o);
    if (x === null || y === null) continue;
    out.push({ date: r.date, a: x, b: y });
  }
  return out;
}

function meanAbsMonthlyBias(p: Pairing[]) {
  const buckets = new Map<string, number[]>();
  for (const r of p) {
    const k = r.date.slice(0, 7);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(r.a - r.b);
  }
  const monthly = [...buckets.values()].map((v) => v.reduce((s, x) => s + x, 0) / v.length);
  return monthly.reduce((s, m) => s + Math.abs(m), 0) / (monthly.length || 1);
}

function byMonthOfYear(p: Pairing[]) {
  const b = new Map<number, number[]>();
  for (const r of p) {
    const m = Number(r.date.slice(5, 7));
    if (!b.has(m)) b.set(m, []);
    b.get(m)!.push(r.a - r.b);
  }
  return [...b.entries()].sort((x, y) => x[0] - y[0]).map(([m, v]) => ({ moy: m, bias: v.reduce((s, x) => s + x, 0) / v.length }));
}

function summary(p: Pairing[]) {
  const d = p.map((r) => r.a - r.b);
  const n = d.length;
  const mean = d.reduce((s, x) => s + x, 0) / (n || 1);
  const mae = d.reduce((s, x) => s + Math.abs(x), 0) / (n || 1);
  const sd = Math.sqrt(d.reduce((s, x) => s + (x - mean) ** 2, 0) / (n || 1));
  const ax = p.map((r) => r.a);
  const bx = p.map((r) => r.b);
  const am = ax.reduce((s, x) => s + x, 0) / (n || 1);
  const bm = bx.reduce((s, x) => s + x, 0) / (n || 1);
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (ax[i] - am) * (bx[i] - bm);
    va += (ax[i] - am) ** 2;
    vb += (bx[i] - bm) ** 2;
  }
  return { n, mean, mae, sd, r: va && vb ? cov / Math.sqrt(va * vb) : NaN, mab: meanAbsMonthlyBias(p) };
}

/** Growing-season GDD base 10 °C, capped at 30 °C (the repo's Winkler convention is checked separately). */
function gddSeason(rows: Daily[], year: number, months: [number, number]) {
  let sum = 0;
  let n = 0;
  for (const r of rows) {
    const y = Number(r.date.slice(0, 4));
    const m = Number(r.date.slice(5, 7));
    if (y !== year || m < months[0] || m > months[1]) continue;
    if (r.tmaxC === null || r.tminC === null) continue;
    sum += Math.max(0, (r.tmaxC + r.tminC) / 2 - 10);
    n++;
  }
  return { gddC: sum, days: n };
}

/** Winkler region from growing-season degree-days °C (Amerine & Winkler boundaries in °C-days). */
function winkler(gddC: number): string {
  if (gddC <= 1389) return "I";
  if (gddC <= 1667) return "II";
  if (gddC <= 1944) return "III";
  if (gddC <= 2222) return "IV";
  return "V";
}

// ---------------------------------------------------------------- DB (read-only)

async function vineyards(tenantId: string) {
  return runAsTenant(tenantId, async () => {
    const vs = await prisma.vineyard.findMany({
      where: { isActive: true },
      select: { id: true, name: true, detail: { select: { gpsLat: true, gpsLng: true, elevationM: true } } },
      orderBy: { name: "asc" },
    });
    const cfgs = await prisma.vineyardWeatherConfig.findMany();
    const byId = new Map(cfgs.map((c) => [c.vineyardId, c]));
    return vs.map((v) => ({ ...v, cfg: byId.get(v.id) }));
  });
}

async function storedSeries(tenantId: string, vineyardId: string, providerKey: string): Promise<Daily[]> {
  return runAsTenant(tenantId, async () =>
    (
      await prisma.vineyardClimateDaily.findMany({
        where: {
          vineyardId,
          providerKey,
          localDate: { gte: new Date(`${START}T00:00:00Z`), lte: new Date(`${END}T00:00:00Z`) },
        },
        select: { localDate: true, tmaxC: true, tminC: true },
        orderBy: { localDate: "asc" },
      })
    ).map((r) => ({ date: r.localDate.toISOString().slice(0, 10), tmaxC: num(r.tmaxC), tminC: num(r.tminC) })),
  );
}

// ---------------------------------------------------------------- main

async function main() {
  const bhutan = await vineyards(BHUTAN);
  const demo = await vineyards(DEMO);

  console.log("=".repeat(110));
  console.log("PART A — BHUTAN: reproduce the bias, then isolate the cause");
  console.log("=".repeat(110));

  const rollup: Array<Record<string, string>> = [];

  for (const v of bhutan) {
    const lat = num(v.detail?.gpsLat);
    const lon = num(v.detail?.gpsLng);
    if (lat === null || lon === null) continue;
    const tz = v.cfg?.timeZone ?? "Asia/Thimphu";

    const stored = await storedSeries(BHUTAN, v.id, "nasa_power");
    if (stored.length === 0) continue;

    const power = await fetchPower(lat, lon);
    const atSite = await fetchArchive(lat, lon, tz); // ERA5 downscaled to the 90 m DEM elevation
    const cellElev = power.cellElevationM;
    const atCell = cellElev !== null ? await fetchArchive(lat, lon, tz, { elevation: Math.round(cellElev) }) : null;

    console.log(`\n${"-".repeat(110)}`);
    console.log(`${v.name} @ ${lat}, ${lon}   (tz ${tz})`);
    console.log(`${"-".repeat(110)}`);
    console.log(`  VineyardDetail.elevationM      : ${v.detail?.elevationM ?? "—"} m`);
    console.log(`  cfg.siteElevationM             : ${v.cfg?.siteElevationM ?? "—"}`);
    console.log(`  ERA5 downscale target (DEM 90m): ${atSite.elevation} m`);
    console.log(`  NASA POWER grid-cell elevation : ${cellElev} m   (cell centre ${power.snappedLat}, ${power.snappedLon})`);
    console.log(`  → POWER cell sits ${f((cellElev ?? 0) - (atSite.elevation ?? 0), 0)} m above the vineyard`);

    // integrity: is the stored series faithfully POWER's own numbers?
    const integrity = summary(pair(stored, power.rows, "tmeanC"));
    console.log(`  stored vs live POWER (tmean)   : n=${integrity.n} mean=${f(integrity.mean)} MAE=${f(integrity.mae)} r=${f(integrity.r, 4)}`);

    // the finding
    const vsSite = summary(pair(stored, atSite.rows, "tmeanC"));
    const vsSiteMax = summary(pair(stored, atSite.rows, "tmaxC"));
    const vsSiteMin = summary(pair(stored, atSite.rows, "tminC"));
    console.log(
      `\n  [A] stored POWER − ERA5 @ VINEYARD elevation (${atSite.elevation} m):\n` +
        `      tmean n=${vsSite.n} bias=${f(vsSite.mean)} MAE=${f(vsSite.mae)} sd=${f(vsSite.sd)} r=${f(vsSite.r, 4)} mean|monthly|=${f(vsSite.mab)}\n` +
        `      tmax  bias=${f(vsSiteMax.mean)}   tmin bias=${f(vsSiteMin.mean)}`,
    );
    const moy = byMonthOfYear(pair(stored, atSite.rows, "tmeanC"));
    const spread = Math.max(...moy.map((m) => m.bias)) - Math.min(...moy.map((m) => m.bias));
    console.log(`      by month-of-year: ${moy.map((m) => `${m.moy}:${f(m.bias, 1)}`).join(" ")}`);
    console.log(`      seasonal spread = ${f(spread)} °C → ${spread < 2 ? "CONSTANT level shift" : "SEASONAL"}`);

    let vsCell: ReturnType<typeof summary> | null = null;
    if (atCell) {
      vsCell = summary(pair(stored, atCell.rows, "tmeanC"));
      console.log(
        `\n  [B] stored POWER − ERA5 @ POWER'S OWN CELL elevation (${atCell.elevation} m):\n` +
          `      tmean n=${vsCell.n} bias=${f(vsCell.mean)} MAE=${f(vsCell.mae)} sd=${f(vsCell.sd)} r=${f(vsCell.r, 4)} mean|monthly|=${f(vsCell.mab)}`,
      );
      console.log(
        `      → residual after removing the elevation difference: ${f(Math.abs(vsCell.mean))} °C ` +
          `(was ${f(Math.abs(vsSite.mean))} °C). ` +
          `${Math.abs(vsCell.mean) < Math.abs(vsSite.mean) * 0.4 ? "ELEVATION EXPLAINS IT." : "elevation does NOT fully explain it."}`,
      );
    }

    // implied lapse rate actually observed between the two products
    const dz = (cellElev ?? 0) - (atSite.elevation ?? 0);
    if (dz !== 0) console.log(`      implied lapse rate from the bias: ${f((-vsSite.mean / dz) * 1000, 2)} °C/km`);

    // Winkler impact — the classification with hard boundaries
    console.log("\n  [C] Winkler / GDD impact (Apr–Oct, base 10 °C):");
    for (const year of [2021, 2022, 2023, 2024]) {
      const a = gddSeason(stored, year, [4, 10]);
      const b = gddSeason(atSite.rows, year, [4, 10]);
      if (a.days < 180 || b.days < 180) continue;
      console.log(
        `      ${year}: POWER ${f(a.gddC, 0).padStart(5)} °C-days → Region ${winkler(a.gddC).padEnd(3)} | ` +
          `ERA5@site ${f(b.gddC, 0).padStart(5)} → Region ${winkler(b.gddC).padEnd(3)} | ` +
          `Δ=${f(b.gddC - a.gddC, 0)} ${winkler(a.gddC) !== winkler(b.gddC) ? "  *** REGION CHANGES ***" : ""}`,
      );
    }

    // Frost / heat threshold ladder impact
    const thr = {
      frostWatch: num(v.cfg?.frostWatchC) ?? 2,
      frostWarn: num(v.cfg?.frostWarnC) ?? 0,
      hardFreeze: num(v.cfg?.hardFreezeC) ?? -2,
      heatWatch: num(v.cfg?.heatWatchC) ?? 35,
      extremeHeat: num(v.cfg?.extremeHeatC) ?? 38,
    };
    const countBelow = (rows: Daily[], t: number) => rows.filter((r) => r.tminC !== null && r.tminC <= t).length;
    const countAbove = (rows: Daily[], t: number) => rows.filter((r) => r.tmaxC !== null && r.tmaxC >= t).length;
    console.log("\n  [D] alert-threshold day counts over the whole window (POWER → ERA5@site):");
    console.log(
      `      frostWatch ≤${thr.frostWatch}: ${countBelow(stored, thr.frostWatch)} → ${countBelow(atSite.rows, thr.frostWatch)}   ` +
        `frostWarn ≤${thr.frostWarn}: ${countBelow(stored, thr.frostWarn)} → ${countBelow(atSite.rows, thr.frostWarn)}   ` +
        `hardFreeze ≤${thr.hardFreeze}: ${countBelow(stored, thr.hardFreeze)} → ${countBelow(atSite.rows, thr.hardFreeze)}`,
    );
    console.log(
      `      heatWatch ≥${thr.heatWatch}: ${countAbove(stored, thr.heatWatch)} → ${countAbove(atSite.rows, thr.heatWatch)}   ` +
        `extremeHeat ≥${thr.extremeHeat}: ${countAbove(stored, thr.extremeHeat)} → ${countAbove(atSite.rows, thr.extremeHeat)}`,
    );

    rollup.push({
      site: v.name,
      siteElev: String(atSite.elevation),
      cellElev: String(cellElev),
      dz: f(dz, 0),
      biasVsSite: f(vsSite.mean),
      biasVsCell: vsCell ? f(vsCell.mean) : "—",
      mabVsSite: f(vsSite.mab),
    });
  }

  console.log(`\n${"=".repeat(110)}`);
  console.log("PART B — US CONTROL (Demo Winery), identical measurement");
  console.log("=".repeat(110));

  for (const v of demo) {
    const lat = num(v.detail?.gpsLat);
    const lon = num(v.detail?.gpsLng);
    if (lat === null || lon === null) continue;
    const stored = await storedSeries(DEMO, v.id, "nasa_power");
    if (stored.length === 0) continue;
    const tz = v.cfg?.timeZone ?? "America/Los_Angeles";
    const power = await fetchPower(lat, lon);
    const atSite = await fetchArchive(lat, lon, tz);
    const s = summary(pair(stored, atSite.rows, "tmeanC"));
    console.log(
      `\n  ${v.name.padEnd(20)} siteElev=${String(atSite.elevation).padStart(5)} m  ` +
        `POWERcell=${f(power.cellElevationM, 0).padStart(6)} m  Δ=${f((power.cellElevationM ?? 0) - (atSite.elevation ?? 0), 0).padStart(6)} m\n` +
        `      n=${s.n} bias=${f(s.mean)} MAE=${f(s.mae)} r=${f(s.r, 4)} mean|monthly|=${f(s.mab)}`,
    );
    rollup.push({
      site: `[US] ${v.name}`,
      siteElev: String(atSite.elevation),
      cellElev: f(power.cellElevationM, 0),
      dz: f((power.cellElevationM ?? 0) - (atSite.elevation ?? 0), 0),
      biasVsSite: f(s.mean),
      biasVsCell: "—",
      mabVsSite: f(s.mab),
    });
  }

  console.log(`\n${"=".repeat(110)}`);
  console.log("ROLLUP — bias tracks the grid-cell-elevation mismatch");
  console.log("=".repeat(110));
  console.log(
    "site".padEnd(24) +
      "siteElev".padStart(9) +
      "cellElev".padStart(10) +
      "Δz(m)".padStart(9) +
      "bias@site".padStart(11) +
      "bias@cell".padStart(11) +
      "mean|mo|".padStart(10),
  );
  for (const r of rollup) {
    console.log(
      r.site.padEnd(24) +
        r.siteElev.padStart(9) +
        r.cellElev.padStart(10) +
        r.dz.padStart(9) +
        r.biasVsSite.padStart(11) +
        r.biasVsCell.padStart(11) +
        r.mabVsSite.padStart(10),
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
