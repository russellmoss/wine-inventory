import { requireAdmin } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { deterministicAnomalies, deterministicExciseAnomalies } from "@/lib/compliance/anomaly";
import { asOpsCadence, asReturnCadence } from "@/lib/compliance/types";
import { EXCISE_FORM, formScope } from "@/lib/compliance/form-type";
import { returnPeriodContaining } from "@/lib/compliance/return-cadence";
import type { ComputedSnapshot } from "@/lib/compliance/generate";
import type { ExciseComputed } from "@/lib/compliance/excise";
import { openDeadlinesForTenant } from "@/lib/compliance/reminders";
import { deadlineWhen, deadlineTitle } from "@/lib/compliance/deadline-display";
import { ComplianceClient, type ReportView, type VesselOpt, type BottledOpt } from "./ComplianceClient";
import { ExciseClient, type ExciseView } from "./ExciseClient";
import { FormModeSwitch } from "./FormModeSwitch";

export default async function CompliancePage({ searchParams }: { searchParams: Promise<{ id?: string; formType?: string }> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const formType: "TTB_5120_17" | "TTB_5000_24" = sp.formType === "TTB_5000_24" ? "TTB_5000_24" : "TTB_5120_17";

  const profile = await prisma.complianceProfile.findFirst();

  // Report list for the ACTIVE form only (C4/E1 — the two forms' histories never cross).
  const reports = await prisma.complianceReport.findMany({
    where: { ...formScope(formType) },
    orderBy: [{ periodEnd: "desc" }, { generatedAt: "desc" }],
    take: 24,
    select: { id: true, periodStart: true, periodEnd: true, cadence: true, status: true, version: true, isFinalBusinessReport: true, taxDollars: true, generatedAt: true },
  });

  const selectedId = sp.id ?? reports[0]?.id ?? null;
  const selected = selectedId ? await prisma.complianceReport.findUnique({ where: { id: selectedId } }) : null;
  // Guard: ignore a stale ?id from the other form.
  const selectedForForm = selected && selected.formType === formType ? selected : null;

  const now = new Date();

  // plan-027 Unit 8 — the nearest open filing deadline, shown as a slim banner above both forms.
  const openForBanner = me.activeOrganizationId ? await openDeadlinesForTenant(me.activeOrganizationId, now, { horizonDays: 45 }) : [];
  const next = openForBanner[0];
  const banner = next ? (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 16,
        borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)", background: "var(--surface-sunken)", fontSize: 14,
      }}
    >
      <span
        aria-hidden
        style={{ width: 8, height: 8, borderRadius: "50%", flex: "none", background: next.tone === "danger" ? "var(--danger)" : next.tone === "warning" ? "var(--wine-primary)" : "var(--text-accent)" }}
      />
      <span>
        <strong>{deadlineTitle(next)}</strong> — {deadlineWhen(next)} (due {next.dueDateStr})
      </span>
    </div>
  ) : null;

  // ─────────────────────────── Excise return (TTB 5000.24) ───────────────────────────
  if (formType === "TTB_5000_24") {
    let view: ExciseView | null = null;
    if (selectedForForm) {
      const computed = selectedForForm.computed as unknown as ExciseComputed;
      const yearStart = new Date(Date.UTC(selectedForForm.periodStart.getUTCFullYear(), 0, 1));
      const filedEarlier =
        computed.ladder.ytdRemovedStart > 0
          ? await prisma.complianceReport.count({
              where: { ...formScope(EXCISE_FORM), status: "FILED", periodStart: { gte: yearStart }, periodEnd: { lt: selectedForForm.periodStart } },
            })
          : 1; // no prior removals → no gap
      const findings = deterministicExciseAnomalies({ snapshot: computed, priorUnfiledPeriodThisYear: filedEarlier === 0 });
      const dueDate = new Date(selectedForForm.periodEnd.getTime() + 14 * 86_400_000);
      view = {
        id: selectedForForm.id,
        periodStart: selectedForForm.periodStart.toISOString(),
        periodEnd: selectedForForm.periodEnd.toISOString(),
        periodLabel: `${selectedForForm.periodStart.toISOString().slice(0, 10)} → ${selectedForForm.periodEnd.toISOString().slice(0, 10)}`,
        dueDate: dueDate.toISOString(),
        cadence: asReturnCadence(selectedForForm.cadence),
        status: selectedForForm.status,
        version: selectedForForm.version,
        isFinalBusinessReport: selectedForForm.isFinalBusinessReport,
        remarks: selectedForForm.remarks,
        computed,
        findings,
      };
    }

    const defaultCadence = asReturnCadence(profile?.defaultReturnCadence ?? "SEMIMONTHLY");
    const isEftPayer = profile?.isEftPayer ?? false;
    const current = returnPeriodContaining(now, defaultCadence, isEftPayer);

    return (
      <div>
        {banner}
        <FormModeSwitch active={formType} />
        <ExciseClient
          key={view?.id ?? "none"}
          reports={reports.map((r) => ({
            id: r.id,
            label: `${r.periodEnd.toISOString().slice(0, 10)} · ${r.version}${r.status === "FILED" ? " · FILED" : " · draft"}${r.taxDollars != null ? ` · $${Number(r.taxDollars).toFixed(2)}` : ""}`,
          }))}
          view={view}
          defaults={{ year: now.getUTCFullYear(), cadence: defaultCadence, isEftPayer, periodIndex: current?.index ?? 0 }}
        />
      </div>
    );
  }

  // ─────────────────────────── Operations report (TTB 5120.17) ───────────────────────────
  const [vessels, bottledInv] = await Promise.all([
    prisma.vessel.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, include: { vesselLots: { select: { volumeL: true } } } }),
    prisma.bottledInventory.findMany({ where: { totalBottles: { gt: 0 } }, include: { wineSku: { select: { name: true, vintage: true } }, location: { select: { name: true } } } }),
  ]);

  let view: ReportView | null = null;
  if (selectedForForm) {
    const snapshot = selectedForForm.computed as unknown as ComputedSnapshot;
    const findings = deterministicAnomalies({ snapshot });
    view = {
      id: selectedForForm.id,
      periodStart: selectedForForm.periodStart.toISOString().slice(0, 10),
      periodEnd: selectedForForm.periodEnd.toISOString().slice(0, 10),
      periodLabel: selectedForForm.periodEnd.toISOString().slice(0, 7),
      cadence: asOpsCadence(selectedForForm.cadence),
      status: selectedForForm.status,
      version: selectedForForm.version,
      isFinalBusinessReport: selectedForForm.isFinalBusinessReport,
      remarks: selectedForForm.remarks,
      cells: snapshot.cells,
      footings: snapshot.footings,
      balanced: snapshot.balanced,
      a13EqualsB2: snapshot.a13EqualsB2,
      perLot: snapshot.perLot,
      overrides: (selectedForForm.overrides as Record<string, string>) ?? {},
      findings,
    };
  }

  const vesselOpts: VesselOpt[] = vessels
    .map((v) => ({ id: v.id, code: v.code, availableL: Math.round(v.vesselLots.reduce((a, r) => a + Number(r.volumeL), 0) * 100) / 100 }))
    .filter((v) => v.availableL > 0);

  const bottledOpts: BottledOpt[] = bottledInv.map((b) => ({
    value: `${b.wineSkuId}|${b.locationId}`,
    label: `${b.wineSku.name}${b.wineSku.vintage ? ` ${b.wineSku.vintage}` : ""} @ ${b.location.name} · ${b.totalBottles} btl`,
    bottles: b.totalBottles,
  }));

  return (
    <div>
      {banner}
      <FormModeSwitch active={formType} />
      <ComplianceClient
        key={view?.id ?? "none"}
        reports={reports.map((r) => ({
          id: r.id,
          label: `${r.periodEnd.toISOString().slice(0, 7)} · ${r.version}${r.status === "FILED" ? " · FILED" : " · draft"}${r.isFinalBusinessReport ? " · FINAL" : ""}`,
        }))}
        view={view}
        profile={{
          ein: profile?.ein ?? "",
          registryNumber: profile?.registryNumber ?? "",
          operatedByName: profile?.operatedByName ?? "",
          address: {
            street1: profile?.operatedByStreet1 ?? "",
            street2: profile?.operatedByStreet2 ?? "",
            city: profile?.operatedByCity ?? "",
            state: profile?.operatedByState ?? "",
            zip: profile?.operatedByZip ?? "",
          },
          operatedByPhone: profile?.operatedByPhone ?? "",
        }}
        vessels={vesselOpts}
        bottled={bottledOpts}
        defaults={{ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, cadence: asOpsCadence(profile?.defaultCadence ?? "MONTHLY") }}
      />
    </div>
  );
}
