import "server-only";
import { prisma } from "@/lib/prisma";
import { molecularSO2, type MolecularSO2 } from "@/lib/chemistry/so2";
import { dedupeByPhysicalReading } from "@/lib/chemistry/fanout-plan";

// Read-side view-models for the Phase 4 samples surface. Open = non-terminal (still awaiting
// a result / attach). Dates cross the boundary as ISO strings; there are no Decimals here.

const OPEN_STATUSES = ["PULLED", "SENT", "PENDING", "RESULT_RETURNED"] as const;

export type OpenSampleRow = {
  id: string;
  lotId: string;
  lotCode: string;
  varietyName: string | null;
  status: string;
  source: string | null;
  lab: string | null;
  pulledAt: string; // ISO
  sentAt: string | null;
  expectedAt: string | null;
};

/** Open (non-terminal) samples across all lots, oldest pull first (most overdue at the top). */
export async function listOpenSamples(): Promise<OpenSampleRow[]> {
  const samples = await prisma.sample.findMany({
    where: { status: { in: [...OPEN_STATUSES] } },
    orderBy: { pulledAt: "asc" },
    include: { lot: { select: { code: true, originVarietyId: true } } },
  });
  const varietyIds = [...new Set(samples.map((s) => s.lot.originVarietyId).filter((x): x is string => !!x))];
  const varieties = varietyIds.length
    ? await prisma.variety.findMany({ where: { id: { in: varietyIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(varieties.map((v) => [v.id, v.name]));
  return samples.map((s) => ({
    id: s.id,
    lotId: s.lotId,
    lotCode: s.lot.code,
    varietyName: s.lot.originVarietyId ? nameById.get(s.lot.originVarietyId) ?? null : null,
    status: s.status,
    source: s.source,
    lab: s.lab,
    pulledAt: s.pulledAt.toISOString(),
    sentAt: s.sentAt ? s.sentAt.toISOString() : null,
    expectedAt: s.expectedAt ? s.expectedAt.toISOString() : null,
  }));
}

/** Count of open samples (for the nav "N pending" badge). */
export async function countOpenSamples(): Promise<number> {
  return prisma.sample.count({ where: { status: { in: [...OPEN_STATUSES] } } });
}

export type VesselAnalyses = {
  /** Flat readings (Decimal → number; date = epoch ms) for the filterable trend view. */
  readings: { analyte: string; value: number; unit: string; date: number }[];
  /** Derived molecular SO₂ from the latest free SO₂ + the pH current at that reading. */
  molecular: MolecularSO2 | null;
  molecularDateLabel: string | null;
  panelCount: number;
};

/**
 * A vessel's analysis history (non-voided panels recorded while it held wine), for the
 * per-vessel trends modal on /bulk. Scoped by the panel's `vesselId` snapshot.
 *
 * Molecular SO₂ is DERIVED (never stored) from the LATEST free SO₂ paired with the pH that was
 * current AT OR BEFORE that free-SO₂ reading. Free SO₂ is the quantity that moves (every addition
 * changes it) while pH is slow-moving, so the antimicrobially-meaningful molecular value must track
 * the newest free SO₂ — not sit frozen until the next panel happens to re-measure pH in one shot.
 * We still only ever use REAL recorded values (we never invent a pH) and we never pair a free SO₂
 * with a pH measured LATER (chronology is respected). When the latest free SO₂ panel also carries a
 * pH, that same-panel pH is the most-recent-at-or-before one, so the strict same-panel case is
 * preserved as a subset.
 */
export async function listVesselAnalyses(vesselId: string): Promise<VesselAnalyses> {
  const rows = await prisma.analysisPanel.findMany({
    where: { vesselId, voidedAt: null },
    orderBy: { observedAt: "asc" },
    include: { readings: true },
  });
  // Plan 060: a whole-tank reading fans out to one panel per co-resident lot, all sharing a
  // vesselReadingGroupId. This is a VESSEL-scoped view, so collapse each group to ONE physical
  // reading (identical readings across the group) — otherwise the trend + panelCount double-count.
  const panels = dedupeByPhysicalReading(rows);
  const readings = panels.flatMap((p) =>
    p.readings.map((r) => ({ analyte: r.analyte, value: Number(r.value), unit: r.unit, date: p.observedAt.getTime() })),
  );

  // Walk chronologically, carrying the most-recent pH seen so far. The latest panel that carries a
  // free SO₂ pairs it with that carried pH (i.e. the pH current at or before this free reading).
  let latestFree: { value: number; observedAt: Date } | null = null;
  let pHForLatestFree: number | null = null;
  let runningPH: number | null = null;
  for (const p of panels) {
    const ph = p.readings.find((r) => r.analyte === "PH");
    if (ph) runningPH = Number(ph.value);
    const free = p.readings.find((r) => r.analyte === "FREE_SO2");
    if (free) {
      latestFree = { value: Number(free.value), observedAt: p.observedAt };
      pHForLatestFree = runningPH; // pH current at/before this free reading (same-panel pH wins)
    }
  }

  let molecular: MolecularSO2 | null = null;
  let molecularDateLabel: string | null = null;
  if (latestFree && pHForLatestFree != null) {
    const m = molecularSO2({ freeSO2: latestFree.value, pH: pHForLatestFree });
    if (m) {
      molecular = m;
      molecularDateLabel = latestFree.observedAt.toISOString().slice(0, 10);
    }
  }
  return { readings, molecular, molecularDateLabel, panelCount: panels.length };
}
