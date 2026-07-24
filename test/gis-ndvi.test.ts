import { describe, it, expect } from "vitest";
import {
  ndviValue,
  computeNdvi,
  isUsableScl,
  isNoData,
  unharmonizedNdvi,
  SCL_CLASS,
} from "@/lib/gis/ndvi";
import { makeFixtureScene, NDVI_SAMPLES, BASELINE_TRAP, at, SCL } from "./fixtures/gis/rasters";

describe("ndviValue — brief §5 policy, verbatim", () => {
  it("computes the exact decimals the fixtures were built around", () => {
    for (const s of Object.values(NDVI_SAMPLES)) {
      expect(ndviValue(s.red, s.nir)).toBeCloseTo(s.ndvi, 12);
    }
  });

  it("yields no-data for a zero denominator, never Infinity", () => {
    const v = ndviValue(0, 0);
    expect(isNoData(v)).toBe(true);
    expect(Number.isFinite(v)).toBe(false);
  });

  it("yields no-data when a band is non-finite", () => {
    expect(isNoData(ndviValue(Number.NaN, 0.4))).toBe(true);
    expect(isNoData(ndviValue(0.1, Number.POSITIVE_INFINITY))).toBe(true);
  });

  it("clamps to [-1, 1] at both ends", () => {
    expect(ndviValue(0, 1)).toBe(1);
    expect(ndviValue(1, 0)).toBe(-1);
    // a pathological pair that would otherwise exceed the range
    expect(ndviValue(-0.4, 0.5)).toBeLessThanOrEqual(1);
    expect(ndviValue(-0.4, 0.5)).toBeGreaterThanOrEqual(-1);
  });

  it("does NOT add an epsilon to the denominator — no-data is explicit", () => {
    // just above the floor: a real (very large) value, not a silently softened one
    const v = ndviValue(0, 1e-5);
    expect(isNoData(v)).toBe(false);
    expect(v).toBe(1);
    // below the floor: no-data
    expect(isNoData(ndviValue(0, 1e-9))).toBe(true);
  });

  it("accepts negative reflectance as data, and clamps the resulting >1 ratio to 1", () => {
    // Deep shadow: red is negative, which harmonizeValues:false preserves rather than clamping at
    // the source. The RAW ratio here is 0.41/0.39 = 1.05, and brief §5's clamp pulls it to 1.0.
    const v = ndviValue(-0.01, 0.4);
    expect(isNoData(v)).toBe(false);
    expect(v).toBe(1);
    // the un-clamped ratio really did exceed 1 — this is not a red==0 fabrication
    expect((0.4 - -0.01) / (0.4 + -0.01)).toBeGreaterThan(1);
  });

  it("negative red and clamped-zero red both land on 1.0 — hence the saturated sentinel", () => {
    expect(ndviValue(-0.01, 0.4)).toBe(1);
    expect(ndviValue(0, 0.4)).toBe(1);
  });

  it("no-data is a distinct value, never confusable with a legitimate NDVI of 0", () => {
    expect(isNoData(ndviValue(0.25, 0.25))).toBe(false);
    expect(ndviValue(0.25, 0.25)).toBe(0);
  });
});

describe("SCL masking", () => {
  it("keeps vegetation and bare soil", () => {
    expect(isUsableScl(SCL_CLASS.VEGETATION)).toBe(true);
    expect(isUsableScl(SCL_CLASS.BARE_SOIL)).toBe(true);
  });

  it("excludes cloud, cirrus, snow, water, saturated and no-data", () => {
    for (const c of [
      SCL_CLASS.NO_DATA,
      SCL_CLASS.SATURATED_OR_DEFECTIVE,
      SCL_CLASS.DARK_AREA,
      SCL_CLASS.WATER,
      SCL_CLASS.CLOUD_MEDIUM,
      SCL_CLASS.CLOUD_HIGH,
      SCL_CLASS.CIRRUS,
      SCL_CLASS.SNOW_OR_ICE,
    ]) {
      expect(isUsableScl(c)).toBe(false);
    }
  });

  it("excludes CLOUD SHADOW — the class most often forgotten and the most damaging", () => {
    // it depresses NDVI without looking like cloud, so a shadowed block reads as a real vigour dip
    expect(isUsableScl(SCL_CLASS.CLOUD_SHADOW)).toBe(false);
  });

  it("treats class 7 as marginal — excluded by default, opt-in only", () => {
    expect(isUsableScl(SCL_CLASS.CLOUD_LOW_OR_UNCLASSIFIED)).toBe(false);
    expect(isUsableScl(SCL_CLASS.CLOUD_LOW_OR_UNCLASSIFIED, { allowMarginal: true })).toBe(true);
  });
});

describe("computeNdvi over the fixture scene", () => {
  const scene = makeFixtureScene();
  const r = computeNdvi(scene.red, scene.nir, scene.scl, scene.width, scene.height);

  it("produces the expected NDVI per land-cover band, to float32 precision", () => {
    // The fixture stores reflectance in Float32Array, exactly as real Sentinel data arrives, so
    // 0.05/0.45 are float32-rounded and NDVI lands at 0.7999999925 rather than 0.8. Asserting to
    // 12 decimals would be asserting a precision the input never had.
    expect(r.values[at(scene, 5, 3)]).toBeCloseTo(NDVI_SAMPLES.vigorous.ndvi, 7);
    expect(r.values[at(scene, 5, 12)]).toBeCloseTo(NDVI_SAMPLES.moderate.ndvi, 7);
    expect(r.values[at(scene, 5, 16)]).toBeCloseTo(NDVI_SAMPLES.soil.ndvi, 7);
  });

  it("masks the cloud/shadow/cirrus row even though its reflectance looks fine", () => {
    for (let col = 0; col < scene.width; col++) {
      expect(isNoData(r.values[at(scene, col, 18)])).toBe(true);
    }
    // the trap: the VALUES were plausible; only the class said otherwise
    expect(scene.red[at(scene, 0, 18)]).toBeGreaterThan(0);
  });

  it("masks the no-data row", () => {
    for (let col = 0; col < scene.width; col++) {
      expect(isNoData(r.values[at(scene, col, 19)])).toBe(true);
    }
  });

  it("counts valid and masked pixels consistently", () => {
    // rows 0-17 usable (18 rows x 20), rows 18-19 masked (2 x 20)
    expect(r.maskedCount).toBe(40);
    expect(r.validCount).toBe(360);
    expect(r.validCount + r.maskedCount).toBe(scene.width * scene.height);
  });

  it("flags exactly the one negative-reflectance pixel as saturated", () => {
    // The fixture plants a single deep-shadow pixel (red = -0.01) at index 0. Its clamped NDVI of
    // 1.0 is real data, but it is not a vigour reading, so it must be countable.
    expect(r.saturatedCount).toBe(1);
    expect(r.values[0]).toBe(1);
  });

  it("also flags saturation from a clamped (red == 0) band", () => {
    const red = new Float32Array([0, 0.05]);
    const nir = new Float32Array([0.4, 0.45]);
    const scl = new Uint8Array([SCL.VEGETATION, SCL.VEGETATION]);
    const out = computeNdvi(red, nir, scl, 2, 1);
    expect(out.saturatedCount).toBe(1);
    expect(out.values[0]).toBe(1);
  });
});

describe("the baseline-04.00 trap — pinned as a regression", () => {
  it("reproduces the documented −0.257 error at vigorous canopy", () => {
    const t = BASELINE_TRAP[0];
    const got = unharmonizedNdvi(t.red, t.nir);
    expect(got).toBeCloseTo(t.unharmonizedNdvi, 12);
    expect(t.trueNdvi - got).toBeCloseTo(0.257, 3);
  });

  it("compresses NDVI toward zero for every land cover", () => {
    for (const t of BASELINE_TRAP) {
      expect(unharmonizedNdvi(t.red, t.nir)).toBeLessThan(t.trueNdvi);
    }
  });

  it("errs most where the product earns its keep, and least on bare soil", () => {
    const errs = BASELINE_TRAP.map((t) => t.trueNdvi - unharmonizedNdvi(t.red, t.nir));
    expect(errs[0]).toBeGreaterThan(errs[2]);
  });

  it("is NOT a constant offset, so it cannot be calibrated out after the fact", () => {
    const errs = BASELINE_TRAP.map((t) => t.trueNdvi - unharmonizedNdvi(t.red, t.nir));
    // if it were constant, every error would match; the spread is what makes it uncorrectable
    expect(Math.abs(errs[0] - errs[2])).toBeGreaterThan(0.15);
  });

  it("harmonized and un-harmonized differ — the guard has something to guard", () => {
    const t = BASELINE_TRAP[0];
    expect(ndviValue(t.red, t.nir)).not.toBeCloseTo(unharmonizedNdvi(t.red, t.nir), 3);
  });
});
