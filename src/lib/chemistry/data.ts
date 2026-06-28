import "server-only";
import { prisma } from "@/lib/prisma";
import { molecularSO2, type MolecularSO2 } from "@/lib/chemistry/so2";

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
  /** Derived molecular SO₂ from the most recent panel that has both free SO₂ + pH. */
  molecular: MolecularSO2 | null;
  molecularDateLabel: string | null;
  panelCount: number;
};

/**
 * A vessel's analysis history (non-voided panels recorded while it held wine), for the
 * per-vessel trends modal on /bulk. Scoped by the panel's `vesselId` snapshot. Molecular SO₂
 * is derived from the latest same-panel free SO₂ + pH (never stored).
 */
export async function listVesselAnalyses(vesselId: string): Promise<VesselAnalyses> {
  const panels = await prisma.analysisPanel.findMany({
    where: { vesselId, voidedAt: null },
    orderBy: { observedAt: "asc" },
    include: { readings: true },
  });
  const readings = panels.flatMap((p) =>
    p.readings.map((r) => ({ analyte: r.analyte, value: Number(r.value), unit: r.unit, date: p.observedAt.getTime() })),
  );
  let molecular: MolecularSO2 | null = null;
  let molecularDateLabel: string | null = null;
  for (let i = panels.length - 1; i >= 0; i--) {
    const p = panels[i];
    const free = p.readings.find((r) => r.analyte === "FREE_SO2");
    const ph = p.readings.find((r) => r.analyte === "PH");
    if (free && ph) {
      const m = molecularSO2({ freeSO2: Number(free.value), pH: Number(ph.value) });
      if (m) {
        molecular = m;
        molecularDateLabel = p.observedAt.toISOString().slice(0, 10);
        break;
      }
    }
  }
  return { readings, molecular, molecularDateLabel, panelCount: panels.length };
}
