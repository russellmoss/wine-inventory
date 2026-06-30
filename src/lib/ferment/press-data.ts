import { prisma } from "@/lib/prisma";

// Phase 6 Unit 9: data for the press form. A "pressable position" is a MUST/JUICE/WINE lot sitting
// in a vessel (you press what's in a tank). The position carries its VesselLot.updatedAt as the
// `expectedRevision` token so a concurrent change between open + submit is caught (council S7).

export type PressablePosition = {
  vesselId: string;
  vesselCode: string;
  lotId: string;
  lotCode: string;
  form: string;
  afState: string;
  volumeL: number;
  revision: string; // VesselLot.updatedAt ISO — the optimistic-concurrency token
};

export type PressDestVessel = { id: string; code: string; capacityL: number };

export type PressFormData = { positions: PressablePosition[]; vessels: PressDestVessel[] };

export async function loadPressFormData(): Promise<PressFormData> {
  const positions = await prisma.vesselLot.findMany({
    where: { lot: { form: { in: ["MUST", "JUICE", "WINE"] }, status: "ACTIVE" } },
    select: {
      vesselId: true,
      volumeL: true,
      updatedAt: true,
      vessel: { select: { code: true } },
      lot: { select: { id: true, code: true, form: true, afState: true } },
    },
    orderBy: { vessel: { code: "asc" } },
  });

  const vessels = await prisma.vessel.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, capacityL: true },
  });

  return {
    positions: positions.map((p) => ({
      vesselId: p.vesselId,
      vesselCode: p.vessel.code,
      lotId: p.lot.id,
      lotCode: p.lot.code,
      form: p.lot.form,
      afState: p.lot.afState,
      volumeL: Number(p.volumeL),
      revision: p.updatedAt.toISOString(),
    })),
    vessels: vessels.map((v) => ({ id: v.id, code: v.code, capacityL: Number(v.capacityL) })),
  };
}
