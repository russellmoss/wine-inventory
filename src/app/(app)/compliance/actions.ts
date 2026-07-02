"use server";

import { revalidatePath } from "next/cache";
import { adminAction } from "@/lib/actions";
import { ActionError } from "@/lib/action-error";
import { removeTaxpaidCore } from "@/lib/compliance/removal-core";
import { removeBottledCore } from "@/lib/compliance/bottled-removal-core";
import { isBottledRemovalDisposition } from "@/lib/compliance/bottled-removal";
import { generateReport, markReportFiled } from "@/lib/compliance/generate";
import { generateExciseReturn } from "@/lib/compliance/generate-excise";
import { returnPeriodBounds } from "@/lib/compliance/return-cadence";
import { reverseOperationCore } from "@/lib/ledger/reverse";
import { prisma } from "@/lib/prisma";
import { isRemovalDisposition } from "@/lib/compliance/removal-reasons";
import { composeAddress } from "@/lib/address/format";
import { asReturnCadence, type WineTaxClass } from "@/lib/compliance/types";

function revalidate() {
  revalidatePath("/compliance");
  revalidatePath("/bulk");
}

// The compliance profile shows on both /compliance and /settings; keep both fresh after a save.
function revalidateProfile() {
  revalidatePath("/compliance");
  revalidatePath("/settings");
}

/** Period bounds (UTC) for a monthly / quarterly / annual report. */
function periodBounds(year: number, month: number | null, cadence: "MONTHLY" | "QUARTERLY" | "ANNUAL") {
  if (cadence === "ANNUAL") return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)) };
  if (cadence === "QUARTERLY") {
    const q = Math.floor(((month ?? 1) - 1) / 3); // 0..3
    return { start: new Date(Date.UTC(year, q * 3, 1)), end: new Date(Date.UTC(year, q * 3 + 3, 0, 23, 59, 59, 999)) };
  }
  const m = (month ?? 1) - 1;
  return { start: new Date(Date.UTC(year, m, 1)), end: new Date(Date.UTC(year, m + 1, 0, 23, 59, 59, 999)) };
}

/** Record a taxpaid (or other-disposition) bulk removal — the reversible tax-determination event. */
export const recordTaxpaidRemoval = adminAction(async ({ actor }, formData: FormData) => {
  const vesselId = String(formData.get("vesselId") ?? "");
  const volumeL = Number(formData.get("volumeL"));
  const disposition = String(formData.get("disposition") ?? "TAXPAID");
  const dateStr = String(formData.get("date") ?? "");
  if (!vesselId) throw new ActionError("Pick a vessel to remove from.");
  if (!isRemovalDisposition(disposition)) throw new ActionError("Unknown disposition.");
  const observedAt = dateStr ? new Date(dateStr) : undefined;
  if (observedAt && Number.isNaN(observedAt.getTime())) throw new ActionError("Invalid date.");
  await removeTaxpaidCore(actor, { vesselId, volumeL, disposition, observedAt });
  revalidate();
});

/** Remove bottled wine from finished-goods inventory with a disposition → the correct §B line. */
export const recordBottledRemoval = adminAction(async ({ actor }, formData: FormData) => {
  const [wineSkuId, locationId] = String(formData.get("skuLoc") ?? "").split("|");
  const bottles = Number(formData.get("bottles"));
  const disposition = String(formData.get("disposition") ?? "TAXPAID");
  if (!wineSkuId || !locationId) throw new ActionError("Pick a bottled wine + location.");
  if (!isBottledRemovalDisposition(disposition)) throw new ActionError("Unknown disposition.");
  if (!Number.isInteger(bottles) || bottles < 1) throw new ActionError("Enter a whole number of bottles.");
  await removeBottledCore(actor, { wineSkuId, locationId, bottles, disposition });
  revalidate();
});

/** Generate (or amend / regenerate with overrides) a DRAFT report for a period. Routes by formType:
 * TTB_5120_17 → the operations report (gallons); TTB_5000_24 → the wine excise return (dollars). */
export const generateComplianceReport = adminAction(async ({ actor }, formData: FormData) => {
  const formType = String(formData.get("formType") ?? "TTB_5120_17");
  const year = Number(formData.get("year"));
  const amendsReportId = String(formData.get("amendsReportId") ?? "") || null;
  const remarks = String(formData.get("remarks") ?? "");
  const overridesRaw = String(formData.get("overrides") ?? "");
  let overrides: Record<string, WineTaxClass> = {};
  if (overridesRaw) {
    try {
      overrides = JSON.parse(overridesRaw);
    } catch {
      throw new ActionError("Bad overrides payload.");
    }
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new ActionError("Enter a valid year.");

  // ── Wine excise return (TTB 5000.24) ──
  if (formType === "TTB_5000_24") {
    const cadence = asReturnCadence(String(formData.get("cadence") ?? "SEMIMONTHLY"));
    const periodIndex = Number(formData.get("periodIndex") ?? 0);
    const isEftPayer = String(formData.get("isEftPayer") ?? "") === "true";
    if (!Number.isInteger(periodIndex) || periodIndex < 0) throw new ActionError("Pick a return period.");
    const period = returnPeriodBounds(year, cadence, periodIndex, isEftPayer);
    const res = await generateExciseReturn(actor.tenantId, {
      periodStart: period.start,
      periodEnd: period.end,
      cadence,
      isEftPayer,
      amendsReportId,
      overrides,
      remarks,
    });
    revalidate();
    return {
      reportId: res.reportId,
      formType,
      netTax: res.netTax,
      downstreamStale: res.downstreamStale,
      priorUnfiledPeriodThisYear: res.priorUnfiledPeriodThisYear,
    };
  }

  // ── Operations report (TTB 5120.17) ──
  const monthRaw = formData.get("month");
  const month = monthRaw != null && String(monthRaw) !== "" ? Number(monthRaw) : null;
  const cadence = (String(formData.get("cadence") ?? "MONTHLY") as "MONTHLY" | "QUARTERLY" | "ANNUAL");
  const { start, end } = periodBounds(year, month, cadence);
  const res = await generateReport(actor.tenantId, { periodStart: start, periodEnd: end, cadence, amendsReportId, overrides, remarks });
  revalidate();
  return { reportId: res.reportId, formType, balanced: res.fold.balanced, needsAbv: res.fold.needsAbvLotIds.length, downstreamStale: res.downstreamStale };
});

/** Mark a DRAFT report FILED (immutable). Blocked when a lot still needs an ABV or it doesn't balance. */
export const fileComplianceReport = adminAction(async ({ actor }, reportId: string, isFinalBusiness: boolean) => {
  if (!reportId) throw new ActionError("Missing report id.");
  await markReportFiled(reportId, actor.actorEmail);
  if (isFinalBusiness) await prisma.complianceReport.update({ where: { id: reportId }, data: { isFinalBusinessReport: true } });
  revalidate();
});

/** Undo a removal (or any reversible op) from the compliance screen — routes to the universal 024 path. */
export const undoComplianceOperation = adminAction(async ({ actor }, operationId: number) => {
  if (!Number.isInteger(operationId)) throw new ActionError("Missing operation id.");
  const r = await reverseOperationCore(actor, { operationId });
  revalidate();
  return { message: r.message };
});

/** Advisory AI readiness note for a report (never gates filing; carries a disclaimer). */
export const assessReportReadiness = adminAction(async (_ctx, reportId: string) => {
  if (!reportId) throw new ActionError("Missing report id.");
  const report = await prisma.complianceReport.findUnique({
    where: { id: reportId },
    select: { periodEnd: true, status: true, formType: true, computed: true },
  });
  if (!report) throw new ActionError("Report not found.");

  if (report.formType === "TTB_5000_24") {
    const { deterministicExciseAnomalies } = await import("@/lib/compliance/anomaly");
    const { assessExciseReadiness } = await import("@/lib/compliance/llm");
    const snapshot = report.computed as unknown as import("@/lib/compliance/excise").ExciseComputed;
    const findings = deterministicExciseAnomalies({ snapshot });
    return assessExciseReadiness({
      periodLabel: report.periodEnd.toISOString().slice(0, 10),
      status: report.status,
      grossTax: snapshot.grossTax,
      cbmaCredit: snapshot.cbmaCredit,
      netTax: snapshot.netTax,
      findings,
    });
  }

  const { deterministicAnomalies } = await import("@/lib/compliance/anomaly");
  const { assessReadiness } = await import("@/lib/compliance/llm");
  const snapshot = report.computed as unknown as import("@/lib/compliance/generate").ComputedSnapshot;
  const findings = deterministicAnomalies({ snapshot });
  const summaryLines = snapshot.footings.map(
    (f) => `- §${f.section} ${f.column}${f.sub ? " " + f.sub : ""}: balances=${f.foots}`,
  );
  const r = await assessReadiness({
    periodLabel: report.periodEnd.toISOString().slice(0, 7),
    balanced: snapshot.balanced,
    status: report.status,
    findings,
    summaryLines,
  });
  return r;
});

/** Save the per-tenant compliance profile (filer identity for the form header). */
export const saveComplianceProfile = adminAction(async (_ctx, formData: FormData) => {
  const cadenceRaw = String(formData.get("defaultCadence") ?? "MONTHLY");
  const defaultCadence = (["MONTHLY", "QUARTERLY", "ANNUAL"].includes(cadenceRaw) ? cadenceRaw : "MONTHLY") as "MONTHLY" | "QUARTERLY" | "ANNUAL";
  // plan-026: the excise-return cadence (SEMIMONTHLY/QUARTERLY/ANNUAL) + EFT-payer flag, saved only
  // when the form supplies them (the /settings form does; the /compliance profile form may not).
  const hasReturnCadence = formData.has("defaultReturnCadence");
  const defaultReturnCadence = asReturnCadence(String(formData.get("defaultReturnCadence") ?? "SEMIMONTHLY"));
  const isEftPayer = String(formData.get("isEftPayer") ?? "") === "true" || formData.get("isEftPayer") === "on";
  const str = (k: string) => String(formData.get(k) ?? "").trim();
  const parts = {
    street1: str("operatedByStreet1"),
    street2: str("operatedByStreet2"),
    city: str("operatedByCity"),
    state: str("operatedByState"),
    zip: str("operatedByZip"),
  };
  const composed = composeAddress(parts);
  const data = {
    ein: str("ein") || null,
    registryNumber: str("registryNumber") || null,
    operatedByName: str("operatedByName") || null,
    // Structured parts are the source of truth; the composed one-line heads Form 5120.17.
    operatedByStreet1: parts.street1 || null,
    operatedByStreet2: parts.street2 || null,
    operatedByCity: parts.city || null,
    operatedByState: parts.state || null,
    operatedByZip: parts.zip || null,
    operatedByAddress: composed || null,
    operatedByPhone: str("operatedByPhone") || null,
    defaultCadence,
    // Only overwrite the return-cadence settings when the submitting form carries them.
    ...(hasReturnCadence ? { defaultReturnCadence, isEftPayer } : {}),
  };
  const existing = await prisma.complianceProfile.findFirst({ select: { id: true } });
  if (existing) await prisma.complianceProfile.update({ where: { id: existing.id }, data });
  else await prisma.complianceProfile.create({ data });
  revalidateProfile();
});
