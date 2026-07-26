// Unit 6's PURE half (record-pure.ts). The DB paths — cross-vineyard accept, commandId replay,
// the ten-block round-trip — are proven in scripts/verify-spray-record.ts on Demo Winery.
import { describe, expect, it } from "vitest";
import {
  canonicalQuantityForBasis,
  computeRateBasis,
  computeRequestHash,
  snapshotBlockLine,
  validateSprayInput,
} from "@/lib/spray/record-pure";
import type { RecordSprayInput, SprayMaterialLineInput } from "@/lib/spray/types";

const baseMaterial: SprayMaterialLineInput = {
  productName: "QA Sulfur",
  materialRole: "PESTICIDE",
  quantityEntered: 5,
  quantityUnit: "LB",
  quantityBasis: "PER_AREA",
  perAreaUnit: "ACRE",
};

const baseInput = (overrides: Partial<RecordSprayInput> = {}): RecordSprayInput => ({
  applicatorName: "QA Applicator",
  applicationMethod: "AIRBLAST",
  startedAt: new Date("2026-07-01T14:00:00Z"),
  materialLines: [baseMaterial],
  blockLines: [{ blockId: "blk1", treatedAreaHa: 1.2 }],
  ...overrides,
});

describe("council G3 — a quantity without a denominator is not a dose", () => {
  it("PER_AREA without perAreaUnit is an ERROR, never a guess", () => {
    const { errors } = validateSprayInput(baseInput({ materialLines: [{ ...baseMaterial, perAreaUnit: null }] }));
    expect(errors.some((e) => e.includes("perAreaUnit"))).toBe(true);
  });
  it("PER_CARRIER_VOLUME without perCarrierVolume is an ERROR", () => {
    const { errors } = validateSprayInput(
      baseInput({ materialLines: [{ ...baseMaterial, quantityBasis: "PER_CARRIER_VOLUME", perAreaUnit: null }] }),
    );
    expect(errors.some((e) => e.includes("perCarrierVolume"))).toBe(true);
  });
  it("PER_CARRIER_VOLUME with no carrier volume anywhere WARNS (never blocks) — KD-12", () => {
    const { errors, warnings } = validateSprayInput(
      baseInput({
        materialLines: [
          { ...baseMaterial, quantityBasis: "PER_CARRIER_VOLUME", perAreaUnit: null, perCarrierVolume: { value: 100, unit: "GAL" } },
        ],
      }),
    );
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.code === "MISSING_CARRIER_VOLUME_FOR_BASIS")).toBe(true);
  });
});

describe("canonicalQuantityForBasis (KD-5)", () => {
  it("TOTAL_IN_TANK → total canonical amount", () => {
    const c = canonicalQuantityForBasis({ ...baseMaterial, quantityBasis: "TOTAL_IN_TANK", quantityEntered: 10, quantityUnit: "LB" });
    expect(c!.quantityDimension).toBe("MASS");
    expect(c!.quantityCanonical).toBeCloseTo(4.5359237, 6);
  });
  it("PER_AREA per acre → canonical per HECTARE", () => {
    const c = canonicalQuantityForBasis({ ...baseMaterial, quantityEntered: 5, quantityUnit: "LB", perAreaUnit: "ACRE" });
    // 5 lb/acre = 2.268 kg / 0.4047 ha ≈ 5.605 kg/ha
    expect(c!.quantityCanonical).toBeCloseTo(5.6045, 3);
  });
  it("PER_CARRIER_VOLUME per 100 gal → canonical per LITER of carrier", () => {
    const c = canonicalQuantityForBasis({
      ...baseMaterial,
      quantityBasis: "PER_CARRIER_VOLUME",
      quantityEntered: 2,
      quantityUnit: "LB",
      perAreaUnit: null,
      perCarrierVolume: { value: 100, unit: "GAL" },
    });
    // 2 lb per 100 gal = 0.9072 kg per 378.54 L ≈ 0.002396 kg/L
    expect(c!.quantityCanonical).toBeCloseTo(0.0023964, 6);
  });
  it("returns null (never 0) when the denominator is missing or non-volume", () => {
    expect(canonicalQuantityForBasis({ ...baseMaterial, perAreaUnit: null })).toBeNull();
    expect(
      canonicalQuantityForBasis({
        ...baseMaterial,
        quantityBasis: "PER_CARRIER_VOLUME",
        perAreaUnit: null,
        perCarrierVolume: { value: 10, unit: "LB" }, // a mass is not a carrier volume
      }),
    ).toBeNull();
  });
});

describe("KD-7 — rate basis provenance", () => {
  it("MEASURED when the block's own volumeUsedL is present", () => {
    const r = computeRateBasis({ volumeUsedL: 1200, treatedAreaHa: 2 }, 935);
    expect(r).toEqual({ rateBasis: "MEASURED", computedVolumePerHaL: 600 });
  });
  it("HEADER_VOLUME when only the header volume is", () => {
    const r = computeRateBasis({ volumeUsedL: null, treatedAreaHa: 2 }, 935);
    expect(r).toEqual({ rateBasis: "HEADER_VOLUME", computedVolumePerHaL: 935 });
  });
  it("UNKNOWN when neither — and the rate is null, NEVER 0", () => {
    const r = computeRateBasis({ volumeUsedL: null, treatedAreaHa: 2 }, null);
    expect(r.rateBasis).toBe("UNKNOWN");
    expect(r.computedVolumePerHaL).toBeNull();
    expect(r.computedVolumePerHaL).not.toBe(0);
  });
});

describe("validation — blocks and segments", () => {
  it("a zero or negative treated area is refused", () => {
    const { errors } = validateSprayInput(baseInput({ blockLines: [{ blockId: "blk1", treatedAreaHa: 0 }] }));
    expect(errors.some((e) => e.includes("treatedAreaHa"))).toBe(true);
    const neg = validateSprayInput(baseInput({ blockLines: [{ blockId: "blk1", treatedAreaHa: -1 }] }));
    expect(neg.errors.length).toBeGreaterThan(0);
  });

  it("the same block twice with distinct segmentNo is ACCEPTED (council G7)", () => {
    const { errors } = validateSprayInput(
      baseInput({
        blockLines: [
          { blockId: "blk1", segmentNo: 1, treatedAreaHa: 1 },
          { blockId: "blk1", segmentNo: 2, treatedAreaHa: 0.5 },
        ],
      }),
    );
    expect(errors).toEqual([]);
  });

  it("the same (block, segment) twice is refused", () => {
    const { errors } = validateSprayInput(
      baseInput({
        blockLines: [
          { blockId: "blk1", segmentNo: 1, treatedAreaHa: 1 },
          { blockId: "blk1", segmentNo: 1, treatedAreaHa: 0.5 },
        ],
      }),
    );
    expect(errors.some((e) => e.includes("duplicate"))).toBe(true);
  });

  it("segments >24h apart WARN and never block (D3)", () => {
    const { errors, warnings } = validateSprayInput(
      baseInput({
        blockLines: [
          { blockId: "blk1", segmentNo: 1, treatedAreaHa: 1, startedAt: new Date("2026-07-01T08:00:00Z"), finishedAt: new Date("2026-07-01T09:00:00Z") },
          { blockId: "blk1", segmentNo: 2, treatedAreaHa: 0.5, startedAt: new Date("2026-07-03T08:00:00Z"), finishedAt: new Date("2026-07-03T09:00:00Z") },
        ],
      }),
    );
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.code === "SEGMENT_GAP_OVER_24H")).toBe(true);
  });

  it("segments 3h apart do not warn", () => {
    const { warnings } = validateSprayInput(
      baseInput({
        blockLines: [
          { blockId: "blk1", segmentNo: 1, treatedAreaHa: 1, startedAt: new Date("2026-07-01T08:00:00Z"), finishedAt: new Date("2026-07-01T09:00:00Z") },
          { blockId: "blk1", segmentNo: 2, treatedAreaHa: 0.5, startedAt: new Date("2026-07-01T11:00:00Z"), finishedAt: new Date("2026-07-01T12:00:00Z") },
        ],
      }),
    );
    expect(warnings.filter((w) => w.code === "SEGMENT_GAP_OVER_24H")).toEqual([]);
  });
});

describe("KD-6 / council CQ2 — the area snapshot records its provenance", () => {
  const block = { blockLabel: "Block 4", code: "4", rowSpacingM: 2.7432, vineSpacingM: 1.8288, vineCount: 1000 };
  it("operator-entered wins and is recorded as OPERATOR_ENTERED", () => {
    const s = snapshotBlockLine({ blockId: "b", treatedAreaHa: 2.5 }, block);
    expect(s).toMatchObject({ treatedAreaHa: 2.5, treatedAreaSource: "OPERATOR_ENTERED" });
  });
  it("defaults from spacing × vine count as DERIVED_FROM_SPACING", () => {
    const s = snapshotBlockLine({ blockId: "b" }, block);
    expect(s.treatedAreaSource).toBe("DERIVED_FROM_SPACING");
    expect(s.treatedAreaHa).toBeCloseTo((2.7432 * 1.8288 * 1000) / 10000, 6);
  });
  it("underivable + not entered → null (an error upstream, never a default)", () => {
    const s = snapshotBlockLine({ blockId: "b" }, { blockLabel: null, code: null, rowSpacingM: null, vineSpacingM: null, vineCount: null });
    expect(s.treatedAreaHa).toBeNull();
  });
});

describe("council C8 — requestHash", () => {
  it("is stable across key order and identical for identical payloads", () => {
    expect(computeRequestHash({ a: 1, b: [2, 3] })).toBe(computeRequestHash({ b: [2, 3], a: 1 }));
  });
  it("differs for a different payload", () => {
    expect(computeRequestHash({ a: 1 })).not.toBe(computeRequestHash({ a: 2 }));
  });
});
