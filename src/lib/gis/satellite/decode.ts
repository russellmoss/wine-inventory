/**
 * Vineyard Intelligence P2 — runtime GeoTIFF decoder (the one genuinely-unbuilt piece).
 *
 * P0 decoded the CDSE FLOAT32 GeoTIFF with dev-only Python `tifffile` (scripts/gis-p0-decode-tif.py).
 * P2 must decode it at runtime on Vercel, so this wraps `geotiff` (geotiff.js) — pure-JS, no native
 * GDAL, no WASM — and turns the adapter's single-image 3-band FLOAT32 output into the flat band arrays
 * `computeNdvi` needs plus the typed geotransform `coverageOverGrid` needs.
 *
 * PURE (no DB, no network, no secrets). The bytes come from `fetchProcessedScene` (client.ts) whose
 * evalscript emits exactly `[B04, B08, SCL]` FLOAT32, one image, one tile/strip layout, in a metric UTM
 * CRS. We ASSERT that contract rather than trust it (council C6), because a silent band-order or FLOAT32
 * mistake would corrupt every NDVI reading and look like real vineyard data.
 *
 * ── Orientation, the load-bearing subtlety ──
 * A north-up GeoTIFF has its origin at the UPPER-LEFT corner and a NEGATIVE y-resolution: raster row 0 is
 * the NORTHERNMOST row and row index increases SOUTHWARD. But `coverage.PixelGrid` is y-UP (origin at the
 * lower-left, row index increases NORTHWARD). We do NOT flip here — the band arrays are returned in faithful
 * file order (row 0 = north) and the geotransform is reported honestly (`originY` = top edge, `axisYSign`
 * = sign of the y-resolution). Rebuilding the y-up PixelGrid and flipping the row lookup is the caller's job
 * (block-metrics, Unit 5), done once, in one place, with this metadata.
 */
import { fromArrayBuffer, type GeoTIFFImage } from "geotiff";

/** The bands our evalscript requests, in order. NOT inferred from photometric tags — this IS the contract. */
export const NDVI_SCENE_BANDS = ["B04", "B08", "SCL"] as const;
export const NDVI_SCENE_SAMPLES_PER_PIXEL = 3;

/** Defensive ceilings (brief §18 SSRF/DoS). Estate scale is ~350×350 ≈ 0.12 M px; the >2 M-px streaming
 *  boundary is a scale-register tripwire (out of scope for P2), so a decode above the ceiling is refused
 *  with a clear error rather than being allowed to OOM the 512 MB serverless request (memory, not time, is
 *  the tightest number). */
export const MAX_SCENE_DIM = 10_000;
export const MAX_SCENE_PIXELS = 4_000_000;
/** The compressed TIFF is our own adapter's output (~0.73 MB estate-wide); cap the input defensively anyway. */
export const MAX_SCENE_BYTES = 64 * 1024 * 1024;

export type SceneDecodeFault =
  | "not-tiff" // missing/!= TIFF magic
  | "bigtiff" // BigTIFF (version 43) — the classic-TIFF decode path only
  | "truncated" // buffer too short / decode threw
  | "band-count" // samplesPerPixel !== 3
  | "sample-format" // a band is not Float32
  | "interleave" // reader did not return per-band planes
  | "oversize" // dimensions/pixels over the ceiling
  | "georef"; // missing/degenerate origin / resolution / EPSG

export class SceneDecodeError extends Error {
  readonly fault: SceneDecodeFault;
  constructor(fault: SceneDecodeFault, message: string) {
    super(message);
    this.name = "SceneDecodeError";
    this.fault = fault;
  }
}

/**
 * A decoded NDVI scene: three band planes in faithful file (row 0 = north) order + the typed geotransform.
 *
 * `axisYSign` is the sign of the GeoTIFF y-resolution: -1 for a standard north-up raster (row index
 * increases southward), +1 for a y-up raster. The caller uses it to rebuild a y-up `PixelGrid`.
 */
export type DecodedNdviScene = {
  readonly red: Float32Array; // B04 REFLECTANCE
  readonly nir: Float32Array; // B08 REFLECTANCE
  readonly scl: Float32Array; // Scene Classification (DN, integer classes carried as float)
  readonly width: number;
  readonly height: number;
  /** Model-space X of the raster's left edge (origin of col 0). */
  readonly originX: number;
  /** Model-space Y of the raster's TOP edge (origin of row 0). North-up ⇒ this is the maximum northing. */
  readonly originY: number;
  /** Pixel size in metres (always positive; native Sentinel-2 grid = 10 m). */
  readonly pixelSizeM: number;
  /** Sign of the y-resolution: -1 north-up (standard), +1 y-up. */
  readonly axisYSign: -1 | 1;
  /** Projected CRS EPSG code (metric UTM zone). */
  readonly crsEpsg: number;
  /** [minX, minY, maxX, maxY] in the model CRS. */
  readonly bbox: readonly [number, number, number, number];
};

/** PURE: read the 16-bit TIFF version word from the header and reject BigTIFF up front (council C6). */
function assertClassicTiff(bytes: Uint8Array): void {
  if (bytes.byteLength < 8) throw new SceneDecodeError("truncated", "buffer too short to be a TIFF");
  const b0 = bytes[0];
  const b1 = bytes[1];
  const littleEndian = b0 === 0x49 && b1 === 0x49; // "II"
  const bigEndian = b0 === 0x4d && b1 === 0x4d; // "MM"
  if (!littleEndian && !bigEndian) throw new SceneDecodeError("not-tiff", "missing TIFF byte-order mark");
  const version = littleEndian ? bytes[2] | (bytes[3] << 8) : (bytes[2] << 8) | bytes[3];
  if (version === 43) throw new SceneDecodeError("bigtiff", "BigTIFF (version 43) is not supported by the classic-TIFF decode path");
  if (version !== 42) throw new SceneDecodeError("not-tiff", `unexpected TIFF version word ${version}`);
}

/** PURE: pull the projected EPSG out of the GeoTIFF geokeys (ProjectedCSTypeGeoKey), else throw. */
function readEpsg(image: GeoTIFFImage): number {
  const keys = (image.geoKeys ?? {}) as Record<string, unknown>;
  const projected = keys.ProjectedCSTypeGeoKey;
  const geographic = keys.GeographicTypeGeoKey;
  const code = typeof projected === "number" && projected > 0 && projected !== 32767 ? projected : typeof geographic === "number" ? geographic : undefined;
  if (typeof code !== "number" || !Number.isFinite(code) || code <= 0) {
    throw new SceneDecodeError("georef", "GeoTIFF has no usable ProjectedCSTypeGeoKey/GeographicTypeGeoKey");
  }
  return code;
}

/**
 * Decode the adapter's 3-band FLOAT32 GeoTIFF into `{red, nir, scl}` band planes + a typed geotransform.
 *
 * Every branch of the council C6 contract is ASSERTED, not assumed: classic (non-Big) TIFF, exactly 3
 * samples-per-pixel, non-interleaved band planes, each a Float32Array, and a full/finite georeference.
 * No decode worker pool is ever constructed (`readRasters` runs inline in the request thread) — that is
 * the ADR-0009 no-worker guarantee, kept by never passing a `pool`.
 */
export async function decodeNdviScene(bytes: Uint8Array): Promise<DecodedNdviScene> {
  if (bytes.byteLength > MAX_SCENE_BYTES) {
    throw new SceneDecodeError("oversize", `TIFF is ${bytes.byteLength} bytes, over the ${MAX_SCENE_BYTES}-byte ceiling`);
  }
  assertClassicTiff(bytes);

  // geotiff wants an ArrayBuffer whose bounds match the view exactly (a subarray's underlying buffer may be larger).
  const ab = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer;

  let image: GeoTIFFImage;
  try {
    const tiff = await fromArrayBuffer(ab as ArrayBuffer);
    image = await tiff.getImage(); // first (and only) image
  } catch (e) {
    throw new SceneDecodeError("truncated", `GeoTIFF parse failed: ${(e as Error)?.message ?? "unknown"}`);
  }

  const width = image.getWidth();
  const height = image.getHeight();
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new SceneDecodeError("truncated", `degenerate raster dimensions ${width}×${height}`);
  }
  if (width > MAX_SCENE_DIM || height > MAX_SCENE_DIM || width * height > MAX_SCENE_PIXELS) {
    throw new SceneDecodeError("oversize", `raster ${width}×${height} exceeds the decode ceiling (${MAX_SCENE_DIM} dim / ${MAX_SCENE_PIXELS} px)`);
  }

  // Band count from the FILE, cross-checked against OUR evalscript contract (not from photometric tags).
  const spp = image.getSamplesPerPixel();
  if (spp !== NDVI_SCENE_SAMPLES_PER_PIXEL) {
    throw new SceneDecodeError("band-count", `expected ${NDVI_SCENE_SAMPLES_PER_PIXEL} bands (${NDVI_SCENE_BANDS.join(",")}), got ${spp}`);
  }

  // interleave:false ⇒ an array of per-band planes. Interleaved output (a single flat array) is refused.
  // No `pool` argument ⇒ inline decode, no worker pool (ADR 0009).
  let rasters: unknown;
  try {
    rasters = await image.readRasters({ interleave: false });
  } catch (e) {
    throw new SceneDecodeError("truncated", `readRasters failed: ${(e as Error)?.message ?? "unknown"}`);
  }
  if (!Array.isArray(rasters) || rasters.length !== NDVI_SCENE_SAMPLES_PER_PIXEL) {
    throw new SceneDecodeError("interleave", "reader did not return three separate band planes");
  }
  const [red, nir, scl] = rasters as unknown[];
  for (const [i, band] of [red, nir, scl].entries()) {
    if (!(band instanceof Float32Array)) {
      throw new SceneDecodeError("sample-format", `band ${NDVI_SCENE_BANDS[i]} is ${(band as object)?.constructor?.name ?? typeof band}, not Float32Array`);
    }
    if ((band as Float32Array).length !== width * height) {
      throw new SceneDecodeError("truncated", `band ${NDVI_SCENE_BANDS[i]} length ${(band as Float32Array).length} != ${width * height}`);
    }
  }

  // Typed geotransform. getOrigin() = upper-left corner [x, y]; getResolution() = [xRes, yRes] with yRes
  // NEGATIVE for a north-up image; getBoundingBox() = [minX, minY, maxX, maxY].
  const origin = image.getOrigin();
  const resolution = image.getResolution();
  const bbox = image.getBoundingBox();
  const originX = origin[0];
  const originY = origin[1];
  const pixelSizeM = Math.abs(resolution[0]);
  const yRes = resolution[1];
  if (![originX, originY, pixelSizeM, yRes, ...bbox].every((v) => typeof v === "number" && Number.isFinite(v)) || pixelSizeM <= 0) {
    throw new SceneDecodeError("georef", "GeoTIFF origin/resolution/bbox is missing or degenerate");
  }
  const axisYSign: -1 | 1 = yRes < 0 ? -1 : 1;
  const crsEpsg = readEpsg(image);

  return {
    red: red as Float32Array,
    nir: nir as Float32Array,
    scl: scl as Float32Array,
    width,
    height,
    originX,
    originY,
    pixelSizeM,
    axisYSign,
    crsEpsg,
    bbox: [bbox[0], bbox[1], bbox[2], bbox[3]] as const,
  };
}
