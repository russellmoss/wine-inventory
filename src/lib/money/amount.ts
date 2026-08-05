// Plan B (data layer) — THE money value types. Pure: no prisma, no React, no I/O, no network.
//
// WHY THIS EXISTS. Money was being computed in JavaScript `number`, and it is measurably wrong:
//
//   round2(1.005)            -> 1        (correct: 1.01 — the float sits just below the half)
//   Math.round(n * 1e8)      -> silently inexact above ~90,071,992, since n*1e8 passes MAX_SAFE_INTEGER
//   sum of 0.07 a thousand times -> 69.99999999999966, not 70
//
// The third one is the dangerous shape here: a reconciliation or cost roll-up that should tie out to the
// cent instead misses by 3.4e-13, which fails an equality check while looking correct to a human.
//
// TWO TYPES, ON PURPOSE. The bug this partition prevents is posting an unrounded per-unit figure as if it
// were a settled amount:
//   `Amount` — a POSTABLE sum of money. Currency-tagged, fixed 2dp. What goes on an invoice, a journal
//              line, a bill. If you can send it to QuickBooks, it is an Amount.
//   `Rate`   — a PER-UNIT cost. Currency-tagged, 8dp (mirrors `SupplyLot.unitCost Decimal(18,8)`).
//              Multiplying it by a quantity does NOT give you an Amount — it gives an `Unrounded`, which
//              you must explicitly settle with `.toAmount()`. There is deliberately no implicit path
//              from a rate to a postable figure, because that implicit step is where double-rounding and
//              off-by-a-cent drift come from.
//
// ROUNDING IS HALF_UP BY DEFAULT, and that is a compatibility choice rather than a principled one:
// the code being replaced used `Math.round`, which is half-up for positives. Banker's rounding
// (HALF_EVEN) is the better default for statistical neutrality and is available — but switching it
// silently would change existing numbers, so it must be an explicit decision per call site.
//
// ⚠️ NEGATIVES DIFFER FROM `Math.round`. `Math.round(-0.5)` is `-0` (it rounds toward +∞), while
// HALF_UP here rounds away from zero to `-1`. Reversals, credits and refunds are negative, so this is
// not a corner case — it is the correction path. Pinned in test/money-amount.test.ts.
import { Prisma } from "@prisma/client";
import { type CurrencyCode, coerceCurrency } from "./currency";

const D = Prisma.Decimal;
type Dec = Prisma.Decimal;

/** Scale of a postable amount. Two decimal places — cents. */
export const AMOUNT_SCALE = 2;
/** Scale of a per-unit rate. Eight — matches `Decimal(18,8)` on SupplyLot.unitCost and friends. */
export const RATE_SCALE = 8;

/** How to settle a value that falls exactly on a half. */
export type Rounding = "half-up" | "half-even" | "down";

// Not annotated `number`: decimal.js types the rounding mode as its own literal union, so widening
// here makes every toDecimalPlaces() call fail. Inference from the constants gives the right type.
const MODE = {
  "half-up": D.ROUND_HALF_UP,
  "half-even": D.ROUND_HALF_EVEN,
  down: D.ROUND_DOWN,
} satisfies Record<Rounding, Prisma.Decimal.Rounding>;

function assertFinite(d: Dec, what: string): void {
  if (!d.isFinite()) throw new Error(`${what}: not a finite decimal (${d.toString()})`);
}

/** Adding NZD to USD is a bug, never a conversion. Convert explicitly through the FX layer first. */
function assertSameCurrency(a: CurrencyCode, b: CurrencyCode, op: string): void {
  if (a !== b) throw new Error(`Money.${op}: currency mismatch ${a} vs ${b} — convert explicitly first`);
}

/** Anything a caller might hand us for a numeric value. `number` is accepted but discouraged. */
export type DecimalLike = Dec | string | number;

const toDec = (v: DecimalLike): Dec => (v instanceof D ? v : new D(typeof v === "number" ? String(v) : v));

/**
 * A POSTABLE sum of money: currency-tagged, always exactly 2dp. Immutable — every operation returns a
 * new Amount. Construction rounds once, so an Amount is never carrying hidden sub-cent precision.
 */
export class Amount {
  private constructor(
    readonly value: Dec,
    readonly currency: CurrencyCode,
  ) {}

  static of(value: DecimalLike, currency: CurrencyCode, rounding: Rounding = "half-up"): Amount {
    const d = toDec(value);
    assertFinite(d, "Amount.of");
    return new Amount(d.toDecimalPlaces(AMOUNT_SCALE, MODE[rounding]), currency);
  }

  /** Read a value straight off a Prisma row. Asserts it is ALREADY at cent scale rather than rounding —
   *  a stored amount with sub-cent precision means something upstream skipped `toAmount`, and quietly
   *  rounding here would hide that. */
  static fromStored(value: DecimalLike, currency: unknown): Amount {
    const d = toDec(value);
    assertFinite(d, "Amount.fromStored");
    if (d.decimalPlaces() > AMOUNT_SCALE) {
      throw new Error(
        `Amount.fromStored: ${d.toString()} has ${d.decimalPlaces()} dp — a stored amount must be at ` +
          `cent scale. Something wrote an unsettled Rate result here.`,
      );
    }
    return new Amount(d.toDecimalPlaces(AMOUNT_SCALE), coerceCurrency(currency));
  }

  static zero(currency: CurrencyCode): Amount {
    return new Amount(new D(0), currency);
  }

  add(other: Amount): Amount {
    assertSameCurrency(this.currency, other.currency, "add");
    return new Amount(this.value.plus(other.value), this.currency);
  }

  subtract(other: Amount): Amount {
    assertSameCurrency(this.currency, other.currency, "subtract");
    return new Amount(this.value.minus(other.value), this.currency);
  }

  negate(): Amount {
    return new Amount(this.value.negated(), this.currency);
  }

  /** Exact sum. Never `reduce((a, b) => a + b, 0)` over numbers — that is the drift case. */
  static sum(amounts: readonly Amount[], currency: CurrencyCode): Amount {
    return amounts.reduce((acc, a) => acc.add(a), Amount.zero(currency));
  }

  isZero(): boolean {
    return this.value.isZero();
  }
  isNegative(): boolean {
    return this.value.isNegative() && !this.value.isZero();
  }
  /** -1, 0 or 1. */
  compare(other: Amount): number {
    assertSameCurrency(this.currency, other.currency, "compare");
    return this.value.comparedTo(other.value);
  }
  equals(other: Amount): boolean {
    return this.currency === other.currency && this.value.equals(other.value);
  }

  /**
   * Split into `n` parts that sum EXACTLY back to this amount. $10.00 across 3 ways is
   * [3.34, 3.33, 3.33], never 3×3.33 = 9.99. The remainder cents are distributed one each from the
   * front, which is the conventional largest-remainder rule.
   *
   * This is the operation cost allocation actually needs — apportioning a bill across lots, or a run
   * cost across bottles — and doing it by dividing and rounding each share independently is precisely
   * how a roll-up stops tying out.
   */
  allocate(n: number): Amount[] {
    if (!Number.isInteger(n) || n <= 0) throw new Error(`Amount.allocate: n must be a positive integer, got ${n}`);
    const unit = new D(1).dividedBy(new D(10).pow(AMOUNT_SCALE)); // one cent
    const totalUnits = this.value.dividedBy(unit).round(); // integer cents, signed
    const base = totalUnits.dividedBy(n).toDecimalPlaces(0, D.ROUND_DOWN);
    let remainder = totalUnits.minus(base.times(n)); // signed; |remainder| < n
    const step = remainder.isNegative() ? new D(-1) : new D(1);
    const out: Amount[] = [];
    for (let i = 0; i < n; i++) {
      let units = base;
      if (!remainder.isZero()) {
        units = units.plus(step);
        remainder = remainder.minus(step);
      }
      out.push(new Amount(units.times(unit), this.currency));
    }
    return out;
  }

  /**
   * Apportion across `weights` (e.g. litres per lot), summing EXACTLY back to this amount. Zero total
   * weight is an error rather than an even split — it means the caller has no basis to allocate on, and
   * silently inventing one is how a cost lands on the wrong lot.
   */
  allocateByWeights(weights: readonly DecimalLike[]): Amount[] {
    if (weights.length === 0) throw new Error("Amount.allocateByWeights: no weights");
    const ws = weights.map(toDec);
    if (ws.some((w) => w.isNegative())) throw new Error("Amount.allocateByWeights: negative weight");
    const total = ws.reduce((a, w) => a.plus(w), new D(0));
    if (total.isZero()) throw new Error("Amount.allocateByWeights: weights sum to zero — no basis to allocate on");

    const unit = new D(1).dividedBy(new D(10).pow(AMOUNT_SCALE));
    const totalUnits = this.value.dividedBy(unit).round();
    const raw = ws.map((w) => totalUnits.times(w).dividedBy(total));
    const floored = raw.map((r) => r.toDecimalPlaces(0, D.ROUND_DOWN));
    let remainder = totalUnits.minus(floored.reduce((a, f) => a.plus(f), new D(0)));
    const step = remainder.isNegative() ? new D(-1) : new D(1);

    // Largest fractional part first — the standard tie-break, and stable for equal weights.
    const order = raw
      .map((r, i) => ({ i, frac: r.minus(floored[i]).abs() }))
      .sort((a, b) => b.frac.comparedTo(a.frac) || a.i - b.i);

    const units = [...floored];
    for (const { i } of order) {
      if (remainder.isZero()) break;
      units[i] = units[i].plus(step);
      remainder = remainder.minus(step);
    }
    return units.map((u) => new Amount(u.times(unit), this.currency));
  }

  /** For persistence. Always exactly 2dp. */
  toDecimal(): Dec {
    return this.value;
  }
  toString(): string {
    return this.value.toFixed(AMOUNT_SCALE);
  }
  /** Plain number — for display and JSON only. NEVER feed this back into money arithmetic. */
  toNumber(): number {
    return this.value.toNumber();
  }
}

/**
 * An intermediate value that is NOT yet postable — the result of rate × quantity. It exists purely so
 * the settle step is visible in the code: you cannot store or add this, you must `.toAmount()` it and
 * choose the rounding. That one forced keystroke is the whole point of the type.
 */
export class Unrounded {
  constructor(
    readonly value: Dec,
    readonly currency: CurrencyCode,
  ) {}

  toAmount(rounding: Rounding = "half-up"): Amount {
    return Amount.of(this.value, this.currency, rounding);
  }
  /** Keep full precision — for chaining before a single final settle. */
  plus(other: Unrounded): Unrounded {
    assertSameCurrency(this.currency, other.currency, "plus");
    return new Unrounded(this.value.plus(other.value), this.currency);
  }
  toDecimal(): Dec {
    return this.value;
  }
}

/**
 * A PER-UNIT cost at 8dp — `$/gram`, `$/litre`, `$/bottle`. Mirrors the `Decimal(18,8)` columns.
 * Deliberately NOT addable to an Amount: a rate is not a sum of money, and the compiler should say so.
 */
export class Rate {
  private constructor(
    readonly value: Dec,
    readonly currency: CurrencyCode,
  ) {}

  static of(value: DecimalLike, currency: CurrencyCode, rounding: Rounding = "half-up"): Rate {
    const d = toDec(value);
    assertFinite(d, "Rate.of");
    return new Rate(d.toDecimalPlaces(RATE_SCALE, MODE[rounding]), currency);
  }

  static fromStored(value: DecimalLike, currency: unknown): Rate {
    const d = toDec(value);
    assertFinite(d, "Rate.fromStored");
    return new Rate(d.toDecimalPlaces(RATE_SCALE), coerceCurrency(currency));
  }

  /** rate × quantity. Returns an UNROUNDED value — settle it explicitly. */
  times(quantity: DecimalLike): Unrounded {
    const q = toDec(quantity);
    assertFinite(q, "Rate.times");
    return new Unrounded(this.value.times(q), this.currency);
  }

  /**
   * Derive a rate from a total over a quantity (e.g. a bill across kilograms). Zero quantity throws
   * rather than yielding Infinity — an unknown unit cost must stay unknown (D14), never a fabricated one.
   */
  static from(total: Amount, quantity: DecimalLike, rounding: Rounding = "half-up"): Rate {
    const q = toDec(quantity);
    if (q.isZero()) throw new Error("Rate.from: zero quantity — an unknown unit cost must stay unknown");
    return Rate.of(total.toDecimal().dividedBy(q), total.currency, rounding);
  }

  toDecimal(): Dec {
    return this.value;
  }
  toString(): string {
    return this.value.toFixed(RATE_SCALE);
  }
}
