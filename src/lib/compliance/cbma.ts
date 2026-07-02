// plan-026 Unit 3 — the CBMA small-producer credit engine (26 USC 5041(c)). Pure, DB-free, exhaustively
// tested — the genuinely hard, high-value part of the excise return. Given how many wine gallons the
// winery has ALREADY removed this calendar year (the YTD ladder position) and how many it removed THIS
// period (by tax class), it allocates the period's gallons across the stepped credit ladder and returns
// the credit, broken down per (class, tier) so Unit 5 can build the Schedule B gross/credit/net matrix.
//
// Council revisions folded (these SUPERSEDE the original Unit-3 sketch):
//  • C2 — NO production cap. The 750k figure is the annual REMOVED-gallon ceiling on the credit, not a
//    production gate; aging a prior-vintage wine with zero current-year production still earns credit.
//  • S1 — ONE unified 750k ladder shared by wine AND cider. Each gallon consumes the same 30k/130k/750k
//    tiers; the CREDIT RATE for a gallon is the wine rate or the cider rate depending on its class.
//  • S5 — within-period allocation is order-independent: the period's gallons occupy the ladder span
//    [ytdStart, ytdStart+periodGal]; each tier's overlap is split across classes PROPORTIONALLY to their
//    share of the period (so wine-first vs cider-first can't change the answer).
//  • S6 — tier limits are parameters (v2 controlled-group apportionment restricts tier 1 to a share).
//  • S4 — gallons stay exact; each credit line is rounded to the cent (mirrors 025's rounding rule).

import type { WineTaxClass } from "./types";
import { round2Gal as round2 } from "./gallons"; // generic round-to-2dp (with epsilon); used here for cents

/** Ladder tier index. 1 = first 30k, 2 = next 100k (30k–130k), 3 = next 620k (130k–750k). */
export type CbmaTier = 1 | 2 | 3;

/** Per-tier credit RATE ($/wine gallon) for wine vs hard cider (26 USC 5041(c), CBMA-permanent). */
export const WINE_CREDIT_RATE: Record<CbmaTier, number> = { 1: 1.0, 2: 0.9, 3: 0.535 };
export const CIDER_CREDIT_RATE: Record<CbmaTier, number> = { 1: 0.062, 2: 0.056, 3: 0.033 };

/** Default ladder boundaries (gallons removed per calendar year). */
export const CBMA_TIER1_LIMIT = 30_000; // first 30,000 gal
export const CBMA_TIER2_LIMIT = 100_000; // next 100,000 gal → tier-2 ends at 130,000
export const CBMA_ANNUAL_CAP = 750_000; // no credit beyond the first 750,000 gal removed/year

export type CbmaInput = {
  /** Wine gallons already removed (ALL classes) earlier this calendar year — the ladder START. */
  ytdRemovedGal: number;
  /** THIS period's taxpaid-removed gallons by tax class (exact, un-rounded). */
  periodRemovedByClass: Partial<Record<WineTaxClass, number>>;
  /** S6: tier boundaries (defaults above). tier2Limit is the SIZE of tier 2 (100k), not its end. */
  tier1Limit?: number;
  tier2Limit?: number;
  annualCap?: number;
};

/** One credit line: gallons of a class that fell in a tier, that tier's rate, and the rounded credit. */
export type CbmaCreditLine = {
  taxClass: WineTaxClass;
  tier: CbmaTier;
  gallons: number; // exact gallons of this class in this tier
  creditRate: number; // wine or cider rate for the tier
  creditAmount: number; // gallons × rate, rounded to the cent (S4)
};

export type CbmaResult = {
  /** Per-(class,tier) credit lines (drives the Schedule B matrix, S3). Zero-credit tiers omitted. */
  lines: CbmaCreditLine[];
  /** Rounded credit summed per class (foots to totalCredit). */
  creditByClass: Partial<Record<WineTaxClass, number>>;
  /** Total CBMA credit for the period, rounded to the cent. */
  totalCredit: number;
  /** This period's total taxpaid-removed gallons (all classes), exact. */
  periodRemovedGal: number;
  /** Of this period's gallons, how many fell at/under the annual cap (earned any credit). */
  creditableGal: number;
  /** The new ladder position AFTER this period (ytdStart + full periodGal, cap-agnostic). */
  newYtdRemovedGal: number;
  /** True when some of this period's gallons fell beyond the 750k annual cap (0 credit on those). */
  over750k: boolean;
};

const isCider = (c: WineTaxClass) => c === "F_HARD_CIDER";

/**
 * Allocate a period's removed gallons across the CBMA credit ladder from a YTD starting position.
 * Order-independent (S5): the period occupies the ladder span [ytdStart, ytdStart + periodGal]; each
 * tier's overlap with that span is split across the period's classes in proportion to each class's
 * share of the period, then priced at that tier's wine/cider rate.
 */
export function applyCbmaCredit(input: CbmaInput): CbmaResult {
  const tier1Limit = input.tier1Limit ?? CBMA_TIER1_LIMIT;
  const tier2Limit = input.tier2Limit ?? CBMA_TIER2_LIMIT;
  const cap = input.annualCap ?? CBMA_ANNUAL_CAP;

  // Tier ranges on the annual ladder (gallons): [start, end).
  const t1End = tier1Limit;
  const t2End = tier1Limit + tier2Limit;
  const tierRanges: { tier: CbmaTier; start: number; end: number }[] = [
    { tier: 1, start: 0, end: t1End },
    { tier: 2, start: t1End, end: t2End },
    { tier: 3, start: t2End, end: cap },
  ];

  const entries = Object.entries(input.periodRemovedByClass).filter(([, g]) => (g ?? 0) > 0) as [WineTaxClass, number][];
  const periodGal = entries.reduce((a, [, g]) => a + g, 0);

  const ytdStart = Math.max(0, input.ytdRemovedGal);
  const spanStart = ytdStart;
  const spanEnd = ytdStart + periodGal;
  const newYtdRemovedGal = spanEnd;

  const lines: CbmaCreditLine[] = [];
  const creditByClass: Partial<Record<WineTaxClass, number>> = {};
  let totalCredit = 0;
  let creditableGal = 0;

  if (periodGal > 0) {
    for (const { tier, start, end } of tierRanges) {
      // Gallons of THIS period that land in this tier (overlap of the period span with the tier range).
      const overlap = Math.max(0, Math.min(end, spanEnd) - Math.max(start, spanStart));
      if (overlap <= 0) continue;
      creditableGal += overlap;
      for (const [taxClass, g] of entries) {
        // Proportional split (S5): this class's share of the tier overlap = overlap × (g / periodGal).
        const galInTier = overlap * (g / periodGal);
        if (galInTier <= 0) continue;
        const creditRate = isCider(taxClass) ? CIDER_CREDIT_RATE[tier] : WINE_CREDIT_RATE[tier];
        const creditAmount = round2(galInTier * creditRate);
        if (creditAmount === 0) continue;
        lines.push({ taxClass, tier, gallons: galInTier, creditRate, creditAmount });
        creditByClass[taxClass] = round2((creditByClass[taxClass] ?? 0) + creditAmount);
        totalCredit = round2(totalCredit + creditAmount);
      }
    }
  }

  return {
    lines,
    creditByClass,
    totalCredit,
    periodRemovedGal: periodGal,
    creditableGal,
    newYtdRemovedGal,
    over750k: spanEnd > cap,
  };
}
