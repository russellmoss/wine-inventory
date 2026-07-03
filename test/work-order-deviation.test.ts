import { describe, it, expect } from "vitest";
import { computeDeviations, hasSignificantDeviation } from "@/lib/work-orders/deviation";

describe("computeDeviations", () => {
  it("reports no deviation when planned equals actual", () => {
    const d = computeDeviations({ drawL: 200, lossL: 5 }, { drawL: 200, lossL: 5 });
    expect(d).toEqual([]);
    expect(hasSignificantDeviation(d)).toBe(false);
  });

  it("computes delta + pct for a changed volume", () => {
    const d = computeDeviations({ drawL: 200 }, { drawL: 210 });
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ field: "drawL", planned: 200, actual: 210, delta: 10, pct: 5 });
  });

  it("a >1% volume change is significant; ≤1% is not (D3)", () => {
    expect(hasSignificantDeviation(computeDeviations({ drawL: 200 }, { drawL: 210 }))).toBe(true); // +5%
    expect(hasSignificantDeviation(computeDeviations({ drawL: 200 }, { drawL: 201 }))).toBe(false); // +0.5%
  });

  it("any chem-amount / rate change is significant (D3)", () => {
    expect(hasSignificantDeviation(computeDeviations({ rateValue: 30 }, { rateValue: 31 }))).toBe(true);
    expect(hasSignificantDeviation(computeDeviations({ plannedAmount: 120 }, { plannedAmount: 121 }))).toBe(true);
  });

  it("ignores non-tracked fields and unchanged values", () => {
    const d = computeDeviations({ drawL: 200, note: "x", fromVesselId: "a" }, { drawL: 200, note: "y", fromVesselId: "b" });
    expect(d).toEqual([]);
  });

  it("flags a field that appeared or disappeared", () => {
    const d = computeDeviations({ lossL: 5 }, {});
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ field: "lossL", planned: 5, actual: null, delta: null, significant: true });
  });
});
