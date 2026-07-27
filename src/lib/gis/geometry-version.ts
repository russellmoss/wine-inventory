/**
 * Vineyard Intelligence P1 — the pure geometry-version transition (append-only, IoU-gated).
 *
 * PURE: no React, no Leaflet, no I/O, no Date (persistence + timestamps live in the Unit 8 action, which
 * applies this transition under a subject row-lock + stale-write guard). This module only DECIDES.
 *
 * Three outcomes (council Q2):
 *   NO_OP            — the shape is unchanged (same frame-stable fingerprint). Idempotent re-save.
 *   CORRECT_IN_PLACE — IoU(old,new) > 0.98: a trace correction. Update the CURRENT version's geometry
 *                      in place, keep the version number and anchor, DO NOT mark dependents stale.
 *   NEW_VERSION      — IoU ≤ 0.98: a real boundary change. Close the open row, append version+1 with a
 *                      fresh anchor, and mark dependents stale (empty in P1, seam wired for P2/P4).
 */
import type { VineyardPolygon } from "./geometry";
import { canonicalAnchorFor, geometryFingerprint, geodesicAreaM2, iou, type CanonicalAnchor } from "./geometry-meta";

/** IoU above this ⇒ a trace correction (no new version, no stale cascade). */
export const IOU_CORRECTION_THRESHOLD = 0.98;

/** A downstream product whose recomputation is invalidated by a boundary change. */
export type StaleDependent = { kind: string; subjectId: string };

/** The NDVI (spatial-metric) dependent kind — VI-P2 is the first real consumer of this seam. */
export const NDVI_DEPENDENT_KIND = "NDVI" as const;

/** The soil-snapshot dependent kind — VI-P4. A boundary change flags the block's soil snapshot stale. */
export const SOIL_DEPENDENT_KIND = "SOIL" as const;

/**
 * PURE: the set of dependent product kinds to invalidate for a subject. VI-P2 wired NDVI and VI-P4 wired
 * SOIL: a boundary change on a PLANTING_AREA or BLOCK marks that subject's NDVI and soil snapshot stale.
 * This is an ANNOTATION, not a deletion (council Q1): both `BlockSpatialMetric` (geometryVersion in its
 * unique key) and `BlockSoilSnapshot` (supersede-not-delete) keep the old rows readable — a recompute
 * COEXISTS, never hidden (runbook §6 "never rewrite"). Soil staleness is also detected at read-time by
 * comparing the block's current geometryVersion to the snapshot's; this seam is the write-path annotation.
 */
export function markStaleFor(subjectId: string): StaleDependent[] {
  return [
    { kind: NDVI_DEPENDENT_KIND, subjectId },
    { kind: SOIL_DEPENDENT_KIND, subjectId },
  ];
}

export type GeometryVersionState = {
  geometry: VineyardPolygon;
  version: number;
  anchor: CanonicalAnchor;
  fingerprint: string;
};

export type GeometryTransition =
  | { kind: "NO_OP" }
  | {
      kind: "CORRECT_IN_PLACE";
      version: number; // unchanged
      geometry: VineyardPolygon;
      anchor: CanonicalAnchor; // unchanged (frame continuity)
      fingerprint: string;
      iouFromPrev: number;
      areaGeodesicM2: number;
    }
  | {
      kind: "NEW_VERSION";
      version: number; // current + 1
      geometry: VineyardPolygon;
      anchor: CanonicalAnchor; // re-anchored to the new geometry
      fingerprint: string;
      iouFromPrev: number;
      areaGeodesicM2: number;
      stale: StaleDependent[];
    };

/** PURE: decide the transition for a geometry edit. `next` is the proposed new geometry (WGS84). */
export function planNextVersion(input: {
  current: GeometryVersionState;
  next: VineyardPolygon;
  subjectId: string;
}): GeometryTransition {
  const { current, next, subjectId } = input;

  // Frame-stable comparison: fingerprint `next` in the CURRENT anchor's frame.
  const fpInCurrentFrame = geometryFingerprint(next, current.anchor);
  if (fpInCurrentFrame === current.fingerprint) {
    return { kind: "NO_OP" };
  }

  const iouFromPrev = iou(current.geometry, next);
  const areaGeodesicM2 = geodesicAreaM2(next);

  if (iouFromPrev > IOU_CORRECTION_THRESHOLD) {
    return {
      kind: "CORRECT_IN_PLACE",
      version: current.version,
      geometry: next,
      anchor: current.anchor,
      fingerprint: fpInCurrentFrame,
      iouFromPrev,
      areaGeodesicM2,
    };
  }

  const anchor = canonicalAnchorFor(next);
  return {
    kind: "NEW_VERSION",
    version: current.version + 1,
    geometry: next,
    anchor,
    fingerprint: geometryFingerprint(next, anchor),
    iouFromPrev,
    areaGeodesicM2,
    stale: markStaleFor(subjectId),
  };
}
