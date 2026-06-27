import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildTimeline,
  currentState,
  type CurrentState,
  type CurrentLocation,
  type RawLine,
  type RawOperation,
  type TimelineEvent,
  type VesselKind,
} from "@/lib/lot/timeline";

// Server-side assembly of the Lot list + detail view-models, read straight from the
// ledger (lot_operation + lot_operation_line) and the projection (vessel_lot -> lot).
// NEVER reads vessel_component (the legacy synced projection, on the retirement path).
// All Decimals become plain numbers; origin names come from batch lookups with a
// legacySnapshot fallback (Lot origin has no FK relation). See the Phase 2 plan.

export type LotListFilter = "ACTIVE" | "DEPLETED" | "ARCHIVED" | "ALL";

export type LotListRow = {
  id: string;
  code: string;
  form: string;
  status: string;
  isLegacy: boolean;
  vintageYear: number | null;
  varietyName: string | null;
  vineyardName: string | null;
  totalL: number;
  locations: CurrentLocation[];
};

export type LotLineageRef = { lotId: string; code: string };

export type LotDetail = {
  id: string;
  code: string;
  form: string;
  status: string;
  isLegacy: boolean;
  note: string | null;
  vintageYear: number | null;
  varietyName: string | null;
  vineyardName: string | null;
  current: CurrentState;
  events: TimelineEvent[];
  lineage: { parents: LotLineageRef[]; children: LotLineageRef[] };
};

type LegacySnapshot = { varietyName?: string | null; vineyardName?: string | null } | null;

type OriginNames = { variety: Map<string, string>; vineyard: Map<string, string> };

/** Batch-resolve variety + vineyard names for a set of lots (origin has no FK relation). */
async function resolveOriginNames(
  lots: { originVarietyId: string | null; originVineyardId: string | null }[],
): Promise<OriginNames> {
  const varietyIds = [...new Set(lots.map((l) => l.originVarietyId).filter((x): x is string => !!x))];
  const vineyardIds = [...new Set(lots.map((l) => l.originVineyardId).filter((x): x is string => !!x))];
  const [vars, vys] = await Promise.all([
    varietyIds.length
      ? prisma.variety.findMany({ where: { id: { in: varietyIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    vineyardIds.length
      ? prisma.vineyard.findMany({ where: { id: { in: vineyardIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  return {
    variety: new Map(vars.map((v) => [v.id, v.name])),
    vineyard: new Map(vys.map((v) => [v.id, v.name])),
  };
}

/** Resolve one lot's origin names: FK-id lookup first, then legacySnapshot fallback. */
function originFor(
  lot: { originVarietyId: string | null; originVineyardId: string | null; legacySnapshot: unknown },
  names: OriginNames,
): { varietyName: string | null; vineyardName: string | null } {
  const snap = (lot.legacySnapshot as LegacySnapshot) ?? null;
  const varietyName =
    (lot.originVarietyId ? names.variety.get(lot.originVarietyId) ?? null : null) ?? snap?.varietyName ?? null;
  const vineyardName =
    (lot.originVineyardId ? names.vineyard.get(lot.originVineyardId) ?? null : null) ?? snap?.vineyardName ?? null;
  return { varietyName, vineyardName };
}

/**
 * The lot list. Filters by status (default ACTIVE = current cellar; DEPLETED / ARCHIVED /
 * ALL reach a bottled lot's full history). Optional vessel filter (NICE). Current volume +
 * locations come from the vessel_lot projection; origin names from batch lookups.
 */
export async function listLots(opts: { status?: LotListFilter; vesselId?: string } = {}): Promise<LotListRow[]> {
  const status = opts.status ?? "ACTIVE";
  const where: Prisma.LotWhereInput = {};
  if (status !== "ALL") where.status = status;
  if (opts.vesselId) where.vesselLots = { some: { vesselId: opts.vesselId } };

  const lots = await prisma.lot.findMany({
    where,
    include: { vesselLots: { include: { vessel: { select: { id: true, code: true, type: true } } } } },
    orderBy: { code: "asc" },
  });

  const names = await resolveOriginNames(lots);

  return lots.map((lot) => {
    const cs = currentState(
      lot.vesselLots.map((vl) => ({
        vesselId: vl.vesselId,
        vesselCode: vl.vessel.code,
        vesselType: vl.vessel.type as VesselKind,
        volumeL: Number(vl.volumeL),
      })),
    );
    const origin = originFor(lot, names);
    return {
      id: lot.id,
      code: lot.code,
      form: lot.form as string,
      status: lot.status,
      isLegacy: lot.isLegacy,
      vintageYear: lot.vintageYear,
      varietyName: origin.varietyName,
      vineyardName: origin.vineyardName,
      totalL: cs.totalL,
      locations: cs.locations,
    };
  });
}

/**
 * One lot's detail view-model: current-state header (vessel_lot -> lot), provenance, simple
 * lineage, and the reverse-chronological operation feed from the ledger, ordered strictly by
 * LotOperation.id (the monotonic fold order — never observedAt). Returns null for a bad id.
 */
export async function getLotDetail(id: string): Promise<LotDetail | null> {
  const lot = await prisma.lot.findUnique({
    where: { id },
    include: {
      vesselLots: { include: { vessel: { select: { id: true, code: true, type: true } } } },
      parentEdges: { include: { parent: { select: { id: true, code: true } } } }, // this lot is the child
      childEdges: { include: { child: { select: { id: true, code: true } } } }, // this lot is the parent
    },
  });
  if (!lot) return null;

  // The ledger history for THIS lot: its operation lines, each with its operation header.
  const lines = await prisma.lotOperationLine.findMany({
    where: { lotId: id },
    include: { operation: true },
  });

  // Resolve vessel types for labeling (deleted vessels keep only their code snapshot).
  const vesselIds = [...new Set(lines.map((l) => l.vesselId).filter((x): x is string => !!x))];
  const vessels = vesselIds.length
    ? await prisma.vessel.findMany({ where: { id: { in: vesselIds } }, select: { id: true, type: true } })
    : [];
  const typeById = new Map(vessels.map((v) => [v.id, v.type as VesselKind]));

  // Group lines by operation, preserving each op header.
  const byOp = new Map<number, { op: RawOperation; lines: RawLine[] }>();
  for (const l of lines) {
    let group = byOp.get(l.operationId);
    if (!group) {
      const o = l.operation;
      group = {
        op: {
          id: o.id,
          type: o.type,
          observedAt: o.observedAt,
          enteredBy: o.enteredBy,
          captureMethod: o.captureMethod,
          note: o.note,
          correctsOperationId: o.correctsOperationId,
        },
        lines: [],
      };
      byOp.set(l.operationId, group);
    }
    group.lines.push({
      vesselId: l.vesselId,
      vesselCode: l.vesselCode,
      vesselType: l.vesselId ? typeById.get(l.vesselId) ?? null : null,
      deltaL: Number(l.deltaL),
      reason: l.reason,
    });
  }

  // Newest-first by operation id (the fold order), per D14 / the plan's Key Decisions.
  const rawOps = [...byOp.values()].sort((a, b) => b.op.id - a.op.id);
  const events = buildTimeline(rawOps, { legacy: lot.isLegacy });

  const current = currentState(
    lot.vesselLots.map((vl) => ({
      vesselId: vl.vesselId,
      vesselCode: vl.vessel.code,
      vesselType: vl.vessel.type as VesselKind,
      volumeL: Number(vl.volumeL),
    })),
  );

  const names = await resolveOriginNames([lot]);
  const origin = originFor(lot, names);

  return {
    id: lot.id,
    code: lot.code,
    form: lot.form as string,
    status: lot.status,
    isLegacy: lot.isLegacy,
    note: lot.note,
    vintageYear: lot.vintageYear,
    varietyName: origin.varietyName,
    vineyardName: origin.vineyardName,
    current,
    events,
    lineage: {
      parents: lot.parentEdges.map((e) => ({ lotId: e.parent.id, code: e.parent.code })),
      children: lot.childEdges.map((e) => ({ lotId: e.child.id, code: e.child.code })),
    },
  };
}
