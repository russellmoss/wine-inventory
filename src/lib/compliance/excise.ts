import { round2Gal as round2 } from "./gallons";
import { rateForClass } from "./excise-rates";
import {
  applyCbmaCredit,
  CBMA_ANNUAL_CAP,
  CBMA_TIER1_LIMIT,
  CBMA_TIER2_LIMIT,
  type CbmaCreditLine,
} from "./cbma";
import { removedTaxpaidGallonsByClass } from "./removals";
import type { PerLotClass } from "./generate";
import type { ReturnCadence, WineTaxClass } from "./types";

// plan-026 Unit 5 — the excise COMPUTE service: turn a period's taxpaid removals into the net wine tax
// + CBMA credit + the backing worksheet. Reuses the shared removal helper (E2), the rate table (U2),
// and the CBMA engine (U3). The `computed` snapshot it returns is the SINGLE source (E5) for both the
// review worksheet (U10) and the filled PDF (U8) — neither re-derives the math.
//
// Council C3 — the CBMA YTD ladder is STATELESS. There is NO persisted/carried-forward ladder; the
// "gallons already removed this calendar year" is recomputed on every generation as a wider window of
// the SAME helper (Jan 1 → period start − 1ms, E3). So amending an earlier period can't leave a stale
// snapshot — but a later already-FILED return must be regenerated (the generate step flags that, U6).
// S4 — gallons stay exact; tax = gallons × rate rounded to the cent; the credit is rounded to the cent.

/** One worksheet row: a tax class's removed gallons → gross tax → CBMA credit → net tax (S3). */
export type ExciseClassRow = {
  taxClass: WineTaxClass;
  gallons: number; // exact removed gallons in the period
  rate: number; // per-gallon rate (27 CFR 24.270)
  grossTax: number; // gallons × rate, rounded to the cent
  cbmaCredit: number; // this class's CBMA credit, rounded to the cent
  netTax: number; // grossTax − cbmaCredit
};

/** The CBMA calendar-year ladder position, made legible for the D4 strip. */
export type CbmaLadder = {
  ytdRemovedStart: number; // ladder position at period start (gallons removed Jan 1 → start)
  periodRemovedGal: number; // gallons removed this period
  ytdRemovedEnd: number; // ladder position after this period
  annualCap: number; // 750,000
  tiers: { tier: 1 | 2 | 3; limit: number; consumed: number; remaining: number }[];
  totalCredit: number;
  over750k: boolean;
};

/** The full excise `computed` Json snapshot (stored on the ComplianceReport row). */
export type ExciseComputed = {
  formType: "TTB_5000_24";
  /** Non-zero worksheet rows, one per tax class removed this period. */
  classRows: ExciseClassRow[];
  /** Line 10 (gross wine tax), the CBMA credit (Schedule B), and the net = amount to pay (line 21). */
  grossTax: number;
  cbmaCredit: number;
  netTax: number;
  /** Per-(class,tier) credit lines — Schedule B backing (E5). */
  cbmaLines: CbmaCreditLine[];
  ladder: CbmaLadder;
  /** Per-lot classification of taxpaid-removed bulk lots (anomaly ABV>24 block, S2). */
  perLot: PerLotClass[];
  cadence: ReturnCadence;
  isEftPayer: boolean;
};

export type ComputeExciseInput = {
  start: Date;
  end: Date;
  cadence: ReturnCadence;
  isEftPayer?: boolean;
  overrides?: Record<string, WineTaxClass>;
  /** S6: tier limits (v2 controlled-group). Defaults to the statutory 30k/100k/750k. */
  tier1Limit?: number;
  tier2Limit?: number;
  annualCap?: number;
};

export type ComputeExciseResult = { computed: ExciseComputed; netTax: number };

/** Build the D4 ladder strip from the post-period position. */
function ladderTiers(ytdEnd: number, tier1Limit: number, tier2Limit: number, cap: number) {
  const ranges: { tier: 1 | 2 | 3; start: number; end: number }[] = [
    { tier: 1, start: 0, end: tier1Limit },
    { tier: 2, start: tier1Limit, end: tier1Limit + tier2Limit },
    { tier: 3, start: tier1Limit + tier2Limit, end: cap },
  ];
  return ranges.map(({ tier, start, end }) => {
    const limit = end - start;
    const consumed = Math.max(0, Math.min(ytdEnd, end) - start);
    return { tier, limit, consumed, remaining: Math.max(0, limit - consumed) };
  });
}

/**
 * Compute the wine excise tax + CBMA credit + worksheet for a return period. `tenantId` is explicit
 * (K12: never read the ALS tenant inside compute). Runs under the caller's tenant context.
 */
export async function computeExcise(tenantId: string, input: ComputeExciseInput): Promise<ComputeExciseResult> {
  const overrides = input.overrides ?? {};
  const tier1Limit = input.tier1Limit ?? CBMA_TIER1_LIMIT;
  const tier2Limit = input.tier2Limit ?? CBMA_TIER2_LIMIT;
  const cap = input.annualCap ?? CBMA_ANNUAL_CAP;

  // 1. This period's taxpaid removals by class (C5: taxpaid only; reversals net).
  const period = await removedTaxpaidGallonsByClass(tenantId, { start: input.start, end: input.end }, overrides);

  // 2. STATELESS YTD (C3/E3): gallons removed Jan 1 → period start − 1ms (same helper, wider window).
  const yearStart = new Date(Date.UTC(input.start.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
  const beforePeriod = new Date(input.start.getTime() - 1);
  const ytdRemovedStart =
    beforePeriod < yearStart
      ? 0
      : (await removedTaxpaidGallonsByClass(tenantId, { start: yearStart, end: beforePeriod }, overrides)).totalGallons;

  // 3. CBMA credit for the period, allocated from the YTD start (order-independent, S5).
  const cbma = applyCbmaCredit({
    ytdRemovedGal: ytdRemovedStart,
    periodRemovedByClass: period.gallonsByClass,
    tier1Limit,
    tier2Limit,
    annualCap: cap,
  });

  // 4. Worksheet rows: per class gross → credit → net (S3/S4).
  const classRows: ExciseClassRow[] = [];
  let grossTax = 0;
  for (const [taxClass, gallons] of Object.entries(period.gallonsByClass) as [WineTaxClass, number][]) {
    if (!gallons) continue;
    const rate = rateForClass(taxClass);
    const gross = round2(gallons * rate);
    const credit = cbma.creditByClass[taxClass] ?? 0;
    grossTax = round2(grossTax + gross);
    classRows.push({ taxClass, gallons, rate, grossTax: gross, cbmaCredit: credit, netTax: round2(gross - credit) });
  }
  classRows.sort((a, b) => a.taxClass.localeCompare(b.taxClass));

  const cbmaCredit = cbma.totalCredit;
  const netTax = round2(grossTax - cbmaCredit);

  const computed: ExciseComputed = {
    formType: "TTB_5000_24",
    classRows,
    grossTax,
    cbmaCredit,
    netTax,
    cbmaLines: cbma.lines,
    ladder: {
      ytdRemovedStart,
      periodRemovedGal: cbma.periodRemovedGal,
      ytdRemovedEnd: cbma.newYtdRemovedGal,
      annualCap: cap,
      tiers: ladderTiers(cbma.newYtdRemovedGal, tier1Limit, tier2Limit, cap),
      totalCredit: cbmaCredit,
      over750k: cbma.over750k,
    },
    perLot: period.perLot,
    cadence: input.cadence,
    isEftPayer: input.isEftPayer ?? false,
  };

  return { computed, netTax };
}
