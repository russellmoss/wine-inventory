import "server-only";
import { prisma } from "@/lib/prisma";

// Phase 7 Unit 12: read models for the En Tirage worklist + the Tirage form's source candidates.

export type WorklistRow = {
  lotId: string;
  code: string;
  bottleCount: number;
  volumeL: number;
  nominalFillMl: number;
  method: string;
  stage: string;
  afState: string;
  tirageAt: string; // YYYY-MM-DD
  monthsOnLees: number;
  locationName: string | null;
  dosageStyle: string | null;
};

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;

export async function getEnTirageWorklist(now: Date = new Date()): Promise<WorklistRow[]> {
  const states = await prisma.bottledLotState.findMany({
    include: { lot: { select: { code: true, afState: true, status: true } }, location: { select: { name: true } } },
    orderBy: { tirageAt: "asc" }, // oldest on lees first (closest to ready-to-disgorge)
  });
  return states
    .filter((s) => s.lot.status === "ACTIVE")
    .map((s) => ({
      lotId: s.lotId,
      code: s.lot.code,
      bottleCount: s.bottleCount,
      volumeL: Number(s.volumeL),
      nominalFillMl: s.nominalFillMl,
      method: s.method,
      stage: s.stage,
      afState: s.lot.afState,
      tirageAt: s.tirageAt.toISOString().slice(0, 10),
      monthsOnLees: Math.round(((now.getTime() - s.tirageAt.getTime()) / MS_PER_MONTH) * 10) / 10,
      locationName: s.location?.name ?? null,
      dosageStyle: s.dosageStyle,
    }));
}

export type TirageCandidate = { vesselId: string; vesselCode: string; lotId: string; lotCode: string; volumeL: number; vintage: number | null };

/** Bulk WINE lots (in a vessel) eligible to go to tirage. */
export async function getTirageCandidates(): Promise<TirageCandidate[]> {
  const rows = await prisma.vesselLot.findMany({
    where: { lot: { form: "WINE", status: "ACTIVE" } },
    include: { vessel: { select: { code: true } }, lot: { select: { code: true, vintageYear: true } } },
    orderBy: { volumeL: "desc" },
  });
  return rows.map((r) => ({ vesselId: r.vesselId, vesselCode: r.vessel.code, lotId: r.lotId, lotCode: r.lot.code, volumeL: Number(r.volumeL), vintage: r.lot.vintageYear }));
}

export async function getActiveLocations(): Promise<{ id: string; name: string }[]> {
  return prisma.location.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

export async function getLiqueurMaterials(): Promise<{ id: string; name: string }[]> {
  return prisma.cellarMaterial.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}
