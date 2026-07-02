import type { ComputedSnapshot } from "./generate";
import type { ExciseComputed } from "./excise";
import { hasRate } from "./excise-rates";

// Unit 11 — pre-file anomaly + readiness checks. Deterministic checks run first (cheap, testable, and
// the ONLY thing that gates filing). An optional LLM pass writes a plain-English "ready / not ready"
// summary + suggested Part X wording — advisory ONLY, never gates, and always carries a disclaimer
// (OV#5). The deterministic core is pure so it's fully unit-tested; the LLM pass lives in llm.ts.

export type AnomalySeverity = "blocker" | "warning" | "info";
export type AnomalyFinding = {
  code: string;
  severity: AnomalySeverity;
  message: string;
  /** Optional jump target for the review grid. */
  jumpTo?: { section: "A" | "B"; line: number };
};

export type DeterministicInput = {
  snapshot: Pick<ComputedSnapshot, "cells" | "footings" | "balanced" | "a13EqualsB2" | "needsAbvLotIds" | "partX">;
  /** Trailing mean of prior periods' total loss (gallons), if ≥1 prior report exists. */
  trailingLossMeanGal?: number | null;
  /** This period's total loss (A29+A30+B18+B19) in gallons. */
  thisPeriodLossGal?: number;
};

const A_LOSS_LINES = new Set([29, 30]);
const B_LOSS_LINES = new Set([18, 19]);

/** All deterministic findings. `blocker`s (also enforced in markReportFiled) prevent filing. */
export function deterministicAnomalies(input: DeterministicInput): AnomalyFinding[] {
  const { snapshot } = input;
  const out: AnomalyFinding[] = [];

  if (snapshot.needsAbvLotIds.length > 0) {
    out.push({
      code: "missing-abv",
      severity: "blocker",
      message: `${snapshot.needsAbvLotIds.length} lot(s) need an ABV before filing (currently defaulted to class a to keep the volume visible). Add a reading or a tax-ABV override, then regenerate.`,
    });
  }

  if (!snapshot.balanced) {
    const bad = snapshot.footings.find((f) => !f.foots);
    out.push({
      code: "does-not-balance",
      severity: "blocker",
      message: "One or more columns do not foot (begin + additions ≠ removals + end). Review the flagged columns before filing.",
      jumpTo: bad ? { section: bad.section, line: bad.section === "A" ? 12 : 7 } : undefined,
    });
  }

  const negativeEnd = snapshot.cells.find((c) => (c.line === 31 || c.line === 20) && c.gallons < 0);
  if (negativeEnd) {
    out.push({
      code: "negative-on-hand",
      severity: "blocker",
      message: `On-hand end is negative in section ${negativeEnd.section} — more wine left than was on hand. Check for a missed receipt or a mis-dated operation.`,
      jumpTo: { section: negativeEnd.section, line: negativeEnd.line },
    });
  }

  if (!snapshot.a13EqualsB2) {
    out.push({
      code: "a13-neq-b2",
      severity: "warning",
      message: "§A line 13 (bulk bottled) does not equal §B line 2 (bottled in). Footnote 3 requires these to match.",
      jumpTo: { section: "A", line: 13 },
    });
  }

  // Material inventory loss/shortage lines need a Part X explanation (ftn 4).
  const lossCells = snapshot.cells.filter(
    (c) => (c.section === "A" && A_LOSS_LINES.has(c.line)) || (c.section === "B" && B_LOSS_LINES.has(c.line)),
  );
  for (const c of lossCells) {
    if (c.gallons > 0) {
      out.push({
        code: "loss-needs-partx",
        severity: "warning",
        message: `Section ${c.section} line ${c.line} shows ${c.gallons.toFixed(2)} gal of loss/shortage — explain in Part X (unexplained bottled shortages can be assessed tax).`,
        jumpTo: { section: c.section, line: c.line },
      });
    }
  }

  // 5× loss spike vs the trailing mean.
  if (input.trailingLossMeanGal != null && input.trailingLossMeanGal > 0 && input.thisPeriodLossGal != null) {
    if (input.thisPeriodLossGal >= 5 * input.trailingLossMeanGal) {
      out.push({
        code: "loss-spike",
        severity: "warning",
        message: `This period's total loss (${input.thisPeriodLossGal.toFixed(2)} gal) is ≥5× the trailing average (${input.trailingLossMeanGal.toFixed(2)} gal). Verify it's real, not a data-entry error.`,
      });
    }
  }

  return out;
}

/** Convenience: does anything BLOCK filing? (deterministic only). */
export function hasFilingBlocker(findings: AnomalyFinding[]): boolean {
  return findings.some((f) => f.severity === "blocker");
}

// ─────────────────────────── plan-026 U9: excise-return anomalies ───────────────────────────

export type ExciseDeterministicInput = {
  snapshot: Pick<ExciseComputed, "classRows" | "grossTax" | "cbmaCredit" | "netTax" | "ladder" | "perLot">;
  /** A prior return period THIS calendar year is still unfiled → the CBMA ladder may be wrong (C3). */
  priorUnfiledPeriodThisYear?: boolean;
  /** An earlier period was amended after this return was computed → regenerate to refresh (C3). */
  downstreamStale?: boolean;
};

/**
 * Deterministic excise-return findings. `blocker`s (also enforced in markReportFiled) prevent filing.
 * The genuinely dangerous ones are BOTH tested and hard-gated: >24% ABV (S2), a class with no rate,
 * negative net tax, and a worksheet that doesn't foot.
 */
export function deterministicExciseAnomalies(input: ExciseDeterministicInput): AnomalyFinding[] {
  const { snapshot } = input;
  const out: AnomalyFinding[] = [];

  // S2 — a taxpaid-removed lot over 24% ABV is DISTILLED SPIRITS, not wine. Hard block.
  const overAbv = snapshot.perLot.filter((l) => l.reason === "abv-over-24-review" || (l.abv != null && l.abv > 24));
  if (overAbv.length > 0) {
    out.push({
      code: "abv-over-24",
      severity: "blocker",
      message: `${overAbv.map((l) => l.lotCode).join(", ")} is over 24% ABV — taxed as distilled spirits, not wine. Reclassify or remove it before filing this wine excise return.`,
    });
  }

  // A removed gallon in a class with no defined wine rate (defensive — all six classes have a rate).
  const noRate = snapshot.classRows.find((r) => !hasRate(r.taxClass));
  if (noRate) {
    out.push({ code: "class-no-rate", severity: "blocker", message: `Tax class ${noRate.taxClass} has no wine excise rate — it can't be taxed on this form.` });
  }

  // Net tax below zero: the CBMA credit exceeds the gross tax (a data or credit-tier error).
  if (snapshot.netTax < 0) {
    out.push({ code: "negative-tax", severity: "blocker", message: "Net tax is negative — the CBMA credit exceeds the gross wine tax. Review the removals and the credit before filing." });
  }

  // Worksheet integrity: line 10 gross must foot to the per-class gross sum, and net = gross − credit.
  const sumGross = snapshot.classRows.reduce((a, r) => a + r.grossTax, 0);
  if (Math.abs(sumGross - snapshot.grossTax) > 0.01) {
    out.push({ code: "gross-mismatch", severity: "blocker", message: "The gross tax does not equal the sum of the per-class worksheet rows. Regenerate the return." });
  }
  if (Math.abs(snapshot.grossTax - snapshot.cbmaCredit - snapshot.netTax) > 0.01) {
    out.push({ code: "net-mismatch", severity: "blocker", message: "Net tax ≠ gross − CBMA credit. Regenerate the return." });
  }

  // Over-claim risk: the year's removed gallons passed the 750k CBMA cap.
  if (snapshot.ladder.over750k) {
    out.push({
      code: "cbma-over-750k",
      severity: "warning",
      message: `Over 750,000 wine gallons have been removed this calendar year — the CBMA credit is capped and any credit claimed on gallons beyond 750k must be repaid via Schedule A.`,
    });
  }

  if (input.priorUnfiledPeriodThisYear) {
    out.push({
      code: "prior-period-unfiled",
      severity: "warning",
      message: "A return period earlier this calendar year hasn't been filed yet — your CBMA credit ladder position may be wrong. File the earlier period first, then regenerate.",
    });
  }

  if (input.downstreamStale) {
    out.push({
      code: "downstream-stale",
      severity: "info",
      message: "An earlier period was amended after this return was generated — regenerate it to refresh the CBMA ladder.",
    });
  }

  return out;
}

export const AI_DISCLAIMER = "AI note — not compliance advice, not reviewed by TTB. Always confirm the numbers yourself before filing.";
