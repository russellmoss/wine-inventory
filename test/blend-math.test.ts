import { describe, it, expect } from "vitest";
import { planBlend, planBlendSplit, isBalanced, balanceKey, type VesselLotBalance } from "@/lib/ledger/math";

// Three lots, each alone in its own vessel.
const balances: VesselLotBalance[] = [
  { vesselId: "T1", lotId: "A", volumeL: 600 },
  { vesselId: "T2", lotId: "B", volumeL: 300 },
  { vesselId: "T3", lotId: "C", volumeL: 200 },
];

describe("planBlend", () => {
  it("blends 3 parents into one balanced child", () => {
    const plan = planBlend(
      [
        { vesselId: "T1", lotId: "A", drawL: 600 },
        { vesselId: "T2", lotId: "B", drawL: 300 },
        { vesselId: "T3", lotId: "C", drawL: 100 },
      ],
      "T4",
      "CHILD",
      0,
      balances,
    );
    expect(isBalanced(plan.lines)).toBe(true);
    expect(plan.childTotalL).toBe(1000);
    const childLine = plan.lines.find((l) => l.vesselId === "T4");
    expect(childLine?.deltaL).toBe(1000);
    expect(childLine?.lotId).toBe("CHILD");
  });

  it("supports a partial draw and leaves the remainder (line is -draw, not -balance)", () => {
    const plan = planBlend(
      [
        { vesselId: "T1", lotId: "A", drawL: 200 }, // of 600 — 400 stays
        { vesselId: "T2", lotId: "B", drawL: 300 },
      ],
      "T4",
      "CHILD",
      0,
      balances,
    );
    expect(plan.childTotalL).toBe(500);
    const aLine = plan.lines.find((l) => l.vesselId === "T1" && l.lotId === "A");
    expect(aLine?.deltaL).toBe(-200);
  });

  it("balances with a loss and emits one external loss line", () => {
    const plan = planBlend(
      [
        { vesselId: "T1", lotId: "A", drawL: 500 },
        { vesselId: "T2", lotId: "B", drawL: 300 },
      ],
      "T4",
      "CHILD",
      8,
      balances,
    );
    expect(isBalanced(plan.lines)).toBe(true);
    expect(plan.childTotalL).toBe(792); // 800 - 8
    const loss = plan.lines.filter((l) => l.vesselId === null);
    expect(loss).toHaveLength(1);
    expect(loss[0].deltaL).toBe(8);
    expect(loss[0].reason).toBe("loss");
  });

  it("fractions are the gross input share and sum to 1 (loss-independent)", () => {
    const plan = planBlend(
      [
        { vesselId: "T1", lotId: "A", drawL: 600 }, // 60%
        { vesselId: "T2", lotId: "B", drawL: 300 }, // 30%
        { vesselId: "T3", lotId: "C", drawL: 100 }, // 10%
      ],
      "T4",
      "CHILD",
      50, // loss must not change the shares
      balances,
    );
    const total = plan.parentGrossByLot.reduce((a, p) => a + p.grossL, 0);
    const fractions = plan.parentGrossByLot.map((p) => p.grossL / total);
    expect(fractions.reduce((a, f) => a + f, 0)).toBeCloseTo(1, 5);
    const a = plan.parentGrossByLot.find((p) => p.lotId === "A")!;
    expect(a.grossL / total).toBeCloseTo(0.6, 5);
  });

  it("aggregates the same parent drawn from two vessels into ONE entry (council C2)", () => {
    const split: VesselLotBalance[] = [
      { vesselId: "T1", lotId: "A", volumeL: 300 },
      { vesselId: "T2", lotId: "A", volumeL: 300 }, // same lot A, two vessels (e.g. two barrels)
      { vesselId: "T3", lotId: "B", volumeL: 200 },
    ];
    const plan = planBlend(
      [
        { vesselId: "T1", lotId: "A", drawL: 300 },
        { vesselId: "T2", lotId: "A", drawL: 300 },
        { vesselId: "T3", lotId: "B", drawL: 200 },
      ],
      "T4",
      "CHILD",
      0,
      split,
    );
    const aEntries = plan.parentGrossByLot.filter((p) => p.lotId === "A");
    expect(aEntries).toHaveLength(1);
    expect(aEntries[0].grossL).toBe(600);
    // ...but the ledger still has two separate negative lines (different vessels).
    expect(plan.lines.filter((l) => l.lotId === "A" && l.deltaL < 0)).toHaveLength(2);
  });

  it("rejects a draw larger than the position's balance", () => {
    expect(() =>
      planBlend([{ vesselId: "T2", lotId: "B", drawL: 400 }], "T4", "CHILD", 0, balances),
    ).toThrow();
  });

  it("rejects a non-positive draw and a loss exceeding the total", () => {
    expect(() =>
      planBlend([{ vesselId: "T1", lotId: "A", drawL: 0 }], "T4", "CHILD", 0, balances),
    ).toThrow();
    expect(() =>
      planBlend([{ vesselId: "T1", lotId: "A", drawL: 100 }], "T4", "CHILD", 200, balances),
    ).toThrow();
  });

  it("does not project the external loss line (sanity on balanceKey usage)", () => {
    const plan = planBlend([{ vesselId: "T1", lotId: "A", drawL: 100 }], "T4", "CHILD", 5, balances);
    expect(plan.lines.some((l) => l.vesselId === null)).toBe(true);
    expect(balanceKey("T4", "CHILD")).toBe("T4::CHILD");
  });
});

describe("planBlendSplit (one child lot, many destination vessels)", () => {
  it("splits the child across vessels with one +line each, balanced", () => {
    const plan = planBlendSplit(
      [
        { vesselId: "T1", lotId: "A", drawL: 600 },
        { vesselId: "T2", lotId: "B", drawL: 300 },
        { vesselId: "T3", lotId: "C", drawL: 100 },
      ],
      [
        { vesselId: "D1", volumeL: 700 },
        { vesselId: "D2", volumeL: 300 },
      ],
      "CHILD",
      0,
      balances,
    );
    expect(isBalanced(plan.lines)).toBe(true);
    expect(plan.childTotalL).toBe(1000);
    const destLines = plan.lines.filter((l) => l.lotId === "CHILD" && l.deltaL > 0);
    expect(destLines).toHaveLength(2);
    expect(destLines.map((l) => l.vesselId).sort()).toEqual(["D1", "D2"]);
    expect(destLines.reduce((a, l) => a + l.deltaL, 0)).toBe(1000);
  });

  it("balances when a loss is taken before the split", () => {
    const plan = planBlendSplit(
      [
        { vesselId: "T1", lotId: "A", drawL: 500 },
        { vesselId: "T2", lotId: "B", drawL: 300 },
      ],
      [
        { vesselId: "D1", volumeL: 400 },
        { vesselId: "D2", volumeL: 392 },
      ],
      "CHILD",
      8, // 800 drawn − 8 loss = 792 into vessels
      balances,
    );
    expect(isBalanced(plan.lines)).toBe(true);
    expect(plan.childTotalL).toBe(792);
    expect(plan.lines.filter((l) => l.vesselId === null)).toHaveLength(1);
  });

  it("rejects a split that doesn't sum to the blended volume", () => {
    expect(() =>
      planBlendSplit(
        [
          { vesselId: "T1", lotId: "A", drawL: 600 },
          { vesselId: "T2", lotId: "B", drawL: 300 },
        ],
        [
          { vesselId: "D1", volumeL: 500 },
          { vesselId: "D2", volumeL: 300 }, // 800 ≠ 900 drawn
        ],
        "CHILD",
        0,
        balances,
      ),
    ).toThrow();
  });

  it("rejects a non-positive destination volume and an empty destination list", () => {
    expect(() =>
      planBlendSplit([{ vesselId: "T1", lotId: "A", drawL: 100 }], [{ vesselId: "D1", volumeL: 0 }], "CHILD", 0, balances),
    ).toThrow();
    expect(() =>
      planBlendSplit([{ vesselId: "T1", lotId: "A", drawL: 100 }], [], "CHILD", 0, balances),
    ).toThrow();
  });
});
