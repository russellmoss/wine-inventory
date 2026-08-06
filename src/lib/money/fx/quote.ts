// Workstream B, FX stage — a currency conversion as a VALUE, not a bare multiply. Pure: no prisma, no
// network, no React. Sits on `Amount`/`Rate` from `@/lib/money/amount`.
//
// WHY THIS EXISTS — TWO DEFECTS, ONE MEASURED AND ONE STRUCTURAL.
//
// 1. THE FLOAT DEFECT, MEASURED. `convertToBase` was `round2(amountForeign * rate)`. Swept over
//    1,400,000 realistic pairs (cent-scale amounts 0.01–2000.00 × seven real ECB rates), the float path
//    disagrees with exact decimal on **447 of them — 0.032%, about 1 in 3,100**, always by exactly one
//    cent and always in the wrong direction:
//
//        11    × 1.085  -> float 11.93   exact 11.94   (11 × 1.085 is 11.935 on the nose)
//        15    × 1.085  -> float 16.27   exact 16.28
//        950   × 0.6231 -> float 591.94  exact 591.95
//
//    The product is computed in binary, lands a hair below the half, and `Math.round` then rounds DOWN a
//    value that was exactly on the half. This is the "cents" grain — the one that has to tie out to
//    QuickBooks, since Σ(base line amounts) is reconciled against QBO's derived home GL debit. One line
//    in 3,100 off by a cent is an A/P reconciliation that silently fails to balance.
//
//    ⚠️ STATED HONESTLY: the "unit" grain (round8, per-stock-unit cost) showed **0 of 1,400,000**
//    disagreements over the same sweep. The MAX_SAFE_INTEGER hazard in `Math.round(n * 1e8)` is real but
//    needs n above ~90,000,000 to bite, and a per-unit cost of ninety million dollars is not a thing.
//    round8 is converted here for uniformity and because accumulation compounds elsewhere — NOT because
//    a defect was observed in it. Do not cite it as one.
//
// 2. THE STRUCTURAL DEFECT. `convertToBase(amount: number, rate: number, grain)` cannot tell what
//    currency the number is in. Nothing stopped converting an already-base amount a second time, or
//    applying a NZD→USD rate to a EUR figure. As the accounting/cost modules grow, that is the failure
//    that will not announce itself: the result is a plausible number. So the unit of conversion here is a
//    QUOTE that knows both sides, and `convert` refuses an Amount whose currency isn't the foreign side.
//
// SCOPE. This is the conversion primitive. The ingest/AP path still stores plain numbers in its Decimal
// columns; migrating that storage is the next stage. Exactness is nonetheless recoverable at the
// boundary, because `new Decimal(String(11.0))` is exactly 11 — the float carries the decimal a human
// typed, and only the ARITHMETIC was lossy.

import { Prisma } from "@prisma/client";
import { type CurrencyCode, requireCurrency } from "@/lib/money/currency";
import { Amount, Rate, Unrounded, type DecimalLike, type Rounding } from "@/lib/money/amount";

const D = Prisma.Decimal;
type Dec = Prisma.Decimal;

const toDec = (v: DecimalLike): Dec => (v instanceof D ? v : new D(typeof v === "number" ? String(v) : v));

export type FxQuoteInput = {
  /** The currency you end up in — the tenant's base/home currency. */
  base: unknown;
  /** The currency you start in — the invoice's currency. */
  foreign: unknown;
  /** BASE per 1 FOREIGN (the QBO `ExchangeRate` convention). Never inverted anywhere. */
  rate: DecimalLike;
  /** The quote date the rate actually came from (may be a prior business day for a weekend). */
  rateDate: Date;
  /** Provenance: "frankfurter", "manual override", a verify stub… Never blank. */
  source: string;
};

/**
 * A dated, sourced, currency-tagged exchange rate, and the only way to convert money in this codebase.
 * Immutable.
 */
export class FxQuote {
  private constructor(
    readonly base: CurrencyCode,
    readonly foreign: CurrencyCode,
    /** BASE per 1 FOREIGN, exact. */
    readonly rate: Dec,
    readonly rateDate: Date,
    readonly source: string,
  ) {}

  static of(input: FxQuoteInput): FxQuote {
    // Strict currency parse, not coerceCurrency: defaulting an unrecognized code to USD here would book a
    // foreign amount 1:1 at a fabricated rate — the D14 violation this whole path exists to prevent.
    const base = requireCurrency(input.base, "FxQuote.base");
    const foreign = requireCurrency(input.foreign, "FxQuote.foreign");

    const rate = toDec(input.rate);
    if (!rate.isFinite() || rate.lessThanOrEqualTo(0)) {
      // The rate service never hands back a fabricated or zero rate — it returns { ok: false } and the
      // caller fails loud. So a bad rate arriving here is a programming error, not a data condition.
      throw new Error(`FxQuote.of: rate must be finite and positive, got ${rate.toString()}`);
    }
    // A same-currency quote at anything other than exactly 1 is incoherent, and it is a shape that really
    // occurs: a feed round-trip can return 0.99999998 for USD→USD. Refuse it rather than apply it.
    if (base === foreign && !rate.equals(1)) {
      throw new Error(
        `FxQuote.of: ${base}->${foreign} is the same currency but the rate is ${rate.toString()}, not 1. ` +
          "Use FxQuote.identity() for a domestic amount.",
      );
    }
    if (!Number.isFinite(input.rateDate.getTime())) throw new Error("FxQuote.of: invalid rateDate");
    if (input.source.trim() === "") throw new Error("FxQuote.of: source is required (rate provenance)");

    return new FxQuote(base, foreign, rate, input.rateDate, input.source.trim());
  }

  /** The no-op quote for a domestic amount: rate exactly 1, both sides the same currency. */
  static identity(currency: unknown, rateDate: Date, source = "same-currency"): FxQuote {
    const c = requireCurrency(currency, "FxQuote.identity");
    return FxQuote.of({ base: c, foreign: c, rate: 1, rateDate, source });
  }

  /** True when this quote converts a currency to itself — conversion is then a pass-through. */
  get isIdentity(): boolean {
    return this.base === this.foreign;
  }

  /** The failure mode worth a specific message: converting something that is ALREADY in base. */
  private assertConvertible(currency: CurrencyCode, op: string): void {
    if (currency === this.foreign) return;
    if (currency === this.base) {
      throw new Error(
        `FxQuote.${op}: this value is already in ${this.base} (the base side of a ${this.foreign}->` +
          `${this.base} quote). Converting it again would apply the rate twice.`,
      );
    }
    throw new Error(
      `FxQuote.${op}: cannot convert ${currency} with a ${this.foreign}->${this.base} quote. ` +
        "Resolve a quote for the right pair.",
    );
  }

  /**
   * Convert a foreign `Amount` to base, settled ONCE at cent scale. Exact decimal multiply — this is the
   * method that fixes the 447-in-1.4-million cent errors.
   *
   * Rounding defaults to half-up to match the `Math.round` behaviour it replaces (see amount.ts on why
   * that is a compatibility choice, not a principled one). ⚠️ Negatives round AWAY from zero here, unlike
   * `Math.round`, and reversals/credits are negative — that is the correction path, not a corner case.
   */
  convert(amount: Amount, rounding: Rounding = "half-up"): Amount {
    this.assertConvertible(amount.currency, "convert");
    if (this.isIdentity) return amount;
    return Amount.of(amount.toDecimal().times(this.rate), this.base, rounding);
  }

  /**
   * Convert without settling — for summing several converted lines and rounding the total ONCE.
   *
   * ⚠️ This is a genuinely different answer from summing `convert()`ed lines, and neither is "the float
   * bug": Σ round(line) ≠ round(Σ line) in exact decimal too. Which one is correct is an ACCOUNTING
   * decision. The A/P path deliberately converts per line, because each base line amount is posted
   * individually and must tie to its own foreign line. Use this only where a single total is what posts.
   */
  convertUnsettled(amount: Amount): Unrounded {
    this.assertConvertible(amount.currency, "convertUnsettled");
    return new Unrounded(amount.toDecimal().times(this.rate), this.base);
  }

  /** Convert a foreign per-unit `Rate` to base at 8dp (the `Decimal(18,8)` unitCost grain). */
  convertRate(rate: Rate, rounding: Rounding = "half-up"): Rate {
    this.assertConvertible(rate.currency, "convertRate");
    if (this.isIdentity) return rate;
    return Rate.of(rate.toDecimal().times(this.rate), this.base, rounding);
  }

  /**
   * The reverse quote (base per 1 foreign → foreign per 1 base).
   *
   * ⚠️ NOT a round-trip guarantee, and the measurements are worse than "approximately equal". Over 20,000
   * cent-scale amounts per rate:
   *
   *     rate 1.085   ->  0 of 20,000 round trips wrong      (exact, every time)
   *     rate 0.6231  ->  7,538 of 20,000 wrong              (an ordinary USD-per-NZD rate)
   *     rate 0.00654 ->  19,870 of 20,000 wrong             (small amounts convert to 0.00 and are GONE)
   *
   * So it round-trips perfectly at some rates and creates or destroys cents at others, which means "it
   * worked when I tried it" proves nothing. Use this to DISPLAY the other direction, never to recover an
   * original amount. To keep an original, keep the original — which is why the ingest path stores
   * `foreignUnitCost` alongside the base figure instead of deriving it back.
   */
  inverse(): FxQuote {
    if (this.isIdentity) return this;
    return new FxQuote(
      this.foreign,
      this.base,
      new D(1).dividedBy(this.rate).toDecimalPlaces(12, D.ROUND_HALF_UP),
      this.rateDate,
      `${this.source} (inverted)`,
    );
  }

  /** The stored/audit shape: the rate as a string, so no float ever round-trips through persistence. */
  rateString(): string {
    return this.rate.toString();
  }

  toString(): string {
    return `${this.foreign}->${this.base} @ ${this.rate.toString()} (${this.rateDate.toISOString().slice(0, 10)}, ${this.source})`;
  }
}
