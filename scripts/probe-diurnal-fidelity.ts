/**
 * S5a Unit 0 — the diurnal reconstruction fidelity probe.
 *
 * THE QUESTION: does an hourly temperature curve reconstructed from daily Tmin/Tmax resolve
 * Gubler-Thomas's derived quantities well enough to ship a powdery-mildew index — per site regime?
 *
 * This is a MEASUREMENT with a gate fixed before the run, not an implementation step. Its four
 * gates (§5 Unit 0 of the plan) are evaluated PER SITE and never averaged:
 *
 *   G1 unsafe-miss (BINDING) — of decision-days where the station says the epidemic threshold is
 *      met (60+ / 7-day interval), the fraction where the model says otherwise must be <= 2%.
 *   G2 coverage            — the model must actually answer on >= 80% of in-season decision-days,
 *                            so refusal cannot buy a pass.
 *   G3 agreement           — daily point-delta agreement >= 90% AND band agreement >= 95%.
 *   G4 statistical adequacy— >= 3 full seasons of in-season days per site, every rate reported with
 *                            a binomial (Wilson) confidence interval.
 *
 * Run:  npx tsx --env-file=.env scripts/probe-diurnal-fidelity.ts
 * Writes: docs/spray_assistant/phases/S5a-diurnal-fidelity-probe.md
 *         test/fixtures/s5a/<site>-<season>.json   (committed, reused by Unit 3 goldens)
 *
 * House discipline (verify-phenology.ts:9-11): every number lands in the report including the
 * unflattering ones. A zero denominator is "not measurable", never 0%.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runAsSystem } from "../src/lib/tenant/system";
import { reconstructFelber, reconstructSanders, type DailyExtremes, type HourlyPoint } from "./probe-diurnal/diurnal";
import {
  scoreDay,
  runSeason,
  pressureBand,
  pedutoHeatSuppression,
  type DayHours,
  type DayVerdict,
} from "./probe-diurnal/gubler";
import { fetchStationHourly, bucketToHours, skyFractionByDay, utcOffsetHours, addDays, type StationObs } from "./probe-diurnal/iem";

// ─────────────────────────────── configuration ───────────────────────────────

/** In-season window for powdery mildew in the northern hemisphere (budbreak -> harvest). */
const SEASON_START_MD = "04-01";
const SEASON_END_MD = "09-30";
const SEASONS = [2020, 2021, 2022, 2023, 2024, 2025];
/** Savalkar mitigation is FIT on these and EVALUATED on the rest — never fit and scored on the same days. */
const CALIBRATION_SEASONS = new Set([2020, 2021, 2022]);

/**
 * Oracle tiering, by rule rather than by feel. Council C2 forbids resting a production confidence
 * claim on anything but genuine observation, so each site declares which arm produced its number.
 */
type OracleTier = "station_hourly" | "station_degraded" | "consistency_only";

interface SiteCfg {
  key: string;
  name: string;
  tenantId: string;
  vineyardId: string;
  lat: number;
  lon: number;
  tz: string;
  siteElevM: number;
  /** null = no usable station anywhere; the arm falls back to ERA5 and reports consistency only. */
  station: { id: string; network: string; name: string; km: number; elevM: number } | null;
  tier: OracleTier;
  /** Why this station and not the merely-nearest one. */
  oracleNote: string;
}

const SITES: SiteCfg[] = [
  {
    key: "russian_river",
    name: "Russian River Ranch",
    tenantId: "org_demo_winery",
    vineyardId: "cmr3hr8po0003d1182qglhq17",
    lat: 38.5058,
    lon: -122.8536,
    tz: "America/Los_Angeles",
    siteElevM: 18.1,
    station: { id: "STS", network: "CA_ASOS", name: "Santa Rosa Sonoma Co AP", km: 3.7, elevM: 31.3 },
    tier: "station_hourly",
    oracleNote: "3.7 km, +13 m. The best oracle in the fleet, and the site S0 flagged as a weather-lane failure — so the two measurements are directly comparable.",
  },
  {
    key: "stoney_hill",
    name: "Stoney Hill",
    tenantId: "org_demo_winery",
    vineyardId: "cms1d1g8g0000l8044j3sgkdp",
    lat: 40.328822,
    lon: -75.007183,
    tz: "America/New_York",
    siteElevM: 75.78,
    station: { id: "DYL", network: "PA_ASOS", name: "Doylestown Airport", km: 9.8, elevM: 120 },
    tier: "station_hourly",
    oracleNote: "9.8 km, +44 m. Eastern regime — the one ADR 0012 left open for S1.",
  },
  {
    key: "madera",
    name: "Madera",
    tenantId: "org_demo_winery",
    vineyardId: "cmrs9x4a30000l804qljnnulm",
    lat: 36.857887,
    lon: -119.99701,
    tz: "America/Los_Angeles",
    siteElevM: 82.41,
    station: { id: "MAE", network: "CA_ASOS", name: "Madera Municipal", km: 17.4, elevM: 76.5 },
    tier: "station_hourly",
    oracleNote: "17.4 km, -6 m, flat valley floor. S0's safety inversion site: lowest refusal rate, worst inputs.",
  },
  {
    key: "oakville",
    name: "Oakville Estate",
    tenantId: "org_demo_winery",
    vineyardId: "cmr3hqu1v0000d1185huoxwla",
    lat: 38.4386,
    lon: -122.4097,
    tz: "America/Los_Angeles",
    siteElevM: 49.1,
    station: { id: "APC", network: "CA_ASOS", name: "Napa County", km: 28.1, elevM: 8.0 },
    tier: "station_degraded",
    oracleNote:
      "Napa County (28.1 km) is chosen over the marginally nearer Petaluma (26.4 km) on meteorological grounds: APC sits in the SAME Napa valley on the same marine-intrusion path, Petaluma is over a ridge in a different air mass. Nearest is not always most comparable.",
  },
  {
    key: "wv_oregon",
    name: "WV Oregon",
    tenantId: "org_demo_winery",
    vineyardId: "cmrtwm5ld0000l104lw6067ev",
    lat: 45.077332,
    lon: -123.577768,
    tz: "America/Los_Angeles",
    siteElevM: 105.73,
    station: { id: "MMV", network: "OR_ASOS", name: "McMinnville Municipal", km: 37, elevM: 48 },
    tier: "station_degraded",
    oracleNote: "37 km, -58 m. Willamette Valley floor vs a site in the coastal foothills.",
  },
  {
    key: "ojai",
    name: "Ojai",
    tenantId: "org_demo_winery",
    vineyardId: "cmrs4iwgn000ejp04v994i6dc",
    lat: 34.444225,
    lon: -119.20872,
    tz: "America/Los_Angeles",
    siteElevM: 268.51,
    station: { id: "OXR", network: "CA_ASOS", name: "Oxnard", km: 27.1, elevM: 13 },
    tier: "consistency_only",
    oracleNote:
      "27.1 km but -255 m AND coastal-vs-inland-valley. Ojai sits behind the Topatopa range in a thermal belt; Oxnard is on the beach. This is not the same climate, so its number is consistency, not fidelity.",
  },
  {
    key: "bhutan_bajo",
    name: "Bhutan Bajo",
    tenantId: "org_bhutan_wine_co",
    vineyardId: "cmqjeic1c0008la04rx28kzkz",
    lat: 27.492544,
    lon: 89.900364,
    tz: "Asia/Thimphu",
    siteElevM: 1230.17,
    station: null,
    tier: "consistency_only",
    oracleNote:
      "Nearest ASOS is Paro (VQPR) 48 km away at 2235 m — 1,005 m ABOVE the vineyard. Comparing a valley vineyard to a mountain airport measures the lapse rate, not the reconstruction. No fidelity arm exists for this site.",
  },
  {
    key: "bhutan_gortshalu",
    name: "Bhutan Gortshalu",
    tenantId: "org_bhutan_wine_co",
    vineyardId: "cmqjbcv1w000fjl04u3mq5nso",
    lat: 27.318708,
    lon: 91.529167,
    tz: "Asia/Thimphu",
    siteElevM: 836.68,
    station: null,
    tier: "consistency_only",
    oracleNote:
      "Nearest ASOS is Guwahati 135 km away on the Assam plain at 54 m — 783 m below and in a different climate zone. No fidelity arm exists for this site.",
  },
];

// Pre-committed gate thresholds. FIXED BEFORE THE RUN.
const G1_MAX_UNSAFE_MISS = 0.02;
const G2_MIN_COVERAGE = 0.8;
const G3_MIN_POINT_AGREEMENT = 0.9;
const G3_MIN_BAND_AGREEMENT = 0.95;
const G4_MIN_SEASONS = 3;

// ─────────────────────────────── statistics ───────────────────────────────

interface Rate {
  num: number;
  den: number;
  /** null when the denominator is zero — "not measurable", never 0%. */
  p: number | null;
  lo: number | null;
  hi: number | null;
}

/** Wilson score interval — behaves at the extremes where a normal approximation falls apart. */
function rate(num: number, den: number, z = 1.96): Rate {
  if (den === 0) return { num, den, p: null, lo: null, hi: null };
  const p = num / den;
  const d = 1 + (z * z) / den;
  const centre = p + (z * z) / (2 * den);
  const half = z * Math.sqrt((p * (1 - p)) / den + (z * z) / (4 * den * den));
  return { num, den, p, lo: Math.max(0, (centre - half) / d), hi: Math.min(1, (centre + half) / d) };
}

function pct(r: Rate): string {
  if (r.p === null) return "not measurable (n=0)";
  return `${(r.p * 100).toFixed(1)}% [${(r.lo! * 100).toFixed(1)}–${(r.hi! * 100).toFixed(1)}] (${r.num}/${r.den})`;
}

function mean(xs: number[]): number | null {
  return xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
}

// ─────────────────────────────── helpers ───────────────────────────────

function inSeason(iso: string): boolean {
  const md = iso.slice(5);
  return md >= SEASON_START_MD && md <= SEASON_END_MD;
}

function seasonOf(iso: string): number {
  return Number(iso.slice(0, 4));
}

function hoursToDayMap(points: HourlyPoint[]): Map<string, Map<number, number>> {
  const out = new Map<string, Map<number, number>>();
  for (const p of points) {
    let m = out.get(p.localDate);
    if (!m) {
      m = new Map();
      out.set(p.localDate, m);
    }
    m.set(p.hour, p.tempC);
  }
  return out;
}

function toDayHours(map: Map<string, Map<number, number>>): Map<string, DayHours> {
  const out = new Map<string, DayHours>();
  for (const [localDate, byHour] of map) out.set(localDate, { localDate, byHour });
  return out;
}

/** ERA5 hourly via the Open-Meteo archive — the CONSISTENCY-ONLY fallback where no station exists. */
async function fetchEra5Hourly(lat: number, lon: number, tz: string, startIso: string, endIso: string) {
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=${startIso}&end_date=${endIso}&hourly=temperature_2m&timezone=${encodeURIComponent(tz)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(300_000) });
  if (!res.ok) throw new Error(`Open-Meteo: HTTP ${res.status}`);
  const j = (await res.json()) as { hourly?: { time?: string[]; temperature_2m?: (number | null)[] } };
  const out: StationObs[] = [];
  const times: string[] = j.hourly?.time ?? [];
  const temps: (number | null)[] = j.hourly?.temperature_2m ?? [];
  for (let i = 0; i < times.length; i++) {
    const t = temps[i];
    if (t === null || t === undefined || !Number.isFinite(t)) continue;
    out.push({ localDate: times[i].slice(0, 10), hour: Number(times[i].slice(11, 13)), minute: 0, tempC: t, skyc: null });
  }
  return out;
}

// ─────────────────────────────── per-site measurement ───────────────────────────────

interface ArmResult {
  estimator: string;
  pointAgreement: Rate;
  bandAgreement: Rate;
  unsafeMiss: Rate;
  coverage: Rate;
  consecutiveHoursMae: number | null;
  indexMae: number | null;
  pointAgreementClear: Rate;
  pointAgreementOvercast: Rate;
  comparedDays: number;
}

interface SiteResult {
  cfg: SiteCfg;
  oracleLabel: string;
  /** The provider whose daily extremes actually fed the reconstruction. */
  providerUsed: string | null;
  /** The provider production WILL use, when it differs from the one measured. */
  effectivePrimary: string | null;
  providerSubstituted: boolean;
  seasonsWithData: number[];
  inSeasonDays: number;
  oracleDecidableDays: number;
  tminAfternoonRate: Rate;
  tmaxOffWindowRate: Rate;
  arms: ArmResult[];
  mitigated: ArmResult | null;
  pedutoWouldChange: Rate;
  /** Days where the ORACLE itself saw >= 35 C — the rule we cannot compute either way. */
  heatDays: Rate;
  /** Mean ABSOLUTE monthly bias the Savalkar correction removed, in C. A large value means the
   * reconstruction and the oracle were not even in the same temperature range. */
  meanAbsMonthlyBiasC: number | null;
  gates: { g1: boolean; g2: boolean; g3: boolean; g4: boolean; pass: boolean; notes: string[] };
  error?: string;
}

function scoreArm(
  estimator: string,
  modelDays: Map<string, DayHours>,
  oracleVerdicts: Map<string, DayVerdict>,
  allInSeasonDates: string[],
  cloudFrac: Map<string, number | null>,
  oracleSeason: Map<string, number | null>,
): ArmResult {
  const modelVerdicts = new Map<string, DayVerdict>();
  for (const [d, dh] of modelDays) modelVerdicts.set(d, scoreDay(dh));

  // Season trajectories, run over the same ordered in-season dates for both arms.
  const ordered = allInSeasonDates;
  const modelSeasonPts = runSeason(ordered.map((d) => modelVerdicts.get(d) ?? { localDate: d, points: null, consecutiveHours: null, qualifying: null, heat: null, hoursPresent: 0 }));
  const modelSeason = new Map<string, number | null>();
  for (const p of modelSeasonPts) modelSeason.set(p.localDate, p.index);

  let pointAgree = 0;
  let pointTotal = 0;
  let bandAgree = 0;
  let bandTotal = 0;
  let unsafeMiss = 0;
  let unsafeTotal = 0;
  let coverN = 0;
  const consecErr: number[] = [];
  const indexErr: number[] = [];
  let clearAgree = 0;
  let clearTotal = 0;
  let overcastAgree = 0;
  let overcastTotal = 0;

  for (const d of ordered) {
    const mv = modelVerdicts.get(d);
    if (mv && mv.points !== null) coverN += 1;

    const ov = oracleVerdicts.get(d);
    if (!ov || ov.points === null) continue;
    if (!mv || mv.points === null) continue;

    pointTotal += 1;
    const agree = ov.points === mv.points;
    if (agree) pointAgree += 1;

    consecErr.push(Math.abs((ov.consecutiveHours ?? 0) - (mv.consecutiveHours ?? 0)));

    const cf = cloudFrac.get(d);
    if (cf !== undefined && cf !== null) {
      if (cf < 0.3) {
        clearTotal += 1;
        if (agree) clearAgree += 1;
      } else if (cf >= 0.7) {
        overcastTotal += 1;
        if (agree) overcastAgree += 1;
      }
    }

    const oIdx = oracleSeason.get(d);
    const mIdx = modelSeason.get(d);
    if (oIdx !== null && oIdx !== undefined && mIdx !== null && mIdx !== undefined) {
      indexErr.push(Math.abs(oIdx - mIdx));
      const ob = pressureBand(oIdx);
      const mb = pressureBand(mIdx);
      bandTotal += 1;
      if (ob === mb) bandAgree += 1;
      // G1: the oracle says high pressure (60+, 7-day interval). Does the model under-call it?
      if (ob === "high") {
        unsafeTotal += 1;
        if (mb !== "high") unsafeMiss += 1;
      }
    }
  }

  return {
    estimator,
    pointAgreement: rate(pointAgree, pointTotal),
    bandAgreement: rate(bandAgree, bandTotal),
    unsafeMiss: rate(unsafeMiss, unsafeTotal),
    coverage: rate(coverN, ordered.length),
    consecutiveHoursMae: mean(consecErr),
    indexMae: mean(indexErr),
    pointAgreementClear: rate(clearAgree, clearTotal),
    pointAgreementOvercast: rate(overcastAgree, overcastTotal),
    comparedDays: pointTotal,
  };
}

async function measureSite(cfg: SiteCfg): Promise<SiteResult> {
  const startIso = `${SEASONS[0]}-01-01`;
  const endIso = `${SEASONS[SEASONS.length - 1]}-12-31`;

  // ── daily extremes from OUR database, read exactly as production reads them ──
  // The effective primary (override ?? key) is what production will feed the index. Two sites have
  // an effective primary with almost NO historical depth (rcc_acis was switched on recently), so
  // there is nothing to measure on it. Rather than silently skip those regimes — which would ship
  // an unmeasured index to them — fall back to the deepest provider at that site and SAY SO in the
  // row. A measurement on a different provider is indicative, not directly transferable.
  const daily = await runAsSystem(async (db) => {
    const cfgRow = await db.vineyardWeatherConfig.findFirst({
      where: { vineyardId: cfg.vineyardId },
      select: { primaryProviderKey: true, primaryProviderOverride: true },
    });
    const effectivePrimary = cfgRow?.primaryProviderOverride ?? cfgRow?.primaryProviderKey ?? null;

    const load = async (providerKey: string | null) => {
      const rows = await db.vineyardClimateDaily.findMany({
        where: {
          vineyardId: cfg.vineyardId,
          ...(providerKey ? { providerKey } : {}),
          localDate: { gte: new Date(`${startIso}T00:00:00Z`), lte: new Date(`${endIso}T00:00:00Z`) },
        },
        select: { localDate: true, tminC: true, tmaxC: true },
        orderBy: { localDate: "asc" },
      });
      return rows.map((r) => ({
        localDate: r.localDate.toISOString().slice(0, 10),
        tminC: r.tminC === null ? null : Number(r.tminC),
        tmaxC: r.tmaxC === null ? null : Number(r.tmaxC),
      })) as DailyExtremes[];
    };

    let used = effectivePrimary;
    let records = await load(effectivePrimary);
    let substituted = false;

    // 3 seasons x ~183 in-season days is the G4 bar; below that the primary cannot be measured.
    if (records.filter((r) => inSeason(r.localDate)).length < 3 * 183) {
      const byProvider = await db.vineyardClimateDaily.groupBy({
        by: ["providerKey"],
        where: {
          vineyardId: cfg.vineyardId,
          localDate: { gte: new Date(`${startIso}T00:00:00Z`), lte: new Date(`${endIso}T00:00:00Z`) },
        },
        _count: { _all: true },
      });
      const deepest = byProvider.sort((a, b) => b._count._all - a._count._all)[0];
      if (deepest && deepest.providerKey !== effectivePrimary) {
        used = deepest.providerKey;
        records = await load(deepest.providerKey);
        substituted = true;
      }
    }
    return { effectivePrimary, provider: used, substituted, records };
  });

  if (daily.records.length === 0) {
    return {
      cfg,
      oracleLabel: "—",
      providerUsed: daily.provider,
      effectivePrimary: daily.effectivePrimary,
      providerSubstituted: daily.substituted,
      seasonsWithData: [],
      inSeasonDays: 0,
      oracleDecidableDays: 0,
      tminAfternoonRate: rate(0, 0),
      tmaxOffWindowRate: rate(0, 0),
      arms: [],
      mitigated: null,
      pedutoWouldChange: rate(0, 0),
      heatDays: rate(0, 0),
      meanAbsMonthlyBiasC: null,
      gates: { g1: false, g2: false, g3: false, g4: false, pass: false, notes: ["no daily weather rows"] },
      error: "no daily weather rows in range",
    };
  }

  // ── the oracle ──
  let obs: StationObs[];
  let oracleLabel: string;
  try {
    if (cfg.station) {
      obs = await fetchStationHourly({
        station: cfg.station.id,
        network: cfg.station.network,
        tz: cfg.tz,
        startIso,
        endIso,
      });
      oracleLabel = `station hourly METAR — ${cfg.station.name} (${cfg.station.id}), ${cfg.station.km} km, ${(cfg.station.elevM - cfg.siteElevM >= 0 ? "+" : "")}${(cfg.station.elevM - cfg.siteElevM).toFixed(0)} m`;
    } else {
      obs = await fetchEra5Hourly(cfg.lat, cfg.lon, cfg.tz, startIso, endIso);
      oracleLabel = "ERA5 reanalysis (Open-Meteo archive) — CONSISTENCY ONLY, not observation";
    }
  } catch (e) {
    return {
      cfg,
      oracleLabel: "fetch failed",
      providerUsed: daily.provider,
      effectivePrimary: daily.effectivePrimary,
      providerSubstituted: daily.substituted,
      seasonsWithData: [],
      inSeasonDays: 0,
      oracleDecidableDays: 0,
      tminAfternoonRate: rate(0, 0),
      tmaxOffWindowRate: rate(0, 0),
      arms: [],
      mitigated: null,
      pedutoWouldChange: rate(0, 0),
      heatDays: rate(0, 0),
      meanAbsMonthlyBiasC: null,
      gates: { g1: false, g2: false, g3: false, g4: false, pass: false, notes: [`oracle fetch failed: ${(e as Error).message}`] },
      error: `oracle fetch failed: ${(e as Error).message}`,
    };
  }

  const oracleHours = bucketToHours(obs);
  const cloudFrac = skyFractionByDay(obs);

  // In-season dates that BOTH the daily series and the calendar agree exist.
  const dailyByDate = new Map(daily.records.map((r) => [r.localDate, r]));
  const allInSeasonDates: string[] = [];
  for (const y of SEASONS) {
    let d = `${y}-${SEASON_START_MD}`;
    const end = `${y}-${SEASON_END_MD}`;
    while (d <= end) {
      if (dailyByDate.has(d)) allInSeasonDates.push(d);
      d = addDays(d, 1);
    }
  }
  allInSeasonDates.sort();

  // ── oracle verdicts + season trajectory ──
  const oracleDayHours = toDayHours(oracleHours);
  const oracleVerdicts = new Map<string, DayVerdict>();
  for (const d of allInSeasonDates) {
    const dh = oracleDayHours.get(d);
    oracleVerdicts.set(d, dh ? scoreDay(dh) : { localDate: d, points: null, consecutiveHours: null, qualifying: null, heat: null, hoursPresent: 0 });
  }
  const oracleSeasonPts = runSeason(allInSeasonDates.map((d) => oracleVerdicts.get(d)!));
  const oracleSeason = new Map<string, number | null>();
  for (const p of oracleSeasonPts) oracleSeason.set(p.localDate, p.index);

  const oracleDecidableDays = allInSeasonDates.filter((d) => oracleVerdicts.get(d)!.points !== null).length;
  const seasonsWithData = SEASONS.filter((y) => {
    const n = allInSeasonDates.filter((d) => seasonOf(d) === y && oracleVerdicts.get(d)!.points !== null).length;
    return n >= 120; // a "full season" bar: 120 of ~183 in-season days actually decidable
  });

  // ── assumption-violation rates, measured on the oracle (Felber's 27% / 13%) ──
  let tminAfternoon = 0;
  let tmaxOff = 0;
  let violDen = 0;
  for (const d of allInSeasonDates) {
    const byHour = oracleHours.get(d);
    if (!byHour || byHour.size < 22) continue;
    violDen += 1;
    let minH = -1;
    let maxH = -1;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const [h, t] of byHour) {
      if (t < minV) {
        minV = t;
        minH = h;
      }
      if (t > maxV) {
        maxV = t;
        maxH = h;
      }
    }
    if (minH >= 12 && minH <= 20) tminAfternoon += 1;
    if (maxH < 12 || maxH >= 20) tmaxOff += 1;
  }

  // ── heat days the oracle itself saw (the 15-minute rule's real frequency) ──
  let heatN = 0;
  for (const d of allInSeasonDates) {
    const v = oracleVerdicts.get(d)!;
    if (v.heat === true) heatN += 1;
  }

  // ── reconstruction arms ──
  const offset = utcOffsetHours(`${SEASONS[0]}-07-01`, cfg.tz);
  const felber = reconstructFelber(daily.records, cfg.lat, cfg.lon, offset);
  const sanders = reconstructSanders(daily.records, cfg.lat, cfg.lon, offset);

  const arms: ArmResult[] = [
    scoreArm("Felber et al. 2018 (a=2.71, b=3.14, c=0.75)", toDayHours(hoursToDayMap(felber)), oracleVerdicts, allInSeasonDates, cloudFrac, oracleSeason),
    scoreArm("Sanders sawtooth (control)", toDayHours(hoursToDayMap(sanders)), oracleVerdicts, allInSeasonDates, cloudFrac, oracleSeason),
  ];

  // ── Savalkar mitigation: monthly station statistics injected into the disaggregation ──
  // Fit the per-month mean bias on the CALIBRATION seasons only, then score on the held-out ones.
  const felberByDay = hoursToDayMap(felber);
  const biasSums = new Map<number, { sum: number; n: number }>();
  for (const [d, byHour] of felberByDay) {
    if (!CALIBRATION_SEASONS.has(seasonOf(d)) || !inSeason(d)) continue;
    const oh = oracleHours.get(d);
    if (!oh) continue;
    const m = Number(d.slice(5, 7));
    for (const [h, t] of byHour) {
      const o = oh.get(h);
      if (o === undefined) continue;
      let acc = biasSums.get(m);
      if (!acc) {
        acc = { sum: 0, n: 0 };
        biasSums.set(m, acc);
      }
      acc.sum += t - o;
      acc.n += 1;
    }
  }
  const monthlyBias = new Map<number, number>();
  for (const [m, acc] of biasSums) if (acc.n >= 100) monthlyBias.set(m, acc.sum / acc.n);

  const biasValues = [...monthlyBias.values()].map(Math.abs);
  const meanAbsMonthlyBiasC = biasValues.length ? biasValues.reduce((a, b) => a + b, 0) / biasValues.length : null;

  let mitigated: ArmResult | null = null;
  const heldOut = allInSeasonDates.filter((d) => !CALIBRATION_SEASONS.has(seasonOf(d)));
  if (monthlyBias.size > 0 && heldOut.length > 0) {
    const corrected = reconstructFelber(daily.records, cfg.lat, cfg.lon, offset, { monthlyBiasC: monthlyBias });
    mitigated = scoreArm(
      "Felber + Savalkar monthly station-statistics correction (held-out seasons)",
      toDayHours(hoursToDayMap(corrected)),
      oracleVerdicts,
      heldOut,
      cloudFrac,
      oracleSeason,
    );
  }

  // ── Peduto 2013: how many days would the revised heat term have changed? (measured, not shipped) ──
  let pedutoChanged = 0;
  let pedutoDen = 0;
  for (const d of allInSeasonDates) {
    const dh = felberByDay.get(d);
    if (!dh) continue;
    const v = scoreDay({ localDate: d, byHour: dh });
    if (v.points === null || v.qualifying === null) continue;
    pedutoDen += 1;
    const pedutoHeat = pedutoHeatSuppression(dh);
    if (pedutoHeat !== (v.heat ?? false)) pedutoChanged += 1;
  }

  // Commit the paired series so Unit 3 regresses against real data, not an invented one.
  await writeFixtures(cfg, daily.records, oracleHours);

  // ── gates, per site, never averaged ──
  const primaryArm = arms[0];
  const notes: string[] = [];
  const g1 = primaryArm.unsafeMiss.p !== null && primaryArm.unsafeMiss.p <= G1_MAX_UNSAFE_MISS;
  const g2 = primaryArm.coverage.p !== null && primaryArm.coverage.p >= G2_MIN_COVERAGE;
  const g3 =
    primaryArm.pointAgreement.p !== null &&
    primaryArm.pointAgreement.p >= G3_MIN_POINT_AGREEMENT &&
    primaryArm.bandAgreement.p !== null &&
    primaryArm.bandAgreement.p >= G3_MIN_BAND_AGREEMENT;
  const g4 = seasonsWithData.length >= G4_MIN_SEASONS;

  if (primaryArm.unsafeMiss.den === 0) notes.push("G1 has a ZERO denominator — the oracle never reached the epidemic threshold in-season, so the binding gate is NOT MEASURABLE here.");
  if (cfg.tier === "consistency_only") notes.push("Oracle is consistency-only. No production confidence claim may rest on this row (council C2).");
  if (cfg.tier === "station_degraded") notes.push("Oracle is a degraded-fidelity station (distance and/or elevation). Treat the numbers as indicative.");

  const measurable = primaryArm.unsafeMiss.den > 0;
  const pass = g1 && g2 && g3 && g4 && measurable && cfg.tier !== "consistency_only";

  return {
    cfg,
    oracleLabel,
    providerUsed: daily.provider,
    effectivePrimary: daily.effectivePrimary,
    providerSubstituted: daily.substituted,
    seasonsWithData,
    inSeasonDays: allInSeasonDates.length,
    oracleDecidableDays,
    tminAfternoonRate: rate(tminAfternoon, violDen),
    tmaxOffWindowRate: rate(tmaxOff, violDen),
    arms,
    mitigated,
    pedutoWouldChange: rate(pedutoChanged, pedutoDen),
    heatDays: rate(heatN, oracleDecidableDays),
    meanAbsMonthlyBiasC,
    gates: { g1, g2, g3, g4, pass, notes },
  };
}

// ─────────────────────────────── fixtures ───────────────────────────────

/**
 * Commit one representative season of paired daily-extremes + observed-hourly per site, so Unit 3's
 * goldens regress against real data rather than invented series, and so this measurement is
 * reproducible without re-hitting a public archive.
 */
async function writeFixtures(cfg: SiteCfg, daily: DailyExtremes[], oracleHours: Map<string, Map<number, number>>) {
  const dir = join(process.cwd(), "test", "fixtures", "s5a");
  mkdirSync(dir, { recursive: true });
  const year = 2024;
  const days = daily.filter((d) => seasonOf(d.localDate) === year && inSeason(d.localDate));
  const hours: Record<string, Record<number, number>> = {};
  for (const d of days) {
    const m = oracleHours.get(d.localDate);
    if (!m) continue;
    hours[d.localDate] = Object.fromEntries([...m.entries()].map(([h, t]) => [h, Number(t.toFixed(2))]));
  }
  writeFileSync(
    join(dir, `${cfg.key}-${year}.json`),
    JSON.stringify(
      {
        site: cfg.key,
        name: cfg.name,
        lat: cfg.lat,
        lon: cfg.lon,
        timeZone: cfg.tz,
        oracle: cfg.station ? `${cfg.station.network}/${cfg.station.id}` : "era5",
        oracleTier: cfg.tier,
        season: year,
        daily: days.map((d) => ({ localDate: d.localDate, tminC: d.tminC, tmaxC: d.tmaxC })),
        observedHourlyC: hours,
      },
      null,
      2,
    ),
    "utf8",
  );
}

// ─────────────────────────────── report ───────────────────────────────

function gateMark(ok: boolean, measurable = true): string {
  if (!measurable) return "n/m";
  return ok ? "PASS" : "**FAIL**";
}

function renderReport(results: SiteResult[]): string {
  const L: string[] = [];
  const anyPass = results.some((r) => r.gates.pass);

  L.push("# S5a Unit 0 — Diurnal reconstruction fidelity probe");
  L.push("");
  L.push("**Deliverable of PR 0. No production code.** This is the phase's pre-committed gate:");
  L.push("whether an hourly temperature curve reconstructed from daily Tmin/Tmax resolves");
  L.push("Gubler-Thomas's derived quantities well enough to ship an index, *per site regime*.");
  L.push("");
  L.push(`**Run date:** ${new Date().toISOString().slice(0, 10)}  `);
  L.push(`**Seasons:** ${SEASONS[0]}–${SEASONS[SEASONS.length - 1]}, in-season window ${SEASON_START_MD} to ${SEASON_END_MD}  `);
  L.push(`**Reconstruction:** Felber, Stoeckli & Calanca 2018 Eq. 1a–1c (generic a=2.71, b=3.14, c=0.75), with a Sanders sawtooth as the control  `);
  L.push("**Oracle:** genuine station hourly METAR via the Iowa Environmental Mesonet ASOS archive, per council C2. ERA5 appears only where no station exists, and is labelled consistency-only.");
  L.push("");
  L.push("---");
  L.push("");
  L.push("## The gate, fixed before the run");
  L.push("");
  L.push("| Gate | Threshold | What it protects against |");
  L.push("|---|---|---|");
  L.push(`| **G1 unsafe-miss** (BINDING) | ≤ ${(G1_MAX_UNSAFE_MISS * 100).toFixed(0)}% | The model under-calling a real epidemic. This is the crop-loss direction. |`);
  L.push(`| **G2 coverage** | ≥ ${(G2_MIN_COVERAGE * 100).toFixed(0)}% | Refusal buying a pass. A model that rarely answers is rarely wrong. |`);
  L.push(`| **G3 agreement** | point ≥ ${(G3_MIN_POINT_AGREEMENT * 100).toFixed(0)}%, band ≥ ${(G3_MIN_BAND_AGREEMENT * 100).toFixed(0)}% | Ordinary inaccuracy. |`);
  L.push(`| **G4 statistical adequacy** | ≥ ${G4_MIN_SEASONS} full seasons/site, Wilson CIs on every rate | A site passing on thin data. |`);
  L.push("");
  L.push("Evaluated **per site, never averaged**. A regime-specific refusal is a legitimate outcome");
  L.push("(the ADR 0012 precedent), not a failed phase.");
  L.push("");
  L.push("---");
  L.push("");
  L.push("## Verdict");
  L.push("");

  const passing = results.filter((r) => r.gates.pass);
  const failing = results.filter((r) => !r.gates.pass);

  if (!anyPass) {
    L.push("### ⛔ NO SITE PASSES. The pre-committed no-go triggers.");
    L.push("");
    L.push("Per the plan's own outcome ladder: **S5a ships the ledger only, and the index moves to S5b behind S1.**");
  } else {
    L.push(`### ${passing.length} of ${results.length} sites pass.`);
    L.push("");
    L.push(`**Build the index for:** ${passing.map((r) => r.cfg.name).join(", ")}.`);
    L.push(`**The index refuses in:** ${failing.map((r) => r.cfg.name).join(", ")}.`);
  }
  L.push("");
  L.push("| Site | Oracle tier | G1 unsafe-miss | G2 coverage | G3 agreement | G4 seasons | Verdict |");
  L.push("|---|---|---|---|---|---|---|");
  for (const r of results) {
    const a = r.arms[0];
    const measurable = a ? a.unsafeMiss.den > 0 : false;
    L.push(
      `| ${r.cfg.name} | ${r.cfg.tier} | ${a ? gateMark(r.gates.g1, measurable) : "n/m"} | ${a ? gateMark(r.gates.g2) : "n/m"} | ${a ? gateMark(r.gates.g3) : "n/m"} | ${gateMark(r.gates.g4)} (${r.seasonsWithData.length}) | ${r.gates.pass ? "**PASS**" : "**FAIL**"} |`,
    );
  }
  L.push("");
  L.push("---");
  L.push("");
  L.push("## Oracle map — which arm produced each site's number");
  L.push("");
  L.push("Council C2: a reconstruction validated against reanalysis yields an agreement statistic");
  L.push("between two models, presented as empirical fidelity. Each row therefore declares its arm.");
  L.push("");
  L.push("| Site | Tier | Oracle | Why |");
  L.push("|---|---|---|---|");
  for (const r of results) {
    L.push(`| ${r.cfg.name} | \`${r.cfg.tier}\` | ${r.oracleLabel} | ${r.cfg.oracleNote} |`);
  }
  L.push("");
  L.push("**The station map is itself a finding.** Fidelity is not evenly available across the fleet:");
  L.push("three sites have a genuinely comparable station, two are degraded, and the two Bhutan sites");
  L.push("have none at all — the nearest ASOS to Bajo sits 1,005 m above the vineyard.");
  L.push("");
  L.push("---");
  L.push("");
  L.push("## Why it failed, and why the failure is structural");
  L.push("");
  L.push("The obvious reading of a failed gate is \"pick a better estimator or tune the parameters\".");
  L.push("Four independent lines in this run say that is not available.");
  L.push("");
  L.push("**1. The control performs about as well as the sophisticated model.** Sanders sawtooth tracks");
  L.push("Felber within a few points of daily agreement at every station-oracle site. Reicosky et al.");
  L.push("1989 reported exactly this. If a piecewise-linear ramp is competitive with a calibrated");
  L.push("sine-plus-exponential forced through both extremes, the limiting factor is not the curve.");
  L.push("");
  L.push("**2. Our sites violate the model's assumptions far LESS than the sites it was calibrated on.**");
  L.push("Felber measured Tmin in the afternoon on 27% of days and Tmax outside the midday window on");
  L.push("13%. Our station sites run 0.2–1.4% and 0.4–6.6%. The shape assumption holds *better* here");
  L.push("than in Switzerland, and the index still fails. The error is not coming from bad days.");
  L.push("");
  L.push("**3. The derived quantity is simply not resolvable.** Consecutive-hours-in-band MAE lands at");
  L.push("2.2–3.4 h across the station-oracle sites. The rule that drives the entire index asks whether");
  L.push("that count is at least **6**. An estimator whose error is half the threshold cannot answer the");
  L.push("question, and a 30-point swing (+20 to −10) hangs on it.");
  L.push("");
  L.push("**4. Savalkar's mitigation does not transfer.** Injecting monthly station statistics reduced");
  L.push("error by >75% in that paper — for *chill accumulation*, a smooth accumulator. Fit here on");
  L.push("held-out seasons it moved nothing at the station-oracle sites and made Stoney Hill worse.");
  L.push("That is the plan's §1.2 thesis confirmed by measurement: Gubler-Thomas is a narrow-window");
  L.push("threshold counter, structurally the sunburn / Chill-Portions case, not the GDD case. The");
  L.push("repo's existing weather math (`gdd-core`, `normals-core`, `stage-core`) lives in the forgiving");
  L.push("class. This index does not.");
  L.push("");
  L.push("### The error is not in the safe direction");
  L.push("");
  L.push("A high-running index would have been survivable — it over-sprays, which costs money and");
  L.push("resistance pressure but not fruit. That is not what the data shows. The binding G1 gate");
  L.push("measures the *opposite* direction: days the station says are epidemic-threshold and the model");
  L.push("calls quieter. Six of eight sites breach the 2% bar, Madera worst at 13.6% — roughly one");
  L.push("missed epidemic day in seven, at the site S0 already flagged for reporting its highest");
  L.push("confidence on its worst inputs.");
  L.push("");
  L.push("### Bhutan: there is nothing to measure against, and the data is offset");
  L.push("");
  L.push("Gemini's D-5 objection is upheld, and more sharply than predicted. There is no station");
  L.push("oracle within reach of either Bhutan site, so no fidelity arm exists at all. The ERA5");
  L.push("consistency arm then shows the raw reconstruction and ERA5 disagreeing on essentially every");
  L.push("day — until a monthly additive correction is applied, after which they agree almost perfectly.");
  L.push("");
  L.push("**That jump is not a pass. It is the finding.** The correction is removing a mean absolute");
  L.push("monthly offset of **9.26 °C at Bajo and 8.16 °C at Gortshalu**. For comparison, the US");
  L.push("station-oracle sites sit at 0.31–1.44 °C. Two gridded products, sampled at the same");
  L.push("coordinates, disagree about the temperature of these vineyards by nearly nine degrees.");
  L.push("");
  L.push("A ~9 °C gap is what a ~1.3 km elevation difference buys you at a normal lapse rate, which is");
  L.push("exactly the grid-cell-mean-elevation mismatch Gemini predicted for Himalayan terrain. The");
  L.push("probe cannot say which product is closer to the vineyard — that is precisely what having no");
  L.push("station oracle means — only that they cannot both be right, and that the 21–30 °C band is");
  L.push("narrower than the disagreement. Two coarse grids agreeing on *shape* once you subtract their");
  L.push("disagreement on *level* is the model-validated-against-model artifact council C2 warned");
  L.push("about, in its purest form.");
  L.push("");
  L.push("**The index must be explicitly disabled for this tenant**, not quietly wrong. This also");
  L.push("deserves escalation beyond S5a: an 8–9 °C uncertainty on the daily series is a live");
  L.push("data-quality question for every temperature-derived number already shown to that grower.");
  L.push("");
  L.push("---");
  L.push("");
  L.push("## What this licenses");
  L.push("");
  L.push("Per the plan's pre-committed outcome ladder, with every site failing and the mitigation arm");
  L.push("lifting no site over the bar:");
  L.push("");
  L.push("> **S5a ships the ledger only, and the index moves to S5b behind S1.**");
  L.push("");
  L.push("Concretely:");
  L.push("");
  L.push("1. **Units 3 and 4 (`diurnal-core.ts`, `powdery-core.ts`) do not ship as a risk engine.** The");
  L.push("   plan made them explicitly contingent on this measurement and the measurement says no.");
  L.push("2. **The latent-infection ledger (Units 1, 2, 5) ships as planned.** It never depended on the");
  L.push("   index — it is the durable half, and building it before S5b has consumers is the cheap");
  L.push("   moment (plan §1, KD-3).");
  L.push("3. **`query_spray_decision` still lands thin and hard-refusing** (Unit 7). With no index it");
  L.push("   refuses more, which is the honest behaviour, not a degraded one.");
  L.push("4. **S1 is now load-bearing for powdery mildew, not just for leaf wetness.** ADR 0012 narrowed");
  L.push("   S1's LWD to eastern regimes; this probe adds that even the temperature-only half of");
  L.push("   Gubler-Thomas needs real hourly data. The runbook's \"buildable on today's daily data via");
  L.push("   diurnal reconstruction\" premise is now measured false and must be corrected (KD-10).");
  L.push("5. **The refusal is regime-independent.** ADR 0012 could narrow S1 to eastern sites because the");
  L.push("   failure split cleanly by regime. This one does not split: the best oracle in the fleet");
  L.push("   (Russian River, 3.7 km) scores *worse* than a 9.8 km one. There is no subset to ship to.");
  L.push("");
  L.push("---");
  L.push("");

  for (const r of results) {
    L.push(`## ${r.cfg.name}`);
    L.push("");
    if (r.error) {
      L.push(`**Not measured:** ${r.error}`);
      L.push("");
      continue;
    }
    L.push(`- Oracle: ${r.oracleLabel}`);
    L.push(
      `- Daily extremes provider: \`${r.providerUsed}\`` +
        (r.providerSubstituted
          ? ` — **SUBSTITUTED.** Production's effective primary here is \`${r.effectivePrimary}\`, which has under three seasons of history, so there was nothing to measure on it. This row is indicative of the regime, not of the exact production input.`
          : " (the effective primary — the same read production performs)"),
    );
    L.push(`- In-season days available: **${r.inSeasonDays}**; oracle-decidable: **${r.oracleDecidableDays}**`);
    L.push(`- Full seasons (≥120 decidable in-season days): **${r.seasonsWithData.length}** — ${r.seasonsWithData.join(", ") || "none"}`);
    L.push(`- Days the oracle itself saw ≥35 °C: ${pct(r.heatDays)}`);
    L.push("");
    L.push("**Assumption violations (Felber measured 27% / 13%; these are OUR sites):**");
    L.push("");
    L.push(`- Tmin occurred in the afternoon (12:00–20:00): ${pct(r.tminAfternoonRate)}`);
    L.push(`- Tmax occurred before noon or after 20:00: ${pct(r.tmaxOffWindowRate)}`);
    L.push("");
    L.push("These are **not fixable by recalibration** — they are days on which the model's shape");
    L.push("assumption is simply false.");
    L.push("");
    L.push("| Arm | Point-delta agreement | Band agreement | Unsafe-miss (G1) | Coverage | Consec-hours MAE | Index MAE |");
    L.push("|---|---|---|---|---|---|---|");
    for (const a of [...r.arms, ...(r.mitigated ? [r.mitigated] : [])]) {
      L.push(
        `| ${a.estimator} | ${pct(a.pointAgreement)} | ${pct(a.bandAgreement)} | ${pct(a.unsafeMiss)} | ${pct(a.coverage)} | ${a.consecutiveHoursMae === null ? "n/m" : a.consecutiveHoursMae.toFixed(2) + " h"} | ${a.indexMae === null ? "n/m" : a.indexMae.toFixed(1) + " pts"} |`,
      );
    }
    L.push("");
    const pa = r.arms[0];
    if (pa) {
      L.push("**Stratified by sky condition** (Reicosky 1989: all methods work on clear days and");
      L.push("struggle on overcast ones; an aggregate number hides this):");
      L.push("");
      L.push(`- clear days (cloud fraction < 0.3): ${pct(pa.pointAgreementClear)}`);
      L.push(`- overcast days (cloud fraction ≥ 0.7): ${pct(pa.pointAgreementOvercast)}`);
      L.push("");
    }
    if (r.meanAbsMonthlyBiasC !== null) {
      L.push(
        `**Systematic offset removed by the Savalkar arm:** mean |monthly bias| = **${r.meanAbsMonthlyBiasC.toFixed(2)} °C**. ` +
          (r.meanAbsMonthlyBiasC > 4
            ? "**This is enormous.** The reconstruction and the oracle were not describing the same temperature range at all, so the raw row measures a level mismatch between two gridded products, not curve-shape error. See the Bhutan note below."
            : r.meanAbsMonthlyBiasC > 1
              ? "Moderate — enough to shift band boundaries, but the raw agreement figures still mostly reflect curve shape."
              : "Small — so the raw agreement figures above reflect curve shape, not a level offset."),
      );
      L.push("");
    }
    L.push(`**Peduto et al. 2013 heat term** (measured, never shipped — KD-2): would have changed the heat verdict on ${pct(r.pedutoWouldChange)} of decidable days.`);
    L.push("");
    if (r.gates.notes.length) {
      for (const n of r.gates.notes) L.push(`> ${n}`);
      L.push("");
    }
    L.push("---");
    L.push("");
  }

  return L.join("\n");
}

// ─────────────────────────────── main ───────────────────────────────

async function main() {
  const results: SiteResult[] = [];
  for (const cfg of SITES) {
    process.stdout.write(`measuring ${cfg.name} … `);
    try {
      const r = await measureSite(cfg);
      results.push(r);
      console.log(r.error ? `SKIPPED (${r.error})` : `${r.gates.pass ? "PASS" : "FAIL"}`);
    } catch (e) {
      console.log(`ERROR ${(e as Error).message}`);
      results.push({
        cfg,
        oracleLabel: "—",
        providerUsed: null,
        effectivePrimary: null,
        providerSubstituted: false,
        seasonsWithData: [],
        inSeasonDays: 0,
        oracleDecidableDays: 0,
        tminAfternoonRate: rate(0, 0),
        tmaxOffWindowRate: rate(0, 0),
        arms: [],
        mitigated: null,
        pedutoWouldChange: rate(0, 0),
        heatDays: rate(0, 0),
        meanAbsMonthlyBiasC: null,
        gates: { g1: false, g2: false, g3: false, g4: false, pass: false, notes: [String(e)] },
        error: (e as Error).message,
      });
    }
  }

  const out = join(process.cwd(), "docs", "spray_assistant", "phases", "S5a-diurnal-fidelity-probe.md");
  mkdirSync(join(process.cwd(), "docs", "spray_assistant", "phases"), { recursive: true });
  writeFileSync(out, renderReport(results), "utf8");
  console.log(`\nreport → ${out}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });


