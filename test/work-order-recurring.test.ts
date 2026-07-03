import { describe, it, expect } from "vitest";
import { nextOccurrence, isDueForGeneration, resolvePayBasisStub } from "@/lib/work-orders/recurring";

describe("nextOccurrence", () => {
  it("steps by 7 / 14 days for WEEKLY / BIWEEKLY", () => {
    const from = new Date("2026-07-01T09:00:00Z");
    expect(nextOccurrence("WEEKLY", from).toISOString()).toBe(new Date("2026-07-08T09:00:00Z").toISOString());
    expect(nextOccurrence("BIWEEKLY", from).toISOString()).toBe(new Date("2026-07-15T09:00:00Z").toISOString());
  });
  it("steps a calendar month for MONTHLY", () => {
    expect(nextOccurrence("MONTHLY", new Date("2026-07-15T09:00:00Z")).getMonth()).toBe(7); // August (0-indexed)
  });
});

describe("isDueForGeneration", () => {
  it("is due when never generated", () => {
    expect(isDueForGeneration("WEEKLY", null, new Date())).toBe(true);
  });
  it("is due once the cadence interval has elapsed", () => {
    const last = new Date("2026-07-01T00:00:00Z");
    expect(isDueForGeneration("WEEKLY", last, new Date("2026-07-07T00:00:00Z"))).toBe(false);
    expect(isDueForGeneration("WEEKLY", last, new Date("2026-07-08T00:00:00Z"))).toBe(true);
  });
});

describe("resolvePayBasisStub", () => {
  it("returns null until Phase 11 wage settings exist (no wage math here)", () => {
    expect(resolvePayBasisStub()).toBeNull();
  });
});
