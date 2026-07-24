/**
 * Vineyard Intelligence — exact fractional pixel coverage.
 *
 * PURE: no React, no Leaflet, no I/O, no dependencies at all. Node-testable, and it survives a flip
 * to the worker architecture unchanged (runbook rule §2.4).
 *
 * THE CLAIM THIS MODULE RESTS ON. Fractional coverage is NOT general polygon-polygon boolean. It is
 * polygon ∩ axis-aligned rectangle, once per intersecting pixel. A rectangle is CONVEX, which is the
 * exact precondition for Sutherland–Hodgman: clip the subject ring against each of the four
 * half-planes in turn, then take the shoelace area of what survives. There is no ring-reassembly
 * step, so the `Unable to complete output ring` failure class that dogs the martinez-lineage
 * libraries (polygon-clipping #40/#49/#75/#83/#91/#101/#105/#139/#140/#172) has no analogue here.
 *
 * Both council reviewers confirmed this independently, including the hard case: a U-shaped polygon
 * that enters, leaves and re-enters one pixel yields a SINGLE output ring with zero-width bridges
 * running along the pixel edge. Those bridges cancel exactly in the shoelace integral, because the
 * two traversals are anti-parallel vectors on the same line and ∫y·dx sums to zero over them.
 *
 * ...but only under TWO preconditions, both of which the first draft of the plan omitted:
 *
 *   (1) THE ULP PRECONDITION (Gemini). The bridges cancel only if both traversals use bit-identical
 *       coordinates. If the boundary intersection is computed with a lerp on BOTH ordinates, the
 *       forward and return bridges differ by ±1 ULP, they stop being collinear, cancellation fails,
 *       and area leaks SILENTLY. So `intersectAxis` below ASSIGNS the exact edge scalar and
 *       interpolates only the other ordinate. This is not a micro-optimisation; it is the thing that
 *       makes "exact" true. Regression-tested by the U-shape case.
 *
 *   (2) THE VALIDITY PRECONDITION (Codex). For a self-touching or self-intersecting ring, signed area
 *       is algebraic rather than geometric: enclosed lobes cancel and the answer is confidently
 *       wrong with no error raised. Those inputs are refused upstream by
 *       `validateVineyardPolygon`, and this module assumes valid, canonically-wound rings.
 *
 * Holes need no special handling: with canonical winding (outer CCW, holes CW) their clipped signed
 * areas are negative and simply subtract.
 */
/**
 * A dimensionless coverage floor. Below this a pixel's intersection fraction is reported as zero
 * rather than kept as a phantom sliver. It is NOT GEOM_EPSILON_M: that one is a LENGTH in metres
 * (vertex snapping inside the clipper), and comparing a [0,1] area ratio against a metre tolerance
 * is a category error even when the two happen to share a magnitude.
 */
const COVERAGE_EPS = 1e-9;

/** A point in recentred projected metres. */
export type Pt = readonly [number, number];

/** A ring in projected metres. May or may not repeat its first point; both are handled. */
export type ProjectedRing = Pt[];

/**
 * A raster grid in recentred projected metres, y increasing UPWARD.
 * `originX`/`originY` are the lower-left corner of pixel (col 0, row 0).
 */
export type PixelGrid = {
  readonly originX: number;
  readonly originY: number;
  readonly pixelSize: number;
  readonly width: number;
  readonly height: number;
};

/** One pixel's coverage. `index = row * width + col`. */
export type PixelCoverage = {
  readonly col: number;
  readonly row: number;
  readonly index: number;
  /** Intersected area divided by pixel area, in [0, 1]. */
  readonly fraction: number;
};

/** PURE: shoelace signed area. Positive = counter-clockwise. Matches `geometry.signedArea`. */
export function shoelace(ring: readonly Pt[]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return sum / 2;
}

/**
 * The intersection of segment a->b with the axis-aligned line `axis = value`.
 *
 * ⚠️ The assignment on the clipped axis is deliberate and load-bearing. `p[axis] = value` EXACTLY,
 * with no arithmetic, so every point produced on this edge is bit-identical on that ordinate.
 * Computing it as `a[axis] + t * (b[axis] - a[axis])` would land within an ULP of `value` but not
 * ON it, and the zero-width bridges of a re-entrant polygon would then fail to cancel.
 */
function intersectAxis(a: Pt, b: Pt, axis: 0 | 1, value: number): Pt {
  const other = axis === 0 ? 1 : 0;
  const denom = b[axis] - a[axis];
  // Parallel/degenerate: fall back to the endpoint. Cannot happen for a segment that genuinely
  // crosses the line, since crossing implies opposite sides implies a non-zero denominator.
  const t = denom === 0 ? 0 : (value - a[axis]) / denom;
  const out: [number, number] = [0, 0];
  out[axis] = value; // ← ASSIGNED, never computed. See the module header.
  out[other] = a[other] + t * (b[other] - a[other]);
  return out;
}

/**
 * Clip a ring against one half-plane of the pixel rectangle.
 * `keepGreater` selects `coord >= value` (left/bottom edges) vs `coord <= value` (right/top).
 */
function clipHalfPlane(ring: readonly Pt[], axis: 0 | 1, value: number, keepGreater: boolean): Pt[] {
  const n = ring.length;
  if (n === 0) return [];
  const inside = (p: Pt) => (keepGreater ? p[axis] >= value : p[axis] <= value);
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const cur = ring[i];
    const prev = ring[(i + n - 1) % n];
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn) {
      if (!prevIn) out.push(intersectAxis(prev, cur, axis, value));
      out.push(cur);
    } else if (prevIn) {
      out.push(intersectAxis(prev, cur, axis, value));
    }
  }
  return out;
}

/** Drop a repeated closing vertex; Sutherland–Hodgman treats the ring cyclically. */
function openRing(ring: readonly Pt[]): Pt[] {
  if (ring.length < 2) return [...ring];
  const a = ring[0];
  const b = ring[ring.length - 1];
  return a[0] === b[0] && a[1] === b[1] ? ring.slice(0, -1) : [...ring];
}

/**
 * PURE: clip a ring to the rectangle `[x0,y0]-[x1,y1]`. Returns the clipped ring, possibly empty.
 * Exported so the U-shape/bridge behaviour can be inspected directly by tests.
 */
export function clipRingToRect(ring: readonly Pt[], x0: number, y0: number, x1: number, y1: number): Pt[] {
  let poly = openRing(ring);
  poly = clipHalfPlane(poly, 0, x0, true); // x >= x0
  if (poly.length === 0) return poly;
  poly = clipHalfPlane(poly, 0, x1, false); // x <= x1
  if (poly.length === 0) return poly;
  poly = clipHalfPlane(poly, 1, y0, true); // y >= y0
  if (poly.length === 0) return poly;
  poly = clipHalfPlane(poly, 1, y1, false); // y <= y1
  return poly;
}

/**
 * PURE: the fraction of one pixel covered by a set of canonically-wound rings.
 *
 * Rings are `[outer, ...holes]` (or several polygons' rings concatenated). Signed areas sum, so holes
 * subtract automatically. Result is clamped to [0, 1]; anything below ε_geom is reported as 0 rather
 * than kept as a phantom sliver.
 */
export function pixelCoverageFraction(
  rings: readonly (readonly Pt[])[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const pixelArea = (x1 - x0) * (y1 - y0);
  if (pixelArea <= 0) return 0;
  let area = 0;
  for (let ri = 0; ri < rings.length; ri++) {
    const clipped = clipRingToRect(rings[ri], x0, y0, x1, y1);
    if (clipped.length < 3) continue;
    // The FIRST ring is the shell; take |area| so a clockwise-drawn shell (Leaflet/Geoman produce
    // either winding, and blocks are stored as the client sent them) still reads positive. Holes
    // (rings after the first) keep their sign so they subtract. This makes coverage winding-robust
    // for the shell without depending on a normalization step that the store deliberately skips.
    area += ri === 0 ? Math.abs(shoelace(clipped)) : shoelace(clipped);
  }
  const fraction = area / pixelArea;
  if (!Number.isFinite(fraction)) return 0;
  if (fraction <= COVERAGE_EPS) return 0;
  return fraction >= 1 ? 1 : fraction;
}

/** PURE: `[minX, minY, maxX, maxY]` over projected rings. */
export function ringsBbox(rings: readonly (readonly Pt[])[]): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return [minX, minY, maxX, maxY];
}

/**
 * PURE: coverage fraction for every pixel the geometry touches.
 *
 * Only candidate pixels from the geometry's bounding box are visited. That prefilter matters:
 * Sutherland–Hodgman is O(vertices × pixels), so without it a high-vertex block would be clipped
 * against every pixel in the raster. Pixels with zero coverage are omitted entirely.
 */
export function coverageOverGrid(rings: readonly (readonly Pt[])[], grid: PixelGrid): PixelCoverage[] {
  const [minX, minY, maxX, maxY] = ringsBbox(rings);
  if (!Number.isFinite(minX)) return [];
  const { originX, originY, pixelSize, width, height } = grid;

  const colLo = Math.max(0, Math.floor((minX - originX) / pixelSize));
  const colHi = Math.min(width - 1, Math.floor((maxX - originX) / pixelSize));
  const rowLo = Math.max(0, Math.floor((minY - originY) / pixelSize));
  const rowHi = Math.min(height - 1, Math.floor((maxY - originY) / pixelSize));

  const out: PixelCoverage[] = [];
  for (let row = rowLo; row <= rowHi; row++) {
    const y0 = originY + row * pixelSize;
    const y1 = y0 + pixelSize;
    for (let col = colLo; col <= colHi; col++) {
      const x0 = originX + col * pixelSize;
      const x1 = x0 + pixelSize;
      const fraction = pixelCoverageFraction(rings, x0, y0, x1, y1);
      if (fraction > 0) out.push({ col, row, index: row * width + col, fraction });
    }
  }
  return out;
}

/**
 * PURE: total covered area in m², summed from the per-pixel fractions.
 *
 * This is the oracle-free invariant that catches the SILENT failure mode. Sliver and dropped-ring
 * bugs in this problem space frequently produce no error at all — a thrown exception is the *good*
 * outcome. Comparing this against the polygon's own shoelace area catches them without needing
 * `exactextract` at all, which is why Unit 5 asserts it alongside the per-cell diff.
 */
export function coveredAreaM2(coverage: readonly PixelCoverage[], pixelSize: number): number {
  const pixelArea = pixelSize * pixelSize;
  let sum = 0;
  for (const c of coverage) sum += c.fraction;
  return sum * pixelArea;
}

/** PURE: the effective pixel count, `Σ coverageFraction` (brief §2.4). Not the same as the count. */
export function effectivePixelCount(coverage: readonly PixelCoverage[]): number {
  let sum = 0;
  for (const c of coverage) sum += c.fraction;
  return sum;
}
