/**
 * Vineyard Intelligence — Int16 quantization for the cached DISPLAY derivative (council fix #6, P3).
 *
 * PURE: no React, no Leaflet, no DOM, no I/O.
 *
 * WHY QUANTIZE. The display derivative is stored so a map open is a cheap blob read, not a re-warp. NDVI is
 * in [-1, 1]; ×10000 lands it in [-10000, 10000], which fits Int16 with room to spare and is 2 bytes/pixel
 * instead of 8 (Float64) — a 4× smaller object, and the 1e-4 quantum is invisible under an 8-bit colour ramp.
 * NaN does not fit an integer type, so `-32768` is reserved as the no-data sentinel. THE SOURCE FLOAT32 STAYS
 * AUTHORITATIVE — this quantized copy is display-only and is never read back into statistics.
 */
import { isNoData, NO_DATA } from "./ndvi";

export const DISPLAY_QUANT_SCALE = 10000;
export const DISPLAY_NODATA_I16 = -32768;

/** PURE: quantize NDVI floats to Int16 (×scale, clamped to [-1,1]); no-data → sentinel. */
export function quantizeToInt16(
  values: ArrayLike<number>,
  scale = DISPLAY_QUANT_SCALE,
  noData = DISPLAY_NODATA_I16,
): Int16Array {
  const out = new Int16Array(values.length);
  const lim = 32767;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (isNoData(v)) {
      out[i] = noData;
      continue;
    }
    const clamped = v < -1 ? -1 : v > 1 ? 1 : v;
    let q = Math.round(clamped * scale);
    if (q > lim) q = lim;
    if (q <= noData) q = noData + 1; // never collide with the sentinel
    out[i] = q;
  }
  return out;
}

/** PURE: dequantize Int16 back to NDVI floats; the sentinel → NaN (no-data). */
export function dequantizeFromInt16(
  q: Int16Array,
  scale = DISPLAY_QUANT_SCALE,
  noData = DISPLAY_NODATA_I16,
): Float64Array {
  const out = new Float64Array(q.length);
  for (let i = 0; i < q.length; i++) {
    out[i] = q[i] === noData ? NO_DATA : q[i] / scale;
  }
  return out;
}

/** PURE: pack an Int16Array into little-endian bytes (the derivative blob payload). */
export function int16ToBytes(q: Int16Array): Uint8Array {
  return new Uint8Array(q.buffer, q.byteOffset, q.byteLength).slice();
}

/** PURE: read an Int16Array back from little-endian bytes. */
export function bytesToInt16(bytes: Uint8Array): Int16Array {
  const aligned = bytes.byteOffset % 2 === 0 ? bytes : bytes.slice();
  return new Int16Array(aligned.buffer, aligned.byteOffset, Math.floor(aligned.byteLength / 2));
}
