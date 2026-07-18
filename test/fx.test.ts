import { describe, it, expect } from "vitest";
import { convertToBase, round8 } from "@/lib/money/fx/convert";
import { parseRate, fetchFrankfurterRate } from "@/lib/money/fx/frankfurter";
import { cetEffectiveDate } from "@/lib/money/fx/rate-service";

// Plan 073 — pure FX logic (no DB, no real network). The DB cache read-through + same-currency +
// weekend + miss behavior of the rate service is proven against Neon in scripts/verify-fx.ts; here we
// lock the pure pieces: conversion/rounding, the feed-response parse, the client's backoff/typed-miss,
// and the CET date normalization.

describe("convertToBase — base = foreign × rate, two rounding grains", () => {
  it("cents grain rounds money to 2dp (Σ matches QBO's derived GL)", () => {
    // €767.16 × 1.0850 = 832.3686 → 832.37
    expect(convertToBase(767.16, 1.085, "cents")).toBe(832.37);
  });

  it("unit grain rounds per-stock-unit to 8dp", () => {
    // €0.128 /unit × 1.0850 = 0.13888 → 0.13888 (already ≤8dp)
    expect(convertToBase(0.128, 1.085, "unit")).toBe(0.13888);
    expect(round8(0.123456789)).toBe(0.12345679);
  });

  it("throws on a non-positive or non-finite rate (never papers over a bad rate — D14)", () => {
    expect(() => convertToBase(100, 0, "cents")).toThrow();
    expect(() => convertToBase(100, -1, "cents")).toThrow();
    expect(() => convertToBase(100, NaN, "cents")).toThrow();
    expect(() => convertToBase(Infinity, 1.1, "cents")).toThrow();
  });
});

describe("parseRate — pull the quote rate out of a Frankfurter body", () => {
  it("reads rates[quote] + the feed's actual date", () => {
    const r = parseRate({ amount: 1, base: "EUR", date: "2026-06-12", rates: { USD: 1.0712 } }, "USD");
    expect(r).toEqual({ ok: true, rate: 1.0712, rateDate: "2026-06-12", source: "ECB via Frankfurter" });
  });

  it("is a miss (null) when the rate is absent, zero, NaN, or the date is missing — never fabricated", () => {
    expect(parseRate({ date: "2026-06-12", rates: {} }, "USD")).toBeNull();
    expect(parseRate({ date: "2026-06-12", rates: { USD: 0 } }, "USD")).toBeNull();
    expect(parseRate({ date: "2026-06-12", rates: { USD: "x" } }, "USD")).toBeNull();
    expect(parseRate({ rates: { USD: 1.07 } }, "USD")).toBeNull(); // no date
    expect(parseRate(null, "USD")).toBeNull();
  });
});

describe("fetchFrankfurterRate — injectable fetch, typed result, backoff", () => {
  const ok = (body: unknown) =>
    ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
  const fail = (status: number) =>
    ({ ok: false, status, json: async () => ({}) }) as unknown as Response;

  it("returns the parsed rate on a 200", async () => {
    const r = await fetchFrankfurterRate("EUR", "USD", "2026-06-12", {
      fetchImpl: async () => ok({ date: "2026-06-12", rates: { USD: 1.0712 } }),
    });
    expect(r).toEqual({ ok: true, rate: 1.0712, rateDate: "2026-06-12", source: "ECB via Frankfurter" });
  });

  it("retries 5xx then succeeds (no real sleeps)", async () => {
    let calls = 0;
    const r = await fetchFrankfurterRate("EUR", "USD", "2026-06-12", {
      fetchImpl: async () => (++calls < 3 ? fail(503) : ok({ date: "2026-06-12", rates: { USD: 1.1 } })),
      sleep: async () => {},
      random: () => 0.5,
    });
    expect(calls).toBe(3);
    expect(r).toEqual({ ok: true, rate: 1.1, rateDate: "2026-06-12", source: "ECB via Frankfurter" });
  });

  it("returns a typed miss (never a fabricated rate) on a terminal 404", async () => {
    const r = await fetchFrankfurterRate("EUR", "ZZZ", "2026-06-12", {
      fetchImpl: async () => fail(404),
      sleep: async () => {},
    });
    expect(r).toEqual({ ok: false, reason: "HTTP 404" });
  });

  it("returns a typed miss on a network throw after retries", async () => {
    const r = await fetchFrankfurterRate("EUR", "USD", "2026-06-12", {
      fetchImpl: async () => {
        throw new Error("ECONNRESET");
      },
      sleep: async () => {},
      random: () => 0.1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("ECONNRESET");
  });
});

describe("cetEffectiveDate — normalize an instant to the ECB (Europe/Berlin) calendar day", () => {
  it("a late-evening US instant maps to the NEXT CET day (no 'yesterday' European rate)", () => {
    // 2026-07-17 22:00 America/Los_Angeles == 2026-07-18 07:00 Europe/Berlin
    expect(cetEffectiveDate(new Date("2026-07-18T05:00:00.000Z"))).toBe("2026-07-18");
  });
  it("a mid-day UTC instant is the same CET day", () => {
    expect(cetEffectiveDate(new Date("2026-07-17T12:00:00.000Z"))).toBe("2026-07-17");
  });
});
