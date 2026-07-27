import "server-only";

/**
 * Vineyard Intelligence P3 — a minimal, dependency-free PNG encoder (RGBA → PNG bytes).
 *
 * WHY HAND-ROLLED. The serving route paints the NDVI overlay as a single `L.imageOverlay` PNG (the no-worker
 * path, ADR 0009). The repo has no image-encoding dependency (no sharp/pngjs), and adding a native module to
 * a Vercel build for one 8-bit RGBA image is not worth it. PNG's spec is small: signature + IHDR + one
 * zlib-deflated IDAT of filter-0 scanlines + IEND. `node:zlib` does the compression; this does the framing.
 */
import { deflateSync } from "node:zlib";

const SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32(n: number): Uint8Array {
  return Uint8Array.from([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = Uint8Array.from([type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)]);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  const out = new Uint8Array(4 + body.length + 4);
  out.set(u32(data.length), 0);
  out.set(body, 4);
  out.set(u32(crc32(body)), 4 + body.length);
  return out;
}

/** Encode an RGBA raster (row-major, 4 bytes/px) to PNG bytes. */
export function encodePng(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Uint8Array {
  // Prefix each scanline with a filter-type byte (0 = None).
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgba.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
  }
  const idat = deflateSync(raw);

  const ihdr = new Uint8Array(13);
  ihdr.set(u32(width), 0);
  ihdr.set(u32(height), 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const chunks = [SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", new Uint8Array(idat)), chunk("IEND", new Uint8Array(0))];
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}
