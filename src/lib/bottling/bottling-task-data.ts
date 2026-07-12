import { prisma } from "@/lib/prisma";
import { round2 } from "@/lib/bottling/draw";
import { materialDisplayName } from "@/lib/cellar/materials-shared";
import type { MaterialPickerOption } from "@/components/work-orders/MaterialFilterPicker";

// Plan 053 E15: run-time data for the work-order bottling sub-form. A "source vessel" is any active vessel
// currently holding wine (positive volume in the ledger projection); the crew picks which to bottle from,
// the bottle count + measured ABV + destination on the execute screen. Mirrors loadPressFormData's shape.
// Plan 056: also the PACKAGING materials (+ on-hand) the crew records as consumed dry goods at completion.

export type BottlingSourceVessel = { id: string; code: string; volumeL: number; lotSummary: string };
export type BottlingDestLocation = { id: string; name: string };
export type BottlingTaskFormData = {
  vessels: BottlingSourceVessel[];
  locations: BottlingDestLocation[];
  packagingOptions: MaterialPickerOption[];
};

export async function loadBottlingTaskFormData(): Promise<BottlingTaskFormData> {
  const rows = await prisma.vesselLot.findMany({
    where: { volumeL: { gt: 0 } },
    select: {
      vesselId: true,
      volumeL: true,
      vessel: { select: { code: true, isActive: true } },
      lot: { select: { code: true, form: true } },
    },
    orderBy: { vessel: { code: "asc" } },
  });

  const byVessel = new Map<string, { code: string; volumeL: number; lots: string[] }>();
  for (const r of rows) {
    if (!r.vessel.isActive) continue;
    const e = byVessel.get(r.vesselId) ?? { code: r.vessel.code, volumeL: 0, lots: [] };
    e.volumeL += Number(r.volumeL);
    e.lots.push(`${r.lot.code} · ${r.lot.form.toLowerCase()}`);
    byVessel.set(r.vesselId, e);
  }
  const vessels: BottlingSourceVessel[] = [...byVessel.entries()].map(([id, e]) => ({
    id,
    code: e.code,
    volumeL: round2(e.volumeL),
    lotSummary: e.lots.join(", "),
  }));

  const locations = await prisma.location.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Plan 056: PACKAGING (+ generic OTHER) materials with on-hand for the packaging-consumed picker. The
  // picker scopes to PACKAGING/OTHER client-side (materialScopeForTask); on-hand comes from open SupplyLots.
  const [materials, onHand] = await Promise.all([
    prisma.cellarMaterial.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, stockUnit: true, kind: true, category: true, subcategory: true, isStockTracked: true, genericName: true, brandName: true, preferGeneric: true },
    }),
    prisma.supplyLot.groupBy({ by: ["materialId"], where: { qtyRemaining: { gt: 0 } }, _sum: { qtyRemaining: true } }),
  ]);
  const onHandByMaterial = new Map(onHand.map((g) => [g.materialId, Number(g._sum.qtyRemaining ?? 0)]));
  const packagingOptions: MaterialPickerOption[] = materials.map((m) => ({
    id: m.id,
    label: materialDisplayName(m),
    unit: m.stockUnit,
    kind: m.kind,
    category: m.category,
    subcategory: m.subcategory,
    onHand: m.isStockTracked ? (onHandByMaterial.get(m.id) ?? 0) : null,
  }));

  return { vessels, locations: locations.map((l) => ({ id: l.id, name: l.name })), packagingOptions };
}
