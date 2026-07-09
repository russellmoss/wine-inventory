import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildTimeline,
  currentState,
  describeMeasurementPanel,
  describeLegacyOperation,
  describeMigrationCutover,
  describeSample,
  describeTastingNote,
  mergeTimeline,
  type CurrentState,
  type CurrentLocation,
  type RawLine,
  type RawOperation,
  type RecordItem,
  type TimelineItem,
  type VesselKind,
} from "@/lib/lot/timeline";
import { detectStuck } from "@/lib/ferment/stuck";
import { reversibilityForOperation } from "@/lib/ledger/reverse";
import { operationSupplementalNote } from "@/lib/cellar/edit-policy";
import type { AlcoholicFermState } from "@/lib/ledger/vocabulary";
import {
  buildAncestry,
  buildDescendants,
  composeRollup,
  hasLineage,
  type LineageEdge,
  type LineageNode,
  type LotMeta,
  type CompositionRollup,
} from "@/lib/lot/lineage";

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

/**
 * BFS the lot_lineage graph both directions from a root, batched level-by-level (no N+1),
 * bounded by depth + node count. Returns the edge list + a per-lot meta map (codes + resolved
 * origin variety/vineyard/vintage) for the pure lineage functions.
 */
async function loadLineageGraph(rootId: string): Promise<{ edges: LineageEdge[]; meta: Map<string, LotMeta> }> {
  const collected = new Map<string, LineageEdge>();
  const lotIds = new Set<string>([rootId]);
  let frontier = [rootId];
  const MAX_NODES = 200;
  for (let depth = 0; depth < 12 && frontier.length > 0 && lotIds.size < MAX_NODES; depth++) {
    const rows = await prisma.lotLineage.findMany({
      where: { OR: [{ parentLotId: { in: frontier } }, { childLotId: { in: frontier } }] },
      select: { parentLotId: true, childLotId: true, fraction: true, kind: true },
    });
    const nextFrontier: string[] = [];
    for (const r of rows) {
      const k = `${r.parentLotId}::${r.childLotId}`;
      if (!collected.has(k)) {
        collected.set(k, {
          parentLotId: r.parentLotId,
          childLotId: r.childLotId,
          fraction: r.fraction == null ? null : Number(r.fraction),
          kind: r.kind,
        });
      }
      for (const id of [r.parentLotId, r.childLotId]) {
        if (!lotIds.has(id)) {
          lotIds.add(id);
          nextFrontier.push(id);
        }
      }
    }
    frontier = nextFrontier;
  }

  const metaLots = await prisma.lot.findMany({
    where: { id: { in: [...lotIds] } },
    select: { id: true, code: true, vintageYear: true, originVarietyId: true, originVineyardId: true, legacySnapshot: true },
  });
  const names = await resolveOriginNames(metaLots);
  const meta = new Map<string, LotMeta>();
  for (const l of metaLots) {
    const o = originFor(l, names);
    meta.set(l.id, { id: l.id, code: l.code, vintageYear: l.vintageYear, varietyName: o.varietyName, vineyardName: o.vineyardName });
  }
  return { edges: [...collected.values()], meta };
}

export type TastingSearchRow = { lotId: string; lotCode: string; snippet: string; dateLabel: string };

/**
 * NICE: free-text tasting-note search over notes/aroma/flavor/appearance (case-insensitive
 * `contains` — no tsvector this phase, to avoid the search_vector migration gotcha). Returns
 * the most recent matches with a short snippet linking back to the lot.
 */
export async function searchTastingNotes(q: string): Promise<TastingSearchRow[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const match = { contains: term, mode: "insensitive" as const };
  const notes = await prisma.lotTastingNote.findMany({
    where: {
      voidedAt: null,
      OR: [{ notes: match }, { aroma: match }, { flavor: match }, { appearance: match }],
    },
    include: { lot: { select: { code: true } } },
    orderBy: { observedAt: "desc" },
    take: 25,
  });
  return notes.map((n) => {
    const raw = [n.notes, n.aroma, n.flavor, n.appearance].find((s) => s && s.toLowerCase().includes(term.toLowerCase())) ?? "";
    const snippet = raw.length > 140 ? `${raw.slice(0, 140)}…` : raw;
    return { lotId: n.lotId, lotCode: n.lot.code, snippet, dateLabel: n.observedAt.toISOString().slice(0, 10) };
  });
}

export type LotDetail = {
  id: string;
  code: string;
  // Phase 1 (identity presentation): the mutable, NON-unique human label (coalesced `displayName ?? code`
  // is the presentation rule) + prior codes / legacy identifiers for the "also-known-as" affordance.
  displayName: string | null;
  aliases: string[];
  form: string;
  // Phase 6: the two orthogonal ferment vectors + the DERIVED stuck signal (null when not
  // applicable — recomputed from the Brix trend, never stored).
  afState: string;
  mlfState: string;
  stuck: { stuck: boolean; reason: string; latestBrix: number | null } | null;
  status: string;
  isLegacy: boolean;
  note: string | null;
  vintageYear: number | null;
  varietyName: string | null;
  vineyardName: string | null;
  current: CurrentState;
  liveHoldings: { vesselVolumeL: number; bottledVolumeL: number; bottleCount: number; live: boolean };
  events: TimelineItem[];
  lineage: { parents: LotLineageRef[]; children: LotLineageRef[] };
  // Phase 5: the walked lineage graph + composition rollup. null when the lot has NO lineage
  // (the common case) so the UI omits the section entirely rather than render an empty graph.
  lineageGraph: {
    ancestors: LineageNode[];
    descendants: LineageNode[];
    rollup: CompositionRollup;
  } | null;
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

function metadataString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

/**
 * The lot list. Filters by status (default ACTIVE = current cellar; DEPLETED / ARCHIVED /
 * ALL reach a bottled lot's full history). Optional vessel filter (NICE). Current volume +
 * locations come from the vessel_lot projection; origin names from batch lookups.
 */
export async function listLots(
  opts: { status?: LotListFilter; vesselId?: string; sourceVineyardIn?: string[] } = {},
): Promise<LotListRow[]> {
  const status = opts.status ?? "ACTIVE";
  const where: Prisma.LotWhereInput = {};
  if (status !== "ALL") where.status = status;
  if (opts.vesselId) where.vesselLots = { some: { vesselId: opts.vesselId } };
  // Phase 5 "my fruit downstream" LENS (Unit 10): an OPTIONAL filter to lots whose source
  // set intersects the given vineyards. This is a VIEW, never an enforced scope — the cellar
  // stays tenant-wide (council C4). Callers pass it only when the manager opts into the lens.
  if (opts.sourceVineyardIn && opts.sourceVineyardIn.length > 0) {
    where.sourceVineyards = { some: { vineyardId: { in: opts.sourceVineyardIn } } };
  }

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
      bottledState: { select: { volumeL: true, bottleCount: true } },
      parentEdges: { include: { parent: { select: { id: true, code: true } } } }, // this lot is the child
      childEdges: { include: { child: { select: { id: true, code: true } } } }, // this lot is the parent
    },
  });
  if (!lot) return null;

  // The ledger history for THIS lot: its operation lines + its cellar-treatment rows
  // (Phase 3), each with its operation header. UNIONing lot_operation_line.lotId with
  // lot_treatment.lotId is what makes volume-NEUTRAL ops (additions, fining, cap mgmt)
  // appear on the timeline at all — they have no lines.
  const [lines, treatments, panels, tastingNotes, samples, legacyRows] = await Promise.all([
    prisma.lotOperationLine.findMany({ where: { lotId: id }, include: { operation: true } }),
    prisma.lotTreatment.findMany({ where: { lotId: id }, include: { operation: true } }),
    // Phase 4 standalone records: non-voided panels (+ their readings), non-voided tasting
    // notes, and live (non-cancelled) samples. These have no operationId — they slot into the
    // op feed by observedAt (mergeTimeline), they do NOT join the byOp grouping.
    prisma.analysisPanel.findMany({
      where: { lotId: id, voidedAt: null },
      include: { readings: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.lotTastingNote.findMany({ where: { lotId: id, voidedAt: null } }),
    prisma.sample.findMany({ where: { lotId: id, status: { not: "CANCELLED" } } }),
    prisma.legacyOperation.findMany({ where: { lotId: id, publishedAt: { not: null } }, orderBy: { occurredAt: "desc" } }),
  ]);

  // Resolve vessel types for labeling (deleted vessels keep only their code snapshot).
  const vesselIds = [...new Set(lines.map((l) => l.vesselId).filter((x): x is string => !!x))];
  const vessels = vesselIds.length
    ? await prisma.vessel.findMany({ where: { id: { in: vesselIds } }, select: { id: true, type: true } })
    : [];
  const typeById = new Map(vessels.map((v) => [v.id, v.type as VesselKind]));

  // Group BOTH sources by operation, preserving each op header.
  const byOp = new Map<number, { op: RawOperation; lines: RawLine[] }>();
  function ensureOp(o: {
    id: number;
    type: RawOperation["type"];
    observedAt: Date;
    enteredBy: string;
    captureMethod: string;
    note: string | null;
    metadata: unknown;
    correctsOperationId: number | null;
  }) {
    let group = byOp.get(o.id);
    if (!group) {
      group = {
        op: {
          id: o.id,
          type: o.type,
          observedAt: o.observedAt,
          enteredBy: o.enteredBy,
          captureMethod: o.captureMethod,
          note: o.note,
          supplementalNote: operationSupplementalNote(o.metadata),
          splitKind: metadataString(o.metadata, "splitKind"),
          correctsOperationId: o.correctsOperationId,
          treatments: [],
        },
        lines: [],
      };
      byOp.set(o.id, group);
    }
    return group;
  }

  for (const l of lines) {
    const group = ensureOp(l.operation);
    group.lines.push({
      vesselId: l.vesselId,
      vesselCode: l.vesselCode,
      vesselType: l.vesselId ? typeById.get(l.vesselId) ?? null : null,
      deltaL: Number(l.deltaL),
      reason: l.reason,
      bucket: l.bucket,
      bottleDelta: l.bottleDelta,
    });
  }
  for (const t of treatments) {
    const group = ensureOp(t.operation);
    group.op.treatments!.push({
      kind: t.kind,
      materialName: t.materialName,
      rateValue: t.rateValue == null ? null : Number(t.rateValue),
      rateBasis: t.rateBasis,
      computedTotal: t.computedTotal == null ? null : Number(t.computedTotal),
      computedUnit: t.computedUnit,
      durationMin: t.durationMin,
      medium: t.medium,
      micron: t.micron == null ? null : Number(t.micron),
    });
  }

  // Find which of the lot's ops were reversed. `correctsOperationId` is set ONLY by a reversal
  // (cellar/rack write a CORRECTION; a still-wine BOTTLE reversal writes a SEED restore op that
  // corrects the BOTTLE op), so we match on it for ANY type — not just CORRECTION — else a
  // reversed bottling wouldn't show as corrected on the timeline (024a).
  const opIds = [...byOp.keys()];
  const corrections = opIds.length
    ? await prisma.lotOperation.findMany({
        where: { correctsOperationId: { in: opIds } },
        select: { correctsOperationId: true },
      })
    : [];
  const correctedIds = new Set(corrections.map((c) => c.correctsOperationId as number));

  // Newest-first by operation id (the fold order), per D14 / the plan's Key Decisions.
  const rawOps = [...byOp.values()].sort((a, b) => b.op.id - a.op.id);
  const opEvents = buildTimeline(rawOps, { legacy: lot.isLegacy, correctedIds });

  // 024a + Phase 6A: resolve each op's timeline reversibility from the SAME DB-aware verdict the
  // dispatcher enforces. A corrected op shows its badge, not an Undo; a reversible operation gets
  // an Undo button; a non-undoable operation carries the reason to show disabled.
  await Promise.all(opEvents.map(async (ev) => {
    if (ev.corrected || ev.isCorrection) return; // defaults (reversible:false, reason:null) stand
    const verdict = await reversibilityForOperation(ev.id);
    if (verdict.reversible) ev.reversible = true;
    else ev.reversalReason = verdict.reason;
  }));

  // Phase 4 standalone records → display items, then HYBRID-merged into the op backbone by
  // observedAt (ops keep their id order; records slot in). Decimal → number at this boundary.
  const legacyBatchIds = [...new Set(legacyRows.map((r) => r.importBatchId))];
  const legacyBatches = legacyBatchIds.length
    ? await prisma.migrationImportBatch.findMany({
        where: { id: { in: legacyBatchIds } },
        select: { id: true, cutoverAt: true, sourceName: true, sourceSystem: true, publishedByEmail: true, createdAt: true },
      })
    : [];

  const recordItems: RecordItem[] = [
    ...panels.map((p) =>
      describeMeasurementPanel({
        id: p.id,
        observedAt: p.observedAt,
        enteredByEmail: p.enteredByEmail,
        captureMethod: p.captureMethod,
        note: p.note,
        sampleId: p.sampleId,
        createdAt: p.createdAt,
        readings: p.readings.map((r) => ({ analyte: r.analyte, value: Number(r.value), unit: r.unit })),
      }),
    ),
    ...tastingNotes.map((t) =>
      describeTastingNote({
        id: t.id,
        observedAt: t.observedAt,
        enteredByEmail: t.enteredByEmail,
        captureMethod: t.captureMethod,
        note: t.notes, // the tasting note's free-text → the rail's note line
        createdAt: t.createdAt,
        appearance: t.appearance,
        aroma: t.aroma,
        flavor: t.flavor,
        tannin: t.tannin,
        acidity: t.acidity,
        body: t.body,
        finish: t.finish,
        score: t.score,
        scoreScale: t.scoreScale,
        readiness: t.readiness,
      }),
    ),
    ...samples.map((s) =>
      describeSample({
        id: s.id,
        pulledAt: s.pulledAt,
        enteredByEmail: s.enteredByEmail,
        captureMethod: s.captureMethod,
        note: s.note,
        createdAt: s.createdAt,
        status: s.status,
        source: s.source,
        lab: s.lab,
      }),
    ),
    ...legacyRows.map((r) =>
      describeLegacyOperation({
        id: r.id,
        importBatchId: r.importBatchId,
        sourceSystem: r.sourceSystem,
        sourceActionType: r.sourceActionType,
        occurredAt: r.occurredAt,
        actorName: r.actorName,
        note: r.note,
        evidenceRef: r.evidenceRef,
        canonicalVolumeL: r.canonicalVolumeL == null ? null : Number(r.canonicalVolumeL),
        sourceVesselKey: r.sourceVesselKey,
        vesselCode: r.vesselCode,
        createdAt: r.createdAt,
      }),
    ),
    ...legacyBatches.map((b) =>
      describeMigrationCutover({
        importBatchId: b.id,
        cutoverAt: b.cutoverAt,
        sourceName: b.sourceName,
        sourceSystem: b.sourceSystem,
        actorEmail: b.publishedByEmail,
        createdAt: b.createdAt,
      }),
    ),
  ];
  const events = mergeTimeline(opEvents, recordItems);

  const current = currentState(
    lot.vesselLots.map((vl) => ({
      vesselId: vl.vesselId,
      vesselCode: vl.vessel.code,
      vesselType: vl.vessel.type as VesselKind,
      volumeL: Number(vl.volumeL),
    })),
  );
  const bottledVolumeL = lot.bottledState ? Number(lot.bottledState.volumeL) : 0;
  const bottleCount = lot.bottledState?.bottleCount ?? 0;

  const names = await resolveOriginNames([lot]);
  const origin = originFor(lot, names);

  // Phase 5: the walked lineage graph + composition rollup (only when there's lineage at all).
  const { edges: lineageEdges, meta: lineageMeta } = await loadLineageGraph(id);
  const lineageGraph = hasLineage(id, lineageEdges)
    ? {
        ancestors: buildAncestry(id, lineageEdges, lineageMeta),
        descendants: buildDescendants(id, lineageEdges, lineageMeta),
        rollup: composeRollup(id, lineageEdges, lineageMeta),
      }
    : null;

  // Phase 6 DERIVED stuck signal: recompute over this lot's non-voided BRIX panels.
  const brixReadings = panels.flatMap((p) =>
    p.readings.filter((r) => r.analyte === "BRIX").map((r) => ({ observedAt: p.observedAt, brix: Number(r.value) })),
  );
  const stuckRes = detectStuck(brixReadings, { afState: lot.afState as AlcoholicFermState });
  const stuck =
    brixReadings.length > 0
      ? { stuck: stuckRes.stuck, reason: stuckRes.reason, latestBrix: stuckRes.latestBrix }
      : null;

  // Phase 1: prior codes (from the append-only rename log) + external identifiers = the a.k.a. set.
  const [priorCodeRows, externalIdentifiers] = await Promise.all([
    prisma.lotCodeEvent.findMany({
      where: { lotId: id, field: "code" },
      select: { fromValue: true },
      orderBy: { observedAt: "desc" },
    }),
    prisma.lotIdentifier.findMany({
      where: { lotId: id, NOT: { kind: "current-code" } },
      select: { value: true },
    }),
  ]);
  const aliases = [
    ...new Set(
      [...priorCodeRows.map((r) => r.fromValue), ...externalIdentifiers.map((r) => r.value)].filter(
        (v): v is string => !!v && v !== lot.code,
      ),
    ),
  ];

  return {
    id: lot.id,
    code: lot.code,
    displayName: lot.displayName,
    aliases,
    form: lot.form as string,
    afState: lot.afState as string,
    mlfState: lot.mlfState as string,
    stuck,
    status: lot.status,
    isLegacy: lot.isLegacy,
    note: lot.note,
    vintageYear: lot.vintageYear,
    varietyName: origin.varietyName,
    vineyardName: origin.vineyardName,
    current,
    liveHoldings: {
      vesselVolumeL: current.totalL,
      bottledVolumeL,
      bottleCount,
      live: current.totalL > 0.01 || bottledVolumeL > 0.01 || bottleCount > 0,
    },
    events,
    lineage: {
      parents: lot.parentEdges.map((e) => ({ lotId: e.parent.id, code: e.parent.code })),
      children: lot.childEdges.map((e) => ({ lotId: e.child.id, code: e.child.code })),
    },
    lineageGraph,
  };
}
