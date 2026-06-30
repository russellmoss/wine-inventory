import { prisma } from "@/lib/prisma";
import { detectStuck, type BrixReading } from "@/lib/ferment/stuck";
import type { AlcoholicFermState, MalolacticState, LotForm } from "@/lib/ledger/vocabulary";

// Phase 6 Unit 8: load the active-fermenting positions for the Round grid. Read from `vessel_lot`
// (the authoritative ledger projection), NOT `vessel_component` — the component projection skips
// blend lots with a null origin, so a fermenting blend would be invisible (known gotcha). One row
// per (vessel, fermenting lot): a lot is "active-fermenting" when afState=ACTIVE OR mlfState=ACTIVE.

export type RoundRow = {
  vesselId: string;
  vesselCode: string;
  vesselType: string;
  lotId: string;
  lotCode: string;
  form: LotForm;
  afState: AlcoholicFermState;
  mlfState: MalolacticState;
  volumeL: number;
  previousBrix: number | null; // most recent non-voided BRIX reading, for the grey "prev" hint
  stuck: boolean; // DERIVED stuck signal (afState=ACTIVE, Brix flat above the floor)
  occupancyToken: string; // the as-of signature the tablet carries on every capture (S5)
};

export async function loadRoundRows(): Promise<RoundRow[]> {
  // Authoritative projection: positions whose lot is actively fermenting.
  const positions = await prisma.vesselLot.findMany({
    where: { lot: { OR: [{ afState: "ACTIVE" }, { mlfState: "ACTIVE" }] } },
    include: {
      vessel: { select: { id: true, code: true, type: true } },
      lot: { select: { id: true, code: true, form: true, afState: true, mlfState: true } },
    },
  });

  if (positions.length === 0) return [];

  // Latest non-voided BRIX per lot, in one pass (panel carries the time axis + void flag).
  const lotIds = [...new Set(positions.map((p) => p.lotId))];
  const brixReadings = await prisma.analysisReading.findMany({
    where: { analyte: "BRIX", panel: { lotId: { in: lotIds }, voidedAt: null } },
    select: { value: true, panel: { select: { lotId: true, observedAt: true } } },
    orderBy: { panel: { observedAt: "desc" } },
  });
  const prevBrixByLot = new Map<string, number>();
  const seriesByLot = new Map<string, BrixReading[]>();
  for (const r of brixReadings) {
    if (!prevBrixByLot.has(r.panel.lotId)) prevBrixByLot.set(r.panel.lotId, Number(r.value)); // first = latest
    const arr = seriesByLot.get(r.panel.lotId) ?? [];
    arr.push({ observedAt: r.panel.observedAt, brix: Number(r.value) });
    seriesByLot.set(r.panel.lotId, arr);
  }

  return positions
    .map((p) => ({
      vesselId: p.vesselId,
      vesselCode: p.vessel.code,
      vesselType: p.vessel.type,
      lotId: p.lotId,
      lotCode: p.lot.code,
      form: p.lot.form as LotForm,
      afState: p.lot.afState as AlcoholicFermState,
      mlfState: p.lot.mlfState as MalolacticState,
      volumeL: Number(p.volumeL),
      previousBrix: prevBrixByLot.get(p.lotId) ?? null,
      stuck: detectStuck(seriesByLot.get(p.lotId) ?? [], { afState: p.lot.afState as AlcoholicFermState }).stuck,
      occupancyToken: `${p.vesselId}:${p.lotId}`,
    }))
    .sort((a, b) => a.vesselCode.localeCompare(b.vesselCode, undefined, { numeric: true }));
}
