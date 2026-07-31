import { describe, it, expect } from "vitest";
import {
  allocateProportionalIncrease,
  planRecordedVolumeCorrection,
  normalizeCorrectionReason,
  CORRECTION_NOISE_L,
  MAX_REASON_CHARS,
} from "@/lib/cellar/volume-correction-plan";

/**
 * The live repro (feedback cms8a9nau0005i8045l65vomp): Demo Winery barrel B3, a 225 L barrique,
 * SEEDed at 100 L on 2026-07-18 with lot 2025-PN. It really held 225 L — the fill volume was typed
 * wrong. Every case below is anchored on those numbers so the test says what the feature is for.
 */
const B3 = { currentL: 100, capacityL: 225 };

describe("planRecordedVolumeCorrection", () => {
  it("the reported case: 100 L corrected up to 225 L is a +125 L correction", () => {
    expect(planRecordedVolumeCorrection({ ...B3, targetL: 225 })).toEqual({
      kind: "CORRECT",
      fromL: 100,
      toL: 225,
      deltaL: 125,
    });
  });

  it("corrects downward too — an over-recorded fill is the same class of typo", () => {
    expect(planRecordedVolumeCorrection({ currentL: 225, capacityL: 225, targetL: 100 })).toEqual({
      kind: "CORRECT",
      fromL: 225,
      toL: 100,
      deltaL: -125,
    });
  });

  it("re-submitting the number already on the books never writes", () => {
    expect(planRecordedVolumeCorrection({ ...B3, targetL: 100 })).toEqual({ kind: "NO_OP", currentL: 100 });
  });

  it("sub-centiliter differences are float noise, not an edit", () => {
    const target = 100 + CORRECTION_NOISE_L / 2;
    expect(planRecordedVolumeCorrection({ ...B3, targetL: target })).toEqual({ kind: "NO_OP", currentL: 100 });
  });

  it("a difference at the centiliter grid IS a real edit", () => {
    expect(planRecordedVolumeCorrection({ ...B3, targetL: 100.01 })).toEqual({
      kind: "CORRECT",
      fromL: 100,
      toL: 100.01,
      deltaL: 0.01,
    });
  });

  it("filling to exactly capacity is allowed — a 225 L barrique full of wine is the normal case", () => {
    expect(planRecordedVolumeCorrection({ ...B3, targetL: 225 }).kind).toBe("CORRECT");
  });

  it("refuses to put more wine in the vessel than it holds", () => {
    expect(planRecordedVolumeCorrection({ ...B3, targetL: 300 })).toEqual({
      kind: "BLOCKED_OVER_CAPACITY",
      targetL: 300,
      capacityL: 225,
    });
  });

  it("refuses on an empty vessel — there is no wine whose volume could be wrong", () => {
    expect(planRecordedVolumeCorrection({ currentL: 0, capacityL: 225, targetL: 225 })).toEqual({
      kind: "BLOCKED_EMPTY",
    });
  });

  it("an empty vessel is refused BEFORE the capacity check, so the message names the real problem", () => {
    expect(planRecordedVolumeCorrection({ currentL: 0, capacityL: 225, targetL: 900 })).toEqual({
      kind: "BLOCKED_EMPTY",
    });
  });

  it("rounds to the centiliter grid the ledger stores at, so the delta is exact", () => {
    const plan = planRecordedVolumeCorrection({ currentL: 100.004, capacityL: 300, targetL: 225.006 });
    expect(plan).toEqual({ kind: "CORRECT", fromL: 100, toL: 225.01, deltaL: 125.01 });
  });

  it("rounds BEFORE the capacity check: 225.006 into a 225 L barrique rounds to 225.01 and is refused", () => {
    // Not pedantry — the ledger chokepoint compares the same rounded numbers, so a plan that
    // said CORRECT here would promise a write the chokepoint then throws on.
    expect(planRecordedVolumeCorrection({ ...B3, targetL: 225.006 })).toEqual({
      kind: "BLOCKED_OVER_CAPACITY",
      targetL: 225.01,
      capacityL: 225,
    });
  });
});

describe("allocateProportionalIncrease", () => {
  it("REGRESSION: grows a position by MORE than it holds — the draw helper throws here", () => {
    // B3: one lot at 100 L, +125 L. computeProportionalDraw refuses this ("draw exceeds available
    // volume"), which is the defect that made the reported edit appear to do nothing.
    expect(allocateProportionalIncrease([{ id: "pn", volumeL: 100 }], 125)).toEqual([{ id: "pn", addL: 125 }]);
  });

  it("splits by volume share across co-resident positions", () => {
    expect(
      allocateProportionalIncrease(
        [
          { id: "a", volumeL: 300 },
          { id: "b", volumeL: 100 },
        ],
        40,
      ),
    ).toEqual([
      { id: "a", addL: 30 },
      { id: "b", addL: 10 },
    ]);
  });

  it("sums EXACTLY to the requested increase even when the split doesn't divide evenly", () => {
    const shares = allocateProportionalIncrease(
      [
        { id: "a", volumeL: 100 },
        { id: "b", volumeL: 100 },
        { id: "c", volumeL: 100 },
      ],
      10,
    );
    const total = shares.reduce((a, s) => a + s.addL, 0);
    expect(Math.round(total * 100)).toBe(1000); // exact in centiliters — the op must balance
  });

  it("a zero increase allocates nothing", () => {
    expect(allocateProportionalIncrease([{ id: "a", volumeL: 100 }], 0)).toEqual([{ id: "a", addL: 0 }]);
  });

  it("refuses a negative increase and an all-empty position set", () => {
    expect(() => allocateProportionalIncrease([{ id: "a", volumeL: 100 }], -1)).toThrow(/>= 0/);
    expect(() => allocateProportionalIncrease([{ id: "a", volumeL: 0 }], 10)).toThrow(/empty positions/);
  });
});

describe("normalizeCorrectionReason", () => {
  it("keeps a real reason, trimmed", () => {
    expect(normalizeCorrectionReason("  fill volume mistyped as 100  ")).toBe("fill volume mistyped as 100");
  });

  it("rejects blank, whitespace and non-strings — an unexplained volume change is the thing being prevented", () => {
    expect(normalizeCorrectionReason("")).toBeNull();
    expect(normalizeCorrectionReason("   ")).toBeNull();
    expect(normalizeCorrectionReason(undefined)).toBeNull();
    expect(normalizeCorrectionReason(null)).toBeNull();
    expect(normalizeCorrectionReason(42)).toBeNull();
  });

  it("bounds an over-long reason instead of rejecting it", () => {
    const long = "x".repeat(MAX_REASON_CHARS + 200);
    expect(normalizeCorrectionReason(long)).toHaveLength(MAX_REASON_CHARS);
  });
});
