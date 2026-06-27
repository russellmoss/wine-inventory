import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import { round2 } from "@/lib/bottling/draw";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import {
  balanceKey,
  planCorrection,
  planLedgerRack,
  type LedgerLine,
  type VesselLotBalance,
} from "@/lib/ledger/math";

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

async function loadVesselLots(vesselId: string) {
  return prisma.vesselLot.findMany({ where: { vesselId }, include: { lot: true } });
}

async function resolveNames(varietyIds: string[], vineyardIds: string[]) {
  const [vars, vys] = await Promise.all([
    prisma.variety.findMany({ where: { id: { in: [...new Set(varietyIds)] } }, select: { id: true, name: true } }),
    prisma.vineyard.findMany({ where: { id: { in: [...new Set(vineyardIds)] } }, select: { id: true, name: true } }),
  ]);
  return {
    varietyName: new Map(vars.map((v) => [v.id, v.name])),
    vineyardName: new Map(vys.map((v) => [v.id, v.name])),
  };
}

/** Rack wine from one vessel to another via a RACK ledger op + a VesselTransfer read-model. */
export async function rackWineCore(actor: LedgerActor, input: TransferWineInput): Promise<TransferWineResult> {
  const { fromVesselId, toVesselId } = input;
  if (!fromVesselId || !toVesselId) throw new ActionError("A source and a destination vessel are both required.");
  if (fromVesselId === toVesselId) throw new ActionError("Source and destination must be different vessels.");

  const [from, to] = await Promise.all([
    prisma.vessel.findUnique({ where: { id: fromVesselId } }),
    prisma.vessel.findUnique({ where: { id: toVesselId } }),
  ]);
  if (!from) throw new ActionError("Source vessel not found.");
  if (!to) throw new ActionError("Destination vessel not found.");
  if (!from.isActive) throw new ActionError(`${vesselLabel(from)} is inactive.`);
  if (!to.isActive) throw new ActionError(`${vesselLabel(to)} is inactive.`);

  const srcLots = await loadVesselLots(fromVesselId);
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
  const toCurrent = round2((await loadVesselLots(toVesselId)).reduce((a, r) => a + Number(r.volumeL), 0));
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

  const transferId = await runLedgerWrite(async (tx) => {
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
    return transfer.id;
  });

  const lossClause = lossL > 0 ? ` (${lossL} L lost to lees)` : "";
  return {
    transferId,
    message: `Racked ${addedL} L from ${fromLabel} to ${toLabel}${lossClause}.`,
    fromCode: from.code,
    toCode: to.code,
    volumeL: plan.drawL,
    lossL: plan.lossL,
    addedL,
  };
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

  const laterLines = await prisma.lotOperationLine.findMany({
    where: { operationId: { gt: rackOpId }, vesselId: { not: null }, operation: { type: { not: "CORRECTION" } } },
    select: { vesselId: true, lotId: true },
  });
  const touchedKeys = new Set(laterLines.map((l) => balanceKey(l.vesselId as string, l.lotId)));

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
