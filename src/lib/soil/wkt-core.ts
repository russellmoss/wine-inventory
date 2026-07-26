/**
 * Vineyard Intelligence P4 — block polygon → WKT, and the staleness fingerprint.
 *
 * PURE: no I/O. INJECTION INVARIANT (design §Operational): the WKT sent to SDA is assembled EXCLUSIVELY
 * from finite `Number` coordinates that passed `validateVineyardPolygon`. No string from any source is
 * ever concatenated into the query. `fmtCoord` throws on a non-finite value so a bad coordinate can
 * never reach the wire. GeoJSON positions are `[lng, lat]` and WKT here is `lng lat` — same order, but
 * asserted in a test rather than assumed. ALL rings are emitted (holes included) — sending only the
 * outer ring would overstate a donut block's area.
 */
import { canonicalAnchorFor, geometryFingerprint, geodesicAreaM2 } from "../gis/geometry-meta";
import type { LinearRing, PolygonRings, VineyardPolygon } from "../gis/geometry";

function fmtCoord(n: number): string {
  if (typeof n !== "number" || !Number.isFinite(n)) throw new Error("non-finite coordinate in WKT");
  return String(n);
}

function ringWkt(ring: LinearRing): string {
  return "(" + ring.map((p) => `${fmtCoord(p[0])} ${fmtCoord(p[1])}`).join(", ") + ")";
}

function polygonWkt(rings: PolygonRings): string {
  return "(" + rings.map(ringWkt).join(", ") + ")";
}

/** Serialize a VALIDATED polygon to WKT (all rings). Pass only the `value` from `validateVineyardPolygon`. */
export function toWkt(poly: VineyardPolygon): string {
  if (poly.type === "Polygon") return `POLYGON${polygonWkt(poly.coordinates)}`;
  return `MULTIPOLYGON(${poly.coordinates.map(polygonWkt).join(", ")})`;
}

/**
 * The block's geodesic area (local, m²) — the display denominator for `areaSqM` (council C3). This is
 * NEVER derived from SDA square degrees × cos(lat).
 */
export function blockAreaSqM(poly: VineyardPolygon): number {
  return geodesicAreaM2(poly);
}

/**
 * A frame-stable fingerprint from scratch (fresh anchor). The orchestrator PREFERS the block's stored
 * `geometryFingerprint` (same anchor as P1) for staleness; this is the fallback for an unversioned block
 * and doubles as the cache key.
 */
export function computeFingerprint(poly: VineyardPolygon): string {
  return geometryFingerprint(poly, canonicalAnchorFor(poly));
}
