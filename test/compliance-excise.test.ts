import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RemovedByClass } from "@/lib/compliance/removals";

// Mock the shared removal helper so the compute arithmetic is a fast pure unit test. The DB-backed
// behaviour of removedTaxpaidGallonsByClass (taxpaid-only base C5, reversal netting) is proven
// end-to-end in scripts/verify-excise.ts against a synthetic tenant (plan Test Coverage Map U5).
const { removedMock } = vi.hoisted(() => ({ removedMock: vi.fn() }));
vi.mock("@/lib/compliance/removals", () => ({ removedTaxpaidGallonsByClass: removedMock }));

import { computeExcise } from "@/lib/compliance/excise";

const YEAR = 2026;
const ret = (gallonsByClass: RemovedByClass) => ({
  gallonsByClass,
  totalGallons: Object.values(gallonsByClass).reduce((a, v) => a + (v ?? 0), 0),
  perLot: [],
});

/**
 * Route the mock by matching the period start: the compute calls the helper with the exact period
 * window for the period, and with {Jan 1 → periodStart−1ms} for the stateless YTD. Matching the
 * period start disambiguates even a Jan-1 period (whose YTD short-circuits to 0 anyway).
 */
function wire(periodStart: Date, period: RemovedByClass, ytd: RemovedByClass = {}) {
  removedMock.mockImplementation((_t: string, range?: { start: Date; end: Date }) =>
    Promise.resolve(range && range.start.getTime() === periodStart.getTime() ? ret(period) : ret(ytd)),
  );
}

beforeEach(() => removedMock.mockReset());

describe("computeExcise (plan-026 Unit 5)", () => {
  it("pre-credit tax = Σ gallons × rate per class; net = gross − CBMA (period starting Jan 1)", async () => {
    wire(new Date(Date.UTC(YEAR, 0, 1)), { A_LE16: 1_000 }); // starts Jan 1 → YTD 0
    const { computed, netTax } = await computeExcise("t", {
      start: new Date(Date.UTC(YEAR, 0, 1)),
      end: new Date(Date.UTC(YEAR, 0, 15, 23, 59, 59, 999)),
      cadence: "SEMIMONTHLY",
    });
    expect(computed.grossTax).toBeCloseTo(1_070, 2); // 1000 × $1.07
    expect(computed.cbmaCredit).toBeCloseTo(1_000, 2); // 1000 × $1.00 (all tier 1)
    expect(netTax).toBeCloseTo(70, 2);
    expect(computed.formType).toBe("TTB_5000_24");
    const rowA = computed.classRows.find((r) => r.taxClass === "A_LE16")!;
    expect(rowA.netTax).toBeCloseTo(70, 2);
  });

  it("two periods same year → YTD ladder steps down (period 2 credited at the lower tier) [C3]", async () => {
    // Period 2 starts mid-Feb; YTD (Jan 1 → Feb start) = 29,500 gal already removed → the 1,000 gal
    // this period straddles 30k: 500 @ $1.00 + 500 @ $0.90 = $950 credit. Gross 1000×$1.07 = 1070.
    wire(new Date(Date.UTC(YEAR, 1, 16)), { A_LE16: 1_000 }, { A_LE16: 29_500 });
    const { computed } = await computeExcise("t", {
      start: new Date(Date.UTC(YEAR, 1, 16)),
      end: new Date(Date.UTC(YEAR, 1, 28, 23, 59, 59, 999)),
      cadence: "SEMIMONTHLY",
    });
    expect(computed.ladder.ytdRemovedStart).toBe(29_500);
    expect(computed.ladder.ytdRemovedEnd).toBe(30_500);
    expect(computed.grossTax).toBeCloseTo(1_070, 2);
    expect(computed.cbmaCredit).toBeCloseTo(950, 2);
    expect(computed.netTax).toBeCloseTo(120, 2);
  });

  it("rounding: gallons stay exact → tax = gal×rate rounded to the cent (S4)", async () => {
    wire(new Date(Date.UTC(YEAR, 0, 1)), { A_LE16: 33.33 });
    const { computed } = await computeExcise("t", {
      start: new Date(Date.UTC(YEAR, 0, 1)),
      end: new Date(Date.UTC(YEAR, 0, 15, 23, 59, 59, 999)),
      cadence: "SEMIMONTHLY",
    });
    expect(computed.classRows[0].gallons).toBeCloseTo(33.33, 6); // exact
    expect(computed.grossTax).toBeCloseTo(35.66, 2); // 33.33 × 1.07 = 35.6631 → 35.66
  });

  it("empty period → $0, no rows", async () => {
    wire(new Date(Date.UTC(YEAR, 5, 1)), {});
    const { computed, netTax } = await computeExcise("t", {
      start: new Date(Date.UTC(YEAR, 5, 1)),
      end: new Date(Date.UTC(YEAR, 5, 15, 23, 59, 59, 999)),
      cadence: "SEMIMONTHLY",
    });
    expect(netTax).toBe(0);
    expect(computed.classRows).toHaveLength(0);
    expect(computed.grossTax).toBe(0);
  });

  it("ladder strip reports consumed/remaining per tier", async () => {
    wire(new Date(Date.UTC(YEAR, 2, 1)), { A_LE16: 5_000 }, { A_LE16: 28_000 });
    const { computed } = await computeExcise("t", {
      start: new Date(Date.UTC(YEAR, 2, 1)),
      end: new Date(Date.UTC(YEAR, 2, 15, 23, 59, 59, 999)),
      cadence: "SEMIMONTHLY",
    });
    // ytdEnd = 33,000. Tier 1 (30k) fully consumed; tier 2 (100k) has 3,000 consumed.
    const t1 = computed.ladder.tiers.find((t) => t.tier === 1)!;
    const t2 = computed.ladder.tiers.find((t) => t.tier === 2)!;
    expect(t1.remaining).toBe(0);
    expect(t2.consumed).toBe(3_000);
    expect(t2.remaining).toBe(97_000);
  });
});
