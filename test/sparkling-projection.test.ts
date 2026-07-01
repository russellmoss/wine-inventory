import { describe, it, expect } from "vitest";
import type { VesselLotBalance } from "@/lib/ledger/math";
import {
  foldBottledLot,
  isCountVolumeConsistent,
  assertCountVolumeConsistent,
  resolveBucket,
  type BottledStateProjection,
} from "@/lib/sparkling/projection";
import {
  planTirageBottling,
  planDisgorgement,
  planDosage,
  planBottleSplit,
  planFinishHandoff,
} from "@/lib/sparkling/plan";

describe("resolveBucket", () => {
  it("defaults VESSEL when vesselId is set, EXTERNAL otherwise, honors explicit bucket", () => {
    expect(resolveBucket({ vesselId: "T1", bucket: undefined })).toBe("VESSEL");
    expect(resolveBucket({ vesselId: null, bucket: undefined })).toBe("EXTERNAL");
    expect(resolveBucket({ vesselId: null, bucket: "BOTTLE_STORAGE" })).toBe("BOTTLE_STORAGE");
  });
});

describe("foldBottledLot across the full arc (fold == projection)", () => {
  const balances: VesselLotBalance[] = [{ vesselId: "T1", lotId: "L1", volumeL: 1500 }];
  const NOMINAL = 750;

  it("tirage → disgorge → dosage → partial split → finish reconciles count + volume, in tolerance every step", () => {
    // Tirage: 1500 L → 2000 × 750 mL
    let state = foldBottledLot(null, planTirageBottling(balances, "T1", "L1", 1500, 2000, 750).lines, "L1");
    expect(state).toEqual({ lotId: "L1", bottleCount: 2000, volumeL: 1500 });
    assertCountVolumeConsistent(state!, NOMINAL);

    // Full disgorgement: 2000 × 25 mL plug → −50 L, count unchanged
    state = foldBottledLot(state, planDisgorgement({ lotId: "L1", bottlesDisgorged: 2000, perBottleLossMl: 25, perBottleVolumeMl: 750 }).lines, "L1");
    expect(state).toEqual({ lotId: "L1", bottleCount: 2000, volumeL: 1450 });
    assertCountVolumeConsistent(state!, NOMINAL);

    // Dosage: 15 mL × 2000 → +30 L
    state = foldBottledLot(state, planDosage("L1", 2000, 15).lines, "L1");
    expect(state).toEqual({ lotId: "L1", bottleCount: 2000, volumeL: 1480 });
    assertCountVolumeConsistent(state!, NOMINAL);

    // Partial split: peel 500 bottles into child C1
    const split = planBottleSplit({ lotId: "L1", bottleCount: state!.bottleCount, volumeL: state!.volumeL }, [{ childLotId: "C1", bottleCount: 500 }]);
    const parent = foldBottledLot(state, split.lines, "L1");
    const child = foldBottledLot(null, split.lines, "C1");
    expect(parent).toEqual({ lotId: "L1", bottleCount: 1500, volumeL: 1110 });
    expect(child).toEqual({ lotId: "C1", bottleCount: 500, volumeL: 370 });
    // conservation: parent lost exactly what the child gained
    expect(parent!.bottleCount + child!.bottleCount).toBe(2000);
    expect(Math.round((parent!.volumeL + child!.volumeL) * 100) / 100).toBe(1480);
    assertCountVolumeConsistent(parent!, NOMINAL);
    assertCountVolumeConsistent(child!, NOMINAL);

    // Finish the parent → drains to functional zero → row deleted (null)
    const finished = foldBottledLot(parent, planFinishHandoff({ lotId: "L1", bottleCount: parent!.bottleCount, volumeL: parent!.volumeL }).lines, "L1");
    expect(finished).toBeNull();
  });

  it("returns current unchanged when no BOTTLE_STORAGE leg touches the lot", () => {
    const cur: BottledStateProjection = { lotId: "L1", bottleCount: 100, volumeL: 75 };
    expect(foldBottledLot(cur, [{ lotId: "L1", vesselId: "T1", deltaL: -10, bucket: "VESSEL" }], "L1")).toEqual(cur);
  });

  it("throws if the fold would drive count negative", () => {
    const cur: BottledStateProjection = { lotId: "L1", bottleCount: 100, volumeL: 75 };
    expect(() => foldBottledLot(cur, planFinishHandoff({ lotId: "L1", bottleCount: 200, volumeL: 150 }).lines, "L1")).toThrow(/negative/);
  });
});

describe("count/volume tolerance (K6)", () => {
  it("a lot at functional zero is consistent; a 50%-off fill is not", () => {
    expect(isCountVolumeConsistent({ lotId: "L1", bottleCount: 0, volumeL: 0 }, 750)).toBe(true);
    expect(isCountVolumeConsistent({ lotId: "L1", bottleCount: 2000, volumeL: 1500 }, 750)).toBe(true); // exactly nominal
    expect(isCountVolumeConsistent({ lotId: "L1", bottleCount: 2000, volumeL: 1450 }, 750)).toBe(true); // post-disgorge, in band
    expect(isCountVolumeConsistent({ lotId: "L1", bottleCount: 2000, volumeL: 200 }, 750)).toBe(false); // 100 mL/bottle — gross desync
    expect(() => assertCountVolumeConsistent({ lotId: "L1", bottleCount: 2000, volumeL: 200 }, 750)).toThrow(/tolerance/);
  });
});
