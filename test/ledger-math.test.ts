import { describe, it, expect } from "vitest";
import {
  foldLines,
  isBalanced,
  assertBalanced,
  planLedgerRack,
  planCorrection,
  planVesselLoss,
  balanceKey,
  findCoResidence,
  assertOneLotPerVessel,
  findWorsenedCoResidence,
  assertNoWorsenedCoResidence,
  type LedgerLine,
  type VesselLotBalance,
} from "@/lib/ledger/math";

const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;
const vol = (bals: VesselLotBalance[], vesselId: string, lotId: string) =>
  bals.find((b) => b.vesselId === vesselId && b.lotId === lotId)?.volumeL ?? 0;

describe("isBalanced / assertBalanced", () => {
  it("balanced lines sum to zero", () => {
    const lines: LedgerLine[] = [
      { lotId: "L1", vesselId: "tankA", deltaL: -100 },
      { lotId: "L1", vesselId: "tankB", deltaL: 100 },
    ];
    expect(isBalanced(lines)).toBe(true);
    expect(() => assertBalanced(lines)).not.toThrow();
  });

  it("unbalanced lines throw", () => {
    const lines: LedgerLine[] = [
      { lotId: "L1", vesselId: "tankA", deltaL: -100 },
      { lotId: "L1", vesselId: "tankB", deltaL: 95 },
    ];
    expect(isBalanced(lines)).toBe(false);
    expect(() => assertBalanced(lines)).toThrow(/not balanced/);
  });

  it("a seed (in from external) balances against a null-vessel line", () => {
    const lines: LedgerLine[] = [
      { lotId: "L1", vesselId: "tankA", deltaL: 225 },
      { lotId: "L1", vesselId: null, deltaL: -225, reason: "seed" },
    ];
    expect(isBalanced(lines)).toBe(true);
  });
});

describe("foldLines", () => {
  it("applies in-vessel deltas and ignores the external counter-account", () => {
    const start: VesselLotBalance[] = [{ vesselId: "tankA", lotId: "L1", volumeL: 225 }];
    const next = foldLines(start, [
      { lotId: "L1", vesselId: "tankA", deltaL: -225 },
      { lotId: "L1", vesselId: "tankB", deltaL: 225 },
    ]);
    expect(vol(next, "tankA", "L1")).toBe(0); // row dropped
    expect(vol(next, "tankB", "L1")).toBe(225);
    expect(next).toHaveLength(1);
  });

  it("sweeps a dust residual (< 0.01 L) to zero", () => {
    const start: VesselLotBalance[] = [{ vesselId: "tankA", lotId: "L1", volumeL: 100 }];
    const next = foldLines(start, [{ lotId: "L1", vesselId: "tankA", deltaL: -99.995 }]);
    expect(next).toHaveLength(0); // 0.005 L residual swept
  });

  it("throws when a balance would go negative beyond dust", () => {
    const start: VesselLotBalance[] = [{ vesselId: "tankA", lotId: "L1", volumeL: 100 }];
    expect(() => foldLines(start, [{ lotId: "L1", vesselId: "tankA", deltaL: -150 }])).toThrow(/negative/);
  });

  it("does not mutate the input balances", () => {
    const start: VesselLotBalance[] = [{ vesselId: "tankA", lotId: "L1", volumeL: 100 }];
    foldLines(start, [{ lotId: "L1", vesselId: "tankA", deltaL: -50 }]);
    expect(start[0].volumeL).toBe(100);
  });
});

describe("planLedgerRack", () => {
  const oneLot: VesselLotBalance[] = [{ vesselId: "barrel14", lotId: "L1", volumeL: 225 }];
  const blended: VesselLotBalance[] = [
    { vesselId: "tank1", lotId: "L1", volumeL: 600 },
    { vesselId: "tank1", lotId: "L2", volumeL: 400 },
  ];

  it("full rack moves everything and balances", () => {
    const p = planLedgerRack(oneLot, "tank1", 225, 0);
    expect(isBalanced(p.lines)).toBe(true);
    expect(p.addedL).toBe(225);
    const after = foldLines(oneLot, p.lines);
    expect(vol(after, "barrel14", "L1")).toBe(0);
    expect(vol(after, "tank1", "L1")).toBe(225);
  });

  it("partial rack splits proportionally across lots, sums exactly", () => {
    const p = planLedgerRack(blended, "tank2", 500, 0);
    expect(isBalanced(p.lines)).toBe(true);
    const after = foldLines(blended, p.lines);
    // 600/1000*500 = 300 moved of L1, 400/1000*500 = 200 of L2
    expect(vol(after, "tank2", "L1")).toBe(300);
    expect(vol(after, "tank2", "L2")).toBe(200);
    expect(vol(after, "tank1", "L1")).toBe(300);
    expect(vol(after, "tank1", "L2")).toBe(200);
  });

  it("loss reduces what lands in the destination but the op still balances", () => {
    const p = planLedgerRack(oneLot, "tank1", 225, 5);
    expect(p.addedL).toBe(220);
    expect(isBalanced(p.lines)).toBe(true);
    const after = foldLines(oneLot, p.lines);
    expect(vol(after, "tank1", "L1")).toBe(220);
    const loss = p.lines.filter((l) => l.reason === "loss");
    expect(sum(loss.map((l) => l.deltaL))).toBe(5);
  });

  it("all volume lost: no destination line, still balances", () => {
    const p = planLedgerRack(oneLot, "tank1", 225, 225);
    expect(p.addedL).toBe(0);
    expect(isBalanced(p.lines)).toBe(true);
    expect(p.lines.some((l) => l.vesselId === "tank1")).toBe(false);
  });

  it("rejects over-draw and bad loss", () => {
    expect(() => planLedgerRack(oneLot, "tank1", 300, 0)).toThrow();
    expect(() => planLedgerRack(oneLot, "tank1", 0, 0)).toThrow();
    expect(() => planLedgerRack(oneLot, "tank1", 100, -1)).toThrow();
    expect(() => planLedgerRack(oneLot, "tank1", 100, 150)).toThrow();
  });
});

describe("planCorrection", () => {
  const source: VesselLotBalance[] = [{ vesselId: "barrel14", lotId: "L1", volumeL: 225 }];

  it("rack then correct restores the original projection (the headline property)", () => {
    const rack = planLedgerRack(source, "tank1", 100, 0);
    const afterRack = foldLines(source, rack.lines);
    const corr = planCorrection(rack.lines, afterRack, new Set());
    expect(corr.ok).toBe(true);
    if (!corr.ok) return;
    const restored = foldLines(afterRack, corr.lines);
    expect(vol(restored, "barrel14", "L1")).toBe(225);
    expect(vol(restored, "tank1", "L1")).toBe(0);
  });

  it("blocks the correction when a later op touched an affected position (D15)", () => {
    const rack = planLedgerRack(source, "tank1", 100, 0);
    const afterRack = foldLines(source, rack.lines);
    // someone topped tank1/L1 afterwards
    const touched = new Set([balanceKey("tank1", "L1")]);
    const corr = planCorrection(rack.lines, afterRack, touched);
    expect(corr.ok).toBe(false);
    if (corr.ok || corr.reason !== "downstream-activity") throw new Error("expected downstream-activity block");
    expect(corr.blockedKeys).toContain(balanceKey("tank1", "L1"));
  });

  it("reports a shortfall when the moved wine is no longer there", () => {
    const rack = planLedgerRack(source, "tank1", 100, 0);
    // tank1 was drained to 0 by some untracked path (no touchedKeys passed)
    const drained: VesselLotBalance[] = [{ vesselId: "barrel14", lotId: "L1", volumeL: 125 }];
    const corr = planCorrection(rack.lines, drained, new Set());
    expect(corr.ok).toBe(false);
    if (corr.ok) return;
    expect(corr.reason).toBe("shortfall");
  });

  it("correcting a loss-bearing rack restores source and removes the loss", () => {
    const rack = planLedgerRack(source, "tank1", 100, 10);
    const afterRack = foldLines(source, rack.lines);
    expect(vol(afterRack, "barrel14", "L1")).toBe(125);
    expect(vol(afterRack, "tank1", "L1")).toBe(90);
    const corr = planCorrection(rack.lines, afterRack, new Set());
    expect(corr.ok).toBe(true);
    if (!corr.ok) return;
    const restored = foldLines(afterRack, corr.lines);
    expect(vol(restored, "barrel14", "L1")).toBe(225);
    expect(vol(restored, "tank1", "L1")).toBe(0);
    expect(isBalanced(corr.lines)).toBe(true); // the loss line is inverted too
  });
});

describe("projection == fold of the full ledger (property over a sequence)", () => {
  it("seed -> rack -> partial rack stays consistent and non-negative", () => {
    let bals: VesselLotBalance[] = [];
    // seed 225 L of L1 into barrel14
    bals = foldLines(bals, [
      { lotId: "L1", vesselId: "barrel14", deltaL: 225 },
      { lotId: "L1", vesselId: null, deltaL: -225, reason: "seed" },
    ]);
    expect(vol(bals, "barrel14", "L1")).toBe(225);
    // rack 100 to tank1
    bals = foldLines(bals, planLedgerRack(bals.filter((b) => b.vesselId === "barrel14"), "tank1", 100).lines);
    // rack 40 of tank1 onward to tank2
    bals = foldLines(bals, planLedgerRack(bals.filter((b) => b.vesselId === "tank1"), "tank2", 40).lines);
    expect(vol(bals, "barrel14", "L1")).toBe(125);
    expect(vol(bals, "tank1", "L1")).toBe(60);
    expect(vol(bals, "tank2", "L1")).toBe(40);
    expect(sum(bals.map((b) => b.volumeL))).toBe(225); // conserved
    expect(bals.every((b) => b.volumeL > 0)).toBe(true);
  });
});

describe("planVesselLoss", () => {
  it("removes the volume proportionally and balances per lot", () => {
    const src: VesselLotBalance[] = [
      { vesselId: "t1", lotId: "L1", volumeL: 300 },
      { vesselId: "t1", lotId: "L2", volumeL: 150 },
    ];
    const plan = planVesselLoss(src, 45, "evaporation");
    expect(plan.removedL).toBe(45);
    expect(isBalanced(plan.lines)).toBe(true);
    // 300:150 = 2:1 → 30 + 15
    const removedByLot = Object.fromEntries(plan.perLot.map((p) => [p.lotId, p.removedL]));
    expect(removedByLot.L1).toBe(30);
    expect(removedByLot.L2).toBe(15);
    // external counter-account legs carry the reason
    expect(plan.lines.filter((l) => l.vesselId === null).every((l) => l.reason === "evaporation")).toBe(true);
    // folding the loss reduces the vessel to 405 L total
    const after = foldLines(src, plan.lines);
    expect(sum(after.map((b) => b.volumeL))).toBe(405);
  });

  it("a full-volume loss empties the vessel", () => {
    const src: VesselLotBalance[] = [{ vesselId: "t1", lotId: "L1", volumeL: 200 }];
    const plan = planVesselLoss(src, 200, "filtration");
    const after = foldLines(src, plan.lines);
    expect(after.length).toBe(0);
  });

  it("rejects a non-positive or over-volume loss", () => {
    const src: VesselLotBalance[] = [{ vesselId: "t1", lotId: "L1", volumeL: 100 }];
    expect(() => planVesselLoss(src, 0, "loss")).toThrow();
    expect(() => planVesselLoss(src, 150, "loss")).toThrow();
  });
});

// ─────────── LEDGER-12: one lot per vessel (plan 088, Unit 1) ───────────
// The guard runs on POST-FOLD balances, so an operation that drains lot B while filling
// lot A in the SAME op is legal — only the surviving state has to satisfy the invariant.
describe("findCoResidence / assertOneLotPerVessel", () => {
  const bal = (vesselId: string, lotId: string, volumeL: number): VesselLotBalance => ({ vesselId, lotId, volumeL });

  describe("legal states", () => {
    it("an empty cellar has no violation", () => {
      expect(findCoResidence([])).toEqual([]);
    });

    it("one lot in one vessel is fine", () => {
      expect(findCoResidence([bal("tankA", "L1", 500)])).toEqual([]);
    });

    it("ONE lot across MANY vessels is fine — the direction we are preserving", () => {
      const barrels = Array.from({ length: 40 }, (_, i) => bal(`barrel${i}`, "L1", 225));
      expect(findCoResidence(barrels)).toEqual([]);
      expect(() => assertOneLotPerVessel(barrels)).not.toThrow();
    });

    it("many single-lot vessels are fine", () => {
      expect(findCoResidence([bal("tankA", "L1", 100), bal("tankB", "L2", 200), bal("tankC", "L3", 300)])).toEqual([]);
    });

    it("drain-B-fill-A in one operation is legal — the fold is what counts", () => {
      const before = [bal("tankA", "LB", 300)];
      const lines: LedgerLine[] = [
        { lotId: "LB", vesselId: "tankA", deltaL: -300 }, // B leaves
        { lotId: "LA", vesselId: "tankA", deltaL: 300 }, // A arrives
      ];
      const after = foldLines(before, lines);
      expect(after).toHaveLength(1);
      expect(findCoResidence(after)).toEqual([]);
    });
  });

  describe("illegal states", () => {
    it("a foreign lot landing in an occupied vessel is a violation", () => {
      const v = findCoResidence([bal("tankA", "L1", 500), bal("tankA", "L2", 100)]);
      expect(v).toHaveLength(1);
      expect(v[0].vesselId).toBe("tankA");
      expect(v[0].lotIds.sort()).toEqual(["L1", "L2"]);
    });

    it("three survivors in one vessel report all three lots", () => {
      const v = findCoResidence([bal("b18", "A", 100), bal("b18", "B", 75), bal("b18", "C", 50)]);
      expect(v).toHaveLength(1);
      expect(v[0].lotIds.sort()).toEqual(["A", "B", "C"]);
    });

    it("reports every offending vessel, not just the first", () => {
      const v = findCoResidence([
        bal("tankA", "L1", 10),
        bal("tankA", "L2", 10),
        bal("tankB", "L3", 10), // fine
        bal("tankC", "L4", 10),
        bal("tankC", "L5", 10),
      ]);
      expect(v.map((x) => x.vesselId).sort()).toEqual(["tankA", "tankC"]);
    });

    it("a CORRECTION that would restore a second lot is a violation", () => {
      // tankA holds L1 after a rack; reverting the rack would put L2 back beside it.
      const current = [bal("tankA", "L1", 200)];
      const reversal: LedgerLine[] = [{ lotId: "L2", vesselId: "tankA", deltaL: 150 }];
      const after = foldLines(current, reversal);
      expect(findCoResidence(after)).toHaveLength(1);
    });

    it("assertOneLotPerVessel throws and names the vessel and the lots", () => {
      expect(() => assertOneLotPerVessel([bal("tankA", "L1", 500), bal("tankA", "L2", 100)])).toThrow(/tankA/);
      expect(() => assertOneLotPerVessel([bal("tankA", "L1", 500), bal("tankA", "L2", 100)])).toThrow(/L1/);
      expect(() => assertOneLotPerVessel([bal("tankA", "L1", 500), bal("tankA", "L2", 100)])).toThrow(/LEDGER-12/);
    });
  });

  describe("functional-zero boundary", () => {
    it("a resident swept to functional zero is NOT a second lot", () => {
      // foldLines drops any residual <= FUNCTIONAL_ZERO_L, so the dust row never survives
      // the fold. This is why a plain UNIQUE(tenantId, vesselId) is safe at the DB.
      const before = [bal("tankA", "LB", 300)];
      const lines: LedgerLine[] = [
        { lotId: "LB", vesselId: "tankA", deltaL: -299.995 }, // leaves 0.005 L of dust
        { lotId: "LA", vesselId: "tankA", deltaL: 299.995 },
      ];
      const after = foldLines(before, lines);
      expect(after.map((b) => b.lotId)).toEqual(["LA"]);
      expect(findCoResidence(after)).toEqual([]);
    });

    it("a resident just ABOVE functional zero still counts", () => {
      const before = [bal("tankA", "LB", 300)];
      const lines: LedgerLine[] = [
        { lotId: "LB", vesselId: "tankA", deltaL: -299.9 }, // 0.1 L left, above the 0.01 threshold
        { lotId: "LA", vesselId: "tankA", deltaL: 299.9 },
      ];
      const after = foldLines(before, lines);
      expect(findCoResidence(after)).toHaveLength(1);
    });
  });

  describe("the external counter-account", () => {
    it("null-vessel lines never reach the projection, so they cannot violate", () => {
      // BOTTLE_STORAGE and EXTERNAL legs carry vesselId: null. They are not vessel occupancy.
      const before = [bal("tankA", "L1", 500)];
      const lines: LedgerLine[] = [
        { lotId: "L1", vesselId: "tankA", deltaL: -100 },
        { lotId: "L1", vesselId: null, deltaL: 100, bucket: "BOTTLE_STORAGE", bottleDelta: 133 },
      ];
      const after = foldLines(before, lines);
      expect(findCoResidence(after)).toEqual([]);
    });
  });
});

// The MONOTONE guard the chokepoint actually enforces (plan 088, Unit 13). "Must be exactly one"
// would refuse every operation on an already-mixed vessel, including the rack that would EMPTY it
// — freezing a barrel a legacy import got wrong. "Never worse" lets bad state only ever shrink.
describe("findWorsenedCoResidence / assertNoWorsenedCoResidence", () => {
  const bal = (vesselId: string, lotId: string, volumeL = 100): VesselLotBalance => ({ vesselId, lotId, volumeL });

  it("filling an empty vessel is fine", () => {
    expect(findWorsenedCoResidence([], [bal("t", "A")])).toEqual([]);
  });

  it("a lot growing in place is fine", () => {
    expect(findWorsenedCoResidence([bal("t", "A", 100)], [bal("t", "A", 300)])).toEqual([]);
  });

  it("adding a SECOND lot to a clean vessel is refused", () => {
    const v = findWorsenedCoResidence([bal("t", "A")], [bal("t", "A"), bal("t", "B")]);
    expect(v).toHaveLength(1);
    expect(() => assertNoWorsenedCoResidence([bal("t", "A")], [bal("t", "A"), bal("t", "B")])).toThrow(/LEDGER-12/);
  });

  it("filling an empty vessel with TWO lots at once is refused", () => {
    expect(findWorsenedCoResidence([], [bal("t", "A"), bal("t", "B")])).toHaveLength(1);
  });

  describe("a vessel that is ALREADY mis-recorded", () => {
    const messy = [bal("b18", "A"), bal("b18", "B"), bal("b18", "C")];

    it("can still be drawn down — the vessel is not frozen", () => {
      // The whole point: without this, you could not even rack the wine out to fix it.
      expect(findWorsenedCoResidence(messy, [bal("b18", "A", 50), bal("b18", "B", 50), bal("b18", "C", 50)])).toEqual([]);
    });

    it("can be HEALED toward one lot", () => {
      expect(findWorsenedCoResidence(messy, [bal("b18", "A"), bal("b18", "B")])).toEqual([]);
      expect(findWorsenedCoResidence(messy, [bal("b18", "A")])).toEqual([]);
      expect(findWorsenedCoResidence(messy, [])).toEqual([]);
    });

    it("but can NEVER be made worse", () => {
      const worse = [...messy, bal("b18", "D")];
      expect(findWorsenedCoResidence(messy, worse)).toHaveLength(1);
      expect(() => assertNoWorsenedCoResidence(messy, worse)).toThrow(/b18/);
    });
  });

  it("judges each vessel independently — healing one while worsening another still refuses", () => {
    const before = [bal("messy", "A"), bal("messy", "B"), bal("clean", "C")];
    const after = [bal("messy", "A"), bal("clean", "C"), bal("clean", "D")];
    const v = findWorsenedCoResidence(before, after);
    expect(v.map((x) => x.vesselId)).toEqual(["clean"]);
  });

  it("a drain-and-refill swap in one operation stays legal", () => {
    expect(findWorsenedCoResidence([bal("t", "OLD")], [bal("t", "NEW")])).toEqual([]);
  });
});
