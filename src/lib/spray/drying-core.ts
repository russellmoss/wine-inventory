// Spray Intelligence S3a — driedBeforeRain, DERIVED, never self-reported (council S3 / KD-2).
// Pure: precipitation arrives as data (the future S1 adapter implements PrecipitationSeriesPort;
// S3a ships the null port), so the derivation is fully proven against committed fixtures before
// any weather lane exists. With no series the honest answer is null + INSUFFICIENT_DATA — the
// S3a default. The human correction path is its own append-only table (spray_drying_override),
// folded here by resolveDriedBeforeRain with attribution (rule §3.5).

import type { SprayDriedBasis, SprayDryingOverrideRow } from "./types";

/** Most protectant labels want 1–2 h to dry (brief §4.2). A documented agronomic heuristic —
 * surfaced as such, overridable per material once S2b supplies a real rainfast period. */
export const DEFAULT_REQUIRED_DRYING_MINUTES = 120;

export interface HourlyPrecipPoint {
  hourStart: Date;
  precipMm: number;
}

/** The injected seam S1 will implement (same pattern as KD-3). Null = no series available. */
export interface PrecipitationSeriesPort {
  hourlyPrecipMm(range: { start: Date; end: Date }): Promise<HourlyPrecipPoint[] | null>;
}

/** The S3a default: no precipitation series exists yet. */
export const NullPrecipitationSeriesPort: PrecipitationSeriesPort = {
  async hourlyPrecipMm() {
    return null;
  },
};

export interface DriedBeforeRainResult {
  value: boolean | null;
  basis: SprayDriedBasis;
}

/**
 * Did the spray dry before rain hit it? True only when the series COVERS the drying window and
 * shows no rain in it; false when rain fell inside the window; null + INSUFFICIENT_DATA when
 * there is no series or it does not cover the window. Never a guess.
 */
export function deriveDriedBeforeRain(args: {
  finishedAt: Date | null;
  requiredDryingMinutes?: number;
  hourlyPrecip: HourlyPrecipPoint[] | null;
}): DriedBeforeRainResult {
  const { finishedAt, hourlyPrecip } = args;
  const requiredMinutes = args.requiredDryingMinutes ?? DEFAULT_REQUIRED_DRYING_MINUTES;
  if (finishedAt == null || hourlyPrecip == null || hourlyPrecip.length === 0) {
    return { value: null, basis: "INSUFFICIENT_DATA" };
  }
  const windowStart = finishedAt.getTime();
  const windowEnd = windowStart + requiredMinutes * 60_000;

  // Coverage check: every hour bucket intersecting the window must be present, or we cannot know.
  const HOUR = 3600_000;
  const firstBucket = Math.floor(windowStart / HOUR) * HOUR;
  const buckets = new Map(hourlyPrecip.map((p) => [p.hourStart.getTime(), p.precipMm]));
  for (let t = firstBucket; t < windowEnd; t += HOUR) {
    if (!buckets.has(t)) return { value: null, basis: "INSUFFICIENT_DATA" };
  }

  for (let t = firstBucket; t < windowEnd; t += HOUR) {
    const mm = buckets.get(t)!;
    if (mm > 0) return { value: false, basis: "HOURLY_PRECIP" };
  }
  return { value: true, basis: "NO_RAIN_IN_WINDOW" };
}

export type ResolvedDrying =
  | { value: boolean; source: "OVERRIDE"; attribution: { email: string; at: Date; reason: string } }
  | { value: boolean; source: "DERIVED"; basis: SprayDriedBasis }
  | { value: null; source: "UNKNOWN"; reason: string };

/**
 * Fold override-over-derived-over-unknown, carrying attribution so S6/S9 can say WHO said so
 * (rule §3.5). The latest override by (enteredAt, id) wins; the whole history is retained.
 */
export function resolveDriedBeforeRain(
  blockLine: { driedBeforeRainDerived: boolean | null; driedBeforeRainBasis: SprayDriedBasis | null },
  overrides: SprayDryingOverrideRow[],
): ResolvedDrying {
  if (overrides.length > 0) {
    const latest = [...overrides].sort((a, b) => {
      const dt = a.enteredAt.getTime() - b.enteredAt.getTime();
      return dt !== 0 ? dt : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })[overrides.length - 1];
    return {
      value: latest.value,
      source: "OVERRIDE",
      attribution: { email: latest.enteredByEmail, at: latest.enteredAt, reason: latest.reason },
    };
  }
  if (blockLine.driedBeforeRainDerived != null && blockLine.driedBeforeRainBasis != null) {
    return { value: blockLine.driedBeforeRainDerived, source: "DERIVED", basis: blockLine.driedBeforeRainBasis };
  }
  return { value: null, source: "UNKNOWN", reason: "Drying before rain has not been determined — no derivation and no operator observation." };
}
