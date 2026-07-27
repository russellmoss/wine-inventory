/**
 * Vineyard Intelligence P2 — per-block NDVI statistics from a decoded scene (council Q1/Q3/Q4/S1).
 *
 * PURE: no DB, no blob, no network. Invoked INLINE by the scene-processing job (Unit 4) with the NDVI
 * raster already in memory (Q4 — no blob reload); persistence is the job's tx. Independently testable
 * against the P0 fixtures.
 *
 * Two things this gets right that P0 (synthetic blocks) never had to:
 *   1. THE MASK GATE (P1 hand-off). P1 topology is warn-only, so a MASK_BREAKING geometry (sibling
 *      overlap, block-outside-parent) can persist and would double-count pixels into a silently-wrong
 *      mean. We re-run `reviewTopology` and REFUSE before writing any metric.
 *   2. THE Y-FLIP. A north-up GeoTIFF has row 0 at the NORTH; `coverage.PixelGrid` is y-up (row 0 at the
 *      SOUTH). Real block geometry must map onto the right raster row or every block reads a neighbour's
 *      vigour. We build one y-up grid recentred to the raster's lower-left corner, project the blocks into
 *      that frame, and flip the row on the NDVI lookup — once, here.
 *
 * Memory (S1): the caller holds the NDVI raster once; per block we build ONE small samples array (only the
 * intersecting pixels), call `zonalStats`, and discard it — never N blocks' sample arrays at once.
 */
import type { VineyardPolygon } from "../gis/geometry";
import { projectedAreaM2 } from "../gis/geometry-meta";
import { createProjectorFromAnchor, projectRings } from "../gis/projection";
import { coverageOverGrid, coveredAreaM2 as geometricCoveredAreaM2, type PixelGrid } from "../gis/coverage";
import { zonalStats, type WeightedSample } from "../gis/zonal";
import { isNoData, type NdviOptions } from "../gis/ndvi";
import { reviewTopology, type TopologyFinding, type TopologyReview } from "../gis/topology";

/** Below this valid fraction a block's summary stats are null + INSUFFICIENT_VALID_COVERAGE (council Q3). */
export const MIN_VALID_FRACTION = 0.5;

export const QUALITY_FLAG = {
  INSUFFICIENT_VALID_COVERAGE: "INSUFFICIENT_VALID_COVERAGE",
  NO_INTERSECTION: "NO_INTERSECTION",
  COVERAGE_AREA_MISMATCH: "COVERAGE_AREA_MISMATCH",
} as const;

/** The scene's typed geotransform, as decoded (Unit 2). originY is the TOP edge for a north-up raster. */
export type SceneGeotransform = {
  readonly originX: number; // left edge, absolute model metres
  readonly originY: number; // top edge (north-up) or bottom edge (y-up), per axisYSign
  readonly pixelSizeM: number;
  readonly axisYSign: -1 | 1; // -1 north-up (standard), +1 y-up
  readonly crsEpsg: number;
  readonly width: number;
  readonly height: number;
};

export type BlockGeometryInput = {
  readonly id: string;
  readonly geometry: VineyardPolygon;
  readonly geometryVersion: number;
  readonly geometryFingerprint: string;
};

/** One block's computed NDVI snapshot — the shape persisted into BlockSpatialMetric (minus tenant/dataset ids). */
export type ComputedBlockMetric = {
  readonly blockId: string;
  readonly metric: "NDVI";
  readonly geometryVersion: number;
  readonly geometryFingerprint: string;
  // Summary stats — null below the valid floor (Q3).
  readonly min: number | null;
  readonly p10: number | null;
  readonly p25: number | null;
  readonly median: number | null;
  readonly mean: number | null;
  readonly p75: number | null;
  readonly p90: number | null;
  readonly max: number | null;
  readonly stdDev: number | null;
  // Counts + coverage — ALWAYS recorded.
  readonly intersectingPixelCount: number;
  readonly validPixelCount: number;
  readonly effectivePixelCount: number; // Σ valid coverage weights (the weighted-mean denominator, S4)
  readonly validFraction: number;
  readonly coveredAreaM2: number; // geometric block footprint on the grid (all cells) — the polygon-area cross-check
  readonly mixedPixelShare: number;
  readonly qualityFlags: string[];
};

export type BlockMetricsResult =
  | { readonly refused: true; readonly reason: "mask-breaking"; readonly findings: TopologyFinding[]; readonly topology: TopologyReview }
  | { readonly refused: false; readonly metrics: ComputedBlockMetric[]; readonly topology: TopologyReview };

export type ComputeBlockMetricsInput = {
  readonly ndvi: { readonly values: ArrayLike<number>; readonly width: number; readonly height: number };
  readonly geotransform: SceneGeotransform;
  readonly planting: { readonly id: string; readonly geometry: VineyardPolygon };
  readonly blocks: readonly BlockGeometryInput[];
  readonly opts?: { readonly minValidFraction?: number } & NdviOptions;
};

const NULL_STATS = { min: null, p10: null, p25: null, median: null, mean: null, p75: null, p90: null, max: null, stdDev: null };

/**
 * PURE: compute per-block NDVI statistics for one dataset's raster.
 *
 * Refuses (writes nothing) if the planting/block topology is MASK_BREAKING. Otherwise returns one immutable
 * metric per block, stamped with the block's geometryVersion+fingerprint; below `minValidFraction` the
 * summary stats are null and INSUFFICIENT_VALID_COVERAGE is flagged (counts + coverage still recorded).
 */
export function computeBlockMetricsCore(input: ComputeBlockMetricsInput): BlockMetricsResult {
  const { ndvi, geotransform, planting, blocks } = input;
  const minValidFraction = input.opts?.minValidFraction ?? MIN_VALID_FRACTION;
  const { width, height, pixelSizeM, axisYSign, crsEpsg } = geotransform;
  const pixelAreaM2 = pixelSizeM * pixelSizeM;

  // 1) MASK GATE (P1 hand-off): re-validate topology and refuse before computing any metric.
  const topology = reviewTopology({
    planting: { id: planting.id, geometry: planting.geometry },
    blocks: blocks.map((b) => ({ id: b.id, geometry: b.geometry })),
  });
  const breaking = topology.findings.filter((f) => f.severity === "MASK_BREAKING");
  if (breaking.length > 0) {
    return { refused: true, reason: "mask-breaking", findings: breaking, topology };
  }

  // 2) One y-up PixelGrid recentred to the raster's LOWER-LEFT corner, plus a projector into that frame.
  //    North-up (axisYSign -1): the file's originY is the TOP edge, so the lower-left Y = originY - H·px, and
  //    grid row r maps to raster row (H-1-r). y-up (+1): originY is already the bottom and no flip is needed.
  const bottomY = axisYSign === -1 ? geotransform.originY - height * pixelSizeM : geotransform.originY;
  const projector = createProjectorFromAnchor({ epsg: `EPSG:${crsEpsg}`, originX: geotransform.originX, originY: bottomY });
  const grid: PixelGrid = { originX: 0, originY: 0, pixelSize: pixelSizeM, width, height };
  const rasterRowFor = (gridRow: number) => (axisYSign === -1 ? height - 1 - gridRow : gridRow);

  const metrics: ComputedBlockMetric[] = [];
  for (const block of blocks) {
    const rings = projectRings(block.geometry, projector);
    const cov = coverageOverGrid(rings, grid);
    const intersectingPixelCount = cov.length;
    const coveredAreaM2 = geometricCoveredAreaM2(cov, pixelSizeM);

    // Sequential accumulator: one small samples array for this block only (S1).
    const samples: WeightedSample[] = [];
    for (const c of cov) {
      const v = ndvi.values[rasterRowFor(c.row) * width + c.col];
      if (!isNoData(v)) samples.push({ value: v, weight: c.fraction });
    }
    const stats = zonalStats(samples, { intersectingPixelCount, pixelAreaM2 });

    const flags: string[] = [];
    if (intersectingPixelCount === 0) flags.push(QUALITY_FLAG.NO_INTERSECTION);
    // Dropped-ring sanity (oracle-free): the covered footprint should reconcile with the polygon's own area.
    const polyAreaM2 = projectedAreaM2(block.geometry);
    if (polyAreaM2 > 0 && Math.abs(coveredAreaM2 - polyAreaM2) > 0.15 * polyAreaM2 + pixelAreaM2) {
      flags.push(QUALITY_FLAG.COVERAGE_AREA_MISMATCH);
    }

    const validPixelCount = stats?.validPixelCount ?? 0;
    const validFraction = stats?.validFraction ?? 0;
    const belowFloor = !stats || validFraction < minValidFraction;
    if (belowFloor) flags.push(QUALITY_FLAG.INSUFFICIENT_VALID_COVERAGE);

    metrics.push({
      blockId: block.id,
      metric: "NDVI",
      geometryVersion: block.geometryVersion,
      geometryFingerprint: block.geometryFingerprint,
      ...(belowFloor
        ? NULL_STATS
        : {
            min: stats.min,
            p10: stats.p10,
            p25: stats.p25,
            median: stats.median,
            mean: stats.mean,
            p75: stats.p75,
            p90: stats.p90,
            max: stats.max,
            stdDev: stats.stdDev,
          }),
      intersectingPixelCount,
      validPixelCount,
      effectivePixelCount: stats?.effectivePixelCount ?? 0,
      validFraction,
      coveredAreaM2,
      mixedPixelShare: stats?.mixedPixelShare ?? 0,
      qualityFlags: flags,
    });
  }

  return { refused: false, metrics, topology };
}
