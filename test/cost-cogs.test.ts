import { describe, it, expect } from "vitest";
import { buildCogsSnapshot, makePostingKey, type CogsInput } from "@/lib/cost/cogs";

// Unit 6 — bottling COGS bill-of-materials assembly (pure). The DB write of the immutable snapshot in
// the finalize tx is the load-bearing wiring, exercised by verify:cost against the live schema.

const base: CogsInput = {
  runId: "run1",
  skuId: "sku1",
  taxClass: null,
  bottledAt: "2026-07-02",
  goodBottles: 630,
  liquidComponents: { FRUIT: 800, MATERIAL: 20 },
  liquidCompleteness: "KNOWN",
  packagingCost: 567, // 0.90/bottle × 630
  costBasisAsOfOperationId: 4242,
  policyVersion: 1,
  currency: "USD",
};

describe("buildCogsSnapshot", () => {
  it("includes dry goods and divides by ACTUAL good bottles (D15)", () => {
    const s = buildCogsSnapshot(base);
    expect(s.totalRunCost).toBe(1387); // 820 liquid + 567 packaging
    expect(s.costPerBottle).toBe(2.2); // 1387 / 630 = 2.2015… → $2.20
    expect(s.componentBreakdown).toEqual({ FRUIT: 800, MATERIAL: 20, PACKAGING: 567 });
    expect(s.basisCompleteness).toBe("KNOWN");
    expect(s.costBasisAsOfOperationId).toBe(4242);
  });

  it("surfaces the cents-rounding residual for a VARIANCE line (D9)", () => {
    const s = buildCogsSnapshot({ ...base, liquidComponents: { FRUIT: 100 }, packagingCost: 0, goodBottles: 3 });
    expect(s.costPerBottle).toBe(33.33);
    expect(Math.abs(s.varianceResidual - (100 - 33.33 * 3))).toBeLessThan(1e-6); // ~0.01
  });

  it("lower good-bottle yield raises cost-per-bottle", () => {
    const full = buildCogsSnapshot({ ...base, liquidComponents: { FRUIT: 1000 }, packagingCost: 0, goodBottles: 1000 });
    const broken = buildCogsSnapshot({ ...base, liquidComponents: { FRUIT: 1000 }, packagingCost: 0, goodBottles: 900 });
    expect(full.costPerBottle).toBe(1);
    expect(broken.costPerBottle).toBe(1.11);
  });

  it("an incomplete liquid or packaging basis taints the snapshot to PARTIAL (D14)", () => {
    expect(buildCogsSnapshot({ ...base, liquidCompleteness: "UNKNOWN" }).basisCompleteness).toBe("PARTIAL");
    expect(buildCogsSnapshot({ ...base, packagingCompleteness: "UNKNOWN" }).basisCompleteness).toBe("PARTIAL");
  });

  it("zero good bottles → costPerBottle 0, whole run cost is residual (no divide-by-zero)", () => {
    const s = buildCogsSnapshot({ ...base, goodBottles: 0 });
    expect(s.costPerBottle).toBe(0);
    expect(s.varianceResidual).toBe(1387);
  });

  it("posting key is deterministic + idempotent per run/sku/taxClass (D18)", () => {
    expect(makePostingKey("run1", "sku1", null)).toBe("cogs:run1:sku1:-");
    expect(makePostingKey("run1", "sku1", "750-14")).toBe("cogs:run1:sku1:750-14");
    expect(buildCogsSnapshot(base).postingKey).toBe("cogs:run1:sku1:-");
  });
});
