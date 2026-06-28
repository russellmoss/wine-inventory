import { prisma } from "@/lib/prisma";
import { classifyBlend } from "@/lib/bulk/blend";
import { computeFill } from "@/lib/vessels/fill";
import { listMaterials } from "@/lib/cellar/materials";
import { listGroups } from "@/lib/vessels/groups";
import { BulkClient, type VesselWithContents, type Option, type BlockOption, type SubblockOption } from "./BulkClient";

export default async function BulkPage() {
  const [vessels, varieties, vineyards, blocks, subblocks, materials, groups] = await Promise.all([
    prisma.vessel.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      include: {
        components: {
          orderBy: { volumeL: "desc" },
          include: { variety: { select: { id: true, name: true } }, vineyard: { select: { id: true, name: true } } },
        },
        // Ledger projection: the lots resident in each vessel, for lot-code badges in the picker
        // and the Phase 4 chemistry-record lot picker (D2 single-lot resolution).
        vesselLots: { orderBy: { volumeL: "desc" }, include: { lot: { select: { id: true, code: true, originVarietyId: true } } } },
      },
    }),
    prisma.variety.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.vineyard.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.vineyardBlock.findMany({
      orderBy: [{ sortOrder: "asc" }],
      select: { id: true, vineyardId: true, blockLabel: true, code: true },
    }),
    prisma.vineyardSubblock.findMany({
      orderBy: [{ sortOrder: "asc" }],
      select: { id: true, blockId: true, code: true, label: true },
    }),
    listMaterials(),
    listGroups(),
  ]);

  const varietyNameById = new Map(varieties.map((v) => [v.id, v.name]));

  const data: VesselWithContents[] = vessels.map((v) => {
    const comps = v.components.map((c) => ({
      id: c.id,
      varietyId: c.variety.id,
      varietyName: c.variety.name,
      vineyardName: c.vineyard.name,
      vintage: c.vintage,
      volumeL: Number(c.volumeL),
    }));
    const blend = classifyBlend(comps.map((c) => ({ varietyId: c.varietyId, varietyName: c.varietyName, volumeL: c.volumeL })));
    const fill = computeFill(comps.map((c) => c.volumeL), Number(v.capacityL));
    return {
      id: v.id,
      code: v.code,
      type: v.type,
      capacityL: Number(v.capacityL),
      blendName: v.blendName,
      components: comps,
      blend,
      fill,
      oakOrigin: v.oakOrigin,
      cooperageYear: v.cooperageYear,
      cooperage: v.cooperage,
      toastLevel: v.toastLevel,
      lotCodes: v.vesselLots.map((vl) => vl.lot.code),
      residentLots: v.vesselLots.map((vl) => ({
        lotId: vl.lotId,
        code: vl.lot.code,
        varietyName: vl.lot.originVarietyId ? varietyNameById.get(vl.lot.originVarietyId) ?? null : null,
      })),
    };
  });

  // Natural sort: codes are strings ("1","2","10"), so sort numerically not lexically.
  data.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  return (
    <BulkClient
      vessels={data}
      varieties={varieties as Option[]}
      vineyards={vineyards as Option[]}
      blocks={blocks as BlockOption[]}
      subblocks={subblocks as SubblockOption[]}
      materials={materials}
      groups={groups}
    />
  );
}
