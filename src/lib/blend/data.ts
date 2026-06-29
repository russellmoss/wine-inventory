import "server-only";
import { prisma } from "@/lib/prisma";

// Read-model for the blend builder + bench trials: every active vessel with its resident lots
// (the source positions a blend draws from) and a current fill, plus resolved origin names for
// the live composition rollup. Origin has no FK, so names come from a single batched lookup.

export type BlendSourceLot = {
  lotId: string;
  code: string;
  volumeL: number;
  varietyName: string | null;
  vineyardName: string | null;
  vintageYear: number | null;
};

export type BlendVessel = {
  id: string;
  code: string;
  type: string;
  capacityL: number;
  filledL: number;
  residents: BlendSourceLot[];
};

type SnapshotLike = { varietyName?: string | null; vineyardName?: string | null } | null;

export async function listBlendVessels(): Promise<BlendVessel[]> {
  const vessels = await prisma.vessel.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    include: {
      vesselLots: {
        orderBy: { volumeL: "desc" },
        include: {
          lot: {
            select: {
              id: true,
              code: true,
              vintageYear: true,
              originVarietyId: true,
              originVineyardId: true,
              legacySnapshot: true,
            },
          },
        },
      },
    },
  });

  const varietyIds = new Set<string>();
  const vineyardIds = new Set<string>();
  for (const v of vessels)
    for (const vl of v.vesselLots) {
      if (vl.lot.originVarietyId) varietyIds.add(vl.lot.originVarietyId);
      if (vl.lot.originVineyardId) vineyardIds.add(vl.lot.originVineyardId);
    }
  const [vars, vys] = await Promise.all([
    varietyIds.size ? prisma.variety.findMany({ where: { id: { in: [...varietyIds] } }, select: { id: true, name: true } }) : Promise.resolve([]),
    vineyardIds.size ? prisma.vineyard.findMany({ where: { id: { in: [...vineyardIds] } }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const varietyName = new Map(vars.map((v) => [v.id, v.name]));
  const vineyardName = new Map(vys.map((v) => [v.id, v.name]));

  return vessels.map((v) => {
    const residents: BlendSourceLot[] = v.vesselLots.map((vl) => {
      const snap = (vl.lot.legacySnapshot as SnapshotLike) ?? null;
      return {
        lotId: vl.lot.id,
        code: vl.lot.code,
        volumeL: Number(vl.volumeL),
        varietyName: (vl.lot.originVarietyId ? varietyName.get(vl.lot.originVarietyId) ?? null : null) ?? snap?.varietyName ?? null,
        vineyardName: (vl.lot.originVineyardId ? vineyardName.get(vl.lot.originVineyardId) ?? null : null) ?? snap?.vineyardName ?? null,
        vintageYear: vl.lot.vintageYear,
      };
    });
    const filledL = Math.round(residents.reduce((a, r) => a + r.volumeL, 0) * 100) / 100;
    return { id: v.id, code: v.code, type: v.type, capacityL: Number(v.capacityL), filledL, residents };
  });
}
