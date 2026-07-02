import { prisma } from "@/lib/prisma";
import { upcomingDeadlines, type OpsCadence } from "./deadlines";
import { classifyDeadlines, type OpenDeadline } from "./deadline-status";
import { computeExcise } from "./excise";
import { OPS_FORM, EXCISE_FORM } from "./form-type";
import { asReturnCadence } from "./types";

// plan-027 Unit 3 (DB wrapper) — the ONE authority the widget, nav badge, /compliance banner, and cron
// all call. Loads the tenant's cadence settings, enumerates deadlines (deadlines.ts), drops FILED
// periods + $0 semimonthly-excise periods (council C2), and classifies the rest. Explicit tenantId
// (K12: never read the ALS tenant inside logic that a cron drives across tenants).

const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export type OpenDeadlinesOpts = {
  /** How far ahead to look (days). Default 45 — covers a monthly + two semimonthly cycles. */
  horizonDays?: number;
  /** How far back to still surface OVERDUE deadlines (days). Default 21. */
  overdueDays?: number;
};

/**
 * Open (unfiled, non-$0) filing deadlines for a tenant as-of `asOf`, annotated with daysUntil + tone.
 * The excise ($0-liability) drop calls computeExcise per excise period in the window — a few calls per
 * tenant; a failure there degrades gracefully (the deadline is kept, not silently hidden).
 */
export async function openDeadlinesForTenant(tenantId: string, asOf: Date, opts: OpenDeadlinesOpts = {}): Promise<OpenDeadline[]> {
  const profile = await prisma.complianceProfile.findFirst({ select: { defaultCadence: true, defaultReturnCadence: true, isEftPayer: true } });
  const opsCadence = (profile?.defaultCadence ?? "MONTHLY") as OpsCadence;
  const returnCadence = asReturnCadence(profile?.defaultReturnCadence ?? "SEMIMONTHLY");
  const isEftPayer = profile?.isEftPayer ?? false;

  const window = { from: new Date(asOf.getTime() - (opts.overdueDays ?? 21) * DAY), to: new Date(asOf.getTime() + (opts.horizonDays ?? 45) * DAY) };
  const deadlines = upcomingDeadlines({ opsCadence, returnCadence, isEftPayer }, window);

  // FILED reports (any period) → filedKeys, keyed the same way deadlines.ts keys periods.
  const filed = await prisma.complianceReport.findMany({ where: { status: "FILED" }, select: { formType: true, periodEnd: true } });
  const filedKeys = new Set(filed.map((r) => `${r.formType === EXCISE_FORM ? "5000.24" : "5120.17"}:${ymd(r.periodEnd)}`));

  // $0 semimonthly excise periods need not be filed (council C2) → drop. Compute liability per excise period.
  const zeroLiabilityKeys = new Set<string>();
  for (const d of deadlines) {
    if (d.form !== "5000.24") continue;
    try {
      const { netTax } = await computeExcise(tenantId, { start: d.periodStart, end: d.periodEnd, cadence: returnCadence, isEftPayer });
      if (netTax <= 0) zeroLiabilityKeys.add(d.periodKey);
    } catch {
      /* leave the deadline visible if liability can't be computed */
    }
  }

  return classifyDeadlines({ deadlines, asOf, filedKeys, zeroLiabilityKeys }).sort((a, b) => a.effectiveDueDate.getTime() - b.effectiveDueDate.getTime());
}

/** Count of open deadlines (for the nav badge) + whether any is danger-toned (≤2 days / overdue). */
export async function openDeadlineBadge(tenantId: string, asOf: Date): Promise<{ count: number; urgent: boolean }> {
  const open = await openDeadlinesForTenant(tenantId, asOf, { horizonDays: 30 });
  return { count: open.length, urgent: open.some((d) => d.tone === "danger") };
}

export { OPS_FORM, EXCISE_FORM };
