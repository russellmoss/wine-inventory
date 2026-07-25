/**
 * Vineyard Intelligence P2 — "around a date" scene selection (Unit 3, council C4).
 *
 * PURE ranking + window expansion; the STAC search is injected so this is fully testable offline with no
 * live provider. Cost discipline (the free tier binds on REQUESTS ~26× before PU): rank on FREE signals
 * first — footprint containment (reject edge-of-tile scenes that don't cover the AOI) then STAC
 * `eo:cloud_cover` — and only flag the ambiguous 10–40 % tile-cloud band for a 1-band SCL-over-AOI preflight
 * (a blanket per-candidate SCL fetch would double request-spend). The SELECTED scene's real per-block SCL
 * coverage is validated once, at processing time (Unit 4), which also auto-advances the top-3.
 */
import type { StacScene } from "./client";

export type SearchStacFn = (req: {
  bbox: readonly [number, number, number, number];
  fromIso: string;
  toIso: string;
  maxCloudCoveragePct?: number;
}) => Promise<StacScene[]>;

/** The ambiguous tile-cloud band where a scene MIGHT be usable over the AOI even if the tile is cloudy. */
export const SCL_PREFLIGHT_BAND = { minCloud: 10, maxCloud: 40 } as const;

/** Progressive ±day windows around the target date; widen only until a containing candidate appears. */
export const SEARCH_WINDOWS_DAYS = [7, 14, 30] as const;

export type SceneCandidate = {
  readonly providerSceneId: string;
  readonly acquiredAt: string | null;
  readonly cloudCover: number | null;
  readonly processingVersion: string | null;
  readonly bbox: [number, number, number, number] | null;
  /** Does the scene footprint fully cover the estate AOI? Non-containing = edge-of-tile, deprioritised. */
  readonly containsAoi: boolean;
  /** |acquired − requested| in whole days (null if the scene has no datetime). */
  readonly offsetDays: number | null;
  /** Tile cloud% is in the 10–40 % band → a 1-band SCL-over-AOI preflight is worth it before committing. */
  readonly needsSclPreflight: boolean;
};

/** PURE: does `outer` fully contain `inner` (both `[minLon, minLat, maxLon, maxLat]`)? */
export function bboxContains(outer: readonly [number, number, number, number], inner: readonly [number, number, number, number]): boolean {
  return outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];
}

/** PURE: whole-day gap between two ISO instants (null if either is missing). */
export function offsetDaysBetween(aIso: string | null, bIso: string): number | null {
  if (!aIso) return null;
  const a = Date.parse(aIso);
  const b = Date.parse(bIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round(Math.abs(a - b) / 86_400_000);
}

/** PURE: is a tile cloud% in the ambiguous preflight band? */
export function needsSclPreflight(cloudCover: number | null): boolean {
  return cloudCover !== null && cloudCover >= SCL_PREFLIGHT_BAND.minCloud && cloudCover <= SCL_PREFLIGHT_BAND.maxCloud;
}

/**
 * PURE: rank raw STAC scenes for an AOI + target date. Containing scenes first, then ascending tile cloud%
 * (nulls last), then smallest date offset. Non-containing (edge-of-tile) scenes are kept but sorted last so
 * the caller can surface WHY a look was withheld rather than silently dropping them.
 */
export function rankSceneCandidates(
  scenes: readonly StacScene[],
  aoiBbox: readonly [number, number, number, number],
  requestedIso: string,
): SceneCandidate[] {
  const candidates: SceneCandidate[] = scenes.map((s) => ({
    providerSceneId: s.id,
    acquiredAt: s.datetime,
    cloudCover: s.cloudCover,
    processingVersion: s.processingVersion,
    bbox: s.bbox,
    containsAoi: s.bbox ? bboxContains(s.bbox, aoiBbox) : false,
    offsetDays: offsetDaysBetween(s.datetime, requestedIso),
    needsSclPreflight: needsSclPreflight(s.cloudCover),
  }));
  const cloudKey = (c: SceneCandidate) => (c.cloudCover === null ? Number.POSITIVE_INFINITY : c.cloudCover);
  const offsetKey = (c: SceneCandidate) => (c.offsetDays === null ? Number.POSITIVE_INFINITY : c.offsetDays);
  return candidates.sort((a, b) => {
    if (a.containsAoi !== b.containsAoi) return a.containsAoi ? -1 : 1;
    if (cloudKey(a) !== cloudKey(b)) return cloudKey(a) - cloudKey(b);
    return offsetKey(a) - offsetKey(b);
  });
}

/** PURE: shift an ISO instant by ±days, returned as ISO. */
export function shiftIsoDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString();
}

export type SceneSearchResult = {
  readonly candidates: SceneCandidate[];
  /** The widest window (±days) that was searched. */
  readonly windowDays: number;
  /** No scene footprint covered the AOI at any window — every candidate is edge-of-tile. */
  readonly noContainingScene: boolean;
};

/**
 * Search STAC "around" a date, widening the window (±7 → ±14 → ±30) only until a CONTAINING candidate
 * appears. STAC is slow/flaky (56–220 s, intermittent 500s in P0), so this must run off any render path.
 * Never fabricates: an empty catalogue returns an empty candidate list.
 */
export async function searchScenesCore(input: {
  searchStac: SearchStacFn;
  aoiBbox: readonly [number, number, number, number];
  aroundIso: string;
  maxCloudCoveragePct?: number;
}): Promise<SceneSearchResult> {
  const { searchStac, aoiBbox, aroundIso } = input;
  let ranked: SceneCandidate[] = [];
  let windowDays = SEARCH_WINDOWS_DAYS[SEARCH_WINDOWS_DAYS.length - 1];
  for (const w of SEARCH_WINDOWS_DAYS) {
    windowDays = w;
    const scenes = await searchStac({
      bbox: aoiBbox,
      fromIso: shiftIsoDays(aroundIso, -w),
      toIso: shiftIsoDays(aroundIso, w),
      maxCloudCoveragePct: input.maxCloudCoveragePct,
    });
    ranked = rankSceneCandidates(scenes, aoiBbox, aroundIso);
    if (ranked.some((c) => c.containsAoi)) break; // good enough — stop widening
  }
  return { candidates: ranked, windowDays, noContainingScene: !ranked.some((c) => c.containsAoi) };
}

/** PURE: the top-N containing candidates the job carries for auto-advance (council C4). */
export function topContainingCandidates(result: SceneSearchResult, n = 3): SceneCandidate[] {
  return result.candidates.filter((c) => c.containsAoi).slice(0, n);
}
