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
  // The most-recent reversible bottle-phase op on this lot (Undo target). Reversing it walks the
  // chain back one step; undoing the tirage returns the wine to tank and drops the row.
  lastReversibleOpId: number | null;
  lastReversibleOpType: string | null;
};

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;
const REVERSIBLE_BOTTLE_OPS = ["TIRAGE", "RIDDLING", "DISGORGEMENT", "DOSAGE"] as const;

export async function getEnTirageWorklist(now: Date = new Date()): Promise<WorklistRow[]> {
  const states = await prisma.bottledLotState.findMany({
    include: { lot: { select: { code: true, afState: true, status: true } }, location: { select: { name: true } } },
    orderBy: { tirageAt: "asc" }, // oldest on lees first (closest to ready-to-disgorge)
  });
  const active = states.filter((s) => s.lot.status === "ACTIVE");
  const lotIds = active.map((s) => s.lotId);

  // Latest not-yet-reversed reversible op per lot (RIDDLING has no lines → also match treatments).
  const ops = await prisma.lotOperation.findMany({
    where: {
      type: { in: [...REVERSIBLE_BOTTLE_OPS] },
      correctedBy: { is: null },
      OR: [{ lines: { some: { lotId: { in: lotIds } } } }, { treatments: { some: { lotId: { in: lotIds } } } }],
    },
    orderBy: { id: "desc" },
    select: { id: true, type: true, lines: { select: { lotId: true } }, treatments: { select: { lotId: true } } },
  });
  const latestOpByLot = new Map<string, { id: number; type: string }>();
  for (const op of ops) {
    const touched = new Set([...op.lines.map((l) => l.lotId), ...op.treatments.map((t) => t.lotId)]);
    for (const lotId of touched) {
      if (lotIds.includes(lotId) && !latestOpByLot.has(lotId)) latestOpByLot.set(lotId, { id: op.id, type: op.type });
    }
  }

  return active.map((s) => {
    const rev = latestOpByLot.get(s.lotId) ?? null;
    return {
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
      lastReversibleOpId: rev?.id ?? null,
      lastReversibleOpType: rev?.type ?? null,
    };
  });
}

export type TirageTank = { vesselId: string; vesselCode: string; volumeL: number };
export type TirageCandidate = {
  lotId: string;
  lotCode: string;
  vintage: number | null;
  totalL: number;
  tanks: TirageTank[]; // the cuvée's own positions — a single lot can span multiple tanks
};

/**
 * Bulk WINE lots eligible for tirage, GROUPED BY LOT (the cuvée). A lot can occupy several
 * tanks; tirage draws across the ones you pick. Combining *different* wines is the upstream
 * assemblage (a BLEND), not tirage.
 */
export async function getTirageCandidates(): Promise<TirageCandidate[]> {
  const rows = await prisma.vesselLot.findMany({
    where: { lot: { form: "WINE", status: "ACTIVE" } },
    include: { vessel: { select: { code: true } }, lot: { select: { code: true, vintageYear: true } } },
    orderBy: [{ lotId: "asc" }, { volumeL: "desc" }],
  });
  const byLot = new Map<string, TirageCandidate>();
  for (const r of rows) {
    let c = byLot.get(r.lotId);
    if (!c) {
      c = { lotId: r.lotId, lotCode: r.lot.code, vintage: r.lot.vintageYear, totalL: 0, tanks: [] };
      byLot.set(r.lotId, c);
    }
    c.tanks.push({ vesselId: r.vesselId, vesselCode: r.vessel.code, volumeL: Number(r.volumeL) });
    c.totalL = Math.round((c.totalL + Number(r.volumeL)) * 100) / 100;
  }
  return [...byLot.values()].sort((a, b) => b.totalL - a.totalL);
}

export type FinishedSparklingRow = {
  lotId: string;
  code: string;
  finishOpId: number; // the FINISH op to reverse (dispatcher → reverseFinalize)
  skuName: string;
  bottleCount: number;
  finishedAt: string; // YYYY-MM-DD
  method: string | null;
  dosageStyle: string | null;
  locationName: string | null;
};

/**
 * Recently finalized sparkling lots that can still be un-finished (FINISH op not yet reversed and
 * the lot is still FINISHED). A finished lot has no BottledLotState so it drops off the En Tirage
 * worklist — this is the entry point to reopen it (after which it reappears in the worklist and the
 * per-row Undo walks it the rest of the way back to the tank). FINISH is sparkling-only (still-wine
 * bottling is a BOTTLE op), so this never lists a normal bottling run.
 */
export async function getRecentlyFinishedSparkling(limit = 25): Promise<FinishedSparklingRow[]> {
  const finishes = await prisma.lotOperation.findMany({
    where: { type: "FINISH", correctedBy: { is: null } },
    orderBy: { id: "desc" },
    take: limit,
    select: { id: true, metadata: true, lines: { select: { lotId: true }, take: 1 } },
  });
  if (finishes.length === 0) return [];

  const lotIds = [...new Set(finishes.map((f) => f.lines[0]?.lotId).filter(Boolean) as string[])];
  const runIds = [...new Set(finishes.map((f) => (f.metadata as { runId?: string } | null)?.runId).filter(Boolean) as string[])];
  const [lots, runs] = await Promise.all([
    prisma.lot.findMany({ where: { id: { in: lotIds } }, select: { id: true, code: true, form: true, status: true } }),
    prisma.bottlingRun.findMany({
      where: { id: { in: runIds } },
      select: { id: true, bottlesProduced: true, date: true, wineSku: { select: { name: true, method: true, dosageStyle: true } }, destinationLocation: { select: { name: true } } },
    }),
  ]);
  const lotById = new Map(lots.map((l) => [l.id, l]));
  const runById = new Map(runs.map((r) => [r.id, r]));

  const rows: FinishedSparklingRow[] = [];
  for (const f of finishes) {
    const lotId = f.lines[0]?.lotId;
    if (!lotId) continue;
    const lot = lotById.get(lotId);
    if (!lot || lot.form !== "FINISHED" || lot.status !== "ACTIVE") continue; // only still-undoable finishes
    const run = (f.metadata as { runId?: string } | null)?.runId ? runById.get((f.metadata as { runId?: string }).runId!) : undefined;
    rows.push({
      lotId,
      code: lot.code,
      finishOpId: f.id,
      skuName: run?.wineSku.name ?? "—",
      bottleCount: run?.bottlesProduced ?? 0,
      finishedAt: (run?.date ?? new Date()).toISOString().slice(0, 10),
      method: run?.wineSku.method ?? null,
      dosageStyle: run?.wineSku.dosageStyle ?? null,
      locationName: run?.destinationLocation?.name ?? null,
    });
  }
  return rows;
}

export async function getActiveLocations(): Promise<{ id: string; name: string }[]> {
  return prisma.location.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

export async function getLiqueurMaterials(): Promise<{ id: string; name: string }[]> {
  return prisma.cellarMaterial.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}
