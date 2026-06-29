import "server-only";
import { prisma } from "@/lib/prisma";
import { scaleTrialToVolume } from "@/lib/blend/trial-math";

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

// ─────────────────────── Bench trials (Unit 9) ───────────────────────

export type TrialComponentRow = { lotId: string; code: string; proportion: number | null; volume: number | null; unit: string | null };
export type TrialRow = {
  id: string;
  name: string;
  targetWine: string | null;
  note: string | null;
  status: string;
  score: number | null;
  scoreScale: string | null;
  readiness: string | null;
  tastingNotes: string | null;
  promotedToLotId: string | null;
  components: TrialComponentRow[];
};

export async function listTrials(): Promise<TrialRow[]> {
  const trials = await prisma.blendTrial.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { components: { include: { lot: { select: { code: true } } } } },
  });
  return trials.map((t) => ({
    id: t.id,
    name: t.name,
    targetWine: t.targetWine,
    note: t.note,
    status: t.status,
    score: t.score,
    scoreScale: t.scoreScale,
    readiness: t.readiness,
    tastingNotes: t.tastingNotes,
    promotedToLotId: t.promotedToLotId,
    components: t.components.map((c) => ({
      lotId: c.lotId,
      code: c.lot.code,
      proportion: c.proportion == null ? null : Number(c.proportion),
      volume: c.volume == null ? null : Number(c.volume),
      unit: c.unit,
    })),
  }));
}

export type TrialPrefillComponent = {
  vesselId: string;
  vesselCode: string;
  lotId: string;
  code: string;
  available: number;
  litres: number;
  depleted: boolean;
};
export type TrialPrefill = {
  trialId: string;
  name: string;
  components: TrialPrefillComponent[];
  anyDepleted: boolean;
};

/**
 * Promote prefill (council S6): scale the trial's ratios to the LARGEST blend that fits all
 * components at the current cellar (auto-sized to the binding constraint), picking each lot's
 * largest current vessel position. Components whose lot has drained since the trial are flagged
 * (depleted) rather than silently mis-scaled — the winemaker tweaks litres at the tank.
 */
export async function getTrialPrefill(trialId: string): Promise<TrialPrefill | null> {
  const trial = await prisma.blendTrial.findUnique({
    where: { id: trialId },
    include: { components: { include: { lot: { select: { code: true } } } } },
  });
  if (!trial) return null;

  const lotIds = trial.components.map((c) => c.lotId);
  const vesselLots = await prisma.vesselLot.findMany({
    where: { lotId: { in: lotIds } },
    orderBy: { volumeL: "desc" },
    include: { vessel: { select: { id: true, code: true, isActive: true } } },
  });
  // Each lot's largest ACTIVE vessel position.
  const bestByLot = new Map<string, { vesselId: string; vesselCode: string; available: number }>();
  for (const vl of vesselLots) {
    if (!vl.vessel.isActive) continue;
    if (!bestByLot.has(vl.lotId)) {
      bestByLot.set(vl.lotId, { vesselId: vl.vessel.id, vesselCode: vl.vessel.code, available: Number(vl.volumeL) });
    }
  }

  // Ratios from the trial (proportion ?? volume). Auto-size to the binding constraint.
  const weights = trial.components.map((c) => ({ lotId: c.lotId, w: Number(c.proportion ?? c.volume ?? 0) }));
  const totalW = weights.reduce((a, x) => a + x.w, 0) || 1;
  let maxTarget = Infinity;
  for (const wgt of weights) {
    const ratio = wgt.w / totalW;
    const avail = bestByLot.get(wgt.lotId)?.available ?? 0;
    if (ratio > 0) maxTarget = Math.min(maxTarget, avail / ratio);
  }
  if (!Number.isFinite(maxTarget)) maxTarget = 0;
  const scaled = scaleTrialToVolume(weights.map((w) => ({ lotId: w.lotId, proportion: w.w })), maxTarget);
  const litresByLot = new Map(scaled.map((s) => [s.lotId, s.litres]));

  const components: TrialPrefillComponent[] = trial.components.map((c) => {
    const best = bestByLot.get(c.lotId);
    return {
      vesselId: best?.vesselId ?? "",
      vesselCode: best?.vesselCode ?? "—",
      lotId: c.lotId,
      code: c.lot.code,
      available: best?.available ?? 0,
      litres: litresByLot.get(c.lotId) ?? 0,
      depleted: !best,
    };
  });
  return { trialId: trial.id, name: trial.name, components, anyDepleted: components.some((c) => c.depleted) };
}
