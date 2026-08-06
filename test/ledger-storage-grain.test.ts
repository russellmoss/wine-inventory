import { describe, it, expect } from "vitest";
import {
  assertBalanced,
  isBalanced,
  planLedgerRack,
  planBlend,
  planRackMerge,
  planVesselLoss,
  planCrush,
  type LedgerLine,
  type VesselLotBalance,
} from "@/lib/ledger/math";
import { computeProportionalDraw } from "@/lib/bottling/draw";

/**
 * LEDGER-9 — the guard. This file IS the proof named by
 * `docs/architecture/invariants/LEDGER-9-decimal-safe-math.md`.
 *
 * WHY IT EXISTS. LEDGER-9 read `status: guarded` while pointing at `npm run verify:reverse`, which is a
 * 264-line REVERSAL-SEMANTICS proof (LIFO unwind, append-only correction, dispatcher routing) containing
 * no reference to rounding, decimals, balance or floats — and whose only fractional literals in the whole
 * file are `0.5` and `13.5`, both 1dp. It never exercised the invariant. `verify:invariants` checks only
 * that the named script EXISTS ("detection only", per the register's own README), so nothing noticed.
 *
 * WHAT MUST HOLD. Ledger volumes are `Decimal(10,2)` — integer centilitres. Postgres rounds each
 * `deltaL` to 2dp on insert, cannot enforce a cross-row sum, and nothing re-reads the operation
 * afterwards. So if a planner emits lines at finer precision, the residuals need not cancel and the
 * operation is permanently unbalanced in the database:
 *
 *     lines  [3.3333, 3.3333, 3.3334, -10]  ->  Σ = 0        (accepted under the old 1e-6 tolerance)
 *     stored [3.33,   3.33,   3.33,   -10]  ->  Σ = -0.01 L  (LEDGER-6 broken, silently, forever)
 *
 * THE ADVERSARIAL PART. Every input below is chosen to be hostile to base-10: thirds, sevenths, primes,
 * and volumes whose exact share has a non-terminating decimal expansion. A test using 500 L and 300 L
 * cannot fail this way, which is exactly how the gap survived.
 */

const CL = (l: number) => Math.round(l * 100);
const atGrain = (l: number) => Math.abs(l * 100 - CL(l)) < 1e-9;

/** Every line sits on the storage grain AND the set conserves exactly once stored. */
function expectStorageSafe(lines: LedgerLine[], label: string): void {
  for (const l of lines) {
    expect(atGrain(l.deltaL), `${label}: deltaL ${l.deltaL} is finer than 0.01 L`).toBe(true);
  }
  const storedSum = lines.reduce((a, l) => a + CL(l.deltaL), 0);
  expect(storedSum, `${label}: stored centilitres sum to ${storedSum}, not 0`).toBe(0);
}

const bal = (vesselId: string, lotId: string, volumeL: number): VesselLotBalance => ({ vesselId, lotId, volumeL });

/** Volumes engineered so an even share is non-terminating in base 10. */
const HOSTILE_SPLITS: { label: string; source: VesselLotBalance[]; drawL: number; lossL: number }[] = [
  { label: "10 L across 3 equal lots", source: [bal("v1", "a", 10), bal("v1", "b", 10), bal("v1", "c", 10)], drawL: 10, lossL: 0 },
  { label: "100 L across 7 equal lots", source: Array.from({ length: 7 }, (_, i) => bal("v1", `l${i}`, 100)), drawL: 100, lossL: 0 },
  { label: "1 L across 3 lots (sub-centilitre shares)", source: [bal("v1", "a", 1), bal("v1", "b", 1), bal("v1", "c", 1)], drawL: 1, lossL: 0 },
  { label: "0.03 L across 3 lots (one centilitre each)", source: [bal("v1", "a", 1), bal("v1", "b", 1), bal("v1", "c", 1)], drawL: 0.03, lossL: 0 },
  { label: "0.01 L across 3 lots (indivisible)", source: [bal("v1", "a", 1), bal("v1", "b", 1), bal("v1", "c", 1)], drawL: 0.01, lossL: 0 },
  { label: "a third of a third: 3.33 L from 9.99 L over 3", source: [bal("v1", "a", 3.33), bal("v1", "b", 3.33), bal("v1", "c", 3.33)], drawL: 3.33, lossL: 0 },
  { label: "thirds WITH a loss that is also a third", source: [bal("v1", "a", 10), bal("v1", "b", 10), bal("v1", "c", 10)], drawL: 10, lossL: 1 },
  { label: "13 lots, 1 L draw — leftover exceeds a cent per lot", source: Array.from({ length: 13 }, (_, i) => bal("v1", `l${i}`, 7)), drawL: 1, lossL: 0 },
  { label: "uneven shares (primes) with a fractional loss", source: [bal("v1", "a", 7), bal("v1", "b", 11), bal("v1", "c", 13), bal("v1", "d", 17)], drawL: 23, lossL: 0.07 },
  { label: "one lot dwarfs the rest (rounding all lands on one)", source: [bal("v1", "a", 999.99), bal("v1", "b", 0.01), bal("v1", "c", 0.01)], drawL: 333.33, lossL: 0 },
];

describe("computeProportionalDraw — the centilitre-integer helper LEDGER-9 actually rests on", () => {
  it.each(HOSTILE_SPLITS)("$label: shares sum EXACTLY to the draw", ({ source, drawL }) => {
    const out = computeProportionalDraw(source.map((b) => ({ id: b.lotId, volumeL: b.volumeL })), drawL);
    expect(out.reduce((a, d) => a + CL(d.deduct), 0)).toBe(CL(drawL));
    for (const d of out) expect(atGrain(d.deduct)).toBe(true);
  });

  it("never over-draws a component, even when the remainder distribution is lopsided", () => {
    const out = computeProportionalDraw([{ id: "a", volumeL: 0.01 }, { id: "b", volumeL: 999.99 }], 0.02);
    for (const d of out) expect(d.remaining).toBeGreaterThanOrEqual(0);
    expect(out.reduce((a, d) => a + CL(d.deduct), 0)).toBe(2);
  });
});

describe("every planner emits lines at the storage grain and conserving exactly", () => {
  it.each(HOSTILE_SPLITS)("planLedgerRack — $label", ({ label, source, drawL, lossL }) => {
    expectStorageSafe(planLedgerRack(source, "dest", drawL, lossL).lines, `planLedgerRack ${label}`);
  });

  it.each(HOSTILE_SPLITS)("planVesselLoss — $label", ({ label, source, drawL }) => {
    expectStorageSafe(planVesselLoss(source, drawL, "loss").lines, `planVesselLoss ${label}`);
  });

  it("planBlend — N sources into one child, with a loss that does not divide evenly", () => {
    const components = [
      { vesselId: "v1", lotId: "a", drawL: 33.33 },
      { vesselId: "v2", lotId: "b", drawL: 33.33 },
      { vesselId: "v3", lotId: "c", drawL: 33.34 },
    ];
    const balances = [bal("v1", "a", 100), bal("v2", "b", 100), bal("v3", "c", 100)];
    expectStorageSafe(planBlend(components, "dest", "child", 0.07, balances).lines, "planBlend");
    expectStorageSafe(planBlend(components, "dest", "child", 0, balances).lines, "planBlend no loss");
  });

  it("planRackMerge — one lot drawn from two vessels, loss spread over the aggregate", () => {
    // The aggregate-per-lot path: lot "a" arrives from two vessels, so the loss share is computed on the
    // combined gross and then split back. Two roundings in sequence is where a residual would appear.
    const draws = [
      { vesselId: "v1", lotId: "a", drawL: 3.33 },
      { vesselId: "v2", lotId: "a", drawL: 3.33 },
      { vesselId: "v3", lotId: "b", drawL: 3.34 },
    ];
    expectStorageSafe(planRackMerge(draws, "dest", 0.01).lines, "planRackMerge");
    expectStorageSafe(planRackMerge(draws, "dest", 1).lines, "planRackMerge 1 L loss");
  });

  it("planCrush — a measured output volume the user could type at 3dp", () => {
    const picks = [{ pickId: "p", consumedKg: 1000, weightKg: 1000, alreadyConsumedKg: 0 }];
    expectStorageSafe(planCrush(picks, "dest", "must", 666.666).lines, "planCrush 3dp input");
    expectStorageSafe(planCrush(picks, "dest", "must", 666.67).lines, "planCrush 2dp input");
  });
});

describe("assertBalanced refuses what Decimal(10,2) would silently break", () => {
  const line = (deltaL: number): LedgerLine => ({ lotId: "l", vesselId: "v", deltaL });

  it("REFUSES a set that sums to zero in floats but not once stored", () => {
    // The exact case the old 1e-6 tolerance waved through. Σ is 0 to fifteen decimal places; stored it
    // is -0.01 L, and no later read would ever have questioned it.
    const lines = [3.3333, 3.3333, 3.3334, -10].map(line);
    expect(Math.abs(lines.reduce((a, l) => a + l.deltaL, 0))).toBeLessThan(1e-6);
    expect(() => assertBalanced(lines)).toThrow(/finer than the centiliter storage grain/);
  });

  it("REFUSES a single line finer than a centilitre, even paired symmetrically", () => {
    // A ±v pair does conserve under symmetric rounding, so conservation alone would pass it. It is still
    // refused: the stored volume would not be the volume the operation claims, and a later split of that
    // position inherits the discrepancy.
    expect(() => assertBalanced([line(0.005), line(-0.005)])).toThrow(/finer than the centiliter/);
    expect(() => assertBalanced([line(3.3333), line(-3.3333)])).toThrow(/finer than the centiliter/);
  });

  it("names the offending volumes so the caller can find the unrounded split", () => {
    expect(() => assertBalanced([line(1.234), line(-1.234)])).toThrow(/1\.234 L/);
  });

  it("ACCEPTS the disciplined 2dp equivalent", () => {
    expect(() => assertBalanced([3.33, 3.33, 3.34, -10].map(line))).not.toThrow();
    expect(isBalanced([3.33, 3.33, 3.34, -10].map(line))).toBe(true);
  });

  it("is EXACT at the grain — no epsilon left to hide behind", () => {
    // One centilitre out is now a failure. Under the old tolerance it was too, but only because 0.01 is
    // far above 1e-6; the point is that the check is now expressed in the units it protects.
    expect(isBalanced([line(10), line(-9.99)])).toBe(false);
    expect(() => assertBalanced([line(10), line(-9.99)])).toThrow(/not balanced/);
  });

  it("does not mistake the binary representation of an exact 2dp value for extra precision", () => {
    // 3.33 * 100 is 333.00000000000006 in IEEE-754. A naive `x * 100 % 1 !== 0` test would reject every
    // legitimate line in the codebase.
    for (let c = 1; c <= 2000; c++) {
      const v = c / 100;
      expect(() => assertBalanced([line(v), line(-v)]), `${v} L must be accepted`).not.toThrow();
    }
  });

  it("still holds for the large volumes a real cellar uses", () => {
    // Decimal(10,2) tops out at 99,999,999.99 L; centilitre integers stay exact far past that (2^53 cL
    // is 9e13 L), so the check does not degrade at tank scale.
    expect(() => assertBalanced([line(99999999.99), line(-99999999.99)])).not.toThrow();
    expect(isBalanced([line(50000000.01), line(-50000000.01)])).toBe(true);
  });
});
