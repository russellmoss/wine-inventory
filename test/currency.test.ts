import { describe, it, expect } from "vitest";
import { SUPPORTED_CURRENCIES, CURRENCY_LABELS, coerceCurrency, currencySymbol, formatMoney, DEFAULT_CURRENCY } from "@/lib/money/currency";

describe("coerceCurrency", () => {
  it("accepts the 6 supported codes (case-insensitive)", () => {
    for (const c of SUPPORTED_CURRENCIES) {
      expect(coerceCurrency(c)).toBe(c);
      expect(coerceCurrency(c.toLowerCase())).toBe(c);
    }
  });
  it("unknown/empty/null → USD", () => {
    expect(coerceCurrency("JPY")).toBe("USD");
    expect(coerceCurrency("")).toBe("USD");
    expect(coerceCurrency(null)).toBe("USD");
    expect(coerceCurrency(undefined)).toBe("USD");
    expect(DEFAULT_CURRENCY).toBe("USD");
  });
});

describe("currencySymbol", () => {
  it("maps each currency to its symbol", () => {
    expect(currencySymbol("USD")).toBe("$");
    expect(currencySymbol("EUR")).toBe("€");
    expect(currencySymbol("NZD")).toBe("NZ$");
    expect(currencySymbol("AUD")).toBe("A$");
    expect(currencySymbol("ZAR")).toBe("R");
    expect(currencySymbol("GBP")).toBe("£");
  });
  it("unknown → USD symbol", () => {
    expect(currencySymbol("JPY")).toBe("$");
    expect(currencySymbol(null)).toBe("$");
  });
});

describe("formatMoney", () => {
  it("prefixes the symbol + 2 decimals + separators", () => {
    expect(formatMoney(1234.5, "USD")).toBe("$1,234.50");
    expect(formatMoney(1234.5, "NZD")).toBe("NZ$1,234.50");
    expect(formatMoney(0.5, "EUR")).toBe("€0.50");
    expect(formatMoney(120, "GBP")).toBe("£120.00");
  });
  it("per-unit suffix", () => {
    expect(formatMoney(0.5, "USD", { per: "L" })).toBe("$0.50/L");
    expect(formatMoney(2.5, "ZAR", { per: "g" })).toBe("R2.50/g");
  });
  it("null / undefined / NaN → em dash (unknown, never $0)", () => {
    expect(formatMoney(null, "USD")).toBe("—");
    expect(formatMoney(undefined, "USD")).toBe("—");
    expect(formatMoney(Number.NaN, "USD")).toBe("—");
  });
  it("unknown currency falls back to the USD symbol", () => {
    expect(formatMoney(10, "JPY")).toBe("$10.00");
  });
});

describe("CURRENCY_LABELS", () => {
  it("labels every supported currency", () => {
    for (const c of SUPPORTED_CURRENCIES) expect(CURRENCY_LABELS[c]).toBeTruthy();
  });
});
