import { requireAdmin } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { deterministicAnomalies } from "@/lib/compliance/anomaly";
import type { ComputedSnapshot } from "@/lib/compliance/generate";
import { ComplianceClient, type ReportView, type VesselOpt, type BottledOpt } from "./ComplianceClient";

export default async function CompliancePage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;

  const [reports, profile, vessels, bottledInv] = await Promise.all([
    prisma.complianceReport.findMany({
      orderBy: [{ periodEnd: "desc" }, { generatedAt: "desc" }],
      take: 24,
      select: { id: true, periodStart: true, periodEnd: true, cadence: true, status: true, version: true, isFinalBusinessReport: true, generatedAt: true },
    }),
    prisma.complianceProfile.findFirst(),
    prisma.vessel.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      include: { vesselLots: { select: { volumeL: true } } },
    }),
    prisma.bottledInventory.findMany({
      where: { totalBottles: { gt: 0 } },
      include: { wineSku: { select: { name: true, vintage: true } }, location: { select: { name: true } } },
    }),
  ]);

  const selectedId = sp.id ?? reports[0]?.id ?? null;
  const selected = selectedId
    ? await prisma.complianceReport.findUnique({ where: { id: selectedId } })
    : null;

  let view: ReportView | null = null;
  if (selected) {
    const snapshot = selected.computed as unknown as ComputedSnapshot;
    const findings = deterministicAnomalies({ snapshot });
    view = {
      id: selected.id,
      periodStart: selected.periodStart.toISOString().slice(0, 10),
      periodEnd: selected.periodEnd.toISOString().slice(0, 10),
      periodLabel: selected.periodEnd.toISOString().slice(0, 7),
      cadence: selected.cadence,
      status: selected.status,
      version: selected.version,
      isFinalBusinessReport: selected.isFinalBusinessReport,
      remarks: selected.remarks,
      cells: snapshot.cells,
      footings: snapshot.footings,
      balanced: snapshot.balanced,
      a13EqualsB2: snapshot.a13EqualsB2,
      perLot: snapshot.perLot,
      overrides: (selected.overrides as Record<string, string>) ?? {},
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

  const now = new Date();
  return (
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
      defaults={{ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, cadence: profile?.defaultCadence ?? "MONTHLY" }}
    />
  );
}
