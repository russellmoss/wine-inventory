import { describe, it, expect } from "vitest";
import { Amount, Rate, AMOUNT_SCALE, RATE_SCALE } from "@/lib/money/amount";

/**
 * The money value types. Every case here is either a defect the old float helpers actually exhibited
 * (measured, not imagined) or a property the two-type split exists to guarantee.
 */

const USD = "USD" as const;
const EUR = "EUR" as const;

/** The float helpers being replaced, reproduced verbatim so the tests compare against real behaviour. */
const round2 = (n: number) => Math.round(n * 100) / 100;

describe("the float defects this replaces", () => {
  it("fixes round2(1.005) returning 1 instead of 1.01", () => {
    expect(round2(1.005)).toBe(1); // the bug, as it exists today
    expect(Amount.of("1.005", USD).toString()).toBe("1.01");
  });

  it("fixes accumulation drift — 0.07 summed 1000 times", () => {
    let f = 0;
    for (let i = 0; i < 1000; i++) f += 0.07;
    expect(f).not.toBe(70); // 69.99999999999966
    const exact = Amount.sum(Array.from({ length: 1000 }, () => Amount.of("0.07", USD)), USD);
    expect(exact.toString()).toBe("70.00");
  });

  it("has no MAX_SAFE_INTEGER cliff at 8dp", () => {
    // round8 scales by 1e8; above ~90,071,992 that product passes MAX_SAFE_INTEGER and goes inexact.
    const big = "100000000.12345678";
    expect(Number(big) * 1e8).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
    expect(Rate.of(big, USD).toString()).toBe("100000000.12345678");
  });

  it("rounds negatives AWAY from zero, unlike Math.round (this is the reversal path)", () => {
    expect(Math.round(-0.5)).toBe(-0); // toward +infinity
    expect(Amount.of("-0.005", USD).toString()).toBe("-0.01");
    expect(Amount.of("-1.005", USD).toString()).toBe("-1.01");
  });
});

describe("Amount", () => {
  it("is always at cent scale", () => {
    expect(Amount.of("1.239", USD).toString()).toBe("1.24");
    expect(Amount.of(5, USD).toString()).toBe("5.00");
    expect(AMOUNT_SCALE).toBe(2);
  });

  it("adds and subtracts exactly", () => {
    expect(Amount.of("0.1", USD).add(Amount.of("0.2", USD)).toString()).toBe("0.30");
    expect(Amount.of("10", USD).subtract(Amount.of("0.01", USD)).toString()).toBe("9.99");
  });

  it("REFUSES to mix currencies — that is a bug, not a conversion", () => {
    expect(() => Amount.of("1", USD).add(Amount.of("1", EUR))).toThrow(/currency mismatch/);
    expect(() => Amount.of("1", USD).compare(Amount.of("1", EUR))).toThrow(/currency mismatch/);
  });

  it("supports half-even when a caller explicitly wants banker's rounding", () => {
    expect(Amount.of("1.005", USD, "half-up").toString()).toBe("1.01");
    expect(Amount.of("1.015", USD, "half-even").toString()).toBe("1.02");
    expect(Amount.of("1.025", USD, "half-even").toString()).toBe("1.02"); // to even
  });

  describe("fromStored", () => {
    it("reads a cent-scale value", () => {
      expect(Amount.fromStored("12.34", "USD").toString()).toBe("12.34");
    });

    it("REFUSES sub-cent precision rather than silently rounding it", () => {
      // A stored amount with 8dp means something wrote an unsettled Rate result into a money column.
      // Rounding here would hide exactly the bug the two-type split exists to surface.
      expect(() => Amount.fromStored("12.3456789", "USD")).toThrow(/cent scale/);
    });
  });
});

describe("Amount.allocate — splitting must not lose or invent cents", () => {
  it("splits 10.00 three ways as 3.34 / 3.33 / 3.33", () => {
    const parts = Amount.of("10.00", USD).allocate(3);
    expect(parts.map((p) => p.toString())).toEqual(["3.34", "3.33", "3.33"]);
  });

  it("always sums back to the original, across many shapes", () => {
    for (const total of ["10.00", "0.01", "0.02", "100.00", "33.33", "1234.57"]) {
      for (const n of [1, 2, 3, 7, 11]) {
        const parts = Amount.of(total, USD).allocate(n);
        expect(parts).toHaveLength(n);
        expect(Amount.sum(parts, USD).toString()).toBe(Amount.of(total, USD).toString());
      }
    }
  });

  it("handles a negative total (a credit or reversal) without losing a cent", () => {
    const parts = Amount.of("-10.00", USD).allocate(3);
    expect(parts.map((p) => p.toString())).toEqual(["-3.34", "-3.33", "-3.33"]);
    expect(Amount.sum(parts, USD).toString()).toBe("-10.00");
  });

  it("rejects a non-positive split", () => {
    expect(() => Amount.of("1", USD).allocate(0)).toThrow();
    expect(() => Amount.of("1", USD).allocate(-1)).toThrow();
  });
});

describe("Amount.allocateByWeights — apportioning a cost across lots", () => {
  it("apportions by weight and still sums exactly", () => {
    const parts = Amount.of("100.00", USD).allocateByWeights([1, 1, 1]);
    expect(Amount.sum(parts, USD).toString()).toBe("100.00");
    expect(parts.map((p) => p.toString())).toEqual(["33.34", "33.33", "33.33"]);
  });

  it("respects uneven weights", () => {
    const parts = Amount.of("100.00", USD).allocateByWeights([50, 30, 20]);
    expect(parts.map((p) => p.toString())).toEqual(["50.00", "30.00", "20.00"]);
  });

  it("sums exactly for awkward weights", () => {
    const parts = Amount.of("1000.00", USD).allocateByWeights(["333.33", "333.33", "333.34"]);
    expect(Amount.sum(parts, USD).toString()).toBe("1000.00");
  });

  it("REFUSES zero total weight instead of inventing an even split", () => {
    // No basis to allocate on. Splitting evenly would land cost on the wrong lot silently.
    expect(() => Amount.of("100.00", USD).allocateByWeights([0, 0])).toThrow(/no basis/);
  });

  it("rejects a negative weight", () => {
    expect(() => Amount.of("100.00", USD).allocateByWeights([1, -1])).toThrow(/negative weight/);
  });
});

describe("Rate — per-unit cost at 8dp", () => {
  it("holds 8 decimal places", () => {
    expect(Rate.of("0.12345678", USD).toString()).toBe("0.12345678");
    expect(RATE_SCALE).toBe(8);
  });

  it("times() yields an UNROUNDED value that must be settled explicitly", () => {
    const r = Rate.of("0.33333333", USD);
    const un = r.times(3);
    expect(un.toDecimal().toString()).toBe("0.99999999");
    expect(un.toAmount().toString()).toBe("1.00");
  });

  it("settles ONCE at the end rather than at each step (this is the double-rounding case)", () => {
    const r = Rate.of("0.005", USD);
    // Settling each of 3 units first: 0.01 x 3 = 0.03. Settling the product once: 0.015 -> 0.02.
    const perUnitFirst = Amount.sum([r.times(1).toAmount(), r.times(1).toAmount(), r.times(1).toAmount()], USD);
    const settledOnce = r.times(3).toAmount();
    expect(perUnitFirst.toString()).toBe("0.03");
    expect(settledOnce.toString()).toBe("0.02");
    expect(perUnitFirst.equals(settledOnce)).toBe(false);
  });

  it("derives from a total over a quantity", () => {
    expect(Rate.from(Amount.of("100.00", USD), 3).toString()).toBe("33.33333333");
  });

  it("REFUSES a zero quantity — an unknown unit cost stays unknown, never Infinity", () => {
    expect(() => Rate.from(Amount.of("100.00", USD), 0)).toThrow(/unknown/);
  });

  it("keeps currency with the rate", () => {
    expect(() => Rate.of("1", USD).times(2).plus(Rate.of("1", EUR).times(2))).toThrow(/currency mismatch/);
  });
});
