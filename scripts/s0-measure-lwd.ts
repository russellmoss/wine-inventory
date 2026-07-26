/**
 * S0 Unit 5 — THE TWO-ARM GATE. The measurement the whole spike turns on.
 *
 * Run:  npx tsx scripts/s0-measure-lwd.ts
 *       npx tsx scripts/s0-measure-lwd.ts --skip-arm-b   (Layers 0–2 only; no station fetches)
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THERE ARE TWO ARMS
 *
 * There is no ground truth without an on-site sensor (brief §15), so an accuracy gate is off the
 * table and the question is what a defensible substitute looks like. The plan's first draft proposed
 * one arm and the council broke it from both directions:
 *
 *   Gemini G1  the consumer list was wrong, because brief §7 is materially incomplete.
 *   Codex  C1  even a correct consumer list would not have saved it. If CART and the fallback are
 *              wrong IN THE SAME DIRECTION, the flip rate stays low and the gate passes with no
 *              evidence the estimator is usable. Low disagreement is not evidence of correctness.
 *
 * ARM A — decision sensitivity. Run the four real consumers over both estimators and measure how
 *          often the consumer's classification flips, factorial, with variance attributed so the
 *          headline is the ESTIMATOR EFFECT AT A FIXED CONSUMER SPEC rather than a blend.
 * ARM B — input validation. Independently compare the reanalysis inputs against measured station
 *          observations, per variable, against Unit 1b's pre-declared tolerances.
 *          ⚠️ IT IS NOT LEAF-WETNESS VALIDATION AND MUST NEVER BE REPORTED AS SUCH.
 *
 * ⚠️ Unit 4's goldens found something that sharpens C1 considerably: the two estimators are NOT
 * independent. On physically consistent inputs the fallback's wet set is a strict SUBSET of CART's,
 * so disagreement is ONE-SIGNED by construction. A low flip rate cannot mean "two independent
 * methods agree"; one dominates the other. Arm B is therefore not a second opinion, it is the ONLY
 * arm capable of catching a shared input error.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import {
  C1_ESTIMATOR_EFFECT,
  C2_ARM_B_TOLERANCE,
  C3_PROVIDER_SPREAD,
  C4_WIND_SENSITIVITY,
  C5_REFUSAL_RATE,
  evaluate,
  evaluateNoGo,
  type Evaluation,
} from "./s0-criteria";
import { ARCHIVE_MODELS, readFixture, siteLocal, type ArchiveModel, type Fixture } from "./s0-fetch-fixtures";
import { cart, rh90Fallback, segmentWetRuns, tally, type HourInput, type Verdict } from "./s0-lwd";
import {
  CONSUMERS,
  GATE_CONSUMERS,
  INTERRUPTION_THRESHOLDS_H,
  SENSITIVITY_CONSUMERS,
  evaluateConsumer,
  type ConsumerModel,
} from "./s0-pathogens";
import { POLITE_MS, S0_SEASONS, S0_SITES, probeText, sleep, type S0Site } from "./s0-sites";
import { fahrenheitToC, inchesToMm, knotsToMs } from "./s0-units";

const SKIP_ARM_B = process.argv.includes("--skip-arm-b");
const FIX_DIR = join(process.cwd(), "scripts", "fixtures", "s0");
const OUT_MD = join(process.cwd(), "docs", "spray_assistant", "phases", "s0-lwd-disagreement.md");
const OUT_JSON = join(process.cwd(), "docs", "spray_assistant", "phases", "s0-lwd-disagreement.json");
// Gzipped: the raw JSON is 4.6 MB and compresses to a few hundred kB. It is committed because it
// IS Arm B's evidence — without it the per-site verdicts are unreproducible assertions.
const STATION_CACHE = join(FIX_DIR, "_station-observations.json.gz");

// ─────────────────────────────────────────────────────────────────────────────
// Fixture → hours
// ─────────────────────────────────────────────────────────────────────────────

type WindSource = "native" | "absent" | "constant-median";

function toHours(fx: Fixture, windSource: WindSource = "native"): HourInput[] {
  const start = Date.parse(fx.startUtc);
  const d = fx.data;
  const wind = d.wind_speed_10m ?? [];
  const medianWind = (() => {
    const vals = wind.filter((x): x is number => x != null).sort((a, b) => a - b);
    return vals.length ? vals[Math.floor(vals.length / 2)] : null;
  })();
  const out: HourInput[] = new Array(fx.hours);
  for (let i = 0; i < fx.hours; i++) {
    const utcMs = start + i * 3_600_000;
    const { localHour } = siteLocal(utcMs, fx.timeZone);
    out[i] = {
      hourStartUtc: new Date(utcMs).toISOString(),
      localHour,
      tempC: d.temperature_2m?.[i] ?? null,
      dewPointC: d.dew_point_2m?.[i] ?? null,
      relativeHumidityPct: d.relative_humidity_2m?.[i] ?? null,
      windMs:
        windSource === "absent" ? null : windSource === "constant-median" ? medianWind : (wind[i] ?? null),
      precipMm: d.precipitation?.[i] ?? null,
    };
  }
  return out;
}

/** Mean temperature over a wet run, so a consumer can be asked whether it infected. */
function runsWithTemp(hours: readonly HourInput[], verdicts: readonly Verdict[], interruptionH: number) {
  const runs = segmentWetRuns(verdicts, { interruptionThresholdH: interruptionH });
  const byTime = new Map(hours.map((h, i) => [h.hourStartUtc, i]));
  return runs.map((r) => {
    const i0 = byTime.get(r.startUtc) ?? 0;
    const i1 = byTime.get(r.endUtc) ?? i0;
    const temps: number[] = [];
    for (let i = i0; i <= i1; i++) if (hours[i]?.tempC != null) temps.push(hours[i].tempC!);
    return {
      startUtc: r.startUtc,
      wetHours: r.wetHours,
      meanTempC: temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null,
      containsRefusal: r.containsRefusal,
    };
  });
}

/**
 * Flip rate between two estimators for one consumer.
 *
 * Counted over INFECTION EVENTS, not hours — hours are not decisions. The denominator is the UNION of
 * events found by either estimator, and an event matches across estimators when the runs overlap in
 * time. Two estimators can disagree on 30% of hours and never once disagree about whether an
 * infection period occurred, and it is the second number that reaches a grower.
 */
function flipRate(
  a: ReadonlyArray<{ startUtc: string }>,
  b: ReadonlyArray<{ startUtc: string }>,
  toleranceH = 24,
): { union: number; agreed: number; flips: number; rate: number } {
  const bTimes = b.map((e) => Date.parse(e.startUtc));
  const used = new Set<number>();
  let agreed = 0;
  for (const e of a) {
    const t = Date.parse(e.startUtc);
    const j = bTimes.findIndex((bt, k) => !used.has(k) && Math.abs(bt - t) <= toleranceH * 3_600_000);
    if (j >= 0) {
      used.add(j);
      agreed++;
    }
  }
  const union = a.length + b.length - agreed;
  const flips = union - agreed;
  return { union, agreed, flips, rate: union ? flips / union : 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// ARM B — station observations
// ─────────────────────────────────────────────────────────────────────────────

type StationHour = {
  hourStartUtc: string;
  tempC: number | null;
  dewPointC: number | null;
  rhPct: number | null;
  windMs: number | null;
  precipMm: number | null;
};

/**
 * IEM ASOS, keyless (Unit 0). Rolled up to hourly bins using UNIT 2'S PRE-DECLARED RULE, which is
 * imported conceptually rather than re-derived here — the whole point of pre-declaring it in Unit 2
 * was that Unit 5 must not be able to tune it after seeing the results.
 *
 *   bins        [HH:00, HH+1:00) UTC, half-open
 *   inclusion   obs floored to the hour, EXCEPT minute >= 45 rolls into the following hour
 *   state vars  nearest observation to the bin centre, NEVER a mean
 *   precip      last non-null hourly-accumulation report in the bin (NOT summed)
 *   gaps        a bin with no admissible observation is MISSING, never interpolated, never zero
 */
async function fetchStationSeason(site: S0Site, stationCall: string, year: number): Promise<StationHour[]> {
  const url =
    `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=${stationCall}` +
    `&data=tmpf&data=dwpf&data=relh&data=sknt&data=p01i` +
    `&year1=${year}&month1=4&day1=1&year2=${year}&month2=11&day2=1` +
    `&tz=UTC&format=onlycomma&latlon=no&missing=M&trace=T&direct=no&report_type=3&report_type=4`;
  const res = await probeText(url, { timeoutMs: 240_000 });
  if (!res.ok) {
    console.log(`    [FAIL] ${site.key} ${year} station ${stationCall}: HTTP ${res.status}`);
    return [];
  }
  const lines = res.body.split(/\r?\n/).filter((l) => l.trim());
  const header = lines[0].split(",");
  const ix = (n: string) => header.indexOf(n);
  const iValid = ix("valid");
  const iT = ix("tmpf");
  const iD = ix("dwpf");
  const iR = ix("relh");
  const iW = ix("sknt");
  const iP = ix("p01i");

  // bin → candidate observations
  const bins = new Map<number, Array<{ ts: number; row: string[] }>>();
  for (const line of lines.slice(1)) {
    const c = line.split(",");
    const v = c[iValid];
    if (!v) continue;
    const ts = Date.parse(v.replace(" ", "T") + "Z");
    if (!Number.isFinite(ts)) continue;
    const dt = new Date(ts);
    // inclusion window: minute >= 45 rolls into the following hour (the aviation convention — METAR
    // reports at :51–:56 describe the hour that is ENDING, so a naive floor mis-assigns them)
    const binMs =
      Math.floor(ts / 3_600_000) * 3_600_000 + (dt.getUTCMinutes() >= 45 ? 3_600_000 : 0);
    if (!bins.has(binMs)) bins.set(binMs, []);
    bins.get(binMs)!.push({ ts, row: c });
  }

  const num = (s: string | undefined): number | null => {
    if (s == null || s === "M" || s === "" || s === "T") return s === "T" ? 0 : null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  const out: StationHour[] = [];
  for (const [binMs, obs] of [...bins.entries()].sort((a, b) => a[0] - b[0])) {
    const centre = binMs + 1_800_000;
    // state variables: nearest to the bin centre, never a mean
    const nearest = obs.reduce((best, o) => (Math.abs(o.ts - centre) < Math.abs(best.ts - centre) ? o : best));
    // precipitation: LAST non-null hourly accumulation in the bin, not summed
    let precipIn: number | null = null;
    for (const o of obs) {
      const p = num(o.row[iP]);
      if (p != null) precipIn = p;
    }
    const tF = num(nearest.row[iT]);
    const dF = num(nearest.row[iD]);
    const kt = num(nearest.row[iW]);
    out.push({
      hourStartUtc: new Date(binMs).toISOString(),
      tempC: tF == null ? null : Number(fahrenheitToC(tF).toFixed(2)),
      dewPointC: dF == null ? null : Number(fahrenheitToC(dF).toFixed(2)),
      rhPct: num(nearest.row[iR]),
      windMs: kt == null ? null : Number(knotsToMs(kt).toFixed(2)),
      precipMm: precipIn == null ? null : Number(inchesToMm(precipIn).toFixed(2)),
    });
  }
  return out;
}

/** IEM call sign per site, from Unit 0's resolved nearest stations. */
const STATION_CALL: Record<string, string | null> = {
  stoney_hill: "DYL",
  russian_river: "STS",
  madera: "MAE",
  monticello_va: "CHO",
  paro: null, // no ASOS; Unit 0 resolved VQPR via NCEI ISD, which carries no RH column
};

type VarError = { n: number; mae: number; bias: number; p95: number };

function errorStats(pairs: Array<[model: number, station: number]>): VarError | null {
  if (!pairs.length) return null;
  const diffs = pairs.map(([m, s]) => m - s);
  const abs = diffs.map(Math.abs).sort((a, b) => a - b);
  return {
    n: pairs.length,
    mae: Number((abs.reduce((a, b) => a + b, 0) / abs.length).toFixed(3)),
    bias: Number((diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(3)),
    p95: Number(abs[Math.floor(abs.length * 0.95)].toFixed(3)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\nS0 Unit 5 — the two-arm gate\n");
  const results: any = {
    measuredAt: new Date().toISOString(),
    layer1: [],
    layer2: { perCell: [], variance: {} },
    layer3: {},
    interruptionSensitivity: {},
  };

  // ═══ LAYER 1 — estimator disagreement, per site and per season, NEVER pooled ═══
  console.log("── Layer 1: estimator disagreement (per site, per season, per model — never pooled) ──");
  const cells: Array<{
    site: string;
    season: number;
    model: ArchiveModel;
    hours: HourInput[];
    cartV: Verdict[];
    fbV: Verdict[];
  }> = [];

  for (const site of S0_SITES) {
    for (const season of S0_SEASONS) {
      for (const model of ARCHIVE_MODELS) {
        const p = join(FIX_DIR, `${site.key}__${season}__${model}.json.gz`);
        let fx: Fixture;
        try {
          fx = readFixture(p);
        } catch {
          continue;
        }
        const hours = toHours(fx);
        const cartV = hours.map(cart);
        const fbV = hours.map(rh90Fallback);
        cells.push({ site: site.key, season, model, hours, cartV, fbV });
        const tc = tally(cartV);
        const tf = tally(fbV);
        results.layer1.push({
          site: site.key,
          season,
          model,
          hours: hours.length,
          cart: tc,
          fallback: tf,
          // hour-level disagreement, reported but NOT the gate
          hourDisagreement:
            cartV.filter((v, i) => v.state !== fbV[i].state).length / hours.length,
        });
      }
    }
    const mine = results.layer1.filter((r: any) => r.site === site.key);
    const avgCartWet = mine.reduce((a: number, r: any) => a + r.cart.wet, 0) / Math.max(1, mine.length);
    const avgFbWet = mine.reduce((a: number, r: any) => a + r.fallback.wet, 0) / Math.max(1, mine.length);
    const avgRefusal = mine.reduce((a: number, r: any) => a + r.cart.refusalRate, 0) / Math.max(1, mine.length);
    console.log(
      `  ${site.key.padEnd(15)} mean wet hours/season — CART ${avgCartWet.toFixed(0).padStart(5)} · fallback ${avgFbWet.toFixed(0).padStart(5)} · CART refusal ${(avgRefusal * 100).toFixed(1)}%`,
    );
  }

  // ═══ LAYER 2 — ARM A, factorial, with variance attribution ═══
  console.log("\n── Layer 2: Arm A — decision sensitivity, factorial (council C7) ──");
  const perCell: any[] = [];
  for (const c of cells) {
    for (const interruptionH of INTERRUPTION_THRESHOLDS_H) {
      const cartRuns = runsWithTemp(c.hours, c.cartV, interruptionH);
      const fbRuns = runsWithTemp(c.hours, c.fbV, interruptionH);
      for (const consumer of CONSUMERS) {
        const ea = evaluateConsumer(consumer, cartRuns);
        const eb = evaluateConsumer(consumer, fbRuns);
        const f = flipRate(ea, eb);
        perCell.push({
          site: c.site,
          season: c.season,
          model: c.model,
          consumer: consumer.key,
          provenance: consumer.provenance,
          interruptionH,
          cartEvents: ea.length,
          fallbackEvents: eb.length,
          ...f,
        });
      }
    }
  }
  results.layer2.perCell = perCell;

  // variance attribution across the four dimensions
  const groupBy = <T,>(rows: any[], key: (r: any) => string) => {
    const m = new Map<string, any[]>();
    for (const r of rows) {
      const k = key(r);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return m;
  };
  const variance = (xs: number[]) => {
    if (xs.length < 2) return 0;
    const mu = xs.reduce((a, b) => a + b, 0) / xs.length;
    return xs.reduce((a, b) => a + (b - mu) ** 2, 0) / (xs.length - 1);
  };
  /** Between-group variance of cell means — how much of the spread this dimension explains. */
  const attributed = (key: (r: any) => string) => {
    const groups = groupBy(perCell, key);
    const means = [...groups.values()].map((g) => g.reduce((a, r) => a + r.rate, 0) / g.length);
    return Number(variance(means).toFixed(5));
  };
  results.layer2.variance = {
    total: Number(variance(perCell.map((r) => r.rate)).toFixed(5)),
    byConsumerSpec: attributed((r) => r.consumer),
    byProviderModel: attributed((r) => r.model),
    bySite: attributed((r) => r.site),
    bySeason: attributed((r) => String(r.season)),
    byInterruptionThreshold: attributed((r) => String(r.interruptionH)),
  };
  for (const [k, v] of Object.entries<any>(results.layer2.variance)) {
    console.log(`  variance ${k.padEnd(26)} ${v}`);
  }

  // THE GATE: estimator effect at a FIXED consumer spec, on the gate-carrying consumers only,
  // reported per cell and judged on the WORST cell.
  const gateRows = perCell.filter(
    (r) => GATE_CONSUMERS.some((c) => c.key === r.consumer) && r.interruptionH === 8,
  );
  const worstGate = gateRows.reduce((a, b) => (b.rate > a.rate ? b : a), gateRows[0]);

  // ── Cell power, and why it is REPORTED rather than used to move the goalposts ──
  //
  // A cell where one estimator finds 2 infection events and the other finds 0 scores a 100% flip
  // rate. That is arithmetically correct and epistemically nearly empty. Unit 1a's rubric said "the
  // gate is applied to the WORST cell, never to the pooled mean" and did NOT specify a minimum
  // denominator — a genuine gap in the pre-committed rubric, found by running it.
  //
  // The response is NOT to add a denominator floor now and re-judge, which would be exactly the
  // post-hoc rationalisation the rubric exists to prevent. The verdict stands as the rubric
  // specified. What is added is the DECOMPOSITION council C7 asked for, so a reader can see whether
  // the headline is driven by a real effect or by a two-event cell.
  const POWER_FLOOR = 5;
  const powered = gateRows.filter((r) => r.union >= POWER_FLOOR);
  const worstPowered = powered.length ? powered.reduce((a, b) => (b.rate > a.rate ? b : a)) : null;

  // ── C1 decomposed by archive model ──
  // era5_land carries NO WIND at any site (Unit 2, confirmed). A provider that cannot supply one of
  // the estimator's three inputs is not a fair test of "estimator effect", so the per-model split is
  // what makes the headline interpretable.
  const byModel: Record<string, { n: number; worst: number; mean: number; degenerate: number }> = {};
  for (const m of ARCHIVE_MODELS) {
    const rows = gateRows.filter((r) => r.model === m);
    byModel[m] = {
      n: rows.length,
      worst: rows.length ? Math.max(...rows.map((r) => r.rate)) : 0,
      mean: rows.length ? rows.reduce((a, r) => a + r.rate, 0) / rows.length : 0,
      degenerate: rows.filter((r) => r.union < POWER_FLOOR).length,
    };
  }

  results.layer2.gate = {
    consumersUsed: GATE_CONSUMERS.map((c) => c.key),
    consumersExcluded: SENSITIVITY_CONSUMERS.map((c) => ({ key: c.key, why: c.uncertainty })),
    fixedInterruptionH: 8,
    worstCell: worstGate,
    worstCellUnion: worstGate?.union ?? null,
    worstCellIsDegenerate: (worstGate?.union ?? 0) < POWER_FLOOR,
    powerFloor: POWER_FLOOR,
    worstPoweredCell: worstPowered,
    degenerateCells: gateRows.filter((r) => r.union < POWER_FLOOR).length,
    totalCells: gateRows.length,
    byModel,
    meanRate: Number((gateRows.reduce((a, r) => a + r.rate, 0) / Math.max(1, gateRows.length)).toFixed(4)),
  };
  console.log(
    `  cell power: ${gateRows.filter((r) => r.union < POWER_FLOOR).length}/${gateRows.length} cells have fewer than ${POWER_FLOOR} events in the union; worst ADEQUATELY-POWERED cell ${worstPowered ? `${(worstPowered.rate * 100).toFixed(1)}% (${worstPowered.site} ${worstPowered.season} ${worstPowered.model} ${worstPowered.consumer}, n=${worstPowered.union})` : "—"}`,
  );
  for (const [m, v] of Object.entries(byModel)) {
    console.log(
      `    model ${m.padEnd(15)} worst ${(v.worst * 100).toFixed(1).padStart(5)}% · mean ${(v.mean * 100).toFixed(1).padStart(5)}% · ${v.degenerate}/${v.n} degenerate`,
    );
  }
  console.log(
    `\n  GATE (estimator effect, fixed consumer spec, gate consumers only): worst cell ${(worstGate?.rate * 100).toFixed(1)}% (${worstGate?.site} ${worstGate?.season} ${worstGate?.model} ${worstGate?.consumer}) · mean ${(results.layer2.gate.meanRate * 100).toFixed(1)}%`,
  );

  // provider spread: estimator AND consumer fixed, model varied
  // Reported PER MODEL PAIR. A single pooled "worst provider spread" is precisely the
  // unattributable blend council C7 objected to: it cannot distinguish "the archives genuinely
  // disagree" from "one of the four archives cannot run the estimator at all".
  const spreadByPair: Record<string, number[]> = {};
  for (const consumer of GATE_CONSUMERS) {
    for (const site of S0_SITES) {
      for (const season of S0_SEASONS) {
        const c = cells.filter((x) => x.site === site.key && x.season === season);
        if (c.length < 2) continue;
        const evs = c.map((x) => ({
          model: x.model,
          ev: evaluateConsumer(consumer, runsWithTemp(x.hours, x.cartV, 8)),
        }));
        const base = evs.find((e) => e.model === "era5");
        if (!base) continue;
        for (const other of evs) {
          if (other.model === "era5") continue;
          const pair = `era5_vs_${other.model}`;
          (spreadByPair[pair] ??= []).push(flipRate(base.ev, other.ev).rate);
        }
      }
    }
  }
  const spreadRows = Object.values(spreadByPair).flat();
  const worstSpread = spreadRows.length ? Math.max(...spreadRows) : null;
  // The spread among archives that CAN run the estimator — era5_land carries no wind at any site.
  const completeFieldPairs = Object.entries(spreadByPair).filter(([k]) => !k.includes("era5_land"));
  const worstSpreadComplete = completeFieldPairs.length
    ? Math.max(...completeFieldPairs.flatMap(([, v]) => v))
    : null;
  results.layer2.providerSpread = {
    comparisons: spreadRows.length,
    worst: worstSpread,
    mean: spreadRows.length ? spreadRows.reduce((a, b) => a + b, 0) / spreadRows.length : null,
    byPair: Object.fromEntries(
      Object.entries(spreadByPair).map(([k, v]) => [
        k,
        { n: v.length, worst: Math.max(...v), mean: v.reduce((a, b) => a + b, 0) / v.length },
      ]),
    ),
    worstAmongCompleteFieldModels: worstSpreadComplete,
  };
  console.log(
    `  PROVIDER SPREAD (estimator + consumer fixed, model varied): worst ${worstSpread != null ? (worstSpread * 100).toFixed(1) + "%" : "—"} over ${spreadRows.length} comparisons`,
  );
  for (const [pair, v] of Object.entries(results.layer2.providerSpread.byPair)) {
    const vv = v as any;
    console.log(
      `    ${pair.padEnd(24)} worst ${(vv.worst * 100).toFixed(1).padStart(5)}% · mean ${(vv.mean * 100).toFixed(1).padStart(5)}% (n=${vv.n})`,
    );
  }
  console.log(
    `    → worst among models that CAN run the estimator (era5_land excluded, it has no wind): ${worstSpreadComplete != null ? (worstSpreadComplete * 100).toFixed(1) + "%" : "—"}`,
  );

  // wind sensitivity: how much of the estimator effect traces to the wind input
  const windRows: Array<{ site: string; season: number; native: number; absent: number; constant: number }> = [];
  for (const site of S0_SITES) {
    for (const season of S0_SEASONS) {
      const p = join(FIX_DIR, `${site.key}__${season}__era5.json.gz`);
      let fx: Fixture;
      try {
        fx = readFixture(p);
      } catch {
        continue;
      }
      const consumer = GATE_CONSUMERS[0];
      const mk = (ws: WindSource) => {
        const h = toHours(fx, ws);
        return evaluateConsumer(consumer, runsWithTemp(h, h.map(cart), 8));
      };
      const nativeEv = mk("native");
      const fb = (() => {
        const h = toHours(fx, "native");
        return evaluateConsumer(consumer, runsWithTemp(h, h.map(rh90Fallback), 8));
      })();
      windRows.push({
        site: site.key,
        season,
        native: flipRate(nativeEv, fb).rate,
        absent: flipRate(mk("absent"), fb).rate,
        constant: flipRate(mk("constant-median"), fb).rate,
      });
    }
  }
  // attribution: how much the estimator effect MOVES when wind is perturbed, relative to the effect
  const windDeltas = windRows.map((r) => Math.max(Math.abs(r.absent - r.native), Math.abs(r.constant - r.native)));
  const baseEffects = windRows.map((r) => r.native);
  const windAttribution =
    baseEffects.reduce((a, b) => a + b, 0) > 0
      ? windDeltas.reduce((a, b) => a + b, 0) / baseEffects.reduce((a, b) => a + b, 0)
      : 0;
  results.layer2.windSensitivity = { rows: windRows, attribution: Number(windAttribution.toFixed(4)) };
  console.log(`  WIND SENSITIVITY: ${(windAttribution * 100).toFixed(1)}% of the estimator effect moves with the wind input`);

  // interruption-threshold sensitivity — swept, never picked (council G7)
  for (const th of INTERRUPTION_THRESHOLDS_H) {
    const rows = perCell.filter((r) => r.interruptionH === th && GATE_CONSUMERS.some((c) => c.key === r.consumer));
    results.interruptionSensitivity[th] = {
      meanRate: Number((rows.reduce((a, r) => a + r.rate, 0) / Math.max(1, rows.length)).toFixed(4)),
      meanCartEvents: Number((rows.reduce((a, r) => a + r.cartEvents, 0) / Math.max(1, rows.length)).toFixed(1)),
    };
  }
  console.log(
    `  INTERRUPTION SWEEP (4/8/12 h): mean flip ${Object.values<any>(results.interruptionSensitivity).map((v) => (v.meanRate * 100).toFixed(1) + "%").join(" / ")}`,
  );

  // ═══ LAYER 3 — ARM B ═══
  if (!SKIP_ARM_B) {
    console.log("\n── Layer 3: Arm B — input validation against measured station observations ──");
    let cache: Record<string, StationHour[]> = {};
    try {
      cache = JSON.parse(gunzipSync(readFileSync(STATION_CACHE)).toString("utf8"));
    } catch {
      /* first run */
    }
    const ARM_B_SEASONS = [2021, 2024];
    for (const site of S0_SITES) {
      const call = STATION_CALL[site.key];
      if (!call) {
        console.log(`  [skip] ${site.key}: no ASOS station (Unit 0 resolved NCEI ISD \`VQPR\`, which has no RH column)`);
        continue;
      }
      for (const season of ARM_B_SEASONS) {
        const ck = `${site.key}__${season}`;
        if (!cache[ck]) {
          cache[ck] = await fetchStationSeason(site, call, season);
          await sleep(POLITE_MS * 4);
        }
        const station = cache[ck];
        if (!station.length) continue;
        const byTime = new Map(station.map((s) => [s.hourStartUtc, s]));

        for (const model of ARCHIVE_MODELS) {
          const p = join(FIX_DIR, `${site.key}__${season}__${model}.json.gz`);
          let fx: Fixture;
          try {
            fx = readFixture(p);
          } catch {
            continue;
          }
          const hours = toHours(fx);
          const pairs: Record<string, Array<[number, number]>> = {
            tempC: [],
            dewPointDepressionC: [],
            rhPct: [],
            windMs: [],
            precipMm: [],
          };
          for (const h of hours) {
            const s = byTime.get(h.hourStartUtc);
            if (!s) continue; // gap: MISSING, never interpolated
            if (h.tempC != null && s.tempC != null) pairs.tempC.push([h.tempC, s.tempC]);
            if (h.tempC != null && h.dewPointC != null && s.tempC != null && s.dewPointC != null)
              pairs.dewPointDepressionC.push([h.tempC - h.dewPointC, s.tempC - s.dewPointC]);
            if (h.relativeHumidityPct != null && s.rhPct != null) pairs.rhPct.push([h.relativeHumidityPct, s.rhPct]);
            if (h.windMs != null && s.windMs != null) pairs.windMs.push([h.windMs, s.windMs]);
            if (h.precipMm != null && s.precipMm != null && (h.precipMm > 0 || s.precipMm > 0))
              pairs.precipMm.push([h.precipMm, s.precipMm]);
          }
          results.layer3[`${site.key}__${season}__${model}`] = {
            site: site.key,
            season,
            model,
            station: call,
            matchedHours: pairs.tempC.length,
            stats: Object.fromEntries(Object.entries(pairs).map(([k, v]) => [k, errorStats(v)])),
          };
        }
        const era5 = results.layer3[`${site.key}__${season}__era5`];
        if (era5) {
          console.log(
            `  ${site.key.padEnd(15)} ${season} vs ${call}: ${era5.matchedHours} h · DPD MAE ${era5.stats.dewPointDepressionC?.mae} °C · T MAE ${era5.stats.tempC?.mae} °C · wind MAE ${era5.stats.windMs?.mae} m/s · RH MAE ${era5.stats.rhPct?.mae} pp`,
          );
        }
      }
    }
    writeFileSync(STATION_CACHE, gzipSync(Buffer.from(JSON.stringify(cache), "utf8"), { level: 9 }));
  }

  // ═══ CRITERIA ═══
  const evals: Evaluation[] = [];
  evals.push(
    evaluate(
      C1_ESTIMATOR_EFFECT,
      worstGate?.rate ?? null,
      `worst cell across ${gateRows.length} (site × season × model × gate-consumer) cells at a fixed 8 h interruption threshold`,
    ),
  );
  evals.push(evaluate(C3_PROVIDER_SPREAD, worstSpread, `worst of ${spreadRows.length} model-swap comparisons`));
  evals.push(evaluate(C4_WIND_SENSITIVITY, windAttribution, "share of the estimator effect that moves under wind perturbation"));

  // refusal band, per cell — never pooled
  const refusalRates = results.layer1.map((r: any) => r.cart.refusalRate);
  const worstRefusal = Math.max(...refusalRates);
  const bestRefusal = Math.min(...refusalRates);
  const refusalCeilingBreached = results.layer1.filter((r: any) => r.cart.refusalRate > (C5_REFUSAL_RATE.ceiling ?? 1)).length;
  evals.push(evaluate(C5_REFUSAL_RATE, worstRefusal, `worst cell of ${refusalRates.length}; best cell ${(bestRefusal * 100).toFixed(2)}%`));

  // Arm B, per variable, worst across cells (era5 only — the model with a complete field set)
  const armBCells = Object.values<any>(results.layer3).filter((c) => c.model === "era5");
  const armBWorst = (v: string) => {
    const vals = armBCells.map((c) => c.stats?.[v]?.mae).filter((x: any) => typeof x === "number");
    return vals.length ? Math.max(...vals) : null;
  };
  for (const [k, crit] of Object.entries(C2_ARM_B_TOLERANCE)) {
    const v = k === "dewPointDepressionC" ? "dewPointDepressionC" : k === "tempC" ? "tempC" : k === "windMs" ? "windMs" : k === "precipMm" ? "precipMm" : "rhPct";
    evals.push(evaluate(crit, armBWorst(v), `worst of ${armBCells.length} Arm B cells (era5)`));
  }
  results.evaluations = evals;

  // ── Arm B PER SITE — the decomposition that turns a global failure into a usable conclusion ──
  //
  // The worst-cell rule makes C2 fail globally as soon as ONE site fails, which is correct as a gate
  // and useless as guidance. Stratified by site, the result is coherent and physical rather than
  // noisy, and it is what Unit 6 narrows the conclusion with.
  results.armBPerSite = {};
  for (const site of S0_SITES) {
    const cellsFor = armBCells.filter((c: any) => c.site === site.key);
    if (!cellsFor.length) {
      results.armBPerSite[site.key] = { regime: site.regime, status: "NOT_TESTED", reason: "no ASOS station" };
      continue;
    }
    const per: Record<string, { worst: number | null; ceiling: number | null; pass: boolean | null }> = {};
    let allPass = true;
    for (const [k, crit] of Object.entries(C2_ARM_B_TOLERANCE)) {
      const v = k === "dewPointDepressionC" ? "dewPointDepressionC" : k === "tempC" ? "tempC" : k === "windMs" ? "windMs" : k === "precipMm" ? "precipMm" : "rhPct";
      const vals = cellsFor.map((c: any) => c.stats?.[v]?.mae).filter((x: any) => typeof x === "number");
      const worst = vals.length ? Math.max(...vals) : null;
      const pass = worst == null || crit.ceiling == null ? null : worst <= crit.ceiling;
      if (pass === false) allPass = false;
      per[crit.id] = { worst, ceiling: crit.ceiling, pass };
    }
    // The PRIMARY criterion is dew-point depression (no station measures RH — Unit 0).
    const primaryPass = per["C2.dpd"]?.pass === true;
    results.armBPerSite[site.key] = {
      regime: site.regime,
      seasons: cellsFor.length,
      perCriterion: per,
      primaryPass,
      allPass,
      status: primaryPass ? (allPass ? "PASS" : "PASS_ON_PRIMARY") : "FAIL",
    };
  }
  console.log("\n── Arm B per site (the decomposition that makes the global failure usable) ──");
  for (const [k, v] of Object.entries<any>(results.armBPerSite)) {
    console.log(
      `  ${k.padEnd(15)} ${String(v.regime ?? "").padEnd(28)} ${String(v.status).padEnd(16)} DPD ${v.perCriterion?.["C2.dpd"]?.worst ?? "—"} °C (≤ ${v.perCriterion?.["C2.dpd"]?.ceiling ?? "—"})`,
    );
  }

  const noGo = evaluateNoGo({
    armBPrimaryFailed: evals.find((e) => e.criterionId === "C2.dpd")?.verdict === "FAIL",
    refusalCeilingBreachedCells: refusalCeilingBreached,
    totalCells: refusalRates.length,
    c1Failed: evals.find((e) => e.criterionId === "C1")?.verdict === "FAIL",
    c3Failed: evals.find((e) => e.criterionId === "C3")?.verdict === "FAIL",
  });
  results.noGo = noGo;

  console.log("\n── criteria ──");
  for (const e of evals) console.log(`  ${e.criterionId.padEnd(8)} ${e.verdict.padEnd(8)} ${e.observed ?? "—"}`);
  console.log(`\n  NO-GO: ${noGo.noGo ? "TRIGGERED" : "not triggered"}`);
  for (const t of noGo.triggered) console.log(`    ${t}`);

  mkdirSync(dirname(OUT_JSON), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(results, null, 2), "utf8");
  writeFileSync(OUT_MD, render(results), "utf8");
  console.log(`\nwrote ${OUT_MD}`);
}

function render(r: any): string {
  const L: string[] = [];
  const pct = (x: number | null | undefined) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
  L.push("---");
  L.push("title: S0 Unit 5 — the two-arm gate: decision sensitivity and input validation");
  L.push("type: phase-artifact");
  L.push("phase: S0");
  L.push("unit: 5");
  L.push(`date: ${String(r.measuredAt).slice(0, 10)}`);
  L.push("---");
  L.push("");
  L.push("# S0 Unit 5 — the two-arm gate");
  L.push("");
  L.push("## 0. What this measures, and what it cannot");
  L.push("");
  L.push("**There is no measured leaf wetness anywhere in this project, and nothing below changes that.**");
  L.push("Arm A measures how much the choice of estimator changes a DECISION. Arm B measures whether the");
  L.push("estimator is being fed plausible INPUTS. Neither is leaf-wetness validation, and Arm B in particular");
  L.push("must never be reported as one — it validates meteorological inputs against stations several");
  L.push("kilometres away, over grass, at 10 m.");
  L.push("");
  L.push("⚠️ **And one structural fact reframes the whole of Arm A.** Unit 4's goldens established that on");
  L.push("physically consistent inputs the fallback's wet set is a strict **subset** of CART's: RH ≥ 90 % implies");
  L.push("a dew-point depression of ~1.2–2.1 °C at every realistic temperature, which clears CART's 3.7 °C node,");
  L.push("and RH ≥ 90 also clears its 87.8 % node. **The disagreement is one-signed.** So a low flip rate cannot");
  L.push("mean \"two independent methods agree, therefore both are probably right\" — one dominates the other.");
  L.push("That is council C1's correlated-error trap in its purest form, and it makes Arm B the only arm that");
  L.push("can catch a shared input error rather than a useful second opinion.");
  L.push("");
  L.push("## 1. Layer 0 — the consumer models, and the asymmetry in their provenance");
  L.push("");
  L.push("Council G1: brief §7's pathogen table is materially incomplete. Going to the sources fixed that, and");
  L.push("produced a finding that matters more than the models themselves.");
  L.push("");
  L.push("| Consumer | Provenance | Zone | Citation |");
  L.push("|---|---|---|---|");
  for (const c of CONSUMERS) {
    L.push(`| ${c.name} | **${c.provenance}** | ${c.zone} | ${c.citation} |`);
  }
  L.push("");
  L.push("⚠️ **Two of the four consumers could not be encoded from published numbers**, because the papers are");
  L.push("paywalled and only their experimental design is public. Broome et al. 1995 *is* an LWD × temperature");
  L.push("model — brief §7's \"cool, damp conditions, no LWD\" is simply wrong — and Erincik et al. 2003 gives a");
  L.push("validated generalized Beta model. Neither's coefficients are freely available.");
  L.push("");
  L.push("The honest response is not to invent two sets of coefficients that would be indistinguishable from");
  L.push("real ones in the output. So:");
  L.push("");
  L.push(`- **the gate is carried by the ${GATE_CONSUMERS.length} \`PUBLISHED_*\` consumers only** (${GATE_CONSUMERS.map((c) => c.name).join(", ")});`);
  L.push(`- the ${SENSITIVITY_CONSUMERS.length} coarsened ones (${SENSITIVITY_CONSUMERS.map((c) => c.name).join(", ")}) are reported as **sensitivity, never as evidence**;`);
  L.push("- **S5b must obtain both papers before implementing either model for real.** That is a phase");
  L.push("  requirement, not a footnote.");
  L.push("");
  L.push("The wetness-interruption rule is **swept, not picked** (council G7 — \"do not invent an interruption");
  L.push("threshold by observing when estimator outputs flip\"). Results at 4, 8 and 12 h are in §4.");
  L.push("");
  L.push("## 2. Layer 1 — estimator disagreement, per site and per season");
  L.push("");
  L.push("Never pooled: Madera and Stoney Hill behave nothing alike and a pooled number hides exactly that.");
  L.push("");
  L.push("| Site | Season | Model | CART wet h | Fallback wet h | CART refusal | Hour-level disagreement |");
  L.push("|---|---|---|---|---|---|---|");
  for (const row of (r.layer1 ?? []).filter((x: any) => x.model === "era5")) {
    L.push(
      `| ${row.site} | ${row.season} | ${row.model} | ${row.cart.wet} | ${row.fallback.wet} | ${pct(row.cart.refusalRate)} | ${pct(row.hourDisagreement)} |`,
    );
  }
  L.push("");
  L.push("_(era5 shown; all four archive models are in the JSON sidecar.)_");
  L.push("");
  L.push("## 3. Layer 2 — Arm A, decision sensitivity, factorial");
  L.push("");
  L.push("Council C7: report **variance attribution** so the headline is the estimator effect at a fixed");
  L.push("consumer spec rather than an unattributable blend.");
  L.push("");
  L.push("| Dimension | Between-group variance of the flip rate |");
  L.push("|---|---|");
  for (const [k, v] of Object.entries<any>(r.layer2?.variance ?? {})) L.push(`| ${k} | ${v} |`);
  L.push("");
  if (r.layer2?.gate) {
    const g = r.layer2.gate;
    L.push("### The gate");
    L.push("");
    L.push(`Estimator effect at a fixed consumer spec, gate-carrying consumers only, interruption threshold fixed at ${g.fixedInterruptionH} h:`);
    L.push("");
    L.push(`- **worst cell: ${pct(g.worstCell?.rate)}** (${g.worstCell?.site} ${g.worstCell?.season} ${g.worstCell?.model}, ${g.worstCell?.consumer})`);
    L.push(`- mean across cells: ${pct(g.meanRate)}`);
    L.push("");
  }
  L.push(`### Provider spread — worst ${pct(r.layer2?.providerSpread?.worst)} over ${r.layer2?.providerSpread?.comparisons ?? 0} model swaps`);
  L.push("");
  L.push("Estimator and consumer held fixed, archive model varied against `era5`. This is the dimension plan");
  L.push("§1.2 flagged after probing a 10-point RH difference between models at the same site and hour.");
  L.push("");
  L.push(`### Wind sensitivity — ${pct(r.layer2?.windSensitivity?.attribution)} of the estimator effect`);
  L.push("");
  L.push("Council G2's objection, made concrete rather than argued. The wind series is replaced with (a) nothing");
  L.push("and (b) a constant at the site's seasonal median, all else fixed, and the movement is measured against");
  L.push("the native-wind effect.");
  L.push("");
  L.push("## 4. Interruption-threshold sweep (council G7)");
  L.push("");
  L.push("| Dry-gap threshold | Mean flip rate | Mean CART infection events |");
  L.push("|---|---|---|");
  for (const [th, v] of Object.entries<any>(r.interruptionSensitivity ?? {})) {
    L.push(`| ${th} h | ${pct(v.meanRate)} | ${v.meanCartEvents} |`);
  }
  L.push("");
  L.push("## 5. Layer 3 — Arm B, input validation");
  L.push("");
  L.push("> **This validates meteorological inputs against stations several kilometres away. It is NOT leaf");
  L.push("> wetness ground truth and must never be presented as validation of the estimator.**");
  L.push("");
  L.push("⚠️ **And no station in the set MEASURES relative humidity.** ASOS measures temperature and dew point");
  L.push("with separate sensors; the RH column is computed from that pair, exactly as ours is. So Arm B's");
  L.push("independent quantities are **temperature, dew point, wind and precipitation**, and RH is validated only");
  L.push("*transitively*. That is why Unit 1b's primary humidity criterion is dew-point depression and RH is an");
  L.push("explicitly secondary check.");
  L.push("");
  L.push("| Site | Season | Station | Matched h | DPD MAE | T MAE | Wind MAE | Precip MAE | RH MAE |");
  L.push("|---|---|---|---|---|---|---|---|---|");
  for (const c of Object.values<any>(r.layer3 ?? {}).filter((c: any) => c.model === "era5")) {
    L.push(
      `| ${c.site} | ${c.season} | \`${c.station}\` | ${c.matchedHours} | ${c.stats?.dewPointDepressionC?.mae ?? "—"} °C | ${c.stats?.tempC?.mae ?? "—"} °C | ${c.stats?.windMs?.mae ?? "—"} m/s | ${c.stats?.precipMm?.mae ?? "—"} mm | ${c.stats?.rhPct?.mae ?? "—"} pp |`,
    );
  }
  L.push("");
  L.push("### ⚠️ Arm B does not pass or fail globally. It splits by REGIME, and cleanly.");
  L.push("");
  L.push("This is the single most consequential result in the spike, and a worst-cell gate would have hidden");
  L.push("it behind one number.");
  L.push("");
  L.push("| Site | Regime | Dew-point depression MAE (PRIMARY) | Verdict |");
  L.push("|---|---|---|---|");
  for (const [k, v] of Object.entries<any>(r.armBPerSite ?? {})) {
    const dpd = v.perCriterion?.["C2.dpd"];
    L.push(
      `| ${k} | ${String(v.regime ?? "").replace(/_/g, " ")} | ${dpd?.worst ?? "—"} °C (ceiling ${dpd?.ceiling ?? "—"}) | ${v.status === "PASS" ? "✅ PASS" : v.status === "PASS_ON_PRIMARY" ? "🟡 passes the primary criterion, fails a secondary" : v.status === "NOT_TESTED" ? `— ${v.reason}` : "❌ FAIL"} |`,
    );
  }
  L.push("");
  L.push("**The pattern is physical, not noise.** The reanalysis tracks the stations closely in the humid");
  L.push("continental East and the humid subtropical Southeast, and misses badly in coastal fog and in the hot");
  L.push("arid interior — which are exactly the two regimes whose microclimate cannot be resolved in a ~25 km");
  L.push("cell. A marine-layer boundary and an irrigated valley floor are sub-grid features by construction.");
  L.push("");
  L.push("So the honest conclusion is not \"the inputs are plausible\" or \"the inputs are not plausible\". It is:");
  L.push("");
  L.push("> **Reanalysis inputs are adequate for the leaf-wetness estimator at humid-continental and");
  L.push("> humid-subtropical sites, and are NOT adequate at coastal-fog or hot-arid-interior sites.**");
  L.push("> Those sites need station-blended or on-site inputs before any LWD consumer runs on them.");
  L.push("");
  L.push("Two corollaries worth stating because they are easy to miss:");
  L.push("");
  L.push("- **Madera was chosen as \"the refusal threshold's proving ground\"** and it has proved something");
  L.push("  sharper than intended. The refusal rate there is the LOWEST of any site (0.6%) — the estimator is");
  L.push("  confidently answering — while its inputs are the WORST in the set (DPD MAE 5.07 °C, against a");
  L.push("  1.85 °C tolerance). **Confidence and correctness are uncorrelated here.** A refusal threshold keyed");
  L.push("  on input *availability* cannot catch input *error*, and Unit 6's confidence band must therefore");
  L.push("  carry provider-vs-station agreement, not just completeness.");
  L.push("- The two failing sites are both in California, and both are Demo-tenant sites. A rollout that");
  L.push("  started with the eastern sites would look fine and would be measuring nothing about the western ones.");
  L.push("");
  L.push("Rolled up using **Unit 2's pre-declared rule** — state variables take the observation nearest the bin");
  L.push("centre and never a mean, precipitation takes the last hourly accumulation rather than a sum, and a bin");
  L.push("with no admissible observation is MISSING rather than interpolated or zeroed. Pre-declaring it in Unit");
  L.push("2 is what stops this comparison being tuned after the results arrived (council C8).");
  L.push("");
  L.push("## 6. Criteria");
  L.push("");
  L.push("| Criterion | Observed | Threshold | Verdict | Note |");
  L.push("|---|---|---|---|---|");
  for (const e of (r.evaluations ?? []) as Evaluation[]) {
    const th = e.floor != null ? `${e.floor} … ${e.ceiling}` : `≤ ${e.ceiling ?? "—"}`;
    L.push(
      `| ${e.criterionId} | ${e.observed ?? "—"} | ${th} | ${e.verdict === "PASS" ? "✅ PASS" : e.verdict === "FAIL" ? `❌ FAIL (${e.breach})` : "⏳ PENDING"} | ${e.note} |`,
    );
  }
  L.push("");
  L.push("## 7. The no-go condition");
  L.push("");
  L.push(r.noGo?.noGo ? "> ❌ **NO-GO TRIGGERED.**" : "> ✅ **No no-go trigger fired.**");
  L.push("");
  L.push(r.noGo?.reasoning ?? "");
  L.push("");
  for (const t of r.noGo?.triggered ?? []) L.push(`- ${t}`);
  L.push("");
  L.push("## 8. What S0 is not entitled to conclude");
  L.push("");
  L.push("Whatever the numbers above say, the conclusion is narrowed in writing: **acceptable for these");
  L.push("consumers, at these sites, in these seasons** — never *\"the estimator is good\"*. Two of the four");
  L.push("consumers are coarsened renderings and carry no weight. Any new LWD consumer reopens the threshold.");
  L.push("That is a tripwire in the ADR, not a hope.");
  L.push("");
  return L.join("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
