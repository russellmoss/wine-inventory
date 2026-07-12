import { prisma } from "@/lib/prisma";
import { BottlingClient, type VesselOpt, type RunRow } from "./BottlingClient";
import { materialDisplayName } from "@/lib/cellar/materials-shared";
import type { MaterialPickerOption } from "@/components/work-orders/MaterialFilterPicker";

export default async function BottlingPage() {
  const [vessels, locations, runs, packagingMaterials, packagingOnHand] = await Promise.all([
    prisma.vessel.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      include: { components: { include: { variety: { select: { name: true } }, vineyard: { select: { name: true } } } } },
    }),
    prisma.location.findMany({ where: { isActive: true }, orderBy: [{ isSystem: "desc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.bottlingRun.findMany({
      // Plan 056: a reversed run (append-only) keeps its rows but carries a reversing snapshot — hide it.
      where: { NOT: { costSnapshots: { some: { reversalOfSnapshotId: { not: null } } } } },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        wineSku: { select: { name: true, vintage: true } },
        destinationLocation: { select: { name: true } },
        sources: { include: { variety: { select: { name: true } }, vineyard: { select: { name: true } } } },
      },
    }),
    prisma.cellarMaterial.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, stockUnit: true, kind: true, category: true, subcategory: true, isStockTracked: true, genericName: true, brandName: true, preferGeneric: true },
    }),
    prisma.supplyLot.groupBy({ by: ["materialId"], where: { qtyRemaining: { gt: 0 } }, _sum: { qtyRemaining: true } }),
  ]);
  const onHandByMaterial = new Map(packagingOnHand.map((g) => [g.materialId, Number(g._sum.qtyRemaining ?? 0)]));
  const packagingOptions: MaterialPickerOption[] = packagingMaterials.map((m) => ({
    id: m.id, label: materialDisplayName(m), unit: m.stockUnit, kind: m.kind, category: m.category, subcategory: m.subcategory,
    onHand: m.isStockTracked ? (onHandByMaterial.get(m.id) ?? 0) : null,
  }));

  const vesselOpts: VesselOpt[] = vessels
    .slice()
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
    .map((v) => ({
      id: v.id,
      code: v.code,
      type: v.type,
      availableL: Math.round(v.components.reduce((a, c) => a + Number(c.volumeL), 0) * 100) / 100,
      contents: v.components.map((c) => `${c.variety.name} · ${c.vineyard.name} · ${c.vintage} (${Number(c.volumeL)} L)`),
    }));

  const runRows: RunRow[] = runs.map((r) => ({
    id: r.id,
    date: r.date.toISOString().slice(0, 10),
    skuName: r.wineSku.name,
    skuVintage: r.wineSku.vintage,
    bottlesProduced: r.bottlesProduced,
    destinationLocationId: r.destinationLocationId,
    location: r.destinationLocation.name,
    bottledAbv: r.bottledAbv == null ? null : Number(r.bottledAbv),
    vesselIds: [...new Set(r.sources.map((s) => s.vesselId).filter((v): v is string => v !== null))],
    sources: r.sources.map((s) => `${s.variety?.name ?? "—"} · ${s.vineyard?.name ?? "—"} · ${s.vintage ?? "NV"}: ${Number(s.volumeConsumedL)} L`),
  }));

  return <BottlingClient vessels={vesselOpts} locations={locations} runs={runRows} packagingOptions={packagingOptions} />;
}
