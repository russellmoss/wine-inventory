import { prisma } from "@/lib/prisma";
import { canManagerAccessVineyard } from "@/lib/access";
import { getActionUser } from "@/lib/actions";

// Phase 6 Unit 9: data for the crush form. Picks are vineyard-scoped, so we only surface blocks
// the user can access (admins see all). "Remaining kg" is DERIVED: weightKg − Σ already-consumed
// (LotHarvestSource) — the single source of truth (council S8).

export type CrushPickOption = {
  pickId: string;
  pickDate: string;
  weightKg: number;
  remainingKg: number;
  brixAtPick: number | null;
};

export type CrushBlockOption = {
  blockId: string;
  vineyardId: string;
  label: string; // "Vineyard · Block"
  varietyId: string | null;
  vintageYear: number;
  picks: CrushPickOption[];
};

export type CrushVesselOption = {
  id: string;
  code: string;
  type: string;
  capacityL: number;
  // existing MUST/JUICE lots resident here (for sequential-fill ADD)
  mustLots: { lotId: string; code: string; volumeL: number }[];
};

export type CrushFormData = { blocks: CrushBlockOption[]; vessels: CrushVesselOption[] };

export async function loadCrushFormData(): Promise<CrushFormData> {
  const user = await getActionUser();

  const records = await prisma.harvestRecord.findMany({
    orderBy: [{ vintageYear: "desc" }],
    select: {
      vintageYear: true,
      vineyardId: true,
      block: { select: { id: true, blockLabel: true, code: true, varietyId: true, vineyard: { select: { name: true } } } },
      picks: { orderBy: { pickDate: "asc" }, select: { id: true, pickDate: true, weightKg: true, brixAtPick: true } },
    },
  });

  // Σ consumed per pick, in one query.
  const pickIds = records.flatMap((r) => r.picks.map((p) => p.id));
  const consumed = pickIds.length
    ? await prisma.lotHarvestSource.groupBy({
        by: ["harvestPickId"],
        where: { harvestPickId: { in: pickIds } },
        _sum: { consumedKg: true },
      })
    : [];
  const consumedByPick = new Map(consumed.map((c) => [c.harvestPickId, Number(c._sum.consumedKg ?? 0)]));

  const blocks: CrushBlockOption[] = records
    .filter((r) => r.block && canManagerAccessVineyard(user, r.vineyardId))
    .map((r) => {
      const picks = r.picks
        .map((p) => {
          const remaining = Math.round((Number(p.weightKg) - (consumedByPick.get(p.id) ?? 0)) * 1000) / 1000;
          return {
            pickId: p.id,
            pickDate: p.pickDate.toISOString().slice(0, 10),
            weightKg: Number(p.weightKg),
            remainingKg: remaining,
            brixAtPick: p.brixAtPick != null ? Number(p.brixAtPick) : null,
          };
        })
        .filter((p) => p.remainingKg > 0.001); // only picks with fruit left to crush
      return {
        blockId: r.block!.id,
        vineyardId: r.vineyardId,
        label: `${r.block!.vineyard.name} · ${r.block!.blockLabel ?? r.block!.code ?? "block"}`,
        varietyId: r.block!.varietyId,
        vintageYear: r.vintageYear,
        picks,
      };
    })
    .filter((b) => b.picks.length > 0);

  const vessels = await prisma.vessel.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      type: true,
      capacityL: true,
      vesselLots: {
        where: { lot: { form: { in: ["MUST", "JUICE"] }, status: "ACTIVE" } },
        select: { volumeL: true, lot: { select: { id: true, code: true } } },
      },
    },
  });

  return {
    blocks,
    vessels: vessels.map((v) => ({
      id: v.id,
      code: v.code,
      type: v.type,
      capacityL: Number(v.capacityL),
      mustLots: v.vesselLots.map((vl) => ({ lotId: vl.lot.id, code: vl.lot.code, volumeL: Number(vl.volumeL) })),
    })),
  };
}
