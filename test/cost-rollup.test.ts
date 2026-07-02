import { describe, it, expect } from "vitest";
import {
  rollupCost,
  bottlingCostPerBottle,
  mergeCompleteness,
  transferImbalance,
  type CostEvent,
  type LotVolume,
} from "@/lib/cost/rollup";

// Unit 4 — the cost roll-up AUTHORITY. Pure fold over cost events + folded volumes. Every fixture is
// hand-computed to the cent and asserts conservation (nothing created/destroyed except explicit
// expense/variance). Mirrors test/ledger-math.test.ts (DB-free pure logic).

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

describe("mergeCompleteness lattice", () => {
  it("KNOWN⊕KNOWN=KNOWN, UNKNOWN⊕UNKNOWN=UNKNOWN, KNOWN⊕UNKNOWN=PARTIAL, x⊕PARTIAL=PARTIAL", () => {
    expect(mergeCompleteness(undefined, "KNOWN")).toBe("KNOWN");
    expect(mergeCompleteness("KNOWN", "KNOWN")).toBe("KNOWN");
    expect(mergeCompleteness("UNKNOWN", "UNKNOWN")).toBe("UNKNOWN");
    expect(mergeCompleteness("KNOWN", "UNKNOWN")).toBe("PARTIAL");
    expect(mergeCompleteness("PARTIAL", "KNOWN")).toBe("PARTIAL");
    expect(mergeCompleteness("KNOWN", "PARTIAL")).toBe("PARTIAL");
  });
});

describe("rollupCost — direct cost", () => {
  it("sums direct capitalized lines and divides by volume", () => {
    const events: CostEvent[] = [
      { opId: 1, kind: "DIRECT", lotId: "A", component: "FRUIT", amount: 300, completeness: "KNOWN" },
      { opId: 2, kind: "DIRECT", lotId: "A", component: "MATERIAL", amount: 20, completeness: "KNOWN" },
    ];
    const vols: LotVolume[] = [{ lotId: "A", volumeL: 100 }];
    const { lots } = rollupCost(events, vols);
    const a = lots.get("A")!;
    expect(a.totalCost).toBe(320);
    expect(a.costPerL).toBe(3.2);
    expect(a.completeness).toBe("KNOWN");
    expect(a.components).toEqual({ FRUIT: 300, MATERIAL: 20 });
  });

  it("a lot with no cost basis is UNKNOWN (never $0-with-KNOWN — D14)", () => {
    const { lots } = rollupCost([], [{ lotId: "A", volumeL: 100 }]);
    const a = lots.get("A")!;
    expect(a.totalCost).toBe(0);
    expect(a.completeness).toBe("UNKNOWN");
  });

  it("an unknown-cost direct line taints completeness but records no phantom cost", () => {
    const events: CostEvent[] = [
      { opId: 1, kind: "DIRECT", lotId: "A", component: "FRUIT", amount: 300, completeness: "KNOWN" },
      { opId: 2, kind: "DIRECT", lotId: "A", component: "MATERIAL", amount: 0, completeness: "UNKNOWN" },
    ];
    const { lots } = rollupCost(events, [{ lotId: "A", volumeL: 100 }]);
    expect(lots.get("A")!.completeness).toBe("PARTIAL");
    expect(lots.get("A")!.totalCost).toBe(300);
  });
});

describe("rollupCost — blend by volume share (D10 / council C2 ambiguity)", () => {
  it("20L from A ($1/L) + 20L from B ($4/L) blends to a cost weighted by VOLUME, not 50/50", () => {
    // A: $100 / 100L = $1/L. B: $400 / 100L = $4/L. Move 20L from each into child C.
    // Cost moved from A = 100 × 20/100 = $20; from B = 400 × 20/100 = $80. C = $100 over 40L = $2.50/L.
    // A 50/50-by-count naive would give $2.50/L too here BY COINCIDENCE of equal transferred vols —
    // so make the transferred volumes DIFFERENT to expose the ambiguity below.
    const events: CostEvent[] = [
      { opId: 1, kind: "DIRECT", lotId: "A", component: "FRUIT", amount: 100, completeness: "KNOWN" },
      { opId: 2, kind: "DIRECT", lotId: "B", component: "FRUIT", amount: 400, completeness: "KNOWN" },
      { opId: 3, kind: "TRANSFER", fromLotId: "A", toLotId: "C", transferredVolumeL: 20, parentPreOpVolumeL: 100 },
      { opId: 3, kind: "TRANSFER", fromLotId: "B", toLotId: "C", transferredVolumeL: 20, parentPreOpVolumeL: 100 },
    ];
    const vols: LotVolume[] = [
      { lotId: "A", volumeL: 80 },
      { lotId: "B", volumeL: 80 },
      { lotId: "C", volumeL: 40 },
    ];
    const { lots } = rollupCost(events, vols);
    expect(lots.get("C")!.totalCost).toBe(100);
    expect(lots.get("C")!.costPerL).toBe(2.5);
    // Parents keep the remainder — conservation: A 80 + B 320 + C 100 = 500 = total direct.
    expect(lots.get("A")!.totalCost).toBe(80);
    expect(lots.get("B")!.totalCost).toBe(320);
    expect(lots.get("A")!.totalCost + lots.get("B")!.totalCost + lots.get("C")!.totalCost).toBe(500);
  });

  it("UNEQUAL transferred volumes: cost follows the transferred-volume fraction, not the child's 50/50 split", () => {
    // A: $1/L, B: $4/L. Move 40L from A but only 10L from B → child is 80% A-volume.
    // Cost: A→ 100×40/100 = $40 ; B→ 400×10/100 = $40. Child = $80 / 50L = $1.60/L.
    // Naive "50/50 of the child composition" would wrongly give (1+4)/2 = $2.50/L.
    const events: CostEvent[] = [
      { opId: 1, kind: "DIRECT", lotId: "A", component: "FRUIT", amount: 100, completeness: "KNOWN" },
      { opId: 2, kind: "DIRECT", lotId: "B", component: "FRUIT", amount: 400, completeness: "KNOWN" },
      { opId: 3, kind: "TRANSFER", fromLotId: "A", toLotId: "C", transferredVolumeL: 40, parentPreOpVolumeL: 100 },
      { opId: 3, kind: "TRANSFER", fromLotId: "B", toLotId: "C", transferredVolumeL: 10, parentPreOpVolumeL: 100 },
    ];
    const { lots } = rollupCost(events, [
      { lotId: "A", volumeL: 60 },
      { lotId: "B", volumeL: 90 },
      { lotId: "C", volumeL: 50 },
    ]);
    expect(lots.get("C")!.totalCost).toBe(80);
    expect(lots.get("C")!.costPerL).toBe(1.6);
    expect(near(lots.get("C")!.costPerL!, 2.5)).toBe(false); // NOT the naive average
  });

  it("child inherits the blended component breakdown proportionally", () => {
    const events: CostEvent[] = [
      { opId: 1, kind: "DIRECT", lotId: "A", component: "FRUIT", amount: 100, completeness: "KNOWN" },
      { opId: 2, kind: "DIRECT", lotId: "B", component: "MATERIAL", amount: 400, completeness: "KNOWN" },
      { opId: 3, kind: "TRANSFER", fromLotId: "A", toLotId: "C", transferredVolumeL: 50, parentPreOpVolumeL: 100 },
      { opId: 3, kind: "TRANSFER", fromLotId: "B", toLotId: "C", transferredVolumeL: 50, parentPreOpVolumeL: 100 },
    ];
    const { lots } = rollupCost(events, [
      { lotId: "A", volumeL: 50 },
      { lotId: "B", volumeL: 50 },
      { lotId: "C", volumeL: 100 },
    ]);
    expect(lots.get("C")!.components).toEqual({ FRUIT: 50, MATERIAL: 200 });
  });
});

describe("rollupCost — SPLIT inherits by fraction (D6)", () => {
  it("a press splitting 100L ($200) into 70L free-run + 30L press inherits cost by volume", () => {
    const events: CostEvent[] = [
      { opId: 1, kind: "DIRECT", lotId: "P", component: "FRUIT", amount: 200, completeness: "KNOWN" },
      { opId: 2, kind: "TRANSFER", fromLotId: "P", toLotId: "FREE", transferredVolumeL: 70, parentPreOpVolumeL: 100 },
      { opId: 2, kind: "TRANSFER", fromLotId: "P", toLotId: "PRESS", transferredVolumeL: 30, parentPreOpVolumeL: 100 },
    ];
    const { lots } = rollupCost(events, [
      { lotId: "P", volumeL: 0 },
      { lotId: "FREE", volumeL: 70 },
      { lotId: "PRESS", volumeL: 30 },
    ]);
    expect(lots.get("FREE")!.totalCost).toBe(140);
    expect(lots.get("PRESS")!.totalCost).toBe(60);
    expect(lots.get("P")!.totalCost).toBe(0); // fully split → no cost, no strand
    expect(lots.get("P")!.stranded).toBe(0);
    expect(lots.get("FREE")!.costPerL).toBe(2);
    expect(lots.get("PRESS")!.costPerL).toBe(2); // same per-L on both children
  });
});

describe("rollupCost — loss classification (D13)", () => {
  it("NORMAL loss (no cost event): cost held, volume drops → per-L RISES", () => {
    // $100 over 100L = $1/L. Normal evaporation loss of 20L → folded volume 80L, cost unchanged.
    const events: CostEvent[] = [
      { opId: 1, kind: "DIRECT", lotId: "A", component: "FRUIT", amount: 100, completeness: "KNOWN" },
    ];
    const { lots } = rollupCost(events, [{ lotId: "A", volumeL: 80 }]);
    expect(lots.get("A")!.totalCost).toBe(100);
    expect(lots.get("A")!.costPerL).toBe(1.25); // rose from $1 → $1.25
  });

  it("ABNORMAL loss: write off the dumped volume's pro-rata cost → per-L UNCHANGED", () => {
    // $100 over 100L = $1/L. Dump 20L abnormally (pre=100). Write-off = 100×20/100 = $20.
    // Remaining cost $80 over folded 80L = $1/L (unchanged); $20 is expensed, not capitalized.
    const events: CostEvent[] = [
      { opId: 1, kind: "DIRECT", lotId: "A", component: "FRUIT", amount: 100, completeness: "KNOWN" },
      { opId: 2, kind: "ABNORMAL_LOSS", lotId: "A", lostVolumeL: 20, preVolumeL: 100 },
    ];
    const { lots } = rollupCost(events, [{ lotId: "A", volumeL: 80 }]);
    const a = lots.get("A")!;
    expect(a.totalCost).toBe(80);
    expect(a.expensed).toBe(20);
    expect(a.costPerL).toBe(1); // UNCHANGED — abnormal loss is not capitalized into survivors
  });
});

describe("rollupCost — completeness contagion (D14)", () => {
  it("an unknown-cost parent taints the blended child (PARTIAL), no phantom $0", () => {
    const events: CostEvent[] = [
      { opId: 1, kind: "DIRECT", lotId: "A", component: "FRUIT", amount: 100, completeness: "KNOWN" },
      // B has volume but its fruit cost was never entered → UNKNOWN, not $0.
      { opId: 2, kind: "DIRECT", lotId: "B", component: "FRUIT", amount: 0, completeness: "UNKNOWN" },
      { opId: 3, kind: "TRANSFER", fromLotId: "A", toLotId: "C", transferredVolumeL: 50, parentPreOpVolumeL: 100 },
      { opId: 3, kind: "TRANSFER", fromLotId: "B", toLotId: "C", transferredVolumeL: 50, parentPreOpVolumeL: 100 },
    ];
    const { lots } = rollupCost(events, [
      { lotId: "A", volumeL: 50 },
      { lotId: "B", volumeL: 50 },
      { lotId: "C", volumeL: 100 },
    ]);
    expect(lots.get("C")!.completeness).toBe("PARTIAL");
  });
});

describe("rollupCost — zero volume ⇒ zero cost / stranded (D9)", () => {
  it("cost left on a fully-depleted lot is reported as stranded (per-L null), not divided by ~0", () => {
    // A lot that got $50 of cost but a partial transfer only moved SOME, then volume went to 0 by a
    // path that left residual cost — modeled by a direct line + a transfer that doesn't cover it all.
    const events: CostEvent[] = [
      { opId: 1, kind: "DIRECT", lotId: "A", component: "FRUIT", amount: 50, completeness: "KNOWN" },
      { opId: 2, kind: "TRANSFER", fromLotId: "A", toLotId: "C", transferredVolumeL: 90, parentPreOpVolumeL: 100 },
    ];
    // A physically empty (0L) but 10% of cost never left (rounding/measurement) → stranded $5.
    const { lots } = rollupCost(events, [
      { lotId: "A", volumeL: 0 },
      { lotId: "C", volumeL: 90 },
    ]);
    const a = lots.get("A")!;
    expect(a.costPerL).toBeNull();
    expect(a.stranded).toBe(5);
  });
});

describe("rollupCost — EXIT CRITERION: cost-per-bottle through a blend AND a loss", () => {
  it("hand-computed end to end (ROADMAP exit scenario)", () => {
    // A: fruit $300 / 300L = $1/L. B: fruit $500 + material $20 = $520 / 200L = $2.60/L.
    // BLEND all of A (300L) + all of B (200L) into C (500L): C cost = 320+? recompute:
    //   from A: 320? no — A total is $300; move 300/300 = all → $300. from B: $520 → all → $520.
    //   C = $820 over 500L = $1.64/L.
    // NORMAL loss (racking) of 20L on C → folded 480L, cost held $820 → $1.7083.../L.
    // Bottle 480L into 750ml bottles = 640 bottles staged; breakage → 630 GOOD bottles.
    // Packaging: glass+cork+capsule+label = $0.90/bottle × 630 good = $567.
    // liquidCost = C total $820. totalRunCost = 820 + 567 = $1387. /630 = $2.2015... → $2.20/bottle.
    const events: CostEvent[] = [
      { opId: 1, kind: "DIRECT", lotId: "A", component: "FRUIT", amount: 300, completeness: "KNOWN" },
      { opId: 2, kind: "DIRECT", lotId: "B", component: "FRUIT", amount: 500, completeness: "KNOWN" },
      { opId: 3, kind: "DIRECT", lotId: "B", component: "MATERIAL", amount: 20, completeness: "KNOWN" },
      { opId: 4, kind: "TRANSFER", fromLotId: "A", toLotId: "C", transferredVolumeL: 300, parentPreOpVolumeL: 300 },
      { opId: 4, kind: "TRANSFER", fromLotId: "B", toLotId: "C", transferredVolumeL: 200, parentPreOpVolumeL: 200 },
      // NORMAL loss => no cost event; only C's folded volume reflects it.
    ];
    const { lots } = rollupCost(events, [
      { lotId: "A", volumeL: 0 },
      { lotId: "B", volumeL: 0 },
      { lotId: "C", volumeL: 480 },
    ]);
    const c = lots.get("C")!;
    expect(c.totalCost).toBe(820);
    expect(c.components).toEqual({ FRUIT: 800, MATERIAL: 20 });
    expect(c.completeness).toBe("KNOWN");
    expect(near(c.costPerL!, 820 / 480)).toBe(true); // per-L rose after the normal loss

    const bottle = bottlingCostPerBottle({ liquidCost: c.totalCost, packagingCost: 0.9 * 630, goodBottles: 630 });
    expect(bottle.totalRunCost).toBe(1387);
    expect(bottle.costPerBottle).toBe(2.2); // includes dry goods, divided by ACTUAL good bottles (D15)
    // Conservation: parents emptied entirely into C.
    expect(lots.get("A")!.totalCost).toBe(0);
    expect(lots.get("B")!.totalCost).toBe(0);
  });
});

describe("bottlingCostPerBottle — yield + residual (D15, D9)", () => {
  it("lower good-bottle yield RAISES cost-per-bottle", () => {
    const staged = bottlingCostPerBottle({ liquidCost: 1000, packagingCost: 0, goodBottles: 1000 });
    const broken = bottlingCostPerBottle({ liquidCost: 1000, packagingCost: 0, goodBottles: 900 });
    expect(staged.costPerBottle).toBe(1);
    expect(broken.costPerBottle).toBe(1.11); // 1000/900 = 1.111 → $1.11
  });

  it("cents-rounding residual is reported for a VARIANCE flush", () => {
    const r = bottlingCostPerBottle({ liquidCost: 100, packagingCost: 0, goodBottles: 3 });
    expect(r.costPerBottle).toBe(33.33);
    expect(near(r.residualToVariance, 100 - 33.33 * 3)).toBe(true); // 0.01
  });

  it("zero good bottles → whole run cost is residual (no divide-by-zero)", () => {
    const r = bottlingCostPerBottle({ liquidCost: 500, packagingCost: 50, goodBottles: 0 });
    expect(r.costPerBottle).toBe(0);
    expect(r.residualToVariance).toBe(550);
  });
});

describe("transferImbalance — conservation invariant (D10)", () => {
  it("cost moved out of parents equals cost moved into children (≈0)", () => {
    const before = new Map([
      ["A", 100],
      ["B", 400],
    ]);
    const imbalance = transferImbalance(
      [
        { fromLotId: "A", toLotId: "C", transferredVolumeL: 40, parentPreOpVolumeL: 100 },
        { fromLotId: "B", toLotId: "C", transferredVolumeL: 10, parentPreOpVolumeL: 100 },
      ],
      before,
    );
    expect(imbalance).toBe(0);
  });
});
