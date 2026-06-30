import { describe, it, expect } from "vitest";
import { planCrush, planCrushSplit, isBalanced, type CrushPickDraw } from "@/lib/ledger/math";

// Phase 6 Unit 3: the PURE crush plan. The DB core (sequential-fill ADD, block access,
// commandId idempotency) is exercised end-to-end in scripts/verify-ferment.ts (Unit 12).

const pick = (over: Partial<CrushPickDraw> = {}): CrushPickDraw => ({
  pickId: "p1",
  consumedKg: 1000,
  weightKg: 1000,
  alreadyConsumedKg: 0,
  ...over,
});

describe("planCrush", () => {
  it("originates a must lot at the MEASURED output, balanced, with an origination (not loss) leg", () => {
    const plan = planCrush([pick({ consumedKg: 3200, weightKg: 3200 })], "tank-1", "must-lot", 2350);
    expect(isBalanced(plan.lines)).toBe(true);
    const into = plan.lines.find((l) => l.vesselId === "tank-1")!;
    const counter = plan.lines.find((l) => l.vesselId === null)!;
    expect(into.deltaL).toBe(2350);
    expect(counter.deltaL).toBe(-2350);
    // The null leg is origination-from-harvest, NOT loss (council S8 — excluded from shrink).
    expect(counter.reason).toBe("crush_origination");
    expect(plan.lines.some((l) => l.reason === "loss")).toBe(false);
  });

  it("derives yield from the measured liters, never from kg", () => {
    // 3.2 t in → 2350 L out = 0.734 L/kg = 734 L/tonne. Driven by the MEASURED output.
    const plan = planCrush([pick({ consumedKg: 3200, weightKg: 3200 })], "tank-1", "must-lot", 2350);
    expect(plan.totalConsumedKg).toBe(3200);
    expect(plan.yieldLPerKg).toBeCloseTo(0.7344, 4);
    expect(plan.yieldLPerTonne).toBeCloseTo(734.38, 2);
  });

  it("sums consumed kg across several picks", () => {
    const plan = planCrush(
      [pick({ pickId: "a", consumedKg: 1200, weightKg: 1200 }), pick({ pickId: "b", consumedKg: 800, weightKg: 800 })],
      "tank-1",
      "must-lot",
      1500,
    );
    expect(plan.totalConsumedKg).toBe(2000);
    expect(plan.yieldLPerKg).toBeCloseTo(0.75, 4);
  });

  it("allows a PARTIAL pick — consume 10 t of an 18 t pick, remainder stays available", () => {
    // 10 t consumed now; alreadyConsumedKg would be 10 t on the NEXT crush of the same pick.
    const plan = planCrush([pick({ consumedKg: 10000, weightKg: 18000, alreadyConsumedKg: 0 })], "tank-1", "must-lot", 7300);
    expect(plan.totalConsumedKg).toBe(10000);
    // A later crush can still take the remaining 8 t:
    const second = planCrush([pick({ consumedKg: 8000, weightKg: 18000, alreadyConsumedKg: 10000 })], "tank-2", "must-2", 5900);
    expect(second.totalConsumedKg).toBe(8000);
  });

  it("rejects over-consume (Σ consumedKg would exceed the pick weight)", () => {
    expect(() => planCrush([pick({ consumedKg: 9000, weightKg: 18000, alreadyConsumedKg: 10000 })], "t", "l", 100)).toThrow(
      /only 8000 kg remain/,
    );
  });

  it("rejects a non-positive consumed kg or output volume", () => {
    expect(() => planCrush([pick({ consumedKg: 0 })], "t", "l", 100)).toThrow(/greater than 0/);
    expect(() => planCrush([pick()], "t", "l", 0)).toThrow(/greater than 0/);
    expect(() => planCrush([], "t", "l", 100)).toThrow(/at least one harvest pick/);
  });
});

describe("planCrushSplit (whole-cluster press → one juice lot across N vessels)", () => {
  it("fans the originated lot across vessels, balanced, with a single origination leg", () => {
    const plan = planCrushSplit(
      [pick({ consumedKg: 2000, weightKg: 2000 })],
      [
        { vesselId: "tank-12", volumeL: 1000 },
        { vesselId: "tank-14", volumeL: 300 },
      ],
      "juice-lot",
    );
    expect(isBalanced(plan.lines)).toBe(true);
    expect(plan.outputVolumeL).toBe(1300);
    // one +line per vessel + a single −origination leg.
    expect(plan.lines.filter((l) => l.vesselId && l.deltaL > 0)).toHaveLength(2);
    const origination = plan.lines.filter((l) => l.vesselId === null);
    expect(origination).toHaveLength(1);
    expect(origination[0].reason).toBe("crush_origination");
    expect(origination[0].deltaL).toBe(-1300);
    expect(plan.yieldLPerTonne).toBeCloseTo(650, 2);
  });

  it("rejects an empty destination list or a non-positive volume", () => {
    expect(() => planCrushSplit([pick()], [], "l")).toThrow(/at least one destination/);
    expect(() => planCrushSplit([pick()], [{ vesselId: "v", volumeL: 0 }], "l")).toThrow(/greater than 0/);
  });
});
