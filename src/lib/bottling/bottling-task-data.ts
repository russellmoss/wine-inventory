import { prisma } from "@/lib/prisma";
import { round2 } from "@/lib/bottling/draw";

// Plan 053 E15: run-time data for the work-order bottling sub-form. A "source vessel" is any active vessel
// currently holding wine (positive volume in the ledger projection); the crew picks which to bottle from,
// the bottle count + measured ABV + destination on the execute screen. Mirrors loadPressFormData's shape.

export type BottlingSourceVessel = { id: string; code: string; volumeL: number; lotSummary: string };
export type BottlingDestLocation = { id: string; name: string };
export type BottlingTaskFormData = { vessels: BottlingSourceVessel[]; locations: BottlingDestLocation[] };

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

  return { vessels, locations: locations.map((l) => ({ id: l.id, name: l.name })) };
}
