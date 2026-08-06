import { describe, it, expect } from "vitest";
import { convertToBase, round8 } from "@/lib/money/fx/convert";
import { parseRate, fetchFrankfurterRate } from "@/lib/money/fx/frankfurter";
import { cetEffectiveDate, getQuote, type ResolvedRate } from "@/lib/money/fx/rate-service";

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

  // The float defect this function used to have, pinned. Each of these was measured wrong under
  // `round2(amountForeign * rate)`: the exact product lands ON a half, the binary product lands a hair
  // below it, and Math.round then rounds DOWN. Over a sweep of 1,400,000 realistic cent-scale amounts ×
  // seven real ECB rates, 447 (0.032% — about 1 in 3,100) came out a cent light.
  it.each([
    [11, 1.085, 11.94], // 11 × 1.085 = 11.935 exactly; float gave 11.93
    [15, 1.085, 16.28], // 16.2750 → 16.28; float gave 16.27
    [37, 1.085, 40.15],
    [65, 1.085, 70.53],
    [950, 0.6231, 591.95], // 591.945 → 591.95; float gave 591.94
    [1850, 0.6231, 1152.74],
  ])("cents grain: %d × %d is exactly %d, not a cent light", (amount, rate, expected) => {
    expect(convertToBase(amount, rate, "cents")).toBe(expected);
  });

  it("keeps every value the old float path already got right", () => {
    // The fix must be behaviour-PRESERVING on the 99.968%. These are the fixtures the FX proofs assert on.
    expect(convertToBase(547.99, 1.085, "cents")).toBe(594.57);
    expect(convertToBase(219.17, 1.085, "cents")).toBe(237.8);
    expect(convertToBase(200, 1.1, "cents")).toBe(220);
    expect(convertToBase(110, 1.25, "cents")).toBe(137.5);
  });

  it("round8 is unchanged on realistic magnitudes — no defect was observed in the unit grain", () => {
    // Stated plainly because it would be easy to over-claim: the same 1.4M-pair sweep found 0 unit-grain
    // disagreements. `Math.round(n * 1e8)` does go inexact, but only above n ≈ 90,000,000, and a per-unit
    // cost of ninety million dollars is not a thing. This was converted for uniformity, not for a bug.
    expect(round8(0.123456789)).toBe(0.12345679);
    expect(round8(90.071992547)).toBe(90.07199255);
    expect(round8(1000.000000005)).toBe(1000.00000001);
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

describe("getQuote — a resolved rate promoted to a currency-tagged FxQuote (MONEY-1)", () => {
  const AT = new Date("2026-06-12T12:00:00.000Z");
  const JUN = new Date("2026-06-12T00:00:00.000Z");

  it("prefers rateExact over the float, so the quote never depends on a round-trip", async () => {
    // This is the whole reason getQuote exists rather than each caller hand-rolling FxQuote.of: the
    // `fx_rate` column is Decimal(18,8) and the feed's body is text, so an exact string IS available —
    // and a hand-rolled construction would quietly reach for the convenient `rate` number instead.
    const resolved: ResolvedRate = {
      ok: true,
      rate: 1.0873,
      rateExact: "1.08730001",
      rateDate: JUN,
      source: "ECB via Frankfurter",
    };
    const r = await getQuote("USD", "EUR", AT, {}, async () => resolved);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.quote.rateString()).toBe("1.08730001");
    expect(r.quote.base).toBe("USD");
    expect(r.quote.foreign).toBe("EUR");
  });

  it("falls back to the float when a stub supplies no exact string", async () => {
    // The injected stubs in verify-ingest / verify-fx-e2e only set `rate`. Falling back is exactly as
    // precise as the stub's own input, which is the most that can be claimed.
    const r = await getQuote("USD", "EUR", AT, {}, async () => ({
      ok: true,
      rate: 1.085,
      rateDate: JUN,
      source: "stub",
    }));
    expect(r.ok && r.quote.rateString()).toBe("1.085");
  });

  it("passes a miss through as { ok: false } — never a fabricated 1.0 (D14)", async () => {
    const r = await getQuote("USD", "EUR", AT, {}, async () => ({ ok: false, reason: "HTTP 404" }));
    expect(r).toEqual({ ok: false, reason: "HTTP 404" });
  });

  it("THROWS on an unsupported currency rather than returning a miss", async () => {
    // Deliberately not an { ok: false }: a miss means "the feed had no rate", which invites a retry or a
    // manual override. An unvalidated currency code is a caller bug, and papering over it is how a
    // foreign amount gets booked 1:1.
    await expect(
      getQuote("USD", "CHF", AT, {}, async () => ({ ok: true, rate: 1.1, rateDate: JUN, source: "stub" })),
    ).rejects.toThrow(/not a supported currency/);
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
