import { prisma } from "@/lib/prisma";
import { computeExcise, type ExciseComputed } from "./excise";
import { EXCISE_FORM, formScope } from "./form-type";
import type { ReturnCadence, WineTaxClass } from "./types";

// plan-026 Unit 6 — persist + generate an excise return. Mirrors generate.ts's DRAFT/FILE/amend
// machinery for the second form: computeExcise → a ComplianceReport row with formType=TTB_5000_24,
// taxDollars=net, computed=the excise worksheet snapshot. FILED rows are never mutated (a regenerate
// always writes a NEW row); markReportFiled (generate.ts) freezes + gates on the excise blockers.
//
// C3 — the CBMA YTD ladder is stateless (recomputed in computeExcise), so there is NO carry-forward to
// persist. onHandEnd stores the post-period ladder position for display/audit only. An AMENDED excise
// return flags any later FILED excise return as downstream-stale (their snapshots predate the amend).

export type GenerateExciseInput = {
  periodStart: Date;
  periodEnd: Date;
  cadence: ReturnCadence;
  isEftPayer?: boolean;
  /** AMENDED: the ORIGINAL FILED excise return this supersedes (re-computes the period, C3). */
  amendsReportId?: string | null;
  overrides?: Record<string, WineTaxClass>;
  remarks?: string;
  tier1Limit?: number;
  tier2Limit?: number;
  annualCap?: number;
};

export type GenerateExciseResult = {
  reportId: string;
  computed: ExciseComputed;
  netTax: number;
  downstreamStale: boolean;
  priorUnfiledPeriodThisYear: boolean;
};

/**
 * Detect the C3 "ladder gap": wine was already removed earlier this calendar year, but no excise
 * return has been FILED for any earlier period. Advisory only — the YTD math is correct regardless
 * (it re-folds the ledger), but the winery's filing discipline may be behind.
 */
async function priorUnfiledThisYear(ytdRemovedStart: number, periodStart: Date): Promise<boolean> {
  if (ytdRemovedStart <= 0) return false;
  const yearStart = new Date(Date.UTC(periodStart.getUTCFullYear(), 0, 1));
  const filedEarlier = await prisma.complianceReport.count({
    where: { ...formScope(EXCISE_FORM), status: "FILED", periodStart: { gte: yearStart }, periodEnd: { lt: periodStart } },
  });
  return filedEarlier === 0;
}

/** Generate + persist a DRAFT excise return for a period. */
export async function generateExciseReturn(tenantId: string, input: GenerateExciseInput): Promise<GenerateExciseResult> {
  const overrides = input.overrides ?? {};
  const { computed, netTax } = await computeExcise(tenantId, {
    start: input.periodStart,
    end: input.periodEnd,
    cadence: input.cadence,
    isEftPayer: input.isEftPayer,
    overrides,
    tier1Limit: input.tier1Limit,
    tier2Limit: input.tier2Limit,
    annualCap: input.annualCap,
  });

  const version: "ORIGINAL" | "AMENDED" = input.amendsReportId ? "AMENDED" : "ORIGINAL";
  const priorUnfiledPeriodThisYear = await priorUnfiledThisYear(computed.ladder.ytdRemovedStart, input.periodStart);

  const autoRemarks: string[] = [];
  if (version === "AMENDED" && input.amendsReportId) autoRemarks.push(`Amends excise return ${input.amendsReportId}.`);
  if (computed.ladder.over750k) autoRemarks.push("CBMA credit capped at 750,000 gal removed this year; any over-claim repays via Schedule A.");
  const remarks = [input.remarks?.trim(), autoRemarks.join(" ")].filter(Boolean).join("\n\n");

  const created = await prisma.complianceReport.create({
    data: {
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      cadence: input.cadence,
      formType: EXCISE_FORM,
      status: "DRAFT",
      version,
      amendsReportId: input.amendsReportId ?? null,
      taxDollars: netTax,
      onHandEnd: { ytdRemovedGal: computed.ladder.ytdRemovedEnd } as unknown as object, // ladder position (display/audit; C3 stateless)
      computed: computed as unknown as object,
      overrides: overrides as unknown as object,
      remarks,
    },
    select: { id: true },
  });

  // A later FILED excise return's snapshot predates this amendment → flag it stale (C3).
  const downstreamStale =
    version === "AMENDED"
      ? (await prisma.complianceReport.count({ where: { ...formScope(EXCISE_FORM), status: "FILED", periodStart: { gte: input.periodEnd } } })) > 0
      : false;

  return { reportId: created.id, computed, netTax, downstreamStale, priorUnfiledPeriodThisYear };
}
