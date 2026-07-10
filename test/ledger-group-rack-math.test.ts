import { describe, it, expect } from "vitest";
import {
  isBalanced,
  planRackSplit,
  planRackMerge,
  balanceKey,
  type LedgerLine,
  type VesselLotBalance,
} from "@/lib/ledger/math";

const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
const into = (lines: LedgerLine[], vesselId: string) =>
  sum(lines.filter((l) => l.vesselId === vesselId && l.deltaL > 0).map((l) => l.deltaL));
const lotsIntoVessel = (lines: LedgerLine[], vesselId: string) =>
  new Set(lines.filter((l) => l.vesselId === vesselId && l.deltaL > 0).map((l) => l.lotId));

// ───────────────────────── planRackSplit (barrel-down: 1 → N) ─────────────────────────

describe("planRackSplit — barrel-down, one source into many destinations", () => {
  const source: VesselLotBalance[] = [{ vesselId: "T12", lotId: "L1", volumeL: 2250 }];
  const dests = Array.from({ length: 10 }, (_, i) => ({ vesselId: `B${101 + i}`, volumeL: 225 }));

  it("balances exactly and fills each destination to its target (single-lot source)", () => {
    const plan = planRackSplit(source, dests);
    expect(isBalanced(plan.lines)).toBe(true);
    expect(plan.drawnL).toBe(2250);
    expect(plan.intoL).toBe(2250);
    for (const d of dests) expect(into(plan.lines, d.vesselId)).toBe(225);
    // Source is fully drawn: one −2250 line on T12.
    expect(sum(plan.lines.filter((l) => l.vesselId === "T12").map((l) => l.deltaL))).toBe(-2250);
  });

  it("preserves lot identity — the same lot lands in every barrel, no child lot minted", () => {
    const plan = planRackSplit(source, dests);
    for (const d of dests) expect([...lotsIntoVessel(plan.lines, d.vesselId)]).toEqual(["L1"]);
    const allLots = new Set(plan.lines.map((l) => l.lotId));
    expect([...allLots]).toEqual(["L1"]); // no new blend lot
  });

  it("supports a partial draw with loss (balances; into = draw − loss)", () => {
    const plan = planRackSplit(source, [{ vesselId: "B1", volumeL: 100 }, { vesselId: "B2", volumeL: 100 }], 4);
    expect(isBalanced(plan.lines)).toBe(true);
    expect(plan.intoL).toBe(200);
    expect(plan.drawnL).toBe(204);
    expect(plan.lossL).toBe(4);
    const external = sum(plan.lines.filter((l) => l.vesselId === null).map((l) => l.deltaL));
    expect(external).toBe(4);
  });

  it("splits a multi-lot source proportionally per lot, conserves each lot, and balances", () => {
    const multi: VesselLotBalance[] = [
      { vesselId: "T1", lotId: "A", volumeL: 300 },
      { vesselId: "T1", lotId: "B", volumeL: 100 },
    ];
    const plan = planRackSplit(multi, [{ vesselId: "B1", volumeL: 200 }, { vesselId: "B2", volumeL: 200 }]);
    expect(isBalanced(plan.lines)).toBe(true);
    // Each lot is fully moved: A → −300 total, B → −100 total (Σ per lot across all lines = 0).
    for (const lot of ["A", "B"]) {
      const perLot = sum(plan.lines.filter((l) => l.lotId === lot).map((l) => l.deltaL));
      expect(perLot).toBe(0);
    }
    // Both destinations receive both lots (co-residence, not a blend).
    expect(lotsIntoVessel(plan.lines, "B1")).toEqual(new Set(["A", "B"]));
  });

  it("leaves no dust — destination totals sum to the drawn total to the centiliter", () => {
    const odd: VesselLotBalance[] = [{ vesselId: "T1", lotId: "L1", volumeL: 1000 }];
    const plan = planRackSplit(odd, [
      { vesselId: "B1", volumeL: 333.33 },
      { vesselId: "B2", volumeL: 333.33 },
      { vesselId: "B3", volumeL: 333.34 },
    ]);
    expect(isBalanced(plan.lines)).toBe(true);
    expect(sum([into(plan.lines, "B1"), into(plan.lines, "B2"), into(plan.lines, "B3")])).toBe(1000);
  });

  it("throws on empty source, no destination, negative loss, and over-draw", () => {
    expect(() => planRackSplit([], [{ vesselId: "B1", volumeL: 100 }])).toThrow(/empty/i);
    expect(() => planRackSplit([{ vesselId: "T1", lotId: "L1", volumeL: 100 }], [])).toThrow(/destination/i);
    expect(() => planRackSplit([{ vesselId: "T1", lotId: "L1", volumeL: 100 }], [{ vesselId: "B1", volumeL: 10 }], -1)).toThrow(/loss/i);
    expect(() => planRackSplit([{ vesselId: "T1", lotId: "L1", volumeL: 100 }], [{ vesselId: "B1", volumeL: 200 }])).toThrow(/exceed/i);
  });
});

// ───────────────────────── planRackMerge (rack-to-tank: N → 1) ─────────────────────────

describe("planRackMerge — rack barrels back to one tank", () => {
  it("reconstitutes ONE lot from ten barrels of the same lot, balances, no child lot", () => {
    const draws = Array.from({ length: 10 }, (_, i) => ({ vesselId: `B${101 + i}`, lotId: "L1", drawL: 220 }));
    const plan = planRackMerge(draws, "T15");
    expect(isBalanced(plan.lines)).toBe(true);
    expect(plan.drawnL).toBe(2200);
    expect(plan.intoL).toBe(2200);
    expect(into(plan.lines, "T15")).toBe(2200);
    expect(lotsIntoVessel(plan.lines, "T15")).toEqual(new Set(["L1"])); // one lot back, identity preserved
    // One negative line per source barrel.
    expect(plan.lines.filter((l) => l.deltaL < 0 && l.vesselId !== null)).toHaveLength(10);
  });

  it("keeps distinct lots distinct in the tank (co-residence, not a blend) and balances with loss", () => {
    const plan = planRackMerge(
      [
        { vesselId: "B1", lotId: "A", drawL: 200 },
        { vesselId: "B2", lotId: "B", drawL: 200 },
      ],
      "T1",
      4,
    );
    expect(isBalanced(plan.lines)).toBe(true);
    expect(plan.intoL).toBe(396);
    expect(lotsIntoVessel(plan.lines, "T1")).toEqual(new Set(["A", "B"]));
    for (const lot of ["A", "B"]) {
      expect(sum(plan.lines.filter((l) => l.lotId === lot).map((l) => l.deltaL))).toBe(0);
    }
  });

  it("throws on no draws, non-positive draw, and loss exceeding the total drawn", () => {
    expect(() => planRackMerge([], "T1")).toThrow(/source/i);
    expect(() => planRackMerge([{ vesselId: "B1", lotId: "L1", drawL: 0 }], "T1")).toThrow(/greater than 0/i);
    expect(() => planRackMerge([{ vesselId: "B1", lotId: "L1", drawL: 100 }], "T1", 200)).toThrow(/exceed/i);
  });
});

// A sanity check that balanceKey is unaffected (used by the fold that consumes these lines).
it("uses stable balance keys the fold understands", () => {
  expect(balanceKey("V", "L")).toBe("V::L");
});
