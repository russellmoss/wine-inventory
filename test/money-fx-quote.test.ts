import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { FxQuote } from "@/lib/money/fx/quote";
import { Amount, Rate } from "@/lib/money/amount";

/**
 * `FxQuote` — a conversion as a currency-tagged value.
 *
 * Two things are being proven here, and they are different in kind:
 *   - the ARITHMETIC is exact (the 1-in-3,100 cent error is gone);
 *   - the conversion REFUSES a currency it wasn't quoted for, which the old bare-number form could not
 *     possibly do. That second one is the reason the type exists — a double conversion or a wrong-pair
 *     rate produces a plausible number, so nothing downstream ever notices.
 */

const D = Prisma.Decimal;
const JUN = new Date("2026-06-12T00:00:00.000Z");
const eurUsd = (rate: string | number = "1.085") =>
  FxQuote.of({ base: "USD", foreign: "EUR", rate, rateDate: JUN, source: "ECB via Frankfurter" });

describe("construction fails loud rather than fabricating", () => {
  it("rejects a non-positive or non-finite rate", () => {
    for (const bad of [0, -1, "0", "-0.5", NaN, Infinity]) {
      expect(() => eurUsd(bad as number)).toThrow(/finite and positive/);
    }
  });

  it("rejects an unsupported currency instead of defaulting it to USD", () => {
    // coerceCurrency would silently map "CHF" to USD and book the amount 1:1 at a fabricated rate — the
    // exact hazard ingest-invoice-core gates against by hand. FxQuote parses strictly so that gate is
    // structural rather than remembered.
    expect(() => FxQuote.of({ base: "USD", foreign: "CHF", rate: 1.1, rateDate: JUN, source: "x" })).toThrow(
      /not a supported currency/,
    );
    expect(() => FxQuote.of({ base: "", foreign: "EUR", rate: 1.1, rateDate: JUN, source: "x" })).toThrow(
      /not a supported currency/,
    );
  });

  it("rejects a same-currency quote whose rate is not exactly 1", () => {
    // A feed round-trip really does return things like 0.99999998 for X→X. Applying it would shave value
    // off a domestic amount for no reason.
    expect(() =>
      FxQuote.of({ base: "USD", foreign: "USD", rate: "0.99999998", rateDate: JUN, source: "feed" }),
    ).toThrow(/same currency/);
    expect(() => FxQuote.of({ base: "USD", foreign: "USD", rate: 1, rateDate: JUN, source: "feed" })).not.toThrow();
  });

  it("requires a source (rate provenance) and a valid date", () => {
    expect(() => FxQuote.of({ base: "USD", foreign: "EUR", rate: 1.1, rateDate: JUN, source: "  " })).toThrow(
      /source is required/,
    );
    expect(() =>
      FxQuote.of({ base: "USD", foreign: "EUR", rate: 1.1, rateDate: new Date("nope"), source: "x" }),
    ).toThrow(/invalid rateDate/);
  });
});

describe("the arithmetic is exact — the measured cent errors are gone", () => {
  // Every one of these was wrong under `round2(amount * rate)`: the exact product sits on a half, the
  // binary product sits just under it, Math.round takes it down.
  it.each([
    ["11", "1.085", "11.94"],
    ["15", "1.085", "16.28"],
    ["37", "1.085", "40.15"],
    ["65", "1.085", "70.53"],
    ["950", "0.6231", "591.95"],
    ["1850", "0.6231", "1152.74"],
  ])("EUR %s at %s converts to USD %s", (amount, rate, expected) => {
    const usd = FxQuote.of({ base: "USD", foreign: "EUR", rate, rateDate: JUN, source: "t" }).convert(
      Amount.of(amount, "EUR"),
    );
    expect(usd.toString()).toBe(expected);
    expect(usd.currency).toBe("USD");
  });

  it("settles ONCE — no rounding of an intermediate", () => {
    // 3 × 0.4166666666 = 1.2499999998, which must settle to 1.25, not to 3 × 0.42 = 1.26.
    const q = FxQuote.of({ base: "USD", foreign: "EUR", rate: "0.4166666666", rateDate: JUN, source: "t" });
    expect(q.convert(Amount.of("3", "EUR")).toString()).toBe("1.25");
  });

  it("rounds a NEGATIVE amount away from zero — the reversal/credit path", () => {
    // Math.round(-0.5) is -0; HALF_UP here is -1. Credits and reversals are negative, so this is the
    // correction path rather than a corner case.
    const q = FxQuote.of({ base: "USD", foreign: "EUR", rate: "1", rateDate: JUN, source: "t" });
    expect(q.convert(Amount.of("-0.005", "EUR")).toString()).toBe("-0.01");
    expect(eurUsd().convert(Amount.of("-11", "EUR")).toString()).toBe("-11.94");
  });

  it("half-even is available per call when a site wants banker's rounding", () => {
    // Note the half has to come from the PRODUCT: an Amount is already at cent scale, so `Amount.of
    // ("11.925")` has settled to 11.93 before the quote ever sees it. 0.05 × 0.5 = 0.025 is a real half.
    const q = FxQuote.of({ base: "USD", foreign: "EUR", rate: "0.5", rateDate: JUN, source: "t" });
    const five = Amount.of("0.05", "EUR");
    expect(q.convert(five, "half-up").toString()).toBe("0.03");
    expect(q.convert(five, "half-even").toString()).toBe("0.02"); // 2 is even
    expect(q.convert(five, "down").toString()).toBe("0.02");
    const quarter = Amount.of("0.25", "EUR"); // 0.125
    expect(q.convert(quarter, "half-up").toString()).toBe("0.13");
    expect(q.convert(quarter, "half-even").toString()).toBe("0.12");
  });
});

describe("a conversion refuses a currency it was not quoted for", () => {
  it("names the double-conversion case specifically", () => {
    // The dangerous one: the value is ALREADY in base. A bare number × rate would happily apply the rate
    // a second time and return something plausible.
    expect(() => eurUsd().convert(Amount.of("100", "USD"))).toThrow(/already in USD/);
    expect(() => eurUsd().convert(Amount.of("100", "USD"))).toThrow(/rate twice/);
  });

  it("refuses an unrelated third currency", () => {
    expect(() => eurUsd().convert(Amount.of("100", "NZD"))).toThrow(/cannot convert NZD/);
  });

  it("applies to every conversion method, not just convert()", () => {
    expect(() => eurUsd().convertRate(Rate.of("1", "USD"))).toThrow(/already in USD/);
    expect(() => eurUsd().convertUnsettled(Amount.of("1", "NZD"))).toThrow(/cannot convert NZD/);
  });
});

describe("the identity quote makes the domestic path unconditional", () => {
  const id = FxQuote.identity("USD", JUN);

  it("is a pass-through, not a multiply by 1.0", () => {
    expect(id.isIdentity).toBe(true);
    const a = Amount.of("11.99", "USD");
    expect(id.convert(a)).toBe(a); // same object — nothing to round, so nothing can drift
    expect(id.rate.equals(1)).toBe(true);
  });

  it("still refuses a foreign amount", () => {
    // The point of using identity for a domestic invoice is that the call site drops its `isForeign`
    // branch. That is only safe if identity is not a wildcard.
    expect(() => id.convert(Amount.of("1", "EUR"))).toThrow(/cannot convert EUR/);
  });

  it("inverts to itself", () => {
    expect(id.inverse()).toBe(id);
  });
});

describe("convertRate — the per-unit grain", () => {
  it("converts at 8dp, matching the Decimal(18,8) unitCost column", () => {
    const r = eurUsd().convertRate(Rate.of("0.128", "EUR"));
    expect(r.toString()).toBe("0.13888000");
    expect(r.currency).toBe("USD");
  });

  it("keeps 8 significant decimals rather than settling to cents", () => {
    const r = FxQuote.of({ base: "USD", foreign: "EUR", rate: "1.0873", rateDate: JUN, source: "t" }).convertRate(
      Rate.of("0.00030779", "EUR"),
    );
    // 0.00030779 × 1.0873 = 0.000334657... → 0.00033466 at 8dp. Settling this to cents would be 0.00.
    expect(r.toString()).toBe("0.00033466");
  });
});

describe("convertUnsettled — Σ round(line) is not round(Σ line), and that is accounting, not a bug", () => {
  it("keeps full precision for a single final settle", () => {
    const q = FxQuote.of({ base: "USD", foreign: "EUR", rate: "0.6231", rateDate: JUN, source: "t" });
    const lines = ["10.11", "10.11", "10.11"].map((v) => Amount.of(v, "EUR"));

    const perLine = lines
      .map((l) => q.convert(l))
      .reduce((a, b) => a.add(b), Amount.zero("USD"))
      .toString();
    const asTotal = lines
      .map((l) => q.convertUnsettled(l))
      .reduce((a, b) => a.plus(b))
      .toAmount()
      .toString();

    // 10.11 × 0.6231 = 6.2996... Per line: 6.30 × 3 = 18.90. As one total: 18.899... → 18.90 here — they
    // agree on this input, which is exactly why the divergence below has to be pinned separately.
    expect(perLine).toBe("18.90");
    expect(asTotal).toBe("18.90");
  });

  it("genuinely diverges on a half, and the divergence is a POSTING decision", () => {
    // 0.10 × 0.05 = 0.005 per line. Rounded per line: 0.01 three times = 0.03. Rounded once as a total:
    // 0.015 = 0.02. A cent of difference, and neither number is a bug — the A/P path converts PER LINE
    // because each base line amount posts individually and must tie to its own foreign line.
    const q = FxQuote.of({ base: "USD", foreign: "EUR", rate: "0.05", rateDate: JUN, source: "t" });
    const lines = ["0.10", "0.10", "0.10"].map((v) => Amount.of(v, "EUR"));

    expect(lines.map((l) => q.convert(l)).reduce((a, b) => a.add(b), Amount.zero("USD")).toString()).toBe("0.03");
    expect(
      lines
        .map((l) => q.convertUnsettled(l))
        .reduce((a, b) => a.plus(b))
        .toAmount()
        .toString(),
    ).toBe("0.02");
  });
});

describe("inverse is for display, and the measurements say why", () => {
  it("flips both sides", () => {
    const inv = eurUsd().inverse();
    expect(inv.base).toBe("EUR");
    expect(inv.foreign).toBe("USD");
    expect(inv.source).toBe("ECB via Frankfurter (inverted)");
  });

  it("round-trips at SOME rates and not others — so it can never be relied on", () => {
    // Measured over 20,000 cent-scale amounts per rate. This is the honest shape of it: at 1.085 the
    // round trip happens to be exact every time, and at 0.6231 — an ordinary USD-per-NZD rate — it is
    // wrong 7,538 times out of 20,000. "It worked when I tried it" is therefore worthless evidence here.
    const trip = (rate: string, cents: string) => {
      const q = FxQuote.of({ base: "USD", foreign: "EUR", rate, rateDate: JUN, source: "t" });
      const eur = Amount.of(cents, "EUR");
      return q.inverse().convert(q.convert(eur)).toString();
    };
    expect(trip("1.085", "11.00")).toBe("11.00"); // exact here…
    expect(trip("0.6231", "0.01")).toBe("0.02"); // …and a cent CREATED out of nothing here
  });

  it("destroys the value entirely at a small rate", () => {
    // At 0.00654 (a plausible JPY→USD), a 0.01 foreign amount converts to 0.00 base and the original is
    // simply gone. Nothing can recover it — which is why the ingest path STORES foreignUnitCost rather
    // than deriving the foreign figure back from base.
    const q = FxQuote.of({ base: "USD", foreign: "EUR", rate: "0.00654", rateDate: JUN, source: "t" });
    const there = q.convert(Amount.of("0.01", "EUR"));
    expect(there.toString()).toBe("0.00");
    expect(q.inverse().convert(there).toString()).toBe("0.00");
    expect(new D(there.toString()).isZero()).toBe(true);
  });
});

describe("persistence shape", () => {
  it("hands back the rate as an exact string, so no float round-trips through the DB", () => {
    expect(eurUsd("1.08730000").rateString()).toBe("1.0873");
    expect(FxQuote.of({ base: "USD", foreign: "EUR", rate: 1.0873, rateDate: JUN, source: "t" }).rateString()).toBe(
      "1.0873",
    );
  });

  it("prints readably for an audit line", () => {
    expect(eurUsd().toString()).toBe("EUR->USD @ 1.085 (2026-06-12, ECB via Frankfurter)");
  });
});
