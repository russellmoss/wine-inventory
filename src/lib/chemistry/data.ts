import "server-only";
import { prisma } from "@/lib/prisma";

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
