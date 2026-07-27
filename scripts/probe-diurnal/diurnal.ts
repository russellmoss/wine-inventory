// S5a Unit 0 probe — daily Tmin/Tmax -> hourly temperature reconstruction.
//
// PRIMARY SOURCE, quoted so the implementation can be audited without the paper:
//   Felber R., Stoeckli S., Calanca P. (2018) "Generic calibration of a simple model of diurnal
//   temperature variations for spatial analysis of accumulated degree-days."
//   Int. J. Biometeorol. 62:621-630. DOI 10.1007/s00484-017-1471-5 (open access).
//
// Eq. 1a  (night before sunrise, h < hR,i + c):
//   T = Tn,i + (TS,i-1 - Tn,i) * [ e^(-b*(h - hS,i-1 + 24)/n1) - ((h - hS,i-1 + 24)/n1) * e^(-b) ]
// Eq. 1b  (day, hR,i + c <= h <= hS,i):
//   T = Tn,i + (Tx,i - Tn,i) * sin( pi * (h - hR,i - c) / (hS,i - hR,i + 2a - 2c) )
// Eq. 1c  (night after sunset, h > hS,i):
//   T = Tn,i+1 + (TS,i - Tn,i+1) * [ e^(-b*(h - hS,i)/n2) - ((h - hS,i)/n2) * e^(-b) ]
// with n1 = hR,i - hS,i-1 + c + 24 and n2 = hR,i+1 - hS,i + c + 24.
//
// Generic parameters (Table 2): a = 2.71 (lag of Tx from noon), b = 3.14 (night decay),
// c = 0.75 (lag of Tn from sunrise).
//
// The `- (x/n) * e^(-b)` term is what makes the night branch land exactly on the next Tn, so the
// series is continuous across midnight AND forced through both daily extremes. Plain Parton-Logan
// has a documented discontinuity here — that is why the plan chose this variant.
//
// STRUCTURAL CONSEQUENCE, and it matters for refusal: reconstructing day i needs day i-1 (its
// sunset temperature) and day i+1 (its Tmin). The first and last day of any series are therefore
// NOT reconstructable. That is a refusal, not a zero.

import { sunTimes } from "./solar";

export const FELBER_A = 2.71;
export const FELBER_B = 3.14;
export const FELBER_C = 0.75;

export interface DailyExtremes {
  localDate: string;
  tminC: number | null;
  tmaxC: number | null;
}

export interface HourlyPoint {
  localDate: string;
  hour: number; // 0..23 local
  tempC: number;
}

export type EstimatorKey = "felber2018" | "sanders_sawtooth";

interface DayGeom {
  sunrise: number;
  sunset: number;
}

/** Sunset temperature on day i, from Eq. 1b evaluated at h = hS,i. */
function sunsetTemp(tmin: number, tmax: number, g: DayGeom, a: number, c: number): number {
  const denom = g.sunset - g.sunrise + 2 * a - 2 * c;
  if (denom <= 0) return tmax;
  return tmin + (tmax - tmin) * Math.sin((Math.PI * (g.sunset - g.sunrise - c)) / denom);
}

/**
 * Felber et al. 2018 reconstruction over a contiguous daily series.
 * Days whose neighbours or own extremes are missing yield NO hours (refusal, never a guess).
 */
export function reconstructFelber(
  days: DailyExtremes[],
  latDeg: number,
  lonDeg: number,
  utcOffsetHours: number,
  opts: { a?: number; b?: number; c?: number; monthlyBiasC?: Map<number, number> } = {},
): HourlyPoint[] {
  const a = opts.a ?? FELBER_A;
  const b = opts.b ?? FELBER_B;
  const c = opts.c ?? FELBER_C;

  const geom = new Map<string, DayGeom>();
  for (const d of days) {
    const s = sunTimes(d.localDate, latDeg, lonDeg, utcOffsetHours);
    geom.set(d.localDate, { sunrise: s.sunrise, sunset: s.sunset });
  }

  const out: HourlyPoint[] = [];
  for (let i = 1; i < days.length - 1; i++) {
    const prev = days[i - 1];
    const cur = days[i];
    const next = days[i + 1];
    if (cur.tminC === null || cur.tmaxC === null) continue;
    if (prev.tminC === null || prev.tmaxC === null) continue;
    if (next.tminC === null) continue;

    const gPrev = geom.get(prev.localDate)!;
    const gCur = geom.get(cur.localDate)!;
    const gNext = geom.get(next.localDate)!;

    const tsPrev = sunsetTemp(prev.tminC, prev.tmaxC, gPrev, a, c);
    const tsCur = sunsetTemp(cur.tminC, cur.tmaxC, gCur, a, c);

    const n1 = gCur.sunrise - gPrev.sunset + c + 24;
    const n2 = gNext.sunrise - gCur.sunset + c + 24;
    const dayDenom = gCur.sunset - gCur.sunrise + 2 * a - 2 * c;

    for (let h = 0; h < 24; h++) {
      let t: number;
      if (h < gCur.sunrise + c) {
        // Eq. 1a — decay from the PREVIOUS sunset temperature toward this morning's Tmin.
        const x = (h - gPrev.sunset + 24) / n1;
        t = cur.tminC + (tsPrev - cur.tminC) * (Math.exp(-b * x) - x * Math.exp(-b));
      } else if (h <= gCur.sunset) {
        // Eq. 1b — the daytime sine.
        if (dayDenom <= 0) continue;
        t = cur.tminC + (cur.tmaxC - cur.tminC) * Math.sin((Math.PI * (h - gCur.sunrise - c)) / dayDenom);
      } else {
        // Eq. 1c — decay from this sunset toward TOMORROW's Tmin.
        const x = (h - gCur.sunset) / n2;
        t = next.tminC + (tsCur - next.tminC) * (Math.exp(-b * x) - x * Math.exp(-b));
      }
      if (!Number.isFinite(t)) continue;
      const bias = opts.monthlyBiasC?.get(Number(cur.localDate.slice(5, 7))) ?? 0;
      out.push({ localDate: cur.localDate, hour: h, tempC: t - bias });
    }
  }
  return out;
}

/**
 * Sanders-style sawtooth — the honest control. Reicosky et al. 1989 found the simple methods did
 * about as well as the sophisticated ones, so a baseline that beats Felber is a real result, not a
 * bug. Linear rise Tmin(sunrise) -> Tmax(sunrise + 2/3 daylength), linear fall to next Tmin.
 */
export function reconstructSanders(
  days: DailyExtremes[],
  latDeg: number,
  lonDeg: number,
  utcOffsetHours: number,
): HourlyPoint[] {
  const geom = new Map<string, DayGeom>();
  for (const d of days) {
    const s = sunTimes(d.localDate, latDeg, lonDeg, utcOffsetHours);
    geom.set(d.localDate, { sunrise: s.sunrise, sunset: s.sunset });
  }

  const out: HourlyPoint[] = [];
  for (let i = 1; i < days.length - 1; i++) {
    const prev = days[i - 1];
    const cur = days[i];
    const next = days[i + 1];
    if (cur.tminC === null || cur.tmaxC === null) continue;
    if (prev.tmaxC === null || next.tminC === null) continue;

    const gCur = geom.get(cur.localDate)!;
    const gPrev = geom.get(prev.localDate)!;
    const peak = gCur.sunrise + (2 / 3) * (gCur.sunset - gCur.sunrise);

    for (let h = 0; h < 24; h++) {
      let t: number;
      if (h < gCur.sunrise) {
        // Falling limb carried over from yesterday's peak into this morning's Tmin.
        const peakPrev = gPrev.sunrise + (2 / 3) * (gPrev.sunset - gPrev.sunrise);
        const span = gCur.sunrise + 24 - peakPrev;
        const frac = span <= 0 ? 1 : (h + 24 - peakPrev) / span;
        t = prev.tmaxC + (cur.tminC - prev.tmaxC) * Math.min(1, Math.max(0, frac));
      } else if (h <= peak) {
        const span = peak - gCur.sunrise;
        const frac = span <= 0 ? 1 : (h - gCur.sunrise) / span;
        t = cur.tminC + (cur.tmaxC - cur.tminC) * frac;
      } else {
        const span = gCur.sunrise + 24 - peak;
        const frac = span <= 0 ? 1 : (h - peak) / span;
        t = cur.tmaxC + (next.tminC - cur.tmaxC) * Math.min(1, Math.max(0, frac));
      }
      if (!Number.isFinite(t)) continue;
      out.push({ localDate: cur.localDate, hour: h, tempC: t });
    }
  }
  return out;
}
