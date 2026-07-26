// VI-P8 council R3/R14 — pick the primary, compose the read-time gap-filled series, compute the spread.
// NEVER blend: the summary + assistant speak in ONE primary source; gap-fill is a READ-TIME composition
// (stamped on the DTO, never a stored row); the spread is the only ensemble output and is a range, never an
// average. `effectivePrimary` = override ?? resolvedDefault, used by BOTH ingest and every read so they agree.
// Pure.

import type { LocalDailyRecord } from "./obs-time-core";
import type { ProviderKey } from "./providers/types";

const STATION_MAX_DISTANCE_M = 16_093; // ~10 miles — beyond this a grid is the better primary.

export interface PrimaryCandidate {
  providerKey: ProviderKey;
  kind: "grid" | "station";
  stationDistanceM: number | null;
  stationElevationDeltaM: number | null; // |station − site| elevation
  completeness: number; // [0,1] daily completeness over the window
}

/** The stored choice: a resolved default + an optional grower override. */
export interface WeatherConfigLike {
  primaryProviderKey: ProviderKey | string;
  primaryProviderOverride?: ProviderKey | string | null;
}

/** effectivePrimary = override ?? resolvedDefault. The ONE helper ingest and reads both use (R14). */
export function effectivePrimary(config: WeatherConfigLike): string {
  return config.primaryProviderOverride ?? config.primaryProviderKey;
}

/**
 * Rank candidates and choose the default primary. Prefer the closest quality station within ~10 mi, breaking
 * ties by smaller elevation delta then higher completeness; fall back to the most complete grid when no
 * station qualifies. Pure — the grower override is applied separately via effectivePrimary.
 */
export function selectPrimaryCore(candidates: PrimaryCandidate[]): ProviderKey | null {
  if (candidates.length === 0) return null;
  // A source with NO usable data (completeness 0 — e.g. a nearby station that reports only precip, or no
  // recent daily temps) must never be primary; the headline would read 0. Prefer sources with data.
  const withData = candidates.filter((c) => c.completeness > 0);
  const eligible = withData.length > 0 ? withData : candidates;
  const stations = eligible.filter(
    (c) => c.kind === "station" && c.stationDistanceM !== null && c.stationDistanceM <= STATION_MAX_DISTANCE_M,
  );
  const pool = stations.length > 0 ? stations : eligible.filter((c) => c.kind === "grid");
  const ranked = (pool.length > 0 ? pool : eligible).slice().sort((a, b) => {
    const da = a.stationDistanceM ?? Number.POSITIVE_INFINITY;
    const db = b.stationDistanceM ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    const ea = a.stationElevationDeltaM ?? Number.POSITIVE_INFINITY;
    const eb = b.stationElevationDeltaM ?? Number.POSITIVE_INFINITY;
    if (ea !== eb) return ea - eb;
    return b.completeness - a.completeness;
  });
  return ranked[0]?.providerKey ?? null;
}

/** A read-time composed daily record: a primary value, or a fallback value stamped with its source. */
export interface ComposedDailyRecord extends LocalDailyRecord {
  filledFromProvider: ProviderKey | null; // null = native primary; set = gap-filled on read (NOT a DB column)
}

/**
 * Compose the primary series, filling ONLY localDates absent from the primary using the fallback provider's
 * rows, stamping each filled entry. Returns an in-memory DTO series — writes NOTHING (council confirmatory
 * gate: the stored per-provider rows stay pure single-source). Present primary days are never overwritten.
 */
export function gapFillCore(
  primary: LocalDailyRecord[],
  fallback: LocalDailyRecord[],
  fallbackProviderKey: ProviderKey,
): ComposedDailyRecord[] {
  const byDate = new Map<string, ComposedDailyRecord>();
  for (const r of primary) byDate.set(r.localDate, { ...r, filledFromProvider: null });
  for (const r of fallback) {
    if (!byDate.has(r.localDate)) byDate.set(r.localDate, { ...r, filledFromProvider: fallbackProviderKey });
  }
  return [...byDate.values()].sort((a, b) => (a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0));
}

export interface Spread {
  min: number;
  max: number;
  range: number;
  /** Sources contributing to the spread (their labels), for the "compare sources" view. */
  sources: string[];
  /** Coarse agreement flag: range within `tightBand` of the values → sources broadly agree. */
  tightAgreement: boolean;
}

/**
 * The ONLY ensemble output: a range across per-source values, never an average. `assertNeverBlended` guards
 * against a mean sneaking in "to be helpful".
 */
export function computeSpreadCore(
  perSource: Array<{ source: string; value: number }>,
  tightBand = 100,
): Spread | null {
  if (perSource.length === 0) return null;
  const values = perSource.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.round((max - min) * 100) / 100;
  return { min, max, range, sources: perSource.map((p) => p.source), tightAgreement: range <= tightBand };
}

/**
 * Contract guard (used by the never-blend test): a headline/summary payload must carry a single-source number
 * and its provenance, NOT a blended `mean`/`average`/`blended` field. Throws if one is present.
 */
export function assertNeverBlended(payload: Record<string, unknown>): void {
  for (const banned of ["mean", "average", "avg", "blended", "ensembleMean"]) {
    if (banned in payload) {
      throw new Error(`assertNeverBlended: forbidden blended field "${banned}" in a headline payload`);
    }
  }
}
