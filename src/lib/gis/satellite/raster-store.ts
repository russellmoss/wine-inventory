import "server-only";

/**
 * Vineyard Intelligence P2 — NDVI raster blob storage (Unit 4 helper).
 *
 * Bytes live in @vercel/blob (private, tenant-namespaced), metadata in Postgres — the IngestedInvoice
 * precedent. The key is DETERMINISTIC from the dataset identity (NOT the sha256, council C1): a retry that
 * re-fetches the same scene overwrites the same object, so materialization is idempotent and a crash between
 * "stored" and "marked READY" never orphans a second copy.
 */
import { createHash } from "node:crypto";
import { put } from "@vercel/blob";

export { hasBlobCredentials } from "@/lib/attachments/blob";

/** PURE: the deterministic private blob key for a dataset. */
export function rasterBlobKey(tenantId: string, datasetIdentity: string): string {
  return `spatial/ndvi/${tenantId}/${datasetIdentity}.tif`;
}

export type StoredRaster = { url: string; key: string; sha256: string; byteSize: number };

/** Store the raster TIFF at its deterministic key (addRandomSuffix:false → idempotent overwrite). */
export async function putPrivateRaster(tenantId: string, datasetIdentity: string, bytes: Uint8Array): Promise<StoredRaster> {
  const key = rasterBlobKey(tenantId, datasetIdentity);
  const buf = Buffer.from(bytes);
  const blob = await put(key, buf, { access: "private", addRandomSuffix: false, contentType: "image/tiff" });
  return { url: blob.url, key, sha256: createHash("sha256").update(buf).digest("hex"), byteSize: buf.byteLength };
}
