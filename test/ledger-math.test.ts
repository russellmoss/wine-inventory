import { describe, it, expect } from "vitest";
import {
  foldLines,
  isBalanced,
  assertBalanced,
  planLedgerRack,
  planCorrection,
  balanceKey,
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
