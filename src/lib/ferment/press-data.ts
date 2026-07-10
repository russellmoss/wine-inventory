import { prisma } from "@/lib/prisma";

// Phase 6 Unit 9: data for the press form. A "pressable position" is a MUST lot sitting in a
// vessel — and ONLY a MUST lot. You press what came off the crusher: whites press immediately
// (MUST→JUICE), reds press off the skins when dry (MUST→WINE). JUICE is already off skins and
// WINE is already pressed (and sitting in barrel), so neither is pressable — surfacing them was a
// bug. The position carries its VesselLot.updatedAt as the `expectedRevision` token (council S7).

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

export type PressFormData = { positions: PressablePosition[]; vessels: PressDestVessel[]; pressCycles: string[] };

export function isPressableLotState(lot: { form: string; status: string }): boolean {
  return lot.form === "MUST" && lot.status === "ACTIVE";
}

export async function loadPressFormData(): Promise<PressFormData> {
  const positions = await prisma.vesselLot.findMany({
    where: { lot: { form: "MUST", status: "ACTIVE" } },
    select: {
      vesselId: true,
      volumeL: true,
      updatedAt: true,
      vessel: { select: { code: true } },
      lot: { select: { id: true, code: true, form: true, status: true, afState: true } },
    },
    orderBy: { vessel: { code: "asc" } },
  });

  const vessels = await prisma.vessel.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, capacityL: true },
  });

  const cycles = await prisma.pressCycle.findMany({ orderBy: { name: "asc" }, select: { name: true } });

  return {
    pressCycles: cycles.map((c) => c.name),
    positions: positions
      .filter((p) => isPressableLotState(p.lot))
      .map((p) => ({
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
