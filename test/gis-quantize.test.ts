import { describe, it, expect } from "vitest";
import {
  quantizeToInt16,
  dequantizeFromInt16,
  int16ToBytes,
  bytesToInt16,
  DISPLAY_NODATA_I16,
  DISPLAY_QUANT_SCALE,
} from "@/lib/gis/quantize";
import { NO_DATA, isNoData } from "@/lib/gis/ndvi";

describe("Int16 display quantization (council fix #6)", () => {
  it("round-trips NDVI within the 1e-4 quantum", () => {
    const src = new Float64Array([-1, -0.2, 0, 0.37, 0.628, 0.9, 1]);
    const back = dequantizeFromInt16(quantizeToInt16(src));
    for (let i = 0; i < src.length; i++) {
      expect(back[i]).toBeCloseTo(src[i], 3); // 1/10000 quantum
    }
  });

  it("maps no-data to the sentinel and back to NaN", () => {
    const src = new Float64Array([0.5, NO_DATA, 0.6]);
    const q = quantizeToInt16(src);
    expect(q[1]).toBe(DISPLAY_NODATA_I16);
    const back = dequantizeFromInt16(q);
    expect(isNoData(back[1])).toBe(true);
    expect(back[0]).toBeCloseTo(0.5, 4);
  });

  it("clamps out-of-range NDVI and never collides with the sentinel", () => {
    const q = quantizeToInt16(new Float64Array([-5, 5]));
    expect(q[0]).toBeGreaterThan(DISPLAY_NODATA_I16); // clamped to -1×scale, not the sentinel
    expect(q[0]).toBe(-1 * DISPLAY_QUANT_SCALE);
    expect(q[1]).toBe(1 * DISPLAY_QUANT_SCALE);
  });

  it("survives a byte pack/unpack (the blob payload)", () => {
    const q = quantizeToInt16(new Float64Array([0.1, 0.55, NO_DATA, -0.3]));
    const round = bytesToInt16(int16ToBytes(q));
    expect(Array.from(round)).toEqual(Array.from(q));
  });
});
