import "server-only";

/**
 * Vineyard Intelligence P3 — materialize + cache the DISPLAY_NDVI derivative (Unit 6).
 *
 * A map open should be a cheap blob read, not a re-warp. This core turns a READY SpatialDataset into a cached
 * SpatialDatasetDerivative: read the source raster back (Unit 2) → warp it onto a north-up EPSG:3857 grid
 * (Unit 3, council #1) → Int16-quantize (Unit 6, council #6) → store the payload in blob → record the warped
 * geotransform + WGS84 bbox on the derivative row. Idempotent + claim-first, mirroring P2's C1 outbox: the
 * INFLIGHT placeholder claims the (dataset, kind, recipeVersion) unique BEFORE the work, a concurrent claimant
 * backs off, and a prior READY row is ADOPTED (no re-warp). The `recipeVersion` is the cache key (council #7).
 *
 * THE SOURCE FLOAT32 STAYS AUTHORITATIVE. This derivative is display-only; block statistics never read it.
 */
import { prisma } from "@/lib/prisma";
import { readNdviGridFromDataset } from "./ndvi-readback-core";
import { recordCdseUsage } from "./usage-core";
import { warpToDisplayGrid } from "@/lib/gis/warp";
import { quantizeToInt16, int16ToBytes, DISPLAY_QUANT_SCALE, DISPLAY_NODATA_I16 } from "@/lib/gis/quantize";
import { putPrivateDerivative } from "@/lib/gis/satellite/raster-store";
import { createHash } from "node:crypto";

/** Bump when the warp/quantize recipe changes — invalidates the cache + the serving-route ETag (council #7). */
export const DISPLAY_RECIPE_VERSION = 1;
export const DISPLAY_DERIVATIVE_KIND = "DISPLAY_NDVI" as const;

/** The recipe fingerprint baked into the derivative (provenance). */
function recipeHash(): string {
  return createHash("sha256")
    .update(`warp:3857-northup-nearest|quant:int16x${DISPLAY_QUANT_SCALE}|nodata:${DISPLAY_NODATA_I16}|v${DISPLAY_RECIPE_VERSION}`)
    .digest("hex")
    .slice(0, 16);
}

export type DisplayDerivativeRow = {
  id: string;
  status: string;
  blobUrl: string | null;
  crsEpsg: number | null;
  gridWidth: number | null;
  gridHeight: number | null;
  originX: unknown;
  originY: unknown;
  pixelSizeM: unknown;
  axisYSign: number | null;
  wgs84Bbox: unknown;
  quantScale: number;
  noDataSentinel: number;
  recipeVersion: number;
};

/**
 * Ensure a READY DISPLAY_NDVI derivative exists for a dataset, materializing it if needed. Returns the row.
 * Throws if the source dataset is not READY / has no raster.
 */
export async function ensureDisplayDerivative(datasetId: string): Promise<DisplayDerivativeRow> {
  const dataset = await prisma.spatialDataset.findUnique({ where: { id: datasetId } });
  if (!dataset) throw new Error(`display-derivative: dataset ${datasetId} not found`);
  if (dataset.status !== "READY" || !dataset.blobUrl) {
    throw new Error(`display-derivative: dataset ${datasetId} is not READY`);
  }

  // 1) Adopt a prior READY derivative (no re-warp) — the cache hit.
  const existing = await prisma.spatialDatasetDerivative.findUnique({
    where: {
      tenantId_datasetId_kind_recipeVersion: {
        tenantId: dataset.tenantId,
        datasetId,
        kind: DISPLAY_DERIVATIVE_KIND,
        recipeVersion: DISPLAY_RECIPE_VERSION,
      },
    },
  });
  if (existing && existing.status === "READY" && existing.blobUrl) return existing as DisplayDerivativeRow;

  // 2) Claim: create/adopt the INFLIGHT placeholder on the unique (claim-first, mirror P2 C1).
  const placeholder =
    existing ??
    (await prisma.spatialDatasetDerivative
      .create({
        data: {
          datasetId,
          vineyardId: dataset.vineyardId,
          kind: DISPLAY_DERIVATIVE_KIND,
          recipeVersion: DISPLAY_RECIPE_VERSION,
          status: "INFLIGHT",
          quantScale: DISPLAY_QUANT_SCALE,
          noDataSentinel: DISPLAY_NODATA_I16,
        },
      })
      .catch(async () => {
        // A concurrent claimant won the unique; re-read and adopt if it's already READY, else back off.
        const row = await prisma.spatialDatasetDerivative.findUnique({
          where: {
            tenantId_datasetId_kind_recipeVersion: {
              tenantId: dataset.tenantId,
              datasetId,
              kind: DISPLAY_DERIVATIVE_KIND,
              recipeVersion: DISPLAY_RECIPE_VERSION,
            },
          },
        });
        if (!row) throw new Error("display-derivative: claim race with no row");
        return row;
      }));

  if (placeholder.status === "READY" && placeholder.blobUrl) return placeholder as DisplayDerivativeRow;

  // 3) Work: read back → warp → quantize → store.
  const readback = await readNdviGridFromDataset(dataset);
  if (!readback) throw new Error(`display-derivative: could not read raster for dataset ${datasetId}`);
  await recordCdseUsage({ blobBytes: readback.byteSize }); // meter egress once, here

  const warped = warpToDisplayGrid(readback.grid, readback.geo);
  const q = quantizeToInt16(warped.grid.values);
  const payload = int16ToBytes(q);
  const stored = await putPrivateDerivative(dataset.tenantId, datasetId, DISPLAY_DERIVATIVE_KIND, DISPLAY_RECIPE_VERSION, payload);

  // 4) Mark READY with the warped geotransform + bbox.
  const updated = await prisma.spatialDatasetDerivative.update({
    where: { id: placeholder.id },
    data: {
      status: "READY",
      blobUrl: stored.url,
      blobKey: stored.key,
      blobSha256: stored.sha256,
      byteSize: stored.byteSize,
      crsEpsg: 3857,
      originX: warped.originX.toFixed(4),
      originY: warped.originY.toFixed(4),
      pixelSizeM: warped.pixelSizeM.toFixed(4),
      gridWidth: warped.grid.width,
      gridHeight: warped.grid.height,
      axisYSign: warped.axisYSign,
      wgs84Bbox: warped.wgs84Bbox,
      recipeHash: recipeHash(),
    },
  });
  return updated as DisplayDerivativeRow;
}
