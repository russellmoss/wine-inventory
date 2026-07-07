import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import { round2, computeProportionalDraw } from "@/lib/bottling/draw";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import {
  planCorrection,
  planLedgerRack,
  type LedgerLine,
  type VesselLotBalance,
} from "@/lib/ledger/math";
import { laterTouchedKeys } from "@/lib/ledger/reverse-guard";
import { blendLotsCore, type BlendComponentInput, type BlendLotsResult } from "@/lib/blend/blend-core";

// Script-safe core for racking + revert (no "use server", no next/cache, no server-only).
// transfer.ts wraps these in server actions + cache revalidation; scripts/tests call the
// cores directly with an explicit actor.

export type TransferWineInput = {
  fromVesselId: string;
  toVesselId: string;
  drawL?: number; // omit = full transfer (whole source)
  lossL?: number; // default 0
  note?: string;
};

export type TransferWineResult = {
  transferId: string;
  message: string;
  fromCode: string;
  toCode: string;
  volumeL: number;
  lossL: number;
  addedL: number;
  operationId: number; // the RACK ledger op this transfer wrote (Phase 9: WO completion links it)
};

export type RevertTransferResult = { transferId: string; message: string };
export type LedgerActor = { actorUserId: string | null; actorEmail: string };

const EPS = 1e-9;

function vesselLabel(v: { type: string; code: string }): string {
  return v.type === "BARREL" ? `Barrel ${v.code}` : `Tank ${v.code}`;
}

type SnapshotEntry = {
  varietyId?: string;
  vineyardId?: string;
  varietyName?: string | null;
  vineyardName?: string | null;
  vintage: number;
  volumeL: number;
};

// The read helpers accept an optional client so they can run inside a caller's tx (Phase 9 A2: the WO
// completion runs the whole rack in ONE runLedgerWrite). Default to the module prisma for the standalone
// callers (rackVesselCore, revertTransferCore).
// Base TransactionClient handle — NOT `Prisma.TransactionClient | typeof prisma`: the extended-vs-base
// union comparison blows TS's type-instantiation depth once the wider graph is large (Phase-1 Surprise
// 1 class; recurs after the Phase-2 + parity merge). The module `prisma` is structurally assignable and
// auto-injects tenantId at runtime regardless.
type DbClient = Prisma.TransactionClient;

async function loadVesselLots(vesselId: string, client: DbClient = prisma as unknown as DbClient) {
  return client.vesselLot.findMany({ where: { vesselId }, include: { lot: true } });
}

async function resolveNames(varietyIds: string[], vineyardIds: string[], client: DbClient = prisma as unknown as DbClient) {
  const [vars, vys] = await Promise.all([
    client.variety.findMany({ where: { id: { in: [...new Set(varietyIds)] } }, select: { id: true, name: true } }),
    client.vineyard.findMany({ where: { id: { in: [...new Set(vineyardIds)] } }, select: { id: true, name: true } }),
  ]);
  return {
    varietyName: new Map(vars.map((v) => [v.id, v.name])),
    vineyardName: new Map(vys.map((v) => [v.id, v.name])),
  };
}

/**
 * Rack wine from one vessel to another WITHIN the caller's tx (Phase 9 A2). Does every read + write
 * through `tx` so a WO completion can compose it with the attempt row + reservation release + audit in
 * ONE runLedgerWrite (no split-brain / dangling reservation). All reads move inside the tx — this also
 * closes the TOCTOU window the old read-then-write had. `rackWineCore` is the standalone wrapper.
 */
export async function rackWineTx(
  tx: Prisma.TransactionClient,
  actor: LedgerActor,
  input: TransferWineInput,
): Promise<TransferWineResult> {
  const { fromVesselId, toVesselId } = input;
  if (!fromVesselId || !toVesselId) throw new ActionError("A source and a destination vessel are both required.");
  if (fromVesselId === toVesselId) throw new ActionError("Source and destination must be different vessels.");

  const [from, to] = await Promise.all([
    tx.vessel.findUnique({ where: { id: fromVesselId } }),
    tx.vessel.findUnique({ where: { id: toVesselId } }),
  ]);
  if (!from) throw new ActionError("Source vessel not found.");
  if (!to) throw new ActionError("Destination vessel not found.");
  if (!from.isActive) throw new ActionError(`${vesselLabel(from)} is inactive.`);
  if (!to.isActive) throw new ActionError(`${vesselLabel(to)} is inactive.`);

  const srcLots = await loadVesselLots(fromVesselId, tx);
  const sourceTotal = round2(srcLots.reduce((a, r) => a + Number(r.volumeL), 0));
  if (sourceTotal <= 0) throw new ActionError(`${vesselLabel(from)} is empty.`);

  const drawL = input.drawL == null ? sourceTotal : round2(input.drawL);
  if (!(drawL > 0)) throw new ActionError("Transfer volume must be greater than 0.");
  if (drawL > sourceTotal + EPS) throw new ActionError(`${vesselLabel(from)} only holds ${sourceTotal} L; can't move ${drawL} L.`);

  const lossL = input.lossL == null ? 0 : round2(input.lossL);
  if (lossL < 0) throw new ActionError("Loss can't be negative.");
  if (lossL > drawL + EPS) throw new ActionError("Loss can't exceed the transfer volume.");

  const addedL = round2(drawL - lossL);
  const toCapacity = Number(to.capacityL);
  const toCurrent = round2((await loadVesselLots(toVesselId, tx)).reduce((a, r) => a + Number(r.volumeL), 0));
  if (toCurrent + addedL > toCapacity + EPS) {
    throw new ActionError(
      `That would exceed ${vesselLabel(to)}'s ${toCapacity} L capacity (it holds ${toCurrent} L, adding ${addedL} L).`,
      "CONFLICT",
    );
  }

  const balances: VesselLotBalance[] = srcLots.map((r) => ({ vesselId: r.vesselId, lotId: r.lotId, volumeL: Number(r.volumeL) }));
  const plan = planLedgerRack(balances, toVesselId, drawL, lossL);

  const lotById = new Map(srcLots.map((r) => [r.lotId, r.lot]));
  const names = await resolveNames(
    srcLots.map((r) => r.lot.originVarietyId ?? "").filter(Boolean),
    srcLots.map((r) => r.lot.originVineyardId ?? "").filter(Boolean),
    tx,
  );
  const snapshot: SnapshotEntry[] = plan.lines
    .filter((l) => l.vesselId === toVesselId && l.deltaL > 0)
    .map((l) => {
      const lot = lotById.get(l.lotId)!;
      return {
        varietyId: lot.originVarietyId ?? undefined,
        vineyardId: lot.originVineyardId ?? undefined,
        varietyName: lot.originVarietyId ? names.varietyName.get(lot.originVarietyId) ?? null : null,
        vineyardName: lot.originVineyardId ? names.vineyardName.get(lot.originVineyardId) ?? null : null,
        vintage: lot.vintageYear ?? 0,
        volumeL: round2(l.deltaL),
      };
    });

  const lotCodes = new Map(srcLots.map((r) => [r.lotId, r.lot.code]));
  const vesselCodes = new Map([
    [fromVesselId, from.code],
    [toVesselId, to.code],
  ]);
  const capacityByVessel = new Map([
    [fromVesselId, Number(from.capacityL)],
    [toVesselId, toCapacity],
  ]);

  const fromLabel = vesselLabel(from);
  const toLabel = vesselLabel(to);
  const lossNote = plan.lossL > 0 ? `, ${plan.lossL} L lost to lees` : "";
  const summary = `Racked ${addedL} L from ${fromLabel} to ${toLabel}${lossNote}`;

  const opId = await writeLotOperation(tx, {
    type: "RACK",
    lines: plan.lines,
    actorUserId: actor.actorUserId,
    enteredBy: actor.actorEmail,
    note: input.note?.trim() || null,
    lotCodes,
    vesselCodes,
    capacityByVessel,
  });
  const transfer = await tx.vesselTransfer.create({
    data: {
      fromVesselId: from.id,
      toVesselId: to.id,
      fromVesselCode: from.code,
      toVesselCode: to.code,
      volumeL: plan.drawL,
      lossL: plan.lossL,
      components: snapshot as unknown as Prisma.InputJsonValue,
      note: input.note?.trim() || null,
      actorUserId: actor.actorUserId,
      actorEmail: actor.actorEmail,
      lotOperationId: opId,
    },
    select: { id: true },
  });
  await writeAudit(tx, { ...actor, action: "STOCK_MOVEMENT", entityType: "VesselTransfer", entityId: transfer.id, summary });

  const lossClause = lossL > 0 ? ` (${lossL} L lost to lees)` : "";
  return {
    transferId: transfer.id,
    message: `Racked ${addedL} L from ${fromLabel} to ${toLabel}${lossClause}.`,
    fromCode: from.code,
    toCode: to.code,
    volumeL: plan.drawL,
    lossL: plan.lossL,
    addedL,
    operationId: opId,
  };
}

/** Rack wine from one vessel to another via a RACK ledger op + a VesselTransfer read-model. Standalone
 * wrapper — owns the SERIALIZABLE tx. WO completion uses rackWineTx directly inside its own tx (A2). */
export async function rackWineCore(actor: LedgerActor, input: TransferWineInput): Promise<TransferWineResult> {
  return runLedgerWrite((tx) => rackWineTx(tx, actor, input));
}

// ─────────────────────── Unit 8b: rack becomes blend-aware ───────────────────────

export type RackRoute = "RACK" | "BLEND";

/**
 * Decide how a rack into a destination should route (pure, council C1 / user):
 *   - empty destination            → RACK (plain move, unchanged);
 *   - destination holds the SAME lot the draw carries → RACK (a merge — the (vessel,lot)
 *     balance just grows, no lineage, NOT a blend);
 *   - destination holds a DIFFERENT lot → BLEND (grow-existing: the resident absorbs the draw
 *     and gains lineage), closing the Phase 4 co-residence loophole at the write path;
 *   - destination holds >1 lot (legacy co-residence) → RACK (leave it; don't guess a child).
 */
export function decideRackRoute(drawnSourceLotIds: string[], destLotIds: string[]): RackRoute {
  if (destLotIds.length !== 1) return "RACK";
  const resident = destLotIds[0];
  const drawsForeign = drawnSourceLotIds.some((id) => id !== resident);
  return drawsForeign ? "BLEND" : "RACK";
}

export type RackVesselInput = TransferWineInput & {
  // Escape hatch (user): when racking into an occupied vessel, mint a NEW blend lot instead of
  // growing the resident — the resident is fully drawn into the new `[vintage]-BL-<TOKEN>` child.
  newBlend?: { token: string; vintage?: number | null };
};

export type RackVesselResult =
  | ({ kind: "RACK" } & TransferWineResult)
  | ({ kind: "BLEND" } & BlendLotsResult & { fromCode: string; toCode: string });

/**
 * Blend-aware rack (Unit 8b). Routes a rack to a plain RACK, a same-lot merge, or a
 * GROW-EXISTING blend depending on the destination's residents — or to a NEW-LOT blend when
 * the caller takes the "make a new blend instead" escape. Shares blendLotsCore so lineage +
 * source-set + provenance are recorded identically to the /blend builder.
 */
export async function rackVesselCore(actor: LedgerActor, input: RackVesselInput): Promise<RackVesselResult> {
  const { fromVesselId, toVesselId } = input;
  if (!fromVesselId || !toVesselId) throw new ActionError("A source and a destination vessel are both required.");
  if (fromVesselId === toVesselId) throw new ActionError("Source and destination must be different vessels.");

  const [srcLots, destLots] = await Promise.all([loadVesselLots(fromVesselId), loadVesselLots(toVesselId)]);
  const sourceTotal = round2(srcLots.reduce((a, r) => a + Number(r.volumeL), 0));
  if (sourceTotal <= 0) throw new ActionError("The source vessel is empty.");
  const drawL = input.drawL == null ? sourceTotal : round2(input.drawL);
  if (!(drawL > 0)) throw new ActionError("Transfer volume must be greater than 0.");
  if (drawL > sourceTotal + EPS) throw new ActionError(`The source only holds ${sourceTotal} L; can't move ${drawL} L.`);
  const lossL = input.lossL == null ? 0 : round2(input.lossL);

  // Split the draw across the source's lots (matches planLedgerRack's proportional deduction).
  const deductions = computeProportionalDraw(
    srcLots.map((r) => ({ id: r.lotId, volumeL: Number(r.volumeL) })),
    drawL,
  );
  const drawnComponents: BlendComponentInput[] = deductions
    .filter((d) => d.deduct > 0)
    .map((d) => ({ vesselId: fromVesselId, lotId: d.id, drawL: round2(d.deduct) }));
  const drawnSourceLotIds = drawnComponents.map((c) => c.lotId);
  const destLotIds = destLots.map((r) => r.lotId);

  const route = decideRackRoute(drawnSourceLotIds, destLotIds);

  // Plain rack / same-lot merge (and no explicit new-blend escape) → unchanged path.
  if (route === "RACK" && !input.newBlend) {
    const res = await rackWineCore(actor, input);
    return { kind: "RACK", ...res };
  }

  // Blend path. GROW-EXISTING by default; NEW-LOT when the escape is taken (the lone resident is
  // fully drawn into the new lot so the destination ends holding only the child — council S4).
  const components = [...drawnComponents];
  let mode: "NEW_LOT" | "GROW_EXISTING" = "GROW_EXISTING";
  if (input.newBlend) {
    mode = "NEW_LOT";
    for (const r of destLots) {
      components.push({ vesselId: toVesselId, lotId: r.lotId, drawL: Number(r.volumeL), deplete: true });
    }
  }

  const blend = await blendLotsCore(actor, {
    mode,
    components,
    toVesselId,
    lossL,
    note: input.note,
    ...(mode === "NEW_LOT" ? { token: input.newBlend!.token, vintage: input.newBlend!.vintage ?? null } : {}),
  });

  const fromCode = srcLots[0]?.lot.code ?? fromVesselId;
  const toCode = destLots[0]?.lot.code ?? blend.childCode;
  return { kind: "BLEND", ...blend, fromCode, toCode };
}

/** The most recent rack still revertable (not reverted, not itself a reversal). */
export async function findRevertableTransfer(opts: { vesselId?: string } = {}) {
  return prisma.vesselTransfer.findFirst({
    where: {
      revertedAt: null,
      revertsId: null,
      ...(opts.vesselId ? { OR: [{ fromVesselId: opts.vesselId }, { toVesselId: opts.vesselId }] } : {}),
    },
    orderBy: { rackedAt: "desc" },
    include: { fromVessel: { select: { type: true } }, toVessel: { select: { type: true } } },
  });
}

/** Undo a rack via a compensating CORRECTION op (D6/D15), blocked if a later op touched it. */
export async function revertTransferCore(actor: LedgerActor, input: { transferId: string }): Promise<RevertTransferResult> {
  const original = await prisma.vesselTransfer.findUnique({
    where: { id: input.transferId },
    include: { lotOperation: { include: { lines: true } } },
  });
  if (!original) throw new ActionError("That transfer no longer exists.");
  if (original.revertedAt) throw new ActionError("That rack has already been reverted.");
  if (original.revertsId) throw new ActionError("That entry is itself a reversal — rack it again instead of reverting.");
  if (!original.lotOperation) throw new ActionError("That rack predates the ledger and can't be undone automatically. Rack it back manually.");
  if (!original.fromVesselId || !original.toVesselId) throw new ActionError("Can't revert: one of the original vessels no longer exists.");

  const rackOpId = original.lotOperation.id;
  const rackLines: LedgerLine[] = original.lotOperation.lines.map((l) => ({ lotId: l.lotId, vesselId: l.vesselId, deltaL: Number(l.deltaL) }));

  // Shared LIFO guard (reverse-guard.ts): later ops on an affected position block the revert —
  // unless they're themselves already reversed, so a rack chain can unwind newest-first.
  const touchedKeys = await laterTouchedKeys(rackOpId);

  const [dest, src] = await Promise.all([
    prisma.vessel.findUnique({ where: { id: original.toVesselId } }),
    prisma.vessel.findUnique({ where: { id: original.fromVesselId } }),
  ]);
  if (!dest) throw new ActionError(`The wine's current vessel (${original.toVesselCode}) no longer exists.`);
  if (!src) throw new ActionError(`The original source vessel (${original.fromVesselCode}) no longer exists.`);

  const [destLots, srcLots] = await Promise.all([loadVesselLots(dest.id), loadVesselLots(src.id)]);
  const currentBalances: VesselLotBalance[] = [...destLots, ...srcLots].map((r) => ({ vesselId: r.vesselId, lotId: r.lotId, volumeL: Number(r.volumeL) }));

  const corr = planCorrection(rackLines, currentBalances, touchedKeys);
  if (!corr.ok) {
    if (corr.reason === "downstream-activity") {
      throw new ActionError(`Can't revert: ${vesselLabel(dest)} has been racked, topped, or bottled since this rack. Undo those first.`, "CONFLICT");
    }
    throw new ActionError(`Can't revert: ${vesselLabel(dest)} no longer holds enough of the racked wine (it may have been bottled, blended, or racked on).`, "CONFLICT");
  }

  const lotCodes = new Map([...destLots, ...srcLots].map((r) => [r.lotId, r.lot.code]));
  const vesselCodes = new Map([
    [src.id, src.code],
    [dest.id, dest.code],
  ]);
  const capacityByVessel = new Map([
    [src.id, Number(src.capacityL)],
    [dest.id, Number(dest.capacityL)],
  ]);

  const totalL = round2(corr.lines.filter((l) => l.vesselId === src.id && l.deltaL > 0).reduce((a, l) => a + l.deltaL, 0));
  const destLabel = vesselLabel(dest);
  const srcLabel = vesselLabel(src);
  const summary = `Reverted rack: moved ${totalL} L back from ${destLabel} to ${srcLabel}`;

  const reversalId = await runLedgerWrite(async (tx) => {
    const opId = await writeLotOperation(tx, {
      type: "CORRECTION",
      lines: corr.lines,
      actorUserId: actor.actorUserId,
      enteredBy: actor.actorEmail,
      note: `Reverts rack ${original.id}`,
      correctsOperationId: rackOpId,
      lotCodes,
      vesselCodes,
      capacityByVessel,
    });
    const reversal = await tx.vesselTransfer.create({
      data: {
        fromVesselId: dest.id,
        toVesselId: src.id,
        fromVesselCode: dest.code,
        toVesselCode: src.code,
        volumeL: totalL,
        lossL: 0,
        components: (original.components ?? []) as unknown as Prisma.InputJsonValue,
        note: `Reverts rack ${original.id}`,
        actorUserId: actor.actorUserId,
        actorEmail: actor.actorEmail,
        revertsId: original.id,
        lotOperationId: opId,
      },
      select: { id: true },
    });
    await tx.vesselTransfer.update({ where: { id: original.id }, data: { revertedAt: new Date() } });
    await writeAudit(tx, { ...actor, action: "STOCK_MOVEMENT", entityType: "VesselTransfer", entityId: reversal.id, summary });
    return reversal.id;
  });

  return { transferId: reversalId, message: `Reverted the rack — moved ${totalL} L back from ${destLabel} to ${srcLabel}.` };
}
