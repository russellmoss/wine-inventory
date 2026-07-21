import { prisma } from "@/lib/prisma";
import { requireActiveTenant } from "@/lib/dal";
import { computeFill } from "@/lib/vessels/fill";
import { VesselsClient, type VesselRow } from "./VesselsClient";

export default async function VesselsPage() {
  await requireActiveTenant();
  const vessels = await prisma.vessel.findMany({
    include: {
      // What the wine is MADE OF (variety / vineyard / vintage, attributed through lineage).
      components: {
        orderBy: { volumeL: "desc" },
        include: { variety: { select: { name: true } }, vineyard: { select: { name: true } } },
      },
      // The vessel's wine (LEDGER-12 = at most one row) and the authoritative fill.
      vesselLots: { orderBy: { volumeL: "desc" }, include: { lot: { select: { id: true, code: true } } } },
    },
  });
  // Natural sort: codes are strings ("1","2","10"), so sort numerically not lexically.
  vessels.sort((a, b) =>
    a.isActive !== b.isActive
      ? (a.isActive ? -1 : 1)
      : a.code.localeCompare(b.code, undefined, { numeric: true }),
  );

  const rows: VesselRow[] = vessels.map((v) => {
    // Fill comes from the LEDGER, not the component sum. They agree whenever provenance is complete,
    // but a lot with no recorded origin has no component rows at all — summing those would report an
    // occupied vessel as empty. `vessel_lot` is the projection the rest of the app trusts.
    const fill = computeFill(
      v.vesselLots.map((vl) => Number(vl.volumeL)),
      Number(v.capacityL),
    );
    return {
      id: v.id,
      code: v.code,
      type: v.type,
      capacityL: Number(v.capacityL),
      isActive: v.isActive,
      componentCount: v.components.length,
      filledL: fill.filledL,
      pct: fill.pct,
      over: fill.over,
      oakOrigin: v.oakOrigin,
      cooperageYear: v.cooperageYear,
      cooperage: v.cooperage,
      toastLevel: v.toastLevel,
      wine: v.vesselLots[0] ? { lotId: v.vesselLots[0].lotId, code: v.vesselLots[0].lot.code } : null,
      components: v.components.map((c) => ({
        varietyName: c.variety.name,
        vineyardName: c.vineyard.name,
        vintage: c.vintage,
        volumeL: Number(c.volumeL),
      })),
    };
  });

  return <VesselsClient vessels={rows} />;
}
