import { describe, it, expect } from "vitest";
import { planPress, isBalanced, type PressFractionDraw } from "@/lib/ledger/math";

// Phase 6 Unit 4: the PURE press plan (1 parent → N fraction child lots, the inverse of a
// blend). The DB core (parent lock, expectedRevision guard, SPLIT lineage, form flips, merge
// destinations, saignée) is exercised in scripts/verify-ferment.ts (Unit 12).

const fr = (childLotId: string, destVesselId: string, volumeL: number): PressFractionDraw => ({
  childLotId,
  destVesselId,
  volumeL,
});

describe("planPress", () => {
  it("draws the parent down into free-run + press fractions, balanced, lees as loss", () => {
    // 2000 L parent → 1700 free-run + 250 hard press + 50 lees.
    const plan = planPress("parent", "tank-A", 2000, [fr("fr-lot", "tank-B", 1700), fr("hp-lot", "barrel-1", 250)], 50);
    expect(isBalanced(plan.lines)).toBe(true);
    expect(plan.drawnL).toBe(2000);
    expect(plan.fractionTotalL).toBe(1950);
    expect(plan.lossL).toBe(50);
    const parentLeg = plan.lines.find((l) => l.vesselId === "tank-A")!;
    expect(parentLeg.deltaL).toBe(-2000);
    expect(plan.lines.find((l) => l.reason === "loss")!.deltaL).toBe(50);
  });

  it("routes fractions to DISTINCT destination lots", () => {
    const plan = planPress("parent", "tank-A", 1000, [fr("a", "v1", 600), fr("b", "v2", 400)], 0);
    const dests = plan.lines.filter((l) => l.deltaL > 0).map((l) => l.lotId).sort();
    expect(dests).toEqual(["a", "b"]);
  });

  it("supports TWO fractions merging into one destination lot (FR + light → Tank A)", () => {
    // mergeIntoLotId surfaces here as two fractions sharing a childLotId in the same vessel.
    const plan = planPress("parent", "tank-A", 1000, [fr("shared", "tank-B", 600), fr("shared", "tank-B", 300)], 0);
    expect(plan.fractionTotalL).toBe(900);
    expect(isBalanced(plan.lines)).toBe(true);
    // Both legs point at the merged lot.
    expect(plan.lines.filter((l) => l.lotId === "shared" && l.deltaL > 0)).toHaveLength(2);
  });

  it("a single fraction = one child (the simplest press / a saignée bleed)", () => {
    const plan = planPress("must-lot", "tank-A", 1000, [fr("rose-juice", "tank-B", 150)], 0);
    expect(plan.drawnL).toBe(150);
    expect(plan.fractionTotalL).toBe(150);
    expect(isBalanced(plan.lines)).toBe(true);
  });

  it("rejects pressing more than the parent holds", () => {
    expect(() => planPress("p", "v", 1000, [fr("a", "d", 900), fr("b", "e", 200)], 0)).toThrow(/holds 1000 L/);
  });

  it("rejects empty fractions, non-positive volume, negative lees", () => {
    expect(() => planPress("p", "v", 1000, [], 0)).toThrow(/at least one fraction/);
    expect(() => planPress("p", "v", 1000, [fr("a", "d", 0)], 0)).toThrow(/greater than 0/);
    expect(() => planPress("p", "v", 1000, [fr("a", "d", 100)], -5)).toThrow(/can't be negative/);
  });
});
