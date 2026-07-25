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
import { getPrivateBlob } from "@/lib/attachments/blob";

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

/**
 * P3 read-back: pull a stored private raster's bytes back for display materialization (the getter P2 omitted).
 * Returns the raw TIFF bytes so the caller can decode + warp them. Blob egress is metered by the caller
 * (Unit 6 records blobEgressBytes) so it isn't double-counted. Returns null if the object is gone.
 */
export async function getPrivateRasterBytes(blobUrl: string): Promise<Uint8Array | null> {
  const blob = await getPrivateBlob(blobUrl);
  if (!blob) return null;
  const ab = await new Response(blob.stream as unknown as ReadableStream).arrayBuffer();
  return new Uint8Array(ab);
}

/** The deterministic private blob key for a cached display DERIVATIVE (warped/quantized). */
export function derivativeBlobKey(tenantId: string, datasetId: string, kind: string, recipeVersion: number): string {
  return `spatial/ndvi-display/${tenantId}/${datasetId}/${kind}.v${recipeVersion}.bin`;
}

/** Store a derivative payload (Int16 raster + header) at its deterministic key (idempotent overwrite). */
export async function putPrivateDerivative(
  tenantId: string,
  datasetId: string,
  kind: string,
  recipeVersion: number,
  bytes: Uint8Array,
): Promise<StoredRaster> {
  const key = derivativeBlobKey(tenantId, datasetId, kind, recipeVersion);
  const buf = Buffer.from(bytes);
  const blob = await put(key, buf, { access: "private", addRandomSuffix: false, contentType: "application/octet-stream" });
  return { url: blob.url, key, sha256: createHash("sha256").update(buf).digest("hex"), byteSize: buf.byteLength };
}

/** Read a stored derivative payload back for the serving route. Returns null if gone. */
export async function getPrivateDerivativeBytes(blobUrl: string): Promise<Uint8Array | null> {
  const blob = await getPrivateBlob(blobUrl);
  if (!blob) return null;
  const ab = await new Response(blob.stream as unknown as ReadableStream).arrayBuffer();
  return new Uint8Array(ab);
}
