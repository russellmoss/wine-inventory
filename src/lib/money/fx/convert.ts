// Plan 073 / workstream B — FX conversion at the NUMBER boundary. Pure: no DB, no network, no React.
//
// The rate is BASE per 1 FOREIGN (== quote per 1 base when the feed is fetched base=foreign, quote=home)
// so conversion is a single multiply with no inversion anywhere (council #5). Two rounding grains:
//   - "cents" (2dp): the money-level base amount — used for A/P reconciliation and landed-cost cents, so
//     Σ(base line amounts) matches QBO's derived home GL debit (foreign × ExchangeRate).
//   - "unit" (8dp): the per-stock-unit `SupplyLot.unitCost Decimal(18,8)`.
//
// ⚠️ THIS IS THE LEGACY, CURRENCY-BLIND FORM. Prefer `FxQuote` (./quote.ts). A bare `number` cannot say
// what currency it is in, so nothing here can catch converting an already-base amount a second time or
// applying a NZD→USD rate to a EUR figure — and the result of either is a plausible number that never
// announces itself. MONEY-1 (`npm run verify:money-fx`) keeps this out of `src/` outside the money module.
//
// The arithmetic below IS now exact. It used to be `round2(amountForeign * rate)` in floating point, which
// over a sweep of 1,400,000 realistic amount×rate pairs disagreed with exact decimal on 447 of them
// (0.032%) — always by one cent, always downward, because the binary product lands a hair below a half
// that `Math.round` should have rounded up. `11 × 1.085` is 11.935 exactly and came out 11.93.
//
// It also no longer borrows `round2` from `@/lib/bottling/draw`, which is the VOLUME rounding helper. That
// import was the tell: money and litres were sharing a rounding function.

import { Prisma } from "@prisma/client";

const D = Prisma.Decimal;

/** Round to 8 dp — the per-stock-unit money grain. Exact: no `Math.round(n * 1e8)`. */
export function round8(n: number): number {
  return new D(String(n)).toDecimalPlaces(8, D.ROUND_HALF_UP).toNumber();
}

export type RoundGrain = "cents" | "unit";

const SCALE: Record<RoundGrain, number> = { cents: 2, unit: 8 };

/**
 * Convert a FOREIGN amount to the BASE currency at `rate` (base per 1 foreign). `grain` picks the
 * rounding: "cents" for money totals, "unit" for per-stock-unit cost. Throws on a non-finite or
 * non-positive rate — the rate service NEVER hands back a fabricated or zero rate (D14), so a bad rate
 * here is a programming error, not a data condition to paper over.
 *
 * `String(n)` before the Decimal is load-bearing: it takes the decimal the float PRINTS as (the number a
 * human typed), which is why exactness is recoverable even though the inputs are still `number`.
 */
export function convertToBase(amountForeign: number, rate: number, grain: RoundGrain): number {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error(`convertToBase: invalid rate ${rate}`);
  if (!Number.isFinite(amountForeign)) throw new Error(`convertToBase: invalid amount ${amountForeign}`);
  return new D(String(amountForeign))
    .times(new D(String(rate)))
    .toDecimalPlaces(SCALE[grain], D.ROUND_HALF_UP)
    .toNumber();
}
