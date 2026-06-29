import { describe, it, expect } from "vitest";
import { scaleTrialToVolume } from "@/lib/blend/trial-math";

describe("scaleTrialToVolume", () => {
  it("scales a 60/30/10 proportion trial to a 600 L tank → 360/180/60", () => {
    const out = scaleTrialToVolume(
      [
        { lotId: "A", proportion: 0.6 },
        { lotId: "B", proportion: 0.3 },
        { lotId: "C", proportion: 0.1 },
      ],
      600,
    );
    expect(out).toEqual([
      { lotId: "A", litres: 360 },
      { lotId: "B", litres: 180 },
      { lotId: "C", litres: 60 },
    ]);
  });

  it("scales bench mL volumes by ratio (60/30/10 mL → 360/180/60 L of 600)", () => {
    const out = scaleTrialToVolume(
      [
        { lotId: "A", volume: 60 },
        { lotId: "B", volume: 30 },
        { lotId: "C", volume: 10 },
      ],
      600,
    );
    expect(out.map((o) => o.litres)).toEqual([360, 180, 60]);
  });

  it("returns zeros for an empty / zero-weight trial rather than NaN", () => {
    expect(scaleTrialToVolume([{ lotId: "A", proportion: 0 }], 600)).toEqual([{ lotId: "A", litres: 0 }]);
    expect(scaleTrialToVolume([{ lotId: "A", proportion: 1 }], 0)).toEqual([{ lotId: "A", litres: 0 }]);
  });
});
