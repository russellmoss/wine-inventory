import "server-only";
import { prisma } from "@/lib/prisma";
import { dedupeByPhysicalReading } from "@/lib/chemistry/fanout-plan";
import { tankDetailFacts, type TankDetailFacts, type TankReading } from "./tank-detail-facts";

/**
 * The Brix + temperature series for one tank (DM-43).
 *
 * SOURCING RULE (plan 103, OD-P6-3). There are two rules in this codebase for "which panels
 * belong to this vessel":
 *
 *   - `ferment/worksheet-data.ts` filters by the resident LOT ids.
 *   - `chemistry/data.ts` (`listVesselAnalyses`) filters `vesselId` OR a null-snapshot panel
 *     on a resident lot.
 *
 * The Analyses tab renders `AnalyteTrends`, which uses the second. If this used the first,
 * the SAME PAGE would state two different "latest Brix" — which is AC-S27 failing in the
 * most confusing possible direction. So this matches `listVesselAnalyses` exactly, and any
 * change to one is a change to both.
 *
 * `voidedAt: null` because a voided panel is a correction, not history to plot.
 * `dedupeByPhysicalReading` because plan 060 fanned one whole-tank reading out to one panel
 * per co-resident lot; those legacy rows are real, and without the dedupe the chart plots the
 * same reading two or three times and drags the curve.
 */

/** Newest-first cap. A ferment is days, not years; this is a plotting window, not an archive. */
const MAX_PANELS = 400;
const MAX_NOTES = 50;

export type TankTastingNote = {
  id: string;
  observedAt: string;
  enteredByEmail: string;
  score: number | null;
  appearance: string | null;
  aroma: string | null;
  flavor: string | null;
  notes: string | null;
};

export type TankDetail = {
  facts: TankDetailFacts;
  /** Panels considered after void-exclusion and fan-out dedupe. */
  panelCount: number;
  /** DM-46. Scoped to the lots currently resident, so it follows the wine, not the steel. */
  tastingNotes: TankTastingNote[];
};

export async function loadTankDetail(vesselId: string): Promise<TankDetail> {
  const residents = await prisma.vesselLot.findMany({ where: { vesselId }, select: { lotId: true } });
  const residentLotIds = residents.map((r) => r.lotId);

  const [rows, noteRows] = await Promise.all([
    prisma.analysisPanel.findMany({
      where: {
        voidedAt: null,
        OR: [
          { vesselId },
          ...(residentLotIds.length ? [{ vesselId: null, lotId: { in: residentLotIds } }] : []),
        ],
      },
      orderBy: { observedAt: "desc" },
      take: MAX_PANELS,
      select: {
        id: true,
        vesselReadingGroupId: true,
        observedAt: true,
        readings: { where: { analyte: { in: ["BRIX", "TEMP"] } }, select: { analyte: true, value: true } },
      },
    }),
    residentLotIds.length
      ? prisma.lotTastingNote.findMany({
          where: { lotId: { in: residentLotIds }, voidedAt: null },
          orderBy: { observedAt: "desc" },
          take: MAX_NOTES,
          select: { id: true, observedAt: true, enteredByEmail: true, score: true, appearance: true, aroma: true, flavor: true, notes: true },
        })
      : Promise.resolve([]),
  ]);

  const panels = dedupeByPhysicalReading(rows);

  const readings: TankReading[] = panels.map((p) => {
    const brix = p.readings.find((r) => r.analyte === "BRIX");
    const temp = p.readings.find((r) => r.analyte === "TEMP");
    return {
      observedAt: p.observedAt.toISOString(),
      brix: brix ? Number(brix.value) : null,
      tempC: temp ? Number(temp.value) : null,
    };
  });

  // `tankDetailFacts` sorts oldest-first per analyte, so the newest-first read order above
  // (which is what the cap needs to keep the RECENT panels) does not leak into the chart.
  return {
    facts: tankDetailFacts(readings),
    panelCount: panels.length,
    tastingNotes: noteRows.map((n) => ({
      id: n.id,
      observedAt: n.observedAt.toISOString(),
      enteredByEmail: n.enteredByEmail,
      score: n.score,
      appearance: n.appearance,
      aroma: n.aroma,
      flavor: n.flavor,
      notes: n.notes,
    })),
  };
}
