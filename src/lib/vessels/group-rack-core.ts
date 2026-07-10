import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import { round2, computeProportionalDraw } from "@/lib/bottling/draw";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import {
  assertBalanced,
  planCorrection,
  planRackSplit,
  planRackMerge,
  type LedgerLine,
  type MultiSourceDraw,
  type RackDestination,
  type VesselLotBalance,
} from "@/lib/ledger/math";
import { laterTouchedKeys } from "@/lib/ledger/reverse-guard";
import { negateCostForReversedOp } from "@/lib/cost/reverse";
import type { LedgerActor } from "@/lib/vessels/rack-core";

// Phase 9.4a: group barrel-down / rack-barrels-to-tank as ONE reviewable work-order task → ONE
// balanced RACK LotOperation with many lines (NOT N ops, NOT a blend — lot identity is preserved).
// This is the "real group-rack completion adapter" the Phase 9.3 plan named as fallback (a). It does
// NOT abuse applyToGroup (that fans one op per member); it writes a single op whose lines span the
// source + all members, so the existing one-attempt-per-op + single-operationId reject model holds
// unchanged. Reversal is a single compensating CORRECTION over all lines (mirrors reverseTransformCore).
// Script-safe (no "use server"). The WO completion path calls groupRackTx inside its own runLedgerWrite;
// groupRackCore is the standalone wrapper (scripts/tests/timeline).

const EPS = 1e-9;

export type GroupRackDirection = "BARREL_DOWN" | "RACK_TO_TANK";

export type GroupBarrelDownInput = {
  direction: "BARREL_DOWN";
  sourceVesselId: string;
  destVesselIds: string[]; // resolved, sorted member list (the signed payload's order is authoritative)
  drawL?: number; // total to draw from the source; omit = move the whole source
  perDestVolumeL?: (number | null)[]; // explicit NET per-destination volume, aligned to destVesselIds; null = auto
  lossL?: number;
  note?: string;
};

export type GroupRackToTankInput = {
  direction: "RACK_TO_TANK";
  sourceVesselIds: string[]; // resolved, sorted member list
  destVesselId: string;
  perSourceDrawL?: (number | null)[]; // explicit per-source draw, aligned to sourceVesselIds; null = drain full
  lossL?: number;
  note?: string;
};

export type GroupRackInput = GroupBarrelDownInput | GroupRackToTankInput;

export type GroupRackResult = {
  operationId: number;
  message: string;
  direction: GroupRackDirection;
  drawnL: number;
  intoL: number;
  lossL: number;
  memberCount: number;
};

export type GroupRackMemberPreview = {
  vesselId: string;
  code: string;
  label: string;
  role: "source" | "destination";
  currentL: number;
  capacityL: number;
  allocationL: number; // signed: − drawn from a source, + delivered into a destination
  status: "ready" | "blocked";
  message: string;
};

export type GroupRackPreview = {
  direction: GroupRackDirection;
  status: "ready" | "blocked";
  reason: string | null;
  parentSummary: string; // e.g. "Rack T12 to 10 barrels (B101–B110)"
  drawnL: number;
  intoL: number;
  lossL: number;
  members: GroupRackMemberPreview[];
};

type DbClient = Prisma.TransactionClient;

type LoadedVessel = {
  id: string;
  code: string;
  type: string;
  isActive: boolean;
  capacityL: number;
  currentL: number;
  lots: { lotId: string; code: string; volumeL: number }[];
};

function vesselLabel(v: { type: string; code: string }): string {
  return v.type === "BARREL" ? `Barrel ${v.code}` : `Tank ${v.code}`;
}

async function loadVessels(ids: string[], client: DbClient): Promise<Map<string, LoadedVessel>> {
  const uniq = [...new Set(ids)];
  const rows = await client.vessel.findMany({
    where: { id: { in: uniq } },
    select: {
      id: true,
      code: true,
      type: true,
      isActive: true,
      capacityL: true,
      vesselLots: { select: { lotId: true, volumeL: true, lot: { select: { code: true } } } },
    },
  });
  const map = new Map<string, LoadedVessel>();
  for (const r of rows) {
    const lots = r.vesselLots.map((vl) => ({ lotId: vl.lotId, code: vl.lot.code, volumeL: Number(vl.volumeL) }));
    map.set(r.id, {
      id: r.id,
      code: r.code,
      type: r.type,
      isActive: r.isActive,
      capacityL: Number(r.capacityL),
      currentL: round2(lots.reduce((a, l) => a + l.volumeL, 0)),
      lots,
    });
  }
  return map;
}

/** Greedy fill-to-headroom allocation across destinations, in the given order, bounded by `drawTotal`. */
function fillToHeadroom(dests: LoadedVessel[], drawTotal: number): { vesselId: string; volumeL: number }[] {
  let remaining = drawTotal;
  const out: { vesselId: string; volumeL: number }[] = [];
  for (const d of dests) {
    if (remaining <= EPS) break;
    const headroom = round2(d.capacityL - d.currentL);
    if (headroom <= EPS) continue;
    const v = round2(Math.min(headroom, remaining));
    out.push({ vesselId: d.id, volumeL: v });
    remaining = round2(remaining - v);
  }
  if (remaining > 0.01) {
    const totalHeadroom = round2(dests.reduce((a, d) => a + Math.max(0, d.capacityL - d.currentL), 0));
    throw new ActionError(
      `The destination barrels can only hold ${totalHeadroom} L, but ${drawTotal} L needs to move. Add barrels or reduce the amount.`,
      "CONFLICT",
    );
  }
  return out;
}

type BuiltPlan = {
  lines: LedgerLine[];
  drawnL: number;
  intoL: number;
  lossL: number;
  allocations: Map<string, number>; // vesselId → signed allocation
  lotCodes: Map<string, string>;
  vesselCodes: Map<string, string>;
  capacityByVessel: Map<string, number>;
  members: LoadedVessel[];
  sideVessel: LoadedVessel;
  summary: string;
};

/** Pure(ish) plan build over loaded vessel state. Throws friendly ActionErrors; never writes. */
function buildGroupRackPlan(input: GroupRackInput, loaded: Map<string, LoadedVessel>): BuiltPlan {
  const lossL = input.lossL == null ? 0 : round2(input.lossL);
  if (lossL < 0) throw new ActionError("Loss can't be negative.");

  const lotCodes = new Map<string, string>();
  const vesselCodes = new Map<string, string>();
  const capacityByVessel = new Map<string, number>();
  const allocations = new Map<string, number>();

  const requireVessel = (id: string, role: string): LoadedVessel => {
    const v = loaded.get(id);
    if (!v) throw new ActionError(`A ${role} vessel isn't accessible in this winery.`, "CONFLICT");
    if (!v.isActive) throw new ActionError(`${vesselLabel(v)} is inactive.`, "CONFLICT");
    vesselCodes.set(v.id, v.code);
    capacityByVessel.set(v.id, v.capacityL);
    for (const l of v.lots) lotCodes.set(l.lotId, l.code);
    return v;
  };

  if (input.direction === "BARREL_DOWN") {
    const src = requireVessel(input.sourceVesselId, "source");
    if (src.currentL <= 0) throw new ActionError(`${vesselLabel(src)} is empty.`);
    const memberIds = [...new Set(input.destVesselIds)].filter((id) => id !== src.id);
    if (memberIds.length === 0) throw new ActionError("A barrel-down needs at least one destination vessel.");
    const dests = memberIds.map((id) => requireVessel(id, "destination"));

    const drawTotal = input.drawL == null ? src.currentL : round2(input.drawL);
    if (!(drawTotal > 0)) throw new ActionError("Transfer volume must be greater than 0.");
    if (drawTotal > src.currentL + EPS) throw new ActionError(`${vesselLabel(src)} only holds ${src.currentL} L; can't move ${drawTotal} L.`);
    if (lossL > drawTotal + EPS) throw new ActionError("Loss can't exceed the transfer volume.");
    const intoTotal = round2(drawTotal - lossL);

    // Destination NET volumes: explicit overrides (aligned to destVesselIds) or greedy fill-to-headroom.
    let destinations: RackDestination[];
    if (input.perDestVolumeL && input.perDestVolumeL.some((v) => v != null)) {
      destinations = [];
      input.destVesselIds.forEach((id, i) => {
        const v = input.perDestVolumeL?.[i];
        if (v != null && v > 0) destinations.push({ vesselId: id, volumeL: round2(v) });
      });
      const sumDest = round2(destinations.reduce((a, d) => a + d.volumeL, 0));
      if (Math.abs(sumDest - intoTotal) > 0.01) {
        throw new ActionError(`The per-barrel volumes total ${sumDest} L but ${intoTotal} L is available to place (draw ${drawTotal} L − loss ${lossL} L).`, "CONFLICT");
      }
    } else {
      destinations = fillToHeadroom(dests, intoTotal);
    }
    // Headroom guard per destination (friendly; the chokepoint also enforces LEDGER-4).
    for (const d of destinations) {
      const v = loaded.get(d.vesselId)!;
      if (round2(v.currentL + d.volumeL) > v.capacityL + 0.01) {
        throw new ActionError(`That would exceed ${vesselLabel(v)}'s ${v.capacityL} L capacity (holds ${v.currentL} L, adding ${d.volumeL} L).`, "CONFLICT");
      }
    }

    const balances: VesselLotBalance[] = src.lots.map((l) => ({ vesselId: src.id, lotId: l.lotId, volumeL: l.volumeL }));
    const plan = planRackSplit(balances, destinations, lossL);
    allocations.set(src.id, round2(-plan.drawnL));
    for (const d of destinations) allocations.set(d.vesselId, d.volumeL);

    const summary = `Barrel down ${vesselLabel(src)} to ${destinations.length} ${destinations.length === 1 ? "barrel" : "barrels"} (${plan.intoL} L${lossL > 0 ? `, ${lossL} L lost` : ""})`;
    return {
      lines: plan.lines,
      drawnL: plan.drawnL,
      intoL: plan.intoL,
      lossL: plan.lossL,
      allocations,
      lotCodes,
      vesselCodes,
      capacityByVessel,
      members: dests,
      sideVessel: src,
      summary,
    };
  }

  // RACK_TO_TANK: many sources → one destination.
  const dest = requireVessel(input.destVesselId, "destination");
  const memberIds = [...new Set(input.sourceVesselIds)].filter((id) => id !== dest.id);
  if (memberIds.length === 0) throw new ActionError("A rack-to-tank needs at least one source vessel.");
  const sources = memberIds.map((id) => requireVessel(id, "source"));

  const draws: MultiSourceDraw[] = [];
  memberIds.forEach((id, i) => {
    const v = loaded.get(id)!;
    const override = input.perSourceDrawL?.[i];
    const totalDraw = override != null ? round2(override) : v.currentL;
    if (v.currentL <= 0) return; // empty source contributes nothing (skipped, not an error)
    if (totalDraw > v.currentL + EPS) throw new ActionError(`${vesselLabel(v)} only holds ${v.currentL} L; can't draw ${totalDraw} L.`, "CONFLICT");
    if (totalDraw <= 0) return;
    // Split the per-vessel draw across that vessel's lots proportionally (identity preserved).
    const perLot = v.lots.length === 1
      ? [{ lotId: v.lots[0].lotId, drawL: totalDraw }]
      : splitDrawAcrossLots(v.lots, totalDraw);
    for (const p of perLot) draws.push({ vesselId: v.id, lotId: p.lotId, drawL: p.drawL });
  });
  if (draws.length === 0) throw new ActionError("All source vessels are empty — nothing to rack.");

  const drawTotal = round2(draws.reduce((a, d) => a + d.drawL, 0));
  if (lossL > drawTotal + EPS) throw new ActionError("Loss can't exceed the total drawn.");
  const intoTotal = round2(drawTotal - lossL);
  if (round2(dest.currentL + intoTotal) > dest.capacityL + 0.01) {
    throw new ActionError(`That would exceed ${vesselLabel(dest)}'s ${dest.capacityL} L capacity (holds ${dest.currentL} L, adding ${intoTotal} L).`, "CONFLICT");
  }

  const plan = planRackMerge(draws, dest.id, lossL);
  allocations.set(dest.id, plan.intoL);
  for (const v of sources) {
    const drawn = round2(draws.filter((d) => d.vesselId === v.id).reduce((a, d) => a + d.drawL, 0));
    if (drawn > 0) allocations.set(v.id, round2(-drawn));
  }
  const active = sources.filter((v) => (allocations.get(v.id) ?? 0) < 0);
  const summary = `Rack ${active.length} ${active.length === 1 ? "barrel" : "barrels"} to ${vesselLabel(dest)} (${plan.intoL} L${lossL > 0 ? `, ${lossL} L lost` : ""})`;
  return {
    lines: plan.lines,
    drawnL: plan.drawnL,
    intoL: plan.intoL,
    lossL: plan.lossL,
    allocations,
    lotCodes,
    vesselCodes,
    capacityByVessel,
    members: sources,
    sideVessel: dest,
    summary,
  };
}

/** Proportional per-lot split of a single vessel's draw (centiliter-exact largest-remainder). */
function splitDrawAcrossLots(lots: { lotId: string; volumeL: number }[], drawL: number): { lotId: string; drawL: number }[] {
  return computeProportionalDraw(lots.map((l) => ({ id: l.lotId, volumeL: l.volumeL })), drawL)
    .filter((d) => d.deduct > 0)
    .map((d) => ({ lotId: d.id, drawL: round2(d.deduct) }));
}

const groupRackMetadata = (input: GroupRackInput, plan: BuiltPlan): Prisma.InputJsonValue => ({
  groupRack: {
    direction: input.direction,
    sourceVesselIds: input.direction === "BARREL_DOWN" ? [input.sourceVesselId] : plan.members.filter((m) => (plan.allocations.get(m.id) ?? 0) < 0).map((m) => m.id),
    destVesselIds: input.direction === "BARREL_DOWN" ? plan.members.map((m) => m.id) : [input.destVesselId],
    allocations: [...plan.allocations.entries()].map(([vesselId, volumeL]) => ({ vesselId, volumeL })),
    intoL: plan.intoL,
    lossL: plan.lossL,
  },
});

/**
 * Rack a whole group in ONE balanced RACK op, WITHIN the caller's tx (Phase 9.4a). Mirrors rackWineTx
 * so a WO completion composes it with the attempt row + reservation release + audit in one
 * runLedgerWrite. `commandId` is threaded to the immutable op (LotOperation.commandId is UNIQUE — a
 * duplicate submit aborts with P2002, treated as success by the caller). No VesselTransfer (the 1:1
 * two-vessel read-model can't represent an N-vessel op); the op carries `metadata.groupRack` and is
 * reversed by reverseGroupRackCore.
 */
export async function groupRackTx(
  tx: Prisma.TransactionClient,
  actor: LedgerActor,
  input: GroupRackInput,
  opts: { commandId?: string | null; note?: string } = {},
): Promise<GroupRackResult> {
  const ids = input.direction === "BARREL_DOWN" ? [input.sourceVesselId, ...input.destVesselIds] : [input.destVesselId, ...input.sourceVesselIds];
  const loaded = await loadVessels(ids, tx);
  const plan = buildGroupRackPlan(input, loaded);
  assertBalanced(plan.lines);

  const opId = await writeLotOperation(tx, {
    type: "RACK",
    lines: plan.lines,
    actorUserId: actor.actorUserId,
    enteredBy: actor.actorEmail,
    note: (opts.note ?? input.note)?.trim() || null,
    commandId: opts.commandId ?? null,
    metadata: groupRackMetadata(input, plan),
    lotCodes: plan.lotCodes,
    vesselCodes: plan.vesselCodes,
    capacityByVessel: plan.capacityByVessel,
  });
  await writeAudit(tx, { ...actor, action: "STOCK_MOVEMENT", entityType: "LotOperation", entityId: String(opId), summary: plan.summary });

  return {
    operationId: opId,
    message: `${plan.summary}.`,
    direction: input.direction,
    drawnL: plan.drawnL,
    intoL: plan.intoL,
    lossL: plan.lossL,
    memberCount: plan.members.length,
  };
}

/** Standalone wrapper — owns the SERIALIZABLE tx. WO completion uses groupRackTx inside its own tx. */
export async function groupRackCore(actor: LedgerActor, input: GroupRackInput, opts: { commandId?: string | null } = {}): Promise<GroupRackResult> {
  return runLedgerWrite((tx) => groupRackTx(tx, actor, input, opts));
}

/** Preview (no write): resolved members + per-member allocation/headroom, one parent summary. */
export async function previewGroupRack(input: GroupRackInput): Promise<GroupRackPreview> {
  const ids = input.direction === "BARREL_DOWN" ? [input.sourceVesselId, ...input.destVesselIds] : [input.destVesselId, ...input.sourceVesselIds];
  const loaded = await loadVessels(ids, prisma as unknown as DbClient);
  try {
    const plan = buildGroupRackPlan(input, loaded);
    const members: GroupRackMemberPreview[] = [];
    const sideRole: "source" | "destination" = input.direction === "BARREL_DOWN" ? "source" : "destination";
    const memberRole: "source" | "destination" = input.direction === "BARREL_DOWN" ? "destination" : "source";
    const push = (v: LoadedVessel, role: "source" | "destination") => {
      const alloc = plan.allocations.get(v.id) ?? 0;
      members.push({
        vesselId: v.id,
        code: v.code,
        label: vesselLabel(v),
        role,
        currentL: v.currentL,
        capacityL: v.capacityL,
        allocationL: round2(alloc),
        status: "ready",
        message: alloc === 0 ? "no wine moved" : role === "destination" ? `+${round2(Math.abs(alloc))} L` : `−${round2(Math.abs(alloc))} L`,
      });
    };
    push(plan.sideVessel, sideRole);
    for (const m of plan.members) push(m, memberRole);
    return {
      direction: input.direction,
      status: "ready",
      reason: null,
      parentSummary: plan.summary,
      drawnL: plan.drawnL,
      intoL: plan.intoL,
      lossL: plan.lossL,
      members,
    };
  } catch (e) {
    const reason = e instanceof ActionError ? e.message : e instanceof Error ? e.message : "Group rack can't be planned.";
    return {
      direction: input.direction,
      status: "blocked",
      reason,
      parentSummary: input.direction === "BARREL_DOWN" ? "Barrel down" : "Rack to tank",
      drawnL: 0,
      intoL: 0,
      lossL: 0,
      members: [],
    };
  }
}

// ───────────────────────── Reversal (one CORRECTION over all lines) ─────────────────────────

/**
 * Reverse a group-rack op as a SINGLE compensating CORRECTION over ALL its lines (mirrors
 * reverseTransformCore). Loads every affected vessel for balances/codes/capacity, LIFO-guards via
 * laterTouchedKeys (LEDGER-11), writes ONE CORRECTION with correctsOperationId (LEDGER-10/3),
 * negates any cost the op recorded. Append-only — the original op is never mutated. Reached from
 * reverseOperationCore's `rack` family when the op has metadata.groupRack and no VesselTransfer.
 */
export async function reverseGroupRackCore(actor: LedgerActor, input: { operationId: number; note?: string }): Promise<{ correctionId: number; reversedOperationId: number; message: string }> {
  const opId = input.operationId;
  const op = await prisma.lotOperation.findUnique({
    where: { id: opId },
    include: { lines: true, correctedBy: { select: { id: true } } },
  });
  if (!op) throw new ActionError("That operation no longer exists.");
  if (op.correctedBy) throw new ActionError("That operation has already been reversed.");
  if (op.type !== "RACK") throw new ActionError(`A ${op.type} operation isn't a group rack.`);

  const origLines: LedgerLine[] = op.lines.map((l) => ({
    lotId: l.lotId,
    vesselId: l.vesselId,
    deltaL: Number(l.deltaL),
    reason: (l.reason as LedgerLine["reason"]) ?? undefined,
    bucket: (l.bucket as LedgerLine["bucket"]) ?? undefined,
    sourceBondId: l.sourceBondId ?? undefined,
    destBondId: l.destBondId ?? undefined,
  }));

  const touchedKeys = await laterTouchedKeys(opId);
  const vesselIds = [...new Set(op.lines.filter((l) => l.vesselId).map((l) => l.vesselId as string))];
  const [projRows, vessels] = await Promise.all([
    prisma.vesselLot.findMany({ where: { vesselId: { in: vesselIds } } }),
    prisma.vessel.findMany({ where: { id: { in: vesselIds } }, select: { id: true, code: true, capacityL: true, isActive: true } }),
  ]);
  const currentBalances: VesselLotBalance[] = projRows.map((r) => ({ vesselId: r.vesselId, lotId: r.lotId, volumeL: Number(r.volumeL) }));

  const corr = planCorrection(origLines, currentBalances, touchedKeys);
  if (!corr.ok) {
    if (corr.reason === "downstream-activity") {
      throw new ActionError("Can't undo this group rack — the wine has been racked, blended, or bottled since. Undo those first.", "CONFLICT");
    }
    throw new ActionError("Can't undo this group rack — the wine it moved is no longer where it was.", "CONFLICT");
  }
  for (const v of vessels) if (!v.isActive) throw new ActionError(`Can't return wine to ${v.code}: that vessel is inactive.`, "CONFLICT");

  const lotCodes = new Map(op.lines.map((l) => [l.lotId, l.lotCode]));
  const vesselCodes = new Map(op.lines.filter((l) => l.vesselId).map((l) => [l.vesselId as string, l.vesselCode ?? ""]));
  const capacityByVessel = new Map(vessels.map((v) => [v.id, Number(v.capacityL)]));
  const summary = `Reverted group rack #${opId}`;

  const correctionId = await runLedgerWrite(async (tx) => {
    const corrId = await writeLotOperation(tx, {
      type: "CORRECTION",
      lines: corr.lines,
      actorUserId: actor.actorUserId,
      enteredBy: actor.actorEmail,
      observedAt: op.observedAt, // fold into the corrected op's period (C5)
      note: input.note?.trim() || `Reverts group rack ${opId}`,
      correctsOperationId: opId,
      lotCodes,
      vesselCodes,
      capacityByVessel,
    });
    await negateCostForReversedOp(tx, opId, corrId);
    await writeAudit(tx, { ...actor, action: "STOCK_MOVEMENT", entityType: "LotOperation", entityId: String(corrId), summary });
    return corrId;
  });

  return { correctionId, reversedOperationId: opId, message: `${summary}.` };
}

/** True if an op is a group-rack op (RACK with groupRack metadata + no VesselTransfer). */
export function isGroupRackMetadata(metadata: unknown): boolean {
  return !!(metadata && typeof metadata === "object" && !Array.isArray(metadata) && "groupRack" in (metadata as Record<string, unknown>));
}
