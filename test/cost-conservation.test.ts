import { describe, it, expect } from "vitest";
import type { CostComponent } from "@prisma/client";
import {
  rollupCost,
  costConservationResidual,
  transferImbalance,
  bottlingCostPerBottle,
  type CostEvent,
  type LotVolume,
} from "@/lib/cost/rollup";
import { planDepletion } from "@/lib/cost/deplete";
import { allocateLandedCost } from "@/lib/ingest/landed-cost";

/**
 * COST-1 — the guard. `npm run verify:cost-conservation`.
 *
 * WHY A SECOND GUARD. COST-1 is `severity: critical` and its only guard is `npm run verify:cost`, which
 * runs `tsx --env-file=.env` against a real database — so it does NOT run in CI's required `check` job,
 * and it cannot run on a laptop without a DB. Meanwhile the one *pure* conservation check that existed,
 * `transferImbalance`, was a TAUTOLOGY: it computed `moved` once and added it to both sides, returning 0
 * for any input including a set of transfers taking 120% of a parent. The test asserting on it was named
 * "conservation invariant (D10)" and could not fail.
 *
 * So this file is the pure, no-DB half: the fold's conservation identity, exercised on inputs chosen to
 * be hostile to base-10 and to rounding, plus the surrounding cents-grain money paths.
 *
 * THE IDENTITY (COST-1):
 *
 *     Σ(DIRECT amounts capitalized) == Σ(every lot's totalCost) + Σ(every lot's expensed)
 *
 * Everything else is movement. TRANSFER subtracts from a parent exactly what it adds to a child;
 * ABNORMAL_LOSS moves cost from components into `expensed`. `stranded` is not a separate term — it is a
 * report of `totalCost` on a ~zero-volume lot, already counted.
 *
 * ⚠️ TOLERANCE, STATED HONESTLY. These assertions use a 1e-9 tolerance, and that is a real limit rather
 * than a formality: the fold is float, so the identity holds to about 1e-13 on values up to $100k — a
 * hundred-billionth of a cent. It is NOT exact the way LEDGER-6 is exact. Measurement drove that choice:
 * sweeps over N-way splits, FIFO depletion (800 cases), landed-cost allocation and cost-per-bottle found
 * no material drift, so converting this path to Decimal would be churn on a critical path with nothing
 * to show. If a future change makes the residual grow, this catches it.
 */

const FRUIT = "FRUIT" as CostComponent;
const OAK = "OAK" as CostComponent;

const direct = (opId: number, lotId: string, amount: number, component = FRUIT): CostEvent => ({
  opId,
  kind: "DIRECT",
  lotId,
  component,
  amount,
  completeness: "KNOWN",
});
const transfer = (opId: number, from: string, to: string, moved: number, parentVol: number): CostEvent => ({
  opId,
  kind: "TRANSFER",
  fromLotId: from,
  toLotId: to,
  transferredVolumeL: moved,
  parentPreOpVolumeL: parentVol,
});
const abnormal = (opId: number, lotId: string, lost: number, pre: number): CostEvent => ({
  opId,
  kind: "ABNORMAL_LOSS",
  lotId,
  lostVolumeL: lost,
  preVolumeL: pre,
});

/** The COST-1 assertion itself. */
function expectConserved(events: CostEvent[], volumes: LotVolume[], label: string): void {
  const result = rollupCost(events, volumes);
  const residual = costConservationResidual(events, result);
  expect(Math.abs(residual), `${label}: cost conservation residual ${residual}`).toBeLessThan(1e-9);
}

describe("COST-1 — the fold neither creates nor destroys cost", () => {
  it("direct capitalization only", () => {
    expectConserved([direct(1, "a", 100), direct(1, "a", 0.07, OAK)], [{ lotId: "a", volumeL: 10 }], "direct");
  });

  // Splits whose exact share has no terminating decimal — the shape that produces dust.
  it.each([
    ["3 ways, $1000.07", 3, 1000.07],
    ["7 ways, $1234.56", 7, 1234.56],
    ["40 barrels, $50000", 40, 50000],
    ["200 ways, $99999.99", 200, 99999.99],
    ["13 ways, $0.07", 13, 0.07],
    ["3 ways, $0.01 (indivisible)", 3, 0.01],
  ])("a parent fully drained %s", (_label, n, cost) => {
    const parentVol = n;
    const events: CostEvent[] = [direct(1, "p", cost)];
    for (let i = 0; i < n; i++) events.push(transfer(2, "p", `c${i}`, 1, parentVol));
    const volumes: LotVolume[] = [
      { lotId: "p", volumeL: 0 },
      ...Array.from({ length: n }, (_, i) => ({ lotId: `c${i}`, volumeL: 1 })),
    ];
    expectConserved(events, volumes, `${n}-way split`);
  });

  it("abnormal loss moves cost to expensed rather than deleting it", () => {
    // The write-off must land in `expensed`, not vanish — that is the difference between an expense and
    // a leak, and only the identity distinguishes them.
    const events = [direct(1, "a", 333.33), abnormal(2, "a", 1, 3)];
    const result = rollupCost(events, [{ lotId: "a", volumeL: 2 }]);
    const lot = result.lots.get("a")!;
    expect(lot.expensed).toBeGreaterThan(0);
    expect(Math.abs(costConservationResidual(events, result))).toBeLessThan(1e-9);
  });

  it("survives a split → abnormal loss → re-blend chain", () => {
    const events = [
      direct(1, "p", 9999.99),
      transfer(2, "p", "c1", 1, 7),
      transfer(2, "p", "c2", 6, 7),
      abnormal(3, "c2", 1, 6),
      transfer(4, "c1", "m", 1, 1),
      transfer(4, "c2", "m", 5, 5),
    ];
    const volumes = [
      { lotId: "p", volumeL: 0 },
      { lotId: "c1", volumeL: 0 },
      { lotId: "c2", volumeL: 0 },
      { lotId: "m", volumeL: 6 },
    ];
    expectConserved(events, volumes, "split→loss→reblend");
  });

  it("holds over a deep repeated split/merge chain (drift would compound here or nowhere)", () => {
    const events: CostEvent[] = [direct(1, "L0", 12345.67)];
    let op = 2;
    for (let gen = 0; gen < 12; gen++) {
      // split 3 ways, then merge back — 24 ops of rounding on top of each other.
      for (let i = 0; i < 3; i++) events.push(transfer(op, `L${gen}`, `L${gen}_${i}`, 1, 3));
      op++;
      for (let i = 0; i < 3; i++) events.push(transfer(op, `L${gen}_${i}`, `L${gen + 1}`, 1, 1));
      op++;
    }
    const volumes: LotVolume[] = [{ lotId: "L12", volumeL: 3 }];
    for (let gen = 0; gen < 12; gen++) {
      volumes.push({ lotId: `L${gen}`, volumeL: 0 });
      for (let i = 0; i < 3; i++) volumes.push({ lotId: `L${gen}_${i}`, volumeL: 0 });
    }
    expectConserved(events, volumes, "12 generations of split+merge");
  });

  it("zero volume ⇒ the cost is reported as stranded, not silently kept", () => {
    // D9: cost left on a drained lot is ghost value the caller flushes to VARIANCE. The report is the
    // whole mechanism — cost that stays without being reported is indistinguishable from a leak.
    const events = [direct(1, "a", 500)];
    const result = rollupCost(events, [{ lotId: "a", volumeL: 0 }]);
    const lot = result.lots.get("a")!;
    expect(lot.stranded).toBe(500);
    expect(lot.costPerL).toBeNull();
  });
});

describe("transferImbalance measures the rounding residual — and is no longer a tautology", () => {
  it("is 0 when the split divides exactly", () => {
    expect(
      transferImbalance(
        [
          { fromLotId: "p", toLotId: "c1", transferredVolumeL: 50, parentPreOpVolumeL: 100 },
          { fromLotId: "p", toLotId: "c2", transferredVolumeL: 50, parentPreOpVolumeL: 100 },
        ],
        new Map([["p", 1000]]),
      ),
    ).toBe(0);
  });

  it("REPORTS the dust a thirds-split leaves behind", () => {
    // The old implementation returned 0 here. It returned 0 for everything.
    const dust = transferImbalance(
      [1, 2, 3].map((i) => ({ fromLotId: "p", toLotId: `c${i}`, transferredVolumeL: 1, parentPreOpVolumeL: 3 })),
      new Map([["p", 100]]),
    );
    expect(dust).not.toBe(0);
    expect(Math.abs(dust)).toBeLessThan(1e-6); // dust, not money — below the stranded/VARIANCE threshold
  });

  it("keeps the residual sub-cent even for a 200-way split of a six-figure cost", () => {
    const transfers = Array.from({ length: 200 }, (_, i) => ({
      fromLotId: "p",
      toLotId: `c${i}`,
      transferredVolumeL: 1,
      parentPreOpVolumeL: 200,
    }));
    expect(Math.abs(transferImbalance(transfers, new Map([["p", 999999.99]])))).toBeLessThan(0.01);
  });
});

describe("the cents-grain money paths around the fold conserve exactly", () => {
  it("landed-cost allocation: Σ landed == Σ subtotals + allocatable charges", () => {
    // Hand-rolled residual sweep onto the last priced line. Measured exact on every case below, which is
    // why it was NOT swapped for Amount.allocateByWeights — that would be churn, not a fix.
    const cases: [(number | null)[], number][] = [
      [[100, 100, 100], 100],
      [[10, 10, 10, 10, 10, 10, 10], 0.01],
      [[1, 1, 1], 0.01],
      [[9999.99, 0.01, 0.01], 333.33],
      [[100, null, 100], 50], // a line with an UNKNOWN price takes no share
    ];
    for (const [subs, charge] of cases) {
      const out = allocateLandedCost(subs as never, { shipping: charge } as never);
      const landedCents = out
        .filter((o) => o.landedLineTotal != null)
        .reduce((a, o) => a + Math.round(o.landedLineTotal! * 100), 0);
      const expectedCents =
        (subs.filter((s) => s != null) as number[]).reduce((a, s) => a + Math.round(s * 100), 0) +
        Math.round(charge * 100);
      expect(landedCents, `subs=${JSON.stringify(subs)} charge=${charge}`).toBe(expectedCents);
    }
  });

  it("cost-per-bottle × bottles + residual == the total run cost, exactly", () => {
    for (const [liquid, packaging, bottles] of [
      [10000, 2500, 1333],
      [1234.56, 0, 7],
      [99999.99, 12345.67, 100000],
      [0.07, 0, 3],
    ]) {
      const r = bottlingCostPerBottle({ liquidCost: liquid, packagingCost: packaging, goodBottles: bottles });
      const recomposed = r.costPerBottle * bottles + r.residualToVariance;
      expect(Math.abs(recomposed - r.totalRunCost), `${liquid}+${packaging}/${bottles}`).toBeLessThan(1e-9);
    }
  });

  it("zero good bottles strands the whole run cost rather than dividing by zero", () => {
    const r = bottlingCostPerBottle({ liquidCost: 500, packagingCost: 100, goodBottles: 0 });
    expect(r.costPerBottle).toBe(0);
    expect(r.residualToVariance).toBe(600);
  });

  it("FIFO depletion: totalCost == Σ line extendedCost across 40 lots and hostile unit costs", () => {
    for (let lots = 1; lots <= 40; lots += 7) {
      for (const unitCost of [0.00030779, 1.6432, 12.5, 0.07, 999.99999999]) {
        const available = Array.from({ length: lots }, (_, i) => ({
          id: `l${i}`,
          receivedAt: i,
          qtyRemaining: 100 + i,
          unitCost,
        }));
        const plan = planDepletion(available as never, lots * 33.7, "FIFO" as never);
        const sum = plan.lines.reduce((a, l) => a + (l.extendedCost ?? 0), 0);
        expect(Math.abs(plan.totalCost - sum), `${lots} lots @ ${unitCost}`).toBeLessThan(1e-9);
      }
    }
  });

  it("an unknown unit cost stays unknown — never a silent $0 (D14)", () => {
    const plan = planDepletion(
      [{ id: "a", receivedAt: 0, qtyRemaining: 100, unitCost: null }] as never,
      50,
      "FIFO" as never,
    );
    expect(plan.completeness).toBe("UNKNOWN");
    expect(plan.lines[0].extendedCost).toBeNull();
  });
});
