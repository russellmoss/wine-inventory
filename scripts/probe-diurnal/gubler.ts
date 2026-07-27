// S5a Unit 0 probe — the Gubler-Thomas Phase-2 conidial risk index, run IDENTICALLY over the
// observed-station arm and each reconstruction arm. Any difference between arms is therefore
// attributable to the reconstruction and nothing else. This is the probe's whole point.
//
// Rules (UC IPM guideline form; plan §1.1):
//   >= 6 CONSECUTIVE hours in 21-30 C ............ +20
//   <  6 consecutive hours in that band .......... -10
//   reached 35 C for more than 15 minutes ........ -10
//   both of the above ............................ +10   (UC IPM sequential: +20 then -10)
// Bounds 0-100. Max daily change +20 / -10.
// Season init: three consecutive qualifying days (+20 each) reach 60; a break before 60 resets to
// 0; once 60 is reached the 3-day rule retires permanently.
//
// AMBIGUITIES RESOLVED DELIBERATELY (plan §1.1):
//  1. "6 hours" read as CONSECUTIVE (stricter reading; UC IPM + every operational implementation).
//  2. Both conditions on one day = +10 (UC IPM sequential), not -10 (Gubler 1999 prose).
//  3. Work in Celsius. 21-30 C is NOT 70-85 F; 85 F = 29.4 C. The 0.6 C gap sits exactly on the
//     band edge where the reconstruction's late-afternoon warm bias lives, so it must not be
//     papered over by working in Fahrenheit.
//
// THE 15-MINUTE PROBLEM, and note it bites the ORACLE too: hourly METAR cannot resolve a
// 15-minute excursion any more than a fitted curve can. The observed arm therefore uses
// "any hourly observation >= 35 C" as its heat proxy. This is reported as a probe limitation,
// not silently treated as truth.

export const BAND_LOW_C = 21;
export const BAND_HIGH_C = 30;
export const HEAT_THRESHOLD_C = 35;
export const MIN_CONSECUTIVE_HOURS = 6;

export const POINTS_QUALIFYING = 20;
export const POINTS_NOT_QUALIFYING = -10;
export const POINTS_QUALIFYING_WITH_HEAT = 10;

export const INDEX_MIN = 0;
export const INDEX_MAX = 100;
export const EPIDEMIC_THRESHOLD = 60;

export interface DayHours {
  localDate: string;
  /** Temperature by local hour 0..23; a missing hour is absent from the map. */
  byHour: Map<number, number>;
}

/** Longest run of CONSECUTIVE clock hours whose temperature sits inside [low, high]. */
export function maxConsecutiveInBand(byHour: Map<number, number>, low = BAND_LOW_C, high = BAND_HIGH_C): number {
  let best = 0;
  let run = 0;
  for (let h = 0; h < 24; h++) {
    const t = byHour.get(h);
    if (t !== undefined && t >= low && t <= high) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

/** True when any hourly sample reached the heat threshold. See the 15-minute caveat above. */
export function heatObserved(byHour: Map<number, number>, threshold = HEAT_THRESHOLD_C): boolean {
  for (const t of byHour.values()) if (t >= threshold) return true;
  return false;
}

export interface DayVerdict {
  localDate: string;
  /** null = not enough hours to decide (refusal, never 0). */
  points: number | null;
  consecutiveHours: number | null;
  qualifying: boolean | null;
  heat: boolean | null;
  hoursPresent: number;
}

/**
 * A day is decidable when we have a full-enough hourly picture. A gap can BREAK a run of six as
 * easily as it can hide one, so the oracle is held to a strict bar: at most 2 of 24 hours missing.
 * The reconstruction arm is analytic and always has all 24, so this only ever bites the station
 * arm — which is correct. An oracle with holes in it is not an oracle.
 */
export const MAX_MISSING_HOURS = 2;

export function scoreDay(day: DayHours): DayVerdict {
  const hoursPresent = day.byHour.size;
  if (hoursPresent < 24 - MAX_MISSING_HOURS) {
    return {
      localDate: day.localDate,
      points: null,
      consecutiveHours: null,
      qualifying: null,
      heat: null,
      hoursPresent,
    };
  }
  const consecutiveHours = maxConsecutiveInBand(day.byHour);
  const qualifying = consecutiveHours >= MIN_CONSECUTIVE_HOURS;
  const heat = heatObserved(day.byHour);
  const points = qualifying ? (heat ? POINTS_QUALIFYING_WITH_HEAT : POINTS_QUALIFYING) : POINTS_NOT_QUALIFYING;
  return { localDate: day.localDate, points, consecutiveHours, qualifying, heat, hoursPresent };
}

export type PressureBand = "low" | "intermediate" | "high";

/**
 * The decision the grower actually makes. Index 0-30 low / 40-50 intermediate / 60+ high in the
 * published table; the gaps (31-39, 51-59) are assigned to the LOWER-risk-adjacent row's successor
 * so the mapping is total, and the 60 boundary — the one that matters — is exact.
 */
export function pressureBand(index: number): PressureBand {
  if (index >= EPIDEMIC_THRESHOLD) return "high";
  if (index >= 40) return "intermediate";
  return "low";
}

export interface SeasonPoint {
  localDate: string;
  index: number | null;
  band: PressureBand | null;
  points: number | null;
}

/**
 * Run the season accumulator over ordered day verdicts.
 * `bridgeMissing` implements the plan's missing-day rule (council C11): a SINGLE undecidable day
 * carries the previous state forward; two or more consecutive undecidable days go to `null`
 * (unknown) and break any pre-60 streak.
 */
export function runSeason(verdicts: DayVerdict[]): SeasonPoint[] {
  let index = 0;
  let streak = 0;
  let retired = false; // once 60 is reached the 3-day reset rule retires permanently
  let missingRun = 0;
  let live = true; // false once we have gone unknown and not yet recovered

  const out: SeasonPoint[] = [];
  for (const v of verdicts) {
    if (v.points === null) {
      missingRun += 1;
      if (missingRun >= 2) {
        live = false;
        streak = 0;
        out.push({ localDate: v.localDate, index: null, band: null, points: null });
        continue;
      }
      // Single missing day: carry state. Confidence degradation is the caller's business.
      out.push({ localDate: v.localDate, index: live ? index : null, band: live ? pressureBand(index) : null, points: null });
      continue;
    }
    missingRun = 0;
    if (!live) {
      // Recovering from an unknown stretch: resume accumulating from the carried index.
      live = true;
    }

    if (!retired) {
      if (v.qualifying) {
        streak += 1;
        index = Math.min(INDEX_MAX, index + POINTS_QUALIFYING);
      } else {
        streak = 0;
        index = 0; // pre-60 break resets to zero
      }
      if (index >= EPIDEMIC_THRESHOLD) retired = true;
    } else {
      index = Math.max(INDEX_MIN, Math.min(INDEX_MAX, index + v.points));
    }
    out.push({ localDate: v.localDate, index, band: pressureBand(index), points: v.points });
  }
  return out;
}

// ── Peduto et al. 2013 heat term — MEASURED ONLY, never shipped (KD-2) ──
// Plant Disease 97:1438-1447, DOI 10.1094/PDIS-01-13-0039-RE. Thresholds are multi-hour and so ARE
// computable from a reconstructed curve, unlike the 1999 rule's 15-minute criterion. The probe
// reports what adopting them would have changed; the index itself keeps the 1999 form, because the
// 60-point epidemic threshold was validated against the ORIGINAL point logic.
export const PEDUTO_RULES = [
  { thresholdC: 34, hours: 4 },
  { thresholdC: 36, hours: 4 },
  { thresholdC: 38, hours: 2 },
] as const;

export function pedutoHeatSuppression(byHour: Map<number, number>): boolean {
  for (const rule of PEDUTO_RULES) {
    let count = 0;
    for (const t of byHour.values()) if (t >= rule.thresholdC) count += 1;
    if (count >= rule.hours) return true;
  }
  return false;
}
