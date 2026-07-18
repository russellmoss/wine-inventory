import { describe, it, expect } from "vitest";
import { baseHomeCurrencyMismatch, baseHomeMismatchMessage } from "@/lib/accounting/currency-guard";

// Plan 073 hardening — the tenant base currency must equal the connected QBO company's home currency. This
// predicate backs three guards (connect-time reject, base-change reject, post-sweep WITHHELD backstop).

describe("baseHomeCurrencyMismatch", () => {
  it("false when base == home (case/whitespace-insensitive)", () => {
    expect(baseHomeCurrencyMismatch("USD", "USD")).toBe(false);
    expect(baseHomeCurrencyMismatch("usd", " USD ")).toBe(false);
  });

  it("true when a base and home are both set and differ", () => {
    expect(baseHomeCurrencyMismatch("NZD", "USD")).toBe(true);
    expect(baseHomeCurrencyMismatch("USD", "EUR")).toBe(true);
  });

  it("false when either side is missing (nothing to compare — e.g. a legacy connection with no home read)", () => {
    expect(baseHomeCurrencyMismatch("USD", null)).toBe(false);
    expect(baseHomeCurrencyMismatch(null, "USD")).toBe(false);
    expect(baseHomeCurrencyMismatch("", "USD")).toBe(false);
    expect(baseHomeCurrencyMismatch(undefined, undefined)).toBe(false);
  });
});

describe("baseHomeMismatchMessage", () => {
  it("names both currencies and gives an actionable next step", () => {
    const m = baseHomeMismatchMessage("NZD", "USD");
    expect(m).toContain("NZD");
    expect(m).toContain("USD");
    expect(m).toMatch(/Settings|connect/i);
  });
});
