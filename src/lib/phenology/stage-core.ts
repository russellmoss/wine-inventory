// Spray Intelligence S4 — the GDD phenology interpolator.
//
// A field note lands roughly weekly. A spray decision is made on a Tuesday. Between notes there
// is no stage at all, so every downstream model either guesses or refuses. This core makes the
// guess explicit, bounded, and labelled — or refuses out loud.
//
// ANCHORS FIRST, MODEL SECOND. An observed stage from a field note is the truth. Between two
// anchors we interpolate on ACCUMULATED GDD rather than elapsed days, because GDD self-calibrates
// to the site and the season — which is the entire reason to reuse the weather tree instead of a
// calendar. Past the last anchor we project, and we say so.
//
// ⚠️ GDD ACCUMULATES FROM THE BUD-BREAK BIOFIX, NEVER FROM THE CALENDAR SEASON WINDOW.
// `season-core` hard-codes the Northern season as Apr 1 – Oct 31. Bhutan is a LIVE tenant at
// ~27 °N in a monsoon climate where an off-cycle or double-pruning regime is entirely plausible;
// an Oct 31 cutoff would silently truncate their GDD curve and trap the model pre-veraison
// (council C9). Biofix anchoring removes the hemisphere assumption entirely, is standard practice
// for degree-day models anyway, and needs no change to src/lib/weather/ — which S4 may not touch.
// With no bud-break anchor the core REFUSES rather than falling back to Apr 1.
//
// Pure. Type-only imports from the weather tree plus its pure functions; no Prisma, no React, no
// server-only. The caller resolves latitude (via resolveVineyardCentroid) and passes a number.
//
// ⚠️ THE MODELED LADDER IS A CURATED FIRST-ORDER CONSTANT with no local validation oracle. It is
// the weakest tier by design and fires only past the last anchor. There is deliberately NO
// per-variety banding: v1 invented a `varietyBand` with no schema field behind it, which violates
// standing rule §3.7 — the exact rule this phase exists to enforce (council S1). Per-variety
// calibration returns when a field exists to drive it. NEWA comparison becomes available as an
// oracle once S5a builds one.

import { dailyGdd, type GddOptions } from "@/lib/weather/gdd-core";
import type { LocalDailyRecord } from "@/lib/weather/obs-time-core";
import { seasonCompleteness, seasonYearFor, windowDayCount } from "@/lib/weather/season-core";
import {
  PHENO_STAGES,
  PHENO_PCT_OPTIONS,
  phenoStageUsesPct,
  type PhenoStage,
} from "@/lib/fieldnotes/types";

// ───────────────────────── S4 constants (all named, all tested at both edges) ─────────────────

/** Base 10 °C, uncapped — matches every other GDD read in the app. */
export const PHENOLOGY_GDD_OPTIONS: GddOptions = { baseC: 10, capC: null };

/**
 * How stale a bud-break anchor may be before it is LAST season's, not this one's. A grape season
 * runs bud break → harvest in well under a year; beyond this we would be accumulating GDD across
 * a dormancy, which is meaningless. Refusing is correct — inheriting last year's biofix would
 * silently inflate `gddSinceBiofix` by an entire season.
 */
export const MAX_BIOFIX_AGE_DAYS = 330;

/**
 * How far past the last observation we will project before refusing, SCALED BY PHASE (council
 * DQ3). A single 28-day number is wrong in both directions: too long through bud break → fruit
 * set, where phenology moves in days and a 3-week-old anchor is nearly worthless; too short after
 * veraison, where veraison → harvest can span 45 days with almost no observable transition.
 */
export const PHASE_HORIZON_DAYS: Record<PhenoStage, number> = {
  DORMANT: 45, // nothing moves
  BUD_BREAK: 14, // fast phase
  FLOWERING: 14, // fast phase — the whole event can pass inside one missed week
  FRUIT_SET: 14, // fast phase
  VERAISON: 21, // slowing
  RIPENING: 45, // slow, few observable transitions
  HARVEST: 45,
  POST_HARVEST: 45,
};

/** Weather coverage of the biofix→target span below which we refuse rather than guess. */
export const MIN_SPAN_COMPLETENESS = 0.95;

/**
 * The generic MODELED ladder: accumulated GDD from the bud-break biofix → phenology coordinate
 * (see `toCoordinate`). Base 10 °C. First-order, literature-shaped, and NOT locally validated —
 * see the file header. Used ONLY for the *delta* past the last anchor, never to overrule an
 * observation.
 */
export const MODELED_LADDER: readonly { gdd: number; coord: number }[] = [
  { gdd: 0, coord: 1.05 }, // bud break, just starting
  { gdd: 100, coord: 1.95 }, // bud break essentially complete
  { gdd: 250, coord: 2.05 }, // flowering begins
  { gdd: 350, coord: 2.95 }, // flowering essentially complete
  { gdd: 420, coord: 3.0 }, // fruit set
  { gdd: 800, coord: 4.05 }, // veraison begins
  { gdd: 950, coord: 4.95 }, // veraison essentially complete
  { gdd: 1050, coord: 5.0 }, // ripening
  { gdd: 1400, coord: 6.0 }, // harvest-ready
];

// ───────────────────────── The monotone phenology coordinate (council C3) ─────────────────────
//
// `parsePhenoPct` admits ONLY 5|25|50|75|100, and only on BUD_BREAK / FLOWERING / VERAISON. So a
// naive "interpolate stage and pct" has an implementation space containing illegal pct values and
// impossible intermediate states — interpolating FLOWERING 75 % → FRUIT_SET could emit
// `FRUIT_SET 88%`, which the parser would reject on the way back in. Instead: map stage × pct onto
// ONE scalar, interpolate on that, and quantize back to the legal buckets on output, emitting
// `stagePct: null` for any stage that does not take one.

const STAGE_INDEX: Record<PhenoStage, number> = PHENO_STAGES.reduce(
  (acc, s, i) => ({ ...acc, [s]: i }),
  {} as Record<PhenoStage, number>,
);
const LAST_INDEX = PHENO_STAGES.length - 1;

/** stage × pct → one monotone scalar. A stage with no pct sits exactly on its integer. */
export function toCoordinate(stage: PhenoStage, stagePct: number | null): number {
  const idx = STAGE_INDEX[stage];
  if (!phenoStageUsesPct(stage) || stagePct == null) return idx;
  return idx + stagePct / 100;
}

/**
 * Scalar → a LEGAL (stage, pct) pair. Never emits a pct outside PHENO_PCT_OPTIONS, and always
 * emits `null` for a stage that does not take one.
 *
 * Note the deliberate adjacency: coordinate 2.0 is both "BUD_BREAK 100 %" and "FLOWERING 0 %".
 * It quantizes to FLOWERING 5 %, which is the nearest legal reading and is viticulturally the
 * same moment. Observed anchors never round-trip through here — they are returned verbatim — so
 * this only ever affects an already-estimated value.
 */
export function fromCoordinate(coord: number): { stage: PhenoStage; stagePct: number | null } {
  const c = Math.min(Math.max(coord, 0), LAST_INDEX);
  const idx = Math.min(Math.floor(c + 1e-9), LAST_INDEX);
  const stage = PHENO_STAGES[idx];
  if (!phenoStageUsesPct(stage)) return { stage, stagePct: null };
  const raw = (c - idx) * 100;
  let best = PHENO_PCT_OPTIONS[0] as number;
  for (const opt of PHENO_PCT_OPTIONS) {
    if (Math.abs(opt - raw) < Math.abs(best - raw)) best = opt;
  }
  return { stage, stagePct: best };
}

/** The modeled ladder, linearly interpolated. Clamps at both ends; never advances past HARVEST. */
export function ladderCoordinate(gddSinceBiofix: number): number {
  const first = MODELED_LADDER[0];
  const last = MODELED_LADDER[MODELED_LADDER.length - 1];
  if (gddSinceBiofix <= first.gdd) return first.coord;
  if (gddSinceBiofix >= last.gdd) return last.coord;
  for (let i = 1; i < MODELED_LADDER.length; i++) {
    const a = MODELED_LADDER[i - 1];
    const b = MODELED_LADDER[i];
    if (gddSinceBiofix <= b.gdd) {
      const t = (gddSinceBiofix - a.gdd) / (b.gdd - a.gdd);
      return a.coord + t * (b.coord - a.coord);
    }
  }
  return last.coord;
}

// ───────────────────────── Public shapes ─────────────────────────

/** One observed stage reading from a field note. */
export type PhenologyAnchor = {
  date: string; // ISO YYYY-MM-DD, vineyard-local civil day
  stage: PhenoStage;
  stagePct: number | null;
};

/** Rule §3.5: two states is not enough. "Interpolated between two real anchors" is materially
 *  stronger than "extrapolated past the last one", and a grower is entitled to know which. */
export type PhenologySource = "OBSERVED" | "INTERPOLATED" | "MODELED";

/** Machine-readable refusal codes — the UI/assistant renders the human `reason` beside them. */
export type PhenologyRefusalCode =
  | "NO_BIOFIX"
  | "NO_ANCHOR"
  | "ANCHOR_TOO_OLD"
  | "INCOMPLETE_WEATHER"
  | "FUTURE_TARGET"
  | "NO_GDD_SPAN";

export type PhenologyEstimate = {
  /** null means CANNOT DETERMINE. It is a first-class outcome, never an error and never a default. */
  stage: PhenoStage | null;
  stagePct: number | null;
  source: PhenologySource | null;
  /** The observation this answer leans on — the thing that makes `anchorAgeDays` meaningful. */
  anchorDate: string | null;
  anchorAgeDays: number | null;
  biofixDate: string | null;
  gddSinceBiofix: number | null;
  /** Days that actually contributed GDD — the honesty counter, gaps excluded. */
  daysCounted: number;
  confidence: "HIGH" | "MEDIUM" | "LOW" | null;
  reasonCode: PhenologyRefusalCode | null;
  /** Always populated on a refusal; a plain sentence a grower can act on. */
  reason: string | null;
  /** Weather coverage of the biofix→target span this answer depends on. */
  spanCompleteness: number | null;
  /** The calendar-season denominator, for context only — never the gate (council C9). */
  seasonCompletenessFraction: number | null;
};

export type PhenologyStageInput = {
  /** Observed stages from field notes. Any order; deduped by date, latest wins. */
  anchors: PhenologyAnchor[];
  /** Vineyard-local daily weather. Only temps are read. */
  dailyRecords: LocalDailyRecord[];
  latitude: number;
  /** The civil day the question is about. */
  targetDate: string;
  /** Site-local today, resolved by the caller via siteTodayIso — never `new Date()` in here. */
  today?: string;
};

// ───────────────────────── Internals ─────────────────────────

function refuse(
  code: PhenologyRefusalCode,
  reason: string,
  partial: Partial<PhenologyEstimate> = {},
): PhenologyEstimate {
  return {
    stage: null,
    stagePct: null,
    source: null,
    anchorDate: null,
    anchorAgeDays: null,
    biofixDate: null,
    gddSinceBiofix: null,
    daysCounted: 0,
    confidence: null,
    reasonCode: code,
    reason,
    spanCompleteness: null,
    seasonCompletenessFraction: null,
    ...partial,
  };
}

/** Inclusive day count minus one — how many days apart two civil days are. */
function daysBetween(fromIso: string, toIso: string): number {
  return windowDayCount(fromIso, toIso) - 1;
}

type GddCurve = {
  /** Cumulative GDD from the biofix through each observed day, in ascending date order. */
  points: { date: string; cumulative: number }[];
  daysCounted: number;
  daysWithTemps: number;
  lastObservedDate: string | null;
};

/**
 * Accumulate GDD forward from the biofix. A day with a missing temp contributes NOTHING and is
 * not counted — never treated as zero GDD, which would flatten the curve and under-state stage.
 */
function buildGddCurve(
  records: LocalDailyRecord[],
  biofixDate: string,
  throughDate: string,
): GddCurve {
  const sorted = [...records].sort((a, b) => (a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0));
  const points: { date: string; cumulative: number }[] = [];
  let cumulative = 0;
  let daysCounted = 0;
  let daysWithTemps = 0;
  for (const r of sorted) {
    if (r.localDate < biofixDate || r.localDate > throughDate) continue;
    const g = dailyGdd(r.tmaxC, r.tminC, PHENOLOGY_GDD_OPTIONS);
    if (g !== null) {
      cumulative += g;
      daysCounted += 1;
      daysWithTemps += 1;
    }
    points.push({ date: r.localDate, cumulative });
  }
  // The last day weather exists for AT ALL — taken across the whole series, not the truncated
  // window, because "is this target in the future?" is a question about the data we hold, not
  // about the span we happened to accumulate over.
  const lastObservedDate = sorted.length ? sorted[sorted.length - 1].localDate : null;
  return { points, daysCounted, daysWithTemps, lastObservedDate };
}

/** Cumulative GDD at a date: the running total as of the latest observed day at or before it. */
function gddAt(curve: GddCurve, date: string): number {
  let out = 0;
  for (const p of curve.points) {
    if (p.date > date) break;
    out = p.cumulative;
  }
  return out;
}

// ───────────────────────── The core ─────────────────────────

/**
 * Estimate a block's phenological stage on `targetDate`, or refuse.
 *
 * Provenance ladder:
 *   a field note ON the target date              → OBSERVED
 *   target BETWEEN two anchors                   → INTERPOLATED (GDD-proportional)
 *   target AFTER the last anchor                 → MODELED (generic ladder, delta only)
 *   no biofix · no anchor · anchor past the phase horizon · weather gap · future target
 *                                                → stage null + a reason (CANNOT DETERMINE)
 */
export function estimatePhenologyStageCore(input: PhenologyStageInput): PhenologyEstimate {
  const { dailyRecords, latitude, targetDate } = input;

  // Dedupe anchors by date (a re-saved report wins) and sort ascending.
  const byDate = new Map<string, PhenologyAnchor>();
  for (const a of input.anchors) byDate.set(a.date, a);
  const anchors = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // ── Refusal 1: the biofix (D11 / council C9) ────────────────────────────────────────────────
  // The LATEST bud-break observation at or before the target. Not the calendar window — that
  // window is Northern-Hemisphere-shaped and would silently truncate the live Bhutan tenant.
  const biofix = [...anchors]
    .reverse()
    .find((a) => a.stage === "BUD_BREAK" && a.date <= targetDate);
  if (!biofix) {
    return refuse(
      "NO_BIOFIX",
      "No bud-break observation for this block, so there is no point to accumulate growing degree days from. Record the date bud break was seen and the estimate becomes available.",
    );
  }
  const biofixAge = daysBetween(biofix.date, targetDate);
  if (biofixAge > MAX_BIOFIX_AGE_DAYS) {
    return refuse(
      "NO_BIOFIX",
      `The most recent bud-break observation is ${biofixAge} days old, which is last season's, not this one's. Record this season's bud break.`,
      { biofixDate: biofix.date },
    );
  }

  // ── Refusal 2: a future target (council S5) ─────────────────────────────────────────────────
  // Nothing in the app reads forecast GDD yet, and S4 will not be the first to guess.
  const curve = buildGddCurve(dailyRecords, biofix.date, targetDate);
  if (curve.lastObservedDate === null) {
    return refuse("INCOMPLETE_WEATHER", "No weather has been recorded for this vineyard yet.", {
      biofixDate: biofix.date,
    });
  }
  if (targetDate > curve.lastObservedDate) {
    return refuse(
      "FUTURE_TARGET",
      `Weather is only recorded through ${curve.lastObservedDate}, so a stage for ${targetDate} would be a forecast. Forecast-driven phenology is not built yet.`,
      { biofixDate: biofix.date },
    );
  }

  // ── Refusal 3: weather coverage of the span this answer actually depends on (council C4) ────
  // Capped at the target date, NOT at today. A question about June 15 must not be refused because
  // July weather is missing — that is a refusal on data irrelevant to the question asked.
  const spanDays = windowDayCount(biofix.date, targetDate);
  const spanCompleteness = spanDays === 0 ? 0 : curve.daysWithTemps / spanDays;
  const seasonFraction = seasonCompleteness(
    dailyRecords,
    latitude,
    seasonYearFor(latitude, targetDate),
    input.today && input.today < targetDate ? input.today : targetDate,
  ).fraction;
  if (spanCompleteness < MIN_SPAN_COMPLETENESS) {
    return refuse(
      "INCOMPLETE_WEATHER",
      `Only ${Math.round(spanCompleteness * 100)}% of the days between bud break and ${targetDate} have temperature data, so the degree-day total this estimate rests on is incomplete.`,
      { biofixDate: biofix.date, spanCompleteness, seasonCompletenessFraction: seasonFraction },
    );
  }

  const gddTarget = Math.round(gddAt(curve, targetDate) * 100) / 100;
  const base = {
    biofixDate: biofix.date,
    gddSinceBiofix: gddTarget,
    daysCounted: curve.daysCounted,
    spanCompleteness,
    seasonCompletenessFraction: seasonFraction,
    reasonCode: null,
    reason: null,
  };

  // ── OBSERVED ────────────────────────────────────────────────────────────────────────────────
  // Returned VERBATIM, never round-tripped through the coordinate, so a real reading is never
  // perturbed by quantization.
  const onDate = anchors.find((a) => a.date === targetDate);
  if (onDate) {
    return {
      ...base,
      stage: onDate.stage,
      stagePct: phenoStageUsesPct(onDate.stage) ? onDate.stagePct : null,
      source: "OBSERVED",
      anchorDate: onDate.date,
      anchorAgeDays: 0,
      confidence: "HIGH",
    };
  }

  const before = [...anchors].reverse().find((a) => a.date < targetDate);
  const after = anchors.find((a) => a.date > targetDate);

  // ── Refusal 4: nothing observed at or before the target ─────────────────────────────────────
  if (!before) {
    return refuse(
      "NO_ANCHOR",
      `No field observation for this block on or before ${targetDate}, so there is nothing to estimate from.`,
      { biofixDate: biofix.date, spanCompleteness, seasonCompletenessFraction: seasonFraction },
    );
  }
  const anchorAgeDays = daysBetween(before.date, targetDate);

  // ── INTERPOLATED: the target sits between two real observations ─────────────────────────────
  if (after) {
    const gddA = gddAt(curve, before.date);
    // The later anchor may sit past `targetDate`, so its cumulative GDD needs its own curve.
    const fullCurve = buildGddCurve(dailyRecords, biofix.date, after.date);
    const gddB = gddAt(fullCurve, after.date);
    if (gddB <= gddA) {
      // No heat accumulated between the two observations, so GDD cannot place the target between
      // them. Falling back to the earlier anchor would UNDER-state the stage, and under-stating
      // stage reads as "no fruit present" — which would let an interlock clear a spray it should
      // block. Refusing is the honest answer and the safe one.
      return refuse(
        "NO_GDD_SPAN",
        `No growing degree days accumulated between ${before.date} and ${after.date}, so the stage on ${targetDate} cannot be placed between those two observations.`,
        { biofixDate: biofix.date, spanCompleteness, seasonCompletenessFraction: seasonFraction },
      );
    }
    const t = Math.min(Math.max((gddTarget - gddA) / (gddB - gddA), 0), 1);
    const coordA = toCoordinate(before.stage, before.stagePct);
    const coordB = toCoordinate(after.stage, after.stagePct);
    const quantized = fromCoordinate(coordA + t * (coordB - coordA));
    return {
      ...base,
      stage: quantized.stage,
      stagePct: quantized.stagePct,
      source: "INTERPOLATED",
      anchorDate: before.date,
      anchorAgeDays,
      confidence: "MEDIUM",
    };
  }

  // ── Refusal 5: the last observation is past the phase-scaled horizon (council DQ3) ──────────
  const horizon = PHASE_HORIZON_DAYS[before.stage];
  if (anchorAgeDays > horizon) {
    return refuse(
      "ANCHOR_TOO_OLD",
      `The last observation for this block was ${anchorAgeDays} days ago at ${before.stage.toLowerCase().replace("_", " ")}, past the ${horizon}-day limit for that phase. Walk the block and record what you see.`,
      {
        biofixDate: biofix.date,
        anchorDate: before.date,
        anchorAgeDays,
        spanCompleteness,
        seasonCompletenessFraction: seasonFraction,
      },
    );
  }

  // ── MODELED: project past the last observation ──────────────────────────────────────────────
  // The ladder supplies only the ADVANCE since the last anchor; the anchor itself stays the
  // truth. Clamped so the projection can never walk BACKWARD from something a human saw.
  const gddAtAnchor = gddAt(curve, before.date);
  const advance = ladderCoordinate(gddTarget) - ladderCoordinate(gddAtAnchor);
  const coordFrom = toCoordinate(before.stage, before.stagePct);
  const quantized = fromCoordinate(coordFrom + Math.max(advance, 0));
  return {
    ...base,
    stage: quantized.stage,
    stagePct: quantized.stagePct,
    source: "MODELED",
    anchorDate: before.date,
    anchorAgeDays,
    confidence: "LOW",
  };
}
