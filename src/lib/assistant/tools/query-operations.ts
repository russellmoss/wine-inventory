import "server-only";
import { prisma } from "@/lib/prisma";
import type { AssistantTool } from "../registry";
import { normVesselCode, vesselCodeCandidates, resolveLotTarget } from "../scope";
import { getVesselTimeline } from "@/lib/vessel/timeline-data";
import { getLotDetail } from "@/lib/lot/data";
import { currentOccupancyWindow, type OccupancyWindow } from "@/lib/vessel/occupancy";
import { buildTimeline, type RawOperation, type RawLine, type OpItem, type VesselKind } from "@/lib/lot/timeline";
import { operationSupplementalNote } from "@/lib/cellar/edit-policy";
import { operationDisplayLabel } from "@/lib/cellar/long-tail-metadata";
import { expandVesselRefs } from "@/lib/chemistry/measurement-history";
import {
  daysAgo,
  dedupePhysicalTreatments,
  filterOperationItems,
  operationLabel,
  rankByStaleness,
  resolveOperationFilter,
  tallyByType,
  type SweepInput,
} from "@/lib/cellar/operation-history";

// Assistant read coverage — a lot/vessel's OPERATION history: the ledger of what was actually DONE to
// the wine (additions, finings, cap management, rackings, toppings, filtrations, blends, crush/press,
// bottling). Filed by the winemaker: the assistant could WRITE these operations and read current
// contents, but had no tool to read the ledger BACK, so "what additions did we make to tank T2" had no
// path. This is the operations counterpart to query_measurements (the CHEMISTRY history).
//
// Fidelity rule: the SINGLE-vessel and SINGLE-lot paths reuse the very loaders the vessel History feed
// and the lot page timeline render from (getVesselTimeline / getLotDetail), so the assistant cannot
// drift from what the operator sees on screen. Only the cross-vessel sweep — where running the full
// composed loader per vessel would be N× the per-op reversibility fan-out — uses its own lean query.
//
// Vessel scope (winemaker, 2026-07-22): a vessel question defaults to the CURRENT FILL (the occupancy
// window — everything since the vessel was last empty/cleaned), matching the vessel page. `allTime`
// reaches back through prior wines.

const MAX_VESSELS = 200;
const MAX_SWEEP_OPS = 3000;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

type Input = {
  lot?: string;
  vessel?: string;
  vessels?: string[];
  vesselType?: "TANK" | "BARREL";
  opTypes: string[];
  sinceDays?: number;
  since?: string;
  limit?: number;
  allTime: boolean;
  includeCorrected: boolean;
  staleAfterDays?: number;
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim());
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function normalize(raw: unknown): Input {
  const r = (raw ?? {}) as Record<string, unknown>;
  const vesselType = str(r.vesselType)?.toUpperCase();
  const single = str(r.opType);
  return {
    lot: str(r.lot),
    vessel: str(r.vessel),
    vessels: strArray(r.vessels),
    vesselType: vesselType === "TANK" || vesselType === "BARREL" ? vesselType : undefined,
    opTypes: [...(single ? [single] : []), ...strArray(r.opTypes)],
    sinceDays: num(r.sinceDays),
    since: str(r.since),
    limit: num(r.limit),
    allTime: r.allTime === true,
    includeCorrected: r.includeCorrected === true,
    staleAfterDays: num(r.staleAfterDays),
  };
}

/** The lower bound on observedAt, from `since` (ISO) or `sinceDays`. */
function sinceMs(input: Input, nowMs: number): number | undefined {
  if (input.since) {
    const d = new Date(input.since);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  if (input.sinceDays != null && input.sinceDays > 0) return nowMs - input.sinceDays * 86_400_000;
  return undefined;
}

function clampLimit(limit: number | undefined): number {
  if (limit == null) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));
}

type TargetVessel = { id: string; code: string; type: string; label: string };

function vesselLabel(type: string, code: string): string {
  return `${type === "BARREL" ? "Barrel" : "Tank"} ${code}`;
}

/** Resolve the vessel set in ONE query (ranges expanded first) — see query-measurements for the rationale. */
async function resolveTargetVessels(input: Input): Promise<{ vessels: TargetVessel[]; unknown: string[] }> {
  const refs = expandVesselRefs([...(input.vessel ? [input.vessel] : []), ...(input.vessels ?? [])]);
  const all = await prisma.vessel.findMany({
    where: input.vesselType ? { type: input.vesselType } : {},
    select: { id: true, code: true, type: true },
    orderBy: { code: "asc" },
  });
  if (refs.length === 0) {
    return { vessels: all.slice(0, MAX_VESSELS).map((v) => ({ ...v, label: vesselLabel(v.type, v.code) })), unknown: [] };
  }
  const byCode = new Map<string, (typeof all)[number]>();
  for (const v of all) byCode.set(normVesselCode(v.code), v);
  const vessels: TargetVessel[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const { wanted } = vesselCodeCandidates(ref);
    const hit = wanted.map((w) => byCode.get(w)).find((v) => v != null);
    if (!hit) {
      unknown.push(ref);
      continue;
    }
    if (seen.has(hit.id)) continue;
    seen.add(hit.id);
    vessels.push({ ...hit, label: vesselLabel(hit.type, hit.code) });
  }
  return { vessels: vessels.slice(0, MAX_VESSELS), unknown };
}

const RESET_KINDS = ["CLEAN", "SANITIZE", "STEAM"] as const;

/**
 * Current occupancy window per vessel, computed for the WHOLE set in two queries and folded by the
 * same pure `currentOccupancyWindow` the vessel page uses. A vessel absent from the returned map is
 * currently empty. Batched deliberately: per-vessel loaders would be 2N round trips for a 40-barrel
 * sweep, for data one findMany already holds.
 */
async function loadOccupancyWindows(vesselIds: string[]): Promise<Map<string, OccupancyWindow>> {
  const [lines, resets] = await Promise.all([
    prisma.lotOperationLine.findMany({
      where: { vesselId: { in: vesselIds } },
      select: { vesselId: true, operationId: true, deltaL: true, operation: { select: { observedAt: true } } },
    }),
    prisma.vesselActivityEvent.findMany({
      where: { vesselId: { in: vesselIds }, voidedAt: null, kind: { in: RESET_KINDS as unknown as never } },
      select: { vesselId: true, observedAt: true },
    }),
  ]);

  const aggByVessel = new Map<string, Map<number, { opId: number; observedAt: Date; deltaL: number }>>();
  for (const l of lines) {
    if (!l.vesselId) continue;
    let byOp = aggByVessel.get(l.vesselId);
    if (!byOp) {
      byOp = new Map();
      aggByVessel.set(l.vesselId, byOp);
    }
    const cur = byOp.get(l.operationId);
    if (cur) cur.deltaL += Number(l.deltaL);
    else byOp.set(l.operationId, { opId: l.operationId, observedAt: l.operation.observedAt, deltaL: Number(l.deltaL) });
  }
  const resetsByVessel = new Map<string, { at: Date }[]>();
  for (const r of resets) {
    const list = resetsByVessel.get(r.vesselId) ?? [];
    list.push({ at: r.observedAt });
    resetsByVessel.set(r.vesselId, list);
  }

  const out = new Map<string, OccupancyWindow>();
  for (const vesselId of vesselIds) {
    const byOp = aggByVessel.get(vesselId);
    if (!byOp) continue;
    const w = currentOccupancyWindow([...byOp.values()], { resetEvents: resetsByVessel.get(vesselId) ?? [] });
    if (w) out.set(vesselId, w);
  }
  return out;
}

/** Is this op inside the vessel's window? Op id when a fill governs; observedAt when a CLEAN does. */
function inWindow(window: OccupancyWindow, opId: number, observedAt: Date): boolean {
  return window.startOpId != null ? opId >= window.startOpId : observedAt.getTime() >= new Date(window.startAt).getTime();
}

const OP_SELECT = {
  id: true,
  type: true,
  observedAt: true,
  enteredBy: true,
  captureMethod: true,
  note: true,
  metadata: true,
  correctsOperationId: true,
  lines: { select: { vesselId: true, vesselCode: true, deltaL: true, reason: true, bucket: true, bottleDelta: true } },
  treatments: {
    select: {
      vesselId: true,
      kind: true,
      materialName: true,
      rateValue: true,
      rateBasis: true,
      computedTotal: true,
      computedUnit: true,
      durationMin: true,
      medium: true,
      micron: true,
    },
  },
} as const;

type RawOpRow = {
  id: number;
  type: string;
  observedAt: Date;
  enteredBy: string;
  captureMethod: string;
  note: string | null;
  metadata: unknown;
  correctsOperationId: number | null;
  lines: { vesselId: string | null; vesselCode: string | null; deltaL: unknown; reason: string | null; bucket: string | null; bottleDelta: number | null }[];
  treatments: {
    vesselId: string | null;
    kind: string;
    materialName: string | null;
    rateValue: unknown;
    rateBasis: string | null;
    computedTotal: unknown;
    computedUnit: string | null;
    durationMin: number | null;
    medium: string | null;
    micron: unknown;
  }[];
};

/**
 * Ledger ops touching any of `vesselIds`, newest fold-order first.
 *
 * The `OR` over lines AND treatments is load-bearing, not defensive: volume-neutral ops
 * (ADDITION / FINING / CAP_MGMT) write NO lot_operation_line rows, so a lines-only query returns a
 * confident, complete-looking answer with every dose and punchdown missing.
 */
async function loadOps(vesselIds: string[], types: string[] | null, includeCorrected: boolean): Promise<RawOpRow[]> {
  const rows = await prisma.lotOperation.findMany({
    where: {
      ...(types ? { type: { in: types as never } } : {}),
      ...(includeCorrected ? {} : { correctedBy: null }),
      OR: [{ lines: { some: { vesselId: { in: vesselIds } } } }, { treatments: { some: { vesselId: { in: vesselIds } } } }],
    },
    orderBy: { id: "desc" },
    take: MAX_SWEEP_OPS,
    select: OP_SELECT,
  });
  return rows as unknown as RawOpRow[];
}

/** Resolve vessel types for leg labeling ("Racked 200 L from Tank 1 to Barrel 14"). */
async function vesselTypeMap(rows: RawOpRow[]): Promise<Map<string, VesselKind>> {
  const ids = [...new Set(rows.flatMap((r) => r.lines.map((l) => l.vesselId)).filter((x): x is string => !!x))];
  if (!ids.length) return new Map();
  const vs = await prisma.vessel.findMany({ where: { id: { in: ids } }, select: { id: true, type: true } });
  return new Map(vs.map((v) => [v.id, v.type as VesselKind]));
}

/** Build display-ready events for ONE vessel from raw rows. Legs keep ALL vessels so summaries read end-to-end. */
function eventsForVessel(rows: RawOpRow[], vesselId: string, typeById: Map<string, VesselKind>): OpItem[] {
  const groups: { op: RawOperation; lines: RawLine[] }[] = [];
  for (const r of rows) {
    const touches = r.lines.some((l) => l.vesselId === vesselId) || r.treatments.some((t) => t.vesselId === vesselId);
    if (!touches) continue;
    const op: RawOperation = {
      id: r.id,
      type: r.type as RawOperation["type"],
      observedAt: r.observedAt,
      enteredBy: r.enteredBy,
      captureMethod: r.captureMethod,
      note: r.note,
      supplementalNote: operationSupplementalNote(r.metadata),
      displayLabel: operationDisplayLabel(r.metadata),
      correctsOperationId: r.correctsOperationId,
      treatments: r.treatments
        .filter((t) => t.vesselId === vesselId)
        .map((t) => ({
          kind: t.kind,
          materialName: t.materialName,
          rateValue: t.rateValue == null ? null : Number(t.rateValue),
          rateBasis: t.rateBasis,
          computedTotal: t.computedTotal == null ? null : Number(t.computedTotal),
          computedUnit: t.computedUnit,
          durationMin: t.durationMin,
          medium: t.medium,
          micron: t.micron == null ? null : Number(t.micron),
        })),
    };
    const lines: RawLine[] = r.lines.map((l) => ({
      vesselId: l.vesselId,
      vesselCode: l.vesselCode,
      vesselType: l.vesselId ? typeById.get(l.vesselId) ?? null : null,
      deltaL: Number(l.deltaL),
      reason: l.reason,
      bucket: l.bucket,
      bottleDelta: l.bottleDelta,
    }));
    groups.push({ op, lines });
  }
  return buildTimeline(groups).map((ev) => ({ kind: "OP" as const, ...ev }));
}

/** The wire shape for one operation. Deliberately compact — the model reads these, not a human. */
function opOut(op: OpItem, nowMs: number) {
  // One physical action on a vessel that once held co-resident lots wrote one treatment row PER LOT.
  // Collapse them, or a single pump-over reads as two and a dose reads as N doses of the same amount.
  const detail = dedupePhysicalTreatments(op.treatments);
  return {
    operationId: op.id,
    type: op.type,
    label: operationLabel(op.type, op.treatments[0]?.kind ?? null),
    summary: op.summary,
    observedAt: op.observedAt,
    date: op.dateLabel,
    daysAgo: daysAgo(new Date(op.observedAt).getTime(), nowMs),
    enteredBy: op.enteredBy,
    captureMethod: op.captureMethod,
    ...(op.note ? { note: op.note } : {}),
    ...(op.legs.length ? { legs: op.legs.map((l) => ({ location: l.label, deltaL: l.deltaL, direction: l.direction, ...(l.reason ? { reason: l.reason } : {}) })) } : {}),
    ...(detail.length
      ? {
          detail: detail.map((t) => ({
            kind: t.kind,
            ...(t.materialName ? { material: t.materialName } : {}),
            ...(t.rateValue != null ? { rate: t.rateValue, rateBasis: t.rateBasis } : {}),
            ...(t.computedTotal != null ? { total: t.computedTotal, totalUnit: t.computedUnit } : {}),
            ...(t.durationMin != null ? { durationMin: t.durationMin } : {}),
            ...(t.medium ? { medium: t.medium } : {}),
            ...(t.micron != null ? { micron: t.micron } : {}),
          })),
        }
      : {}),
    ...(op.corrected || op.voided ? { reversed: true } : {}),
    ...(op.isCorrection ? { isReversal: true, reverses: op.correctsId } : {}),
    ...(op.workOrder ? { workOrder: { number: op.workOrder.number, title: op.workOrder.title, status: op.workOrder.statusLabel } } : {}),
  };
}

/** Shared tail on every list response: the tally, truncation honesty, and the unknown-input echo. */
function listEnvelope(matched: OpItem[], limit: number, unknownOpTypes: string[], unknownVessels: string[] = []) {
  return {
    operationCount: matched.length,
    byType: tallyByType(matched),
    ...(matched.length > limit ? { truncated: { returned: limit, matched: matched.length } } : {}),
    ...(unknownOpTypes.length ? { unknownOpTypes } : {}),
    ...(unknownVessels.length ? { unknownVessels } : {}),
  };
}

export const queryOperationsTool: AssistantTool = {
  name: "query_operations",
  description:
    "Read the OPERATION history for a vessel or a lot — what was actually DONE to the wine, from the cellar ledger. This is the same feed the vessel History panel and the lot page timeline show: additions and finings, cap management (punchdowns, pump-overs, bâtonnage), rackings and transfers, toppings, filtrations, blends, crush/press, and bottling. Use for 'what additions did we make to tank T2', 'when did we last punch down T5', 'show the racking history of barrel 14', 'what have we done to lot 2026-SY-2', 'has T3 been topped this month'. " +
    "For lab/bench CHEMISTRY readings (pH, TA, Brix, free SO2) use query_measurements instead — this tool reports operations, not analyses. " +
    "SCOPE: a vessel question covers that vessel's CURRENT FILL by default — everything since it was last emptied or cleaned — which is what 'what did we do to T2' almost always means. Pass `allTime: true` to reach back through the wine it held before. A LOT's history follows the wine across every vessel it has lived in, so use `lot` when the wine has moved. " +
    "FILTERING: `opTypes` accepts plain cellar words — ['additions'], ['punchdowns'], ['racking'], ['toppings'], ['fining'], ['filtration'], ['blend'] — or canonical types like ['CAP_MGMT']. Omit it for everything. Operations that were later reversed by a correction are EXCLUDED by default (a reversed addition was never made); pass `includeCorrected: true` to see them, flagged `reversed`. " +
    "COMPARING VESSELS: pass `vessels` (ranges like ['barrels 1-5'] are expanded for you) or `vesselType` to sweep every tank or barrel. A multi-vessel request returns each vessel's MOST RECENT matching operation with `daysAgo` — that is what answers 'which tanks haven't been punched down in three days' or 'when did each fermenter last get an addition'. Pass `staleAfterDays` to split them into overdue and recent. " +
    "CRITICAL when sweeping: vessels holding wine that have NO matching operation in their current fill come back in `neverInThisFill`, NOT in the ranking — a tank never punched down is the MOST overdue one there is, so report that list before naming any winner from the ranking. Empty vessels are listed in `emptyVessels` and are excluded, since there is nothing in them to work on.",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      lot: { type: "string", description: "Lot code or name, e.g. '2026-SY-2'. Follows the wine across every vessel it has lived in. Use when the user names a lot, or asks about wine that has moved." },
      vessel: { type: "string", description: "A single vessel, e.g. 'tank 5', 'T5', 'barrel 14'. Returns its full operation feed for the current fill." },
      vessels: { type: "array", items: { type: "string" }, description: "Several vessels to compare. Ranges are accepted verbatim — ['barrels 1 through 5'] or ['B1-B5'] are expanded server-side. Returns each vessel's most recent matching operation." },
      vesselType: { type: "string", enum: ["TANK", "BARREL"], description: "Sweep every vessel of this type. Use for 'which tanks…' / 'across all barrels' questions." },
      opTypes: {
        type: "array",
        items: { type: "string" },
        description: "Narrow to these operations. Plain words work: 'additions', 'finings', 'punchdowns', 'pumpovers', 'racking', 'transfers', 'toppings', 'filtration', 'blends', 'crush', 'press', 'bottling', 'losses'. Canonical types also work: ADDITION, FINING, CAP_MGMT, RACK, TOPPING, FILTRATION, BLEND, CRUSH, PRESS, BOTTLE, LOSS, ADJUST, CORRECTION, SEED. Omit for every operation.",
      },
      opType: { type: "string", description: "Convenience form of `opTypes` for a single kind, e.g. 'additions'." },
      allTime: { type: "boolean", description: "True to include operations from BEFORE the vessel's current fill (prior wines). Default false — the current fill only, matching the vessel page. Ignored for a lot, whose history is already complete." },
      includeCorrected: { type: "boolean", description: "True to include operations a later correction reversed. Default false." },
      sinceDays: { type: "number", description: "Only operations from the last N days." },
      since: { type: "string", description: "Only operations on or after this ISO date (e.g. '2026-07-01')." },
      staleAfterDays: { type: "number", description: "Multi-vessel sweeps only: split vessels into overdue (last matching operation this many days ago or longer) and recent. Use for 'which tanks haven't been punched down in 3 days' → 3." },
      limit: { type: "number", description: `Max operations to return for a single vessel or lot. Default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}.` },
    },
  },
  async run(_ctx, rawInput) {
    const input = normalize(rawInput);
    const nowMs = Date.now();
    const limit = clampLimit(input.limit);
    const gte = sinceMs(input, nowMs);

    const { types, unknown: unknownOpTypes } = resolveOperationFilter(input.opTypes);
    if (unknownOpTypes.length && !types) {
      return {
        message: `I don't recognize the operation type ${unknownOpTypes.map((t) => `"${t}"`).join(", ")}. Try additions, finings, punchdowns, rackings, toppings, filtration, blends, crush, press, or bottling.`,
      };
    }

    const filterOpts = { types, sinceMs: gte, includeCorrected: input.includeCorrected };
    const hasVesselTarget = !!input.vessel || (input.vessels ?? []).length > 0 || !!input.vesselType;

    if (!hasVesselTarget && !input.lot) {
      return { message: "Which tank, barrel, or lot should I look up? You can also ask across all tanks or all barrels." };
    }

    // ---- LOT scope: follows the wine across every vessel it has lived in. --------------------
    if (input.lot && !hasVesselTarget) {
      const { lotId, lotCode } = await resolveLotTarget({ lot: input.lot });
      const detail = await getLotDetail(lotId);
      if (!detail) return { message: `I couldn't load lot ${lotCode}.` };
      const matched = filterOperationItems(detail.events, filterOpts);
      if (matched.length === 0) {
        return {
          scope: "lot",
          lot: lotCode,
          message: `No ${types ? types.map((t) => operationLabel(t).toLowerCase()).join(" / ") + " " : ""}operations on record for lot ${lotCode}${gte ? " in that period" : ""}.`,
          ...(unknownOpTypes.length ? { unknownOpTypes } : {}),
        };
      }
      return {
        scope: "lot",
        lot: lotCode,
        lotStatus: detail.status,
        note: "The lot's full operation history, newest first — it follows the wine through every vessel it has lived in.",
        operations: matched.slice(0, limit).map((op) => opOut(op, nowMs)),
        ...listEnvelope(matched, limit, unknownOpTypes),
      };
    }

    const { vessels, unknown: unknownVessels } = await resolveTargetVessels(input);
    if (vessels.length === 0) {
      return { message: unknownVessels.length ? `I couldn't find ${unknownVessels.join(", ")}. Use a code like "T3" or "barrel 14".` : "No matching vessels." };
    }

    // ---- SINGLE VESSEL, current fill: reuse the vessel page's own loader (exact parity). ------
    if (vessels.length === 1 && !input.allTime) {
      const v = vessels[0];
      const timeline = await getVesselTimeline(v.id);
      if (!timeline || timeline.windowStartAt === null) {
        return {
          scope: "vessel",
          vessel: v.label,
          empty: true,
          message: `${v.label} is empty — there is nothing in it now, so it has no current-fill history. Ask again with allTime: true for what it held before.`,
        };
      }
      const matched = filterOperationItems(timeline.items, filterOpts);
      const lot = await prisma.vesselLot.findFirst({
        where: { vesselId: v.id },
        orderBy: { volumeL: "desc" },
        select: { lot: { select: { code: true } } },
      });
      if (matched.length === 0) {
        return {
          scope: "vessel",
          vessel: v.label,
          lot: lot?.lot.code ?? null,
          filledAt: timeline.windowStartAt,
          message: `No ${types ? types.map((t) => operationLabel(t).toLowerCase()).join(" / ") + " " : ""}operations on record for ${v.label} in its current fill${gte ? " in that period" : ""}.`,
          ...(unknownOpTypes.length ? { unknownOpTypes } : {}),
        };
      }
      return {
        scope: "vessel",
        vessel: v.label,
        lot: lot?.lot.code ?? null,
        filledAt: timeline.windowStartAt,
        note: "This vessel's CURRENT fill only — everything since it was last emptied or cleaned. Ask with allTime for earlier wines.",
        operations: matched.slice(0, limit).map((op) => opOut(op, nowMs)),
        ...listEnvelope(matched, limit, unknownOpTypes, unknownVessels),
      };
    }

    // ---- SINGLE VESSEL, all time: the lean ledger read, unbounded by the occupancy window. ---
    if (vessels.length === 1 && input.allTime) {
      const v = vessels[0];
      const rows = await loadOps([v.id], types, input.includeCorrected);
      const typeById = await vesselTypeMap(rows);
      const matched = filterOperationItems(eventsForVessel(rows, v.id, typeById), filterOpts);
      if (matched.length === 0) {
        return { scope: "vessel-all-time", vessel: v.label, message: `No operations on record for ${v.label} at all.`, ...(unknownOpTypes.length ? { unknownOpTypes } : {}) };
      }
      return {
        scope: "vessel-all-time",
        vessel: v.label,
        note: "EVERY wine this vessel has held, not just the current fill. Ledger operations only — analyses, tastings and maintenance are not included on this path.",
        operations: matched.slice(0, limit).map((op) => opOut(op, nowMs)),
        ...listEnvelope(matched, limit, unknownOpTypes, unknownVessels),
      };
    }

    // ---- SWEEP: each vessel's most recent matching operation, stalest first. -----------------
    const vesselIds = vessels.map((v) => v.id);
    const [windows, residents] = await Promise.all([
      loadOccupancyWindows(vesselIds),
      prisma.vesselLot.findMany({
        where: { vesselId: { in: vesselIds } },
        orderBy: { volumeL: "desc" },
        select: { vesselId: true, lot: { select: { code: true } } },
      }),
    ]);
    const lotCodeByVessel = new Map<string, string>();
    for (const r of residents) if (!lotCodeByVessel.has(r.vesselId)) lotCodeByVessel.set(r.vesselId, r.lot.code);

    // A vessel with no occupancy window holds nothing. It is reported, never ranked: an empty tank
    // is not "overdue for a punchdown", and letting it place in the ranking would invent work.
    const occupied = input.allTime ? vessels : vessels.filter((v) => windows.has(v.id));
    const emptyVessels = vessels.filter((v) => !windows.has(v.id)).map((v) => v.label);
    if (occupied.length === 0) {
      return { scope: "sweep", message: `All ${vessels.length} of those vessels are empty right now.`, emptyVessels };
    }

    const rows = await loadOps(occupied.map((v) => v.id), types, input.includeCorrected);
    const typeById = await vesselTypeMap(rows);

    const sweepInput: SweepInput[] = occupied.map((v) => {
      const window = windows.get(v.id);
      const scoped = input.allTime ? rows : rows.filter((r) => (window ? inWindow(window, r.id, r.observedAt) : false));
      const events = filterOperationItems(eventsForVessel(scoped, v.id, typeById), filterOpts);
      // `events` is fold-order desc, so the head is the most recent by op id. Use observedAt for the
      // recency the user experiences; the two agree except on a backdated entry.
      const last = events.length
        ? events.reduce((best, e) => (new Date(e.observedAt).getTime() > new Date(best.observedAt).getTime() ? e : best))
        : null;
      return {
        vesselLabel: v.label,
        lotCode: lotCodeByVessel.get(v.id) ?? null,
        last: last ? { opId: last.id, type: last.type, summary: last.summary, observedAtMs: new Date(last.observedAt).getTime() } : null,
      };
    });

    const { ranked, neverInThisFill, overdue } = rankByStaleness(sweepInput, nowMs, input.staleAfterDays);
    const what = types ? types.map((t) => operationLabel(t).toLowerCase()).join(" / ") : "operation";
    return {
      scope: "sweep",
      comparison: "recency",
      ...(types ? { opTypes: types } : {}),
      note: `Each vessel's most recent ${what}, stalest first${input.allTime ? "" : ", within its current fill"}. Vessels in neverInThisFill have had NO such operation at all — they are more overdue than anything in the ranking, not less.`,
      vesselsCompared: occupied.length,
      results: ranked,
      neverInThisFill,
      ...(input.staleAfterDays != null ? { staleAfterDays: input.staleAfterDays, overdue: overdue.map((r) => r.vessel) } : {}),
      ...(emptyVessels.length ? { emptyVessels } : {}),
      ...(unknownOpTypes.length ? { unknownOpTypes } : {}),
      ...(unknownVessels.length ? { unknownVessels } : {}),
    };
  },
};
