import { describe, it, expect } from "vitest";
import { isBalanced, type LedgerLine, type VesselLotBalance } from "@/lib/ledger/math";
import {
  planTirageBottling,
  planDisgorgement,
  planDosage,
  planBottleSplit,
  planFinishHandoff,
  mlToL,
} from "@/lib/sparkling/plan";

const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

/** Every planner must produce balanced lines, and every BOTTLE_STORAGE leg must pair deltaL + bottleDelta. */
function assertWellFormed(lines: LedgerLine[]) {
  expect(isBalanced(lines)).toBe(true);
  for (const l of lines) {
    if (l.bucket === "BOTTLE_STORAGE") {
      expect(l.bottleDelta, "BOTTLE_STORAGE legs carry a bottleDelta").not.toBeUndefined();
    } else {
      expect(l.bottleDelta, "non-BOTTLE_STORAGE legs have no bottleDelta").toBeUndefined();
    }
  }
}

describe("planTirageBottling", () => {
  const balances: VesselLotBalance[] = [{ vesselId: "T1", lotId: "L1", volumeL: 1500 }];

  it("1500 L → 2000 × 750 mL: bottleCount 2000, volume ~1500, balanced BOTTLE_STORAGE leg", () => {
    const p = planTirageBottling(balances, "T1", "L1", 1500, 2000, 750);
    assertWellFormed(p.lines);
    expect(p.bottleCount).toBe(2000);
    expect(p.drawL).toBe(1500);
    const bottleLeg = p.lines.find((l) => l.bucket === "BOTTLE_STORAGE")!;
    expect(bottleLeg.deltaL).toBe(1500);
    expect(bottleLeg.bottleDelta).toBe(2000);
    const vesselLeg = p.lines.find((l) => l.bucket === "VESSEL")!;
    expect(vesselLeg.vesselId).toBe("T1");
    expect(vesselLeg.deltaL).toBe(-1500);
  });

  it("rejects an over-draw beyond the lot's balance", () => {
    expect(() => planTirageBottling(balances, "T1", "L1", 1600, 2000, 750)).toThrow(/holds/);
  });

  it("rejects a non-positive or fractional bottle count", () => {
    expect(() => planTirageBottling(balances, "T1", "L1", 1500, 0, 750)).toThrow(/whole number/);
    expect(() => planTirageBottling(balances, "T1", "L1", 1500, 10.5, 750)).toThrow(/whole number/);
  });
});

describe("planDisgorgement", () => {
  it("2000 × 25 mL: volume −50 L, count unchanged", () => {
    const p = planDisgorgement({ lotId: "L1", bottlesDisgorged: 2000, perBottleLossMl: 25, perBottleVolumeMl: 750 });
    assertWellFormed(p.lines);
    expect(p.volumeLostL).toBe(50);
    expect(p.bottleDelta).toBe(0);
  });

  it("breakage drops BOTH count and volume; sacrificial drops count only", () => {
    // 500 disgorged @ 25 mL = 12.5 L plug loss; +3 breakage @ 750 mL = 2.25 L; +40 sacrificial = no extra volume.
    const p = planDisgorgement({
      lotId: "L1",
      bottlesDisgorged: 500,
      perBottleLossMl: 25,
      perBottleVolumeMl: 750,
      breakageCount: 3,
      sacrificedBottleCount: 40,
    });
    assertWellFormed(p.lines);
    expect(p.bottleDelta).toBe(-(40 + 3));
    expect(p.volumeLostL).toBe(Math.round((25 * 500 + 750 * 3) / 1000 * 100) / 100); // 14.75 L
  });

  it("sacrificial-only adds no volume beyond the plug loss (reallocated, not lost)", () => {
    const withSac = planDisgorgement({ lotId: "L1", bottlesDisgorged: 100, perBottleLossMl: 25, perBottleVolumeMl: 750, sacrificedBottleCount: 5 });
    const without = planDisgorgement({ lotId: "L1", bottlesDisgorged: 100, perBottleLossMl: 25, perBottleVolumeMl: 750 });
    expect(withSac.volumeLostL).toBe(without.volumeLostL); // sacrifice is volume-neutral
    expect(withSac.bottleDelta).toBe(-5);
  });

  it("rejects a non-positive disgorge count or loss", () => {
    expect(() => planDisgorgement({ lotId: "L1", bottlesDisgorged: 0, perBottleLossMl: 25, perBottleVolumeMl: 750 })).toThrow(/whole number/);
    expect(() => planDisgorgement({ lotId: "L1", bottlesDisgorged: 10, perBottleLossMl: 0, perBottleVolumeMl: 750 })).toThrow(/greater than 0/);
  });
});

describe("planDosage", () => {
  it("15 mL × 2000 bottles: +30 L, count unchanged, EXTERNAL counter is not a loss", () => {
    const p = planDosage("L1", 2000, 15);
    assertWellFormed(p.lines);
    expect(p.addedL).toBe(30);
    const bottleLeg = p.lines.find((l) => l.bucket === "BOTTLE_STORAGE")!;
    expect(bottleLeg.deltaL).toBe(30);
    expect(bottleLeg.bottleDelta).toBe(0);
    const ext = p.lines.find((l) => l.bucket === "EXTERNAL")!;
    expect(ext.reason).toBe("dosage");
    expect(ext.reason).not.toBe("loss");
  });
});

describe("planBottleSplit (partial disgorgement)", () => {
  it("2000 → 500 child + 1500 parent conserves count and volume", () => {
    const p = planBottleSplit({ lotId: "P", bottleCount: 2000, volumeL: 1500 }, [{ childLotId: "C", bottleCount: 500 }]);
    assertWellFormed(p.lines);
    expect(p.parentRemainingCount).toBe(1500);
    // per-bottle fill = 1500/2000 = 0.75 L; 500 bottles = 375 L
    expect(p.perTranche[0].volumeL).toBe(375);
    expect(p.parentRemainingVolumeL).toBe(1125);
    // conservation: parent delta + child delta = 0
    expect(sum(p.lines.map((l) => l.deltaL))).toBe(0);
    expect(sum(p.lines.map((l) => l.bottleDelta ?? 0))).toBe(0);
  });

  it("rejects peeling more bottles than the parent holds", () => {
    expect(() => planBottleSplit({ lotId: "P", bottleCount: 100, volumeL: 75 }, [{ childLotId: "C", bottleCount: 200 }])).toThrow(/holds/);
  });
});

describe("planFinishHandoff", () => {
  it("drains volume + count to zero against an EXTERNAL bottle leg", () => {
    const p = planFinishHandoff({ lotId: "L1", bottleCount: 1500, volumeL: 1140 });
    assertWellFormed(p.lines);
    expect(p.volumeL).toBe(1140);
    expect(p.bottleCount).toBe(1500);
    const bottleLeg = p.lines.find((l) => l.bucket === "BOTTLE_STORAGE")!;
    expect(bottleLeg.deltaL).toBe(-1140);
    expect(bottleLeg.bottleDelta).toBe(-1500);
    expect(p.lines.find((l) => l.bucket === "EXTERNAL")!.reason).toBe("bottle");
  });

  it("rejects finishing an empty lot", () => {
    expect(() => planFinishHandoff({ lotId: "L1", bottleCount: 0, volumeL: 0 })).toThrow(/empty/);
  });
});

describe("mlToL", () => {
  it("converts mL → L at centiliter precision", () => {
    expect(mlToL(750)).toBe(0.75);
    expect(mlToL(25)).toBe(0.03); // round2
  });
});
