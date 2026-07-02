import { describe, it, expect } from "vitest";
import { deterministicExciseAnomalies, hasFilingBlocker } from "@/lib/compliance/anomaly";
import type { ExciseComputed } from "@/lib/compliance/excise";
import type { PerLotClass } from "@/lib/compliance/generate";

const base = (over: Partial<ExciseComputed> = {}): Pick<ExciseComputed, "classRows" | "grossTax" | "cbmaCredit" | "netTax" | "ladder" | "perLot"> => ({
  classRows: [{ taxClass: "A_LE16", gallons: 100, rate: 1.07, grossTax: 107, cbmaCredit: 100, netTax: 7 }],
  grossTax: 107,
  cbmaCredit: 100,
  netTax: 7,
  ladder: {
    ytdRemovedStart: 0,
    periodRemovedGal: 100,
    ytdRemovedEnd: 100,
    annualCap: 750_000,
    tiers: [],
    totalCredit: 100,
    over750k: false,
  },
  perLot: [],
  ...over,
});

const lot = (over: Partial<PerLotClass>): PerLotClass => ({
  lotId: "l1",
  lotCode: "ZZ-1",
  taxClass: "A_LE16",
  sparklingSub: null,
  needsAbvReview: false,
  abv: 13.5,
  overridden: false,
  reason: "abv-le-16",
  ...over,
});

describe("deterministicExciseAnomalies (plan-026 Unit 9)", () => {
  it("clean return → no findings", () => {
    expect(deterministicExciseAnomalies({ snapshot: base() })).toHaveLength(0);
  });

  it("ABV > 24% on a taxpaid-removed lot → BLOCK (file as distilled spirits) [S2]", () => {
    const f = deterministicExciseAnomalies({ snapshot: base({ perLot: [lot({ abv: 25.5, reason: "abv-over-24-review" })] }) });
    const blk = f.find((x) => x.code === "abv-over-24");
    expect(blk?.severity).toBe("blocker");
    expect(hasFilingBlocker(f)).toBe(true);
    expect(blk?.message).toMatch(/distilled spirits/i);
  });

  it("negative net tax → BLOCK", () => {
    const f = deterministicExciseAnomalies({ snapshot: base({ netTax: -5, cbmaCredit: 112 }) });
    expect(f.some((x) => x.code === "negative-tax" && x.severity === "blocker")).toBe(true);
  });

  it("gross ≠ Σ worksheet rows → BLOCK", () => {
    const f = deterministicExciseAnomalies({ snapshot: base({ grossTax: 999 }) });
    expect(f.some((x) => x.code === "gross-mismatch")).toBe(true);
  });

  it("net ≠ gross − credit → BLOCK", () => {
    const f = deterministicExciseAnomalies({ snapshot: base({ netTax: 50 }) }); // 107 − 100 = 7, not 50
    expect(f.some((x) => x.code === "net-mismatch")).toBe(true);
  });

  it("over 750k removed this year → WARNING (not a blocker)", () => {
    const f = deterministicExciseAnomalies({ snapshot: base({ ladder: { ...base().ladder, over750k: true } }) });
    const w = f.find((x) => x.code === "cbma-over-750k");
    expect(w?.severity).toBe("warning");
    expect(hasFilingBlocker(f)).toBe(false);
  });

  it("prior unfiled period this year → WARNING; downstream stale → INFO", () => {
    const f = deterministicExciseAnomalies({ snapshot: base(), priorUnfiledPeriodThisYear: true, downstreamStale: true });
    expect(f.find((x) => x.code === "prior-period-unfiled")?.severity).toBe("warning");
    expect(f.find((x) => x.code === "downstream-stale")?.severity).toBe("info");
  });
});
