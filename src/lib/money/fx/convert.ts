// Plan 073 — PURE FX conversion + rounding. No DB, no network, no React. The rate is BASE per 1 FOREIGN
// (== quote per 1 base when the feed is fetched base=foreign, quote=home) so conversion is a single
// multiply with no inversion anywhere (council #5). Two rounding grains:
//   - "cents" (round2): the money-level base amount — used for A/P reconciliation and landed-cost cents,
//     so Σ(base line amounts) matches QBO's derived home GL debit (foreign × ExchangeRate).
//   - "unit" (round8): the per-stock-unit SupplyLot.unitCost (Decimal(18,8)).

import { round2 } from "@/lib/bottling/draw";

/** Round to 8 dp — the per-stock-unit money grain (mirrors cost/rollup.ts:round8). */
export function round8(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

export type RoundGrain = "cents" | "unit";

/**
 * Convert a FOREIGN amount to the BASE currency at `rate` (base per 1 foreign). `grain` picks the
 * rounding: "cents" for money totals (round2), "unit" for per-stock-unit cost (round8). Throws on a
 * non-finite / non-positive rate — the rate service NEVER hands a fabricated or zero rate (D14), so a
 * bad rate here is a programming error, not a data condition to paper over.
 */
export function convertToBase(amountForeign: number, rate: number, grain: RoundGrain): number {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error(`convertToBase: invalid rate ${rate}`);
  if (!Number.isFinite(amountForeign)) throw new Error(`convertToBase: invalid amount ${amountForeign}`);
  const raw = amountForeign * rate;
  return grain === "cents" ? round2(raw) : round8(raw);
}
