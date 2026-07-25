import { describe, it, expect } from "vitest";
import { usageYearMonth, isCdseQuotaExhausted, CDSE_FREE_TIER } from "@/lib/spatial/usage-core";

/**
 * Pure parts of the quota telemetry. Atomic-increment / month-rollover-under-concurrency are guaranteed by
 * the single `INSERT … ON CONFLICT DO UPDATE` statement and exercised end-to-end by verify:ndvi (DB-gated).
 */
describe("usageYearMonth — the UTC billing bucket", () => {
  it("formats UTC year-month zero-padded", () => {
    expect(usageYearMonth(new Date("2026-07-25T12:00:00Z"))).toBe("2026-07");
    expect(usageYearMonth(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
  });

  it("rolls over on the UTC month boundary, not the local one", () => {
    // 2026-07-31T23:30 in UTC-05 is still July UTC → 2026-07 (the provider clock is UTC).
    expect(usageYearMonth(new Date("2026-08-01T04:30:00Z"))).toBe("2026-08");
    expect(usageYearMonth(new Date("2026-07-31T23:59:59Z"))).toBe("2026-07");
  });
});

describe("isCdseQuotaExhausted — the auto-add headroom gate", () => {
  it("is false with headroom", () => {
    expect(isCdseQuotaExhausted({ requestCount: 10, processingUnits: 3 })).toBe(false);
  });
  it("trips when requests hit the cap (the binding constraint ~26× before PU)", () => {
    expect(isCdseQuotaExhausted({ requestCount: CDSE_FREE_TIER.requests, processingUnits: 1 })).toBe(true);
  });
  it("trips when PU hit the cap", () => {
    expect(isCdseQuotaExhausted({ requestCount: 1, processingUnits: CDSE_FREE_TIER.processingUnits })).toBe(true);
  });
});
