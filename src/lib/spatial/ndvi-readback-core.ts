import "server-only";

/**
 * Vineyard Intelligence P3 — decode a stored NDVI dataset back into an in-memory grid (Unit 2).
 *
 * The read-back path P2 deliberately omitted (raster-store was write-only). Pulls the private TIFF bytes,
 * decodes them with the SAME runtime decoder P2 wrote, and recomputes NDVI with the SAME masking, so the
 * grid we display is bit-identical to the grid the block stats were computed from. No new NDVI math — this
 * is P2's `decode → computeNdvi` reused verbatim, just sourced from blob instead of the live provider.
 */
import { decodeNdviScene } from "@/lib/gis/satellite/decode";
import { getPrivateRasterBytes } from "@/lib/gis/satellite/raster-store";
import { roundedScl } from "@/lib/gis/satellite/process-scene-core";
import { computeNdvi } from "@/lib/gis/ndvi";
import type { Grid } from "@/lib/gis/smooth";
import type { SourceGeotransform } from "@/lib/gis/warp";

export type ReadBackNdvi = {
  readonly grid: Grid;
  readonly geo: SourceGeotransform;
  readonly validCount: number;
  /** Bytes read out of blob (for egress metering by the caller). */
  readonly byteSize: number;
};

/** The minimal dataset shape the read-back needs (a SpatialDataset row). */
export type ReadBackDatasetInput = {
  readonly blobUrl: string | null;
  readonly status?: string;
};

/**
 * Fetch → decode → NDVI. Returns null if the dataset has no stored raster (never READY) or the blob is gone.
 * The geotransform comes from the decoded bytes (authoritative — it matches the pixels exactly).
 */
export async function readNdviGridFromDataset(dataset: ReadBackDatasetInput): Promise<ReadBackNdvi | null> {
  if (!dataset.blobUrl) return null;
  const bytes = await getPrivateRasterBytes(dataset.blobUrl);
  if (!bytes) return null;

  const decoded = await decodeNdviScene(bytes);
  const ndvi = computeNdvi(decoded.red, decoded.nir, roundedScl(decoded.scl), decoded.width, decoded.height);

  const grid: Grid = { width: decoded.width, height: decoded.height, values: ndvi.values };
  const geo: SourceGeotransform = {
    crsEpsg: decoded.crsEpsg,
    originX: decoded.originX,
    originY: decoded.originY,
    pixelSizeM: decoded.pixelSizeM,
    axisYSign: decoded.axisYSign,
  };
  return { grid, geo, validCount: ndvi.validCount, byteSize: bytes.byteLength };
}
