import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import { balanceKey, type LedgerLine } from "@/lib/ledger/math";
import { laterTouchedKeys } from "@/lib/ledger/reverse-guard";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { deriveBond } from "./bond";

// Phase 2 (BOND-1) — the TRANSFER_IN_BOND op family: move a lot across bonds as ONE balanced,
// SERIALIZABLE op that posts symmetric Removed-in-Bond (source, §A15/§B9) / Received-in-Bond (dest,
// §A7/§B3) to both bonds' 5120.17 chains. A one-sided or two-transaction post is a BOND-1 violation,
// so the removed + received legs are written together in a single writeLotOperation.
//
// v1 semantics: WHOLE-LOT, LOSSLESS. A transfer moves a lot's entire holding from ONE source vessel
// to ONE destination vessel and flips the lot's derived bond (deriveBond is per-lot single-valued —
// a partial cross-bond move would put one lot on two bonds, a "superposition of premises" the same
// way a cross-bond blend is forbidden). To move part of a lot to another bond, split it first
// (press/blend-split) and transfer the child. A physical transfer loss is recorded as a separate
// LOSS op. These boundaries keep the fold's per-lot bond attribution exact.

/** Bond-moving input (council Codex-CRIT2): `toBondId` is REQUIRED + non-null — a bond-moving op
 * NEVER derives its destination bond implicitly (only legacy/origination rows derive primary). The
 * source bond is derived from the lot's current position; source ≠ dest is enforced at runtime. */
export type TransferInBondInput = {
  lotId: string;
  toVesselId: string;
  toBondId: string;
  observedAt?: Date;
  note?: string | null;
  commandId?: string | null;
};

export type TransferInBondResult = {
  operationId: number;
  lotId: string;
  lotCode: string;
  fromBondId: string;
  toBondId: string;
  fromVesselId: string;
  toVesselId: string;
  volumeL: number;
  duplicate: boolean;
  message: string;
};

function isCommandConflict(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: string }).code === "P2002" &&
    JSON.stringify((e as { meta?: unknown }).meta ?? "").includes("commandId")
  );
}

/** Reconstruct the success result of an already-committed transfer (commandId idempotency). */
async function findByCommandId(commandId: string): Promise<TransferInBondResult | null> {
  const op = await prisma.lotOperation.findUnique({
    where: { commandId },
    select: { id: true, type: true, metadata: true },
  });
  if (!op || op.type !== "TRANSFER_IN_BOND") return null;
  const m = (op.metadata ?? {}) as Record<string, unknown>;
  return {
    operationId: op.id,
    lotId: String(m.lotId ?? ""),
    lotCode: String(m.lotCode ?? ""),
    fromBondId: String(m.fromBondId ?? ""),
    toBondId: String(m.toBondId ?? ""),
    fromVesselId: String(m.fromVesselId ?? ""),
    toVesselId: String(m.toVesselId ?? ""),
    volumeL: Number(m.volumeL ?? 0),
    duplicate: true,
    message: `Transfer-in-bond already recorded (operation #${op.id}).`,
  };
}

/**
 * The TRANSFER_IN_BOND op inside the caller's tx. Loads the lot's single-vessel position, derives its
 * current (source) bond, validates the explicit destination bond, and writes ONE balanced op:
 *   −V from the source vessel  (sourceBondId = fromBond → §A15/§B9 removed-in-bond)
 *   +V into the dest vessel     (destBondId  = toBond   → §A7/§B3  received-in-bond)
 * Does NOT do the commandId idempotency pre-check (that lives in transferInBondCore).
 */
export async function transferInBondTx(
  tx: Prisma.TransactionClient,
  actor: LedgerActor,
  input: TransferInBondInput,
): Promise<TransferInBondResult> {
  const toBondId = input.toBondId?.trim();
  if (!input.lotId) throw new ActionError("Pick a lot to transfer.");
  if (!input.toVesselId) throw new ActionError("Pick a destination vessel.");
  if (!toBondId) throw new ActionError("Pick the destination bond.");
  const observedAt = input.observedAt ?? new Date();

  const lot = await tx.lot.findUnique({ where: { id: input.lotId }, select: { id: true, code: true } });
  if (!lot) throw new ActionError("That lot doesn't exist in this winery.", "CONFLICT");

  // Whole-lot, single-vessel guard: the lot must sit in exactly one vessel with positive volume.
  const positions = await tx.vesselLot.findMany({
    where: { lotId: input.lotId },
    select: { vesselId: true, volumeL: true, vessel: { select: { code: true } } },
  });
  const held = positions.filter((p) => Number(p.volumeL) > 0);
  if (held.length === 0) throw new ActionError(`${lot.code} has no wine in a vessel to transfer.`, "CONFLICT");
  if (held.length > 1) {
    throw new ActionError(
      `${lot.code} is split across ${held.length} vessels. Consolidate it into one vessel before transferring it in bond.`,
      "CONFLICT",
    );
  }
  const from = held[0];
  const fromVesselId = from.vesselId;
  const volumeL = Number(from.volumeL);

  // Source bond is DERIVED (the lot's current bond); dest bond is EXPLICIT and must differ (BOND-1).
  const fromBondId = await deriveBond(input.lotId, observedAt, tx);
  if (toBondId === fromBondId) {
    throw new ActionError(`${lot.code} is already on that bond — nothing to transfer.`, "CONFLICT");
  }
  const toBond = await tx.bond.findUnique({ where: { id: toBondId }, select: { id: true, registryNumber: true } });
  if (!toBond) throw new ActionError("That destination bond doesn't exist in this winery.", "CONFLICT");

  const toVessel = await tx.vessel.findUnique({ where: { id: input.toVesselId }, select: { id: true, code: true, capacityL: true, isActive: true } });
  if (!toVessel) throw new ActionError("That destination vessel doesn't exist in this winery.", "CONFLICT");
  if (!toVessel.isActive) throw new ActionError(`${toVessel.code} is inactive.`, "CONFLICT");
  const fromVessel = await tx.vessel.findUnique({ where: { id: fromVesselId }, select: { id: true, code: true, capacityL: true } });

  // Symmetric legs — removed (source bond) + received (dest bond) in ONE op (BOND-1 atomicity).
  const lines: LedgerLine[] = [
    { lotId: input.lotId, vesselId: fromVesselId, deltaL: -volumeL, sourceBondId: fromBondId },
    { lotId: input.lotId, vesselId: input.toVesselId, deltaL: volumeL, destBondId: toBondId },
  ];

  const lotCodes = new Map([[input.lotId, lot.code]]);
  const vesselCodes = new Map<string, string>([[input.toVesselId, toVessel.code]]);
  if (fromVessel) vesselCodes.set(fromVessel.id, fromVessel.code);
  const capacityByVessel = new Map<string, number>([[toVessel.id, Number(toVessel.capacityL)]]);
  if (fromVessel) capacityByVessel.set(fromVessel.id, Number(fromVessel.capacityL));

  const opId = await writeLotOperation(tx, {
    type: "TRANSFER_IN_BOND",
    lines,
    actorUserId: actor.actorUserId,
    enteredBy: actor.actorEmail,
    captureMethod: "MANUAL",
    observedAt,
    note: input.note?.trim() || `Transferred ${volumeL} L of ${lot.code} into bond ${toBond.registryNumber}`,
    commandId: input.commandId ?? null,
    lotCodes,
    vesselCodes,
    capacityByVessel,
  });
  await tx.lotOperation.update({
    where: { id: opId },
    data: { metadata: { lotId: input.lotId, lotCode: lot.code, fromBondId, toBondId, fromVesselId, toVesselId: input.toVesselId, volumeL } },
  });
  await writeAudit(tx, {
    ...actor,
    action: "STOCK_MOVEMENT",
    entityType: "LotOperation",
    entityId: String(opId),
    summary: `Transfer-in-bond: ${volumeL} L of ${lot.code} → bond ${toBond.registryNumber}`,
  });

  return {
    operationId: opId,
    lotId: input.lotId,
    lotCode: lot.code,
    fromBondId,
    toBondId,
    fromVesselId,
    toVesselId: input.toVesselId,
    volumeL,
    duplicate: false,
    message: `Transferred ${volumeL} L of ${lot.code} into bond ${toBond.registryNumber}.`,
  };
}

/** Standalone TRANSFER_IN_BOND with full crush-core commandId idempotency (a double-submit is a
 * no-op success, never a duplicate transfer). Admin-gated at the action layer. */
export async function transferInBondCore(actor: LedgerActor, input: TransferInBondInput): Promise<TransferInBondResult> {
  if (input.commandId) {
    const existing = await findByCommandId(input.commandId);
    if (existing) return existing;
  }
  try {
    return await runLedgerWrite((tx) => transferInBondTx(tx, actor, input));
  } catch (e) {
    if (input.commandId && isCommandConflict(e)) {
      const existing = await findByCommandId(input.commandId);
      if (existing) return existing;
    }
    throw e;
  }
}

export type ReverseTransferInBondResult = {
  correctionId: number;
  reversedOperationId: number;
  lotId: string;
  message: string;
};

/**
 * Reverse a TRANSFER_IN_BOND as a bond-SWAPPING CORRECTION (LEDGER-10 append-only; LEDGER-3 single
 * correction; LEDGER-11 downstream guard). The inverse is a clean transfer in the OPPOSITE direction:
 * the received leg (destBondId=toBond, +V) becomes removed-from-toBond (−V), and the removed leg
 * (sourceBondId=fromBond, −V) becomes received-back-into-fromBond (+V). Emitting properly-swapped
 * bond fields is what lets the fold post the reversal symmetrically AND lets C7's cascade derive BOTH
 * affected (formType, bond) chains from the emitted lines (council Codex-CRIT1 / Gemini-SF2). The
 * generic cellar corrector can't do this — it drops bond fields — so TRANSFER_IN_BOND has its own path.
 */
export async function reverseTransferInBondCore(
  actor: LedgerActor,
  input: { operationId: number; note?: string },
): Promise<ReverseTransferInBondResult> {
  const opId = input.operationId;
  const op = await prisma.lotOperation.findUnique({
    where: { id: opId },
    include: { lines: true, correctedBy: { select: { id: true } } },
  });
  if (!op) throw new ActionError("That operation no longer exists.");
  if (op.type !== "TRANSFER_IN_BOND") throw new ActionError("That operation isn't an in-bond transfer.", "CONFLICT");
  if (op.correctedBy) throw new ActionError("That transfer has already been reversed.");

  // LEDGER-11: block if any later non-correction op touched an affected (vessel, lot) position.
  const touchedKeys = await laterTouchedKeys(opId);
  const affected = op.lines.filter((l) => l.vesselId).map((l) => balanceKey(l.vesselId as string, l.lotId));
  if (affected.some((k) => touchedKeys.has(k))) {
    throw new ActionError(
      `Can't undo transfer #${opId}: a later operation has since touched the same wine. Undo that first.`,
      "CONFLICT",
    );
  }

  // Swapped inverse legs: a received leg (destBondId) → removed (sourceBondId); a removed leg
  // (sourceBondId) → received (destBondId). deltaL negated throughout.
  const inverse: LedgerLine[] = op.lines.map((l) => {
    const base: LedgerLine = { lotId: l.lotId, vesselId: l.vesselId, deltaL: -Number(l.deltaL) };
    if (l.destBondId) base.sourceBondId = l.destBondId; // was received here → now removed from here
    if (l.sourceBondId) base.destBondId = l.sourceBondId; // was removed here → now received back here
    return base;
  });

  // Friendly shortfall guard (LEDGER-1/7 also fail-close in the fold): the removed leg must still
  // find its wine where the transfer left it.
  const removedLegs = inverse.filter((l) => l.vesselId && l.deltaL < 0);
  if (removedLegs.length > 0) {
    const rows = await prisma.vesselLot.findMany({
      where: { OR: removedLegs.map((l) => ({ vesselId: l.vesselId as string, lotId: l.lotId })) },
      select: { vesselId: true, lotId: true, volumeL: true },
    });
    const have = new Map(rows.map((r) => [balanceKey(r.vesselId, r.lotId), Number(r.volumeL)]));
    for (const l of removedLegs) {
      const key = balanceKey(l.vesselId as string, l.lotId);
      if ((have.get(key) ?? 0) + l.deltaL < -0.01) {
        throw new ActionError(`Can't undo transfer #${opId}: the wine it moved is no longer where it was.`, "CONFLICT");
      }
    }
  }

  const lotCodes = new Map(op.lines.map((l) => [l.lotId, l.lotCode]));
  const affectedVesselIds = [...new Set(op.lines.filter((l) => l.vesselId).map((l) => l.vesselId as string))];
  const vessels = await prisma.vessel.findMany({ where: { id: { in: affectedVesselIds } }, select: { id: true, code: true, capacityL: true } });
  const vesselCodes = new Map(vessels.map((v) => [v.id, v.code]));
  const capacityByVessel = new Map(vessels.map((v) => [v.id, Number(v.capacityL)]));
  const anyLotId = op.lines[0]?.lotId ?? "";

  const correctionId = await runLedgerWrite(async (tx) => {
    const corrId = await writeLotOperation(tx, {
      type: "CORRECTION",
      lines: inverse,
      actorUserId: actor.actorUserId,
      enteredBy: actor.actorEmail,
      observedAt: op.observedAt, // folds into the corrected op's period → drives AMEND-1 if filed
      note: input.note?.trim() || `Reverses transfer-in-bond ${opId}`,
      correctsOperationId: opId,
      lotCodes,
      vesselCodes,
      capacityByVessel,
    });
    await writeAudit(tx, {
      ...actor,
      action: "STOCK_MOVEMENT",
      entityType: "LotOperation",
      entityId: String(corrId),
      summary: `Reversed transfer-in-bond #${opId}`,
    });
    return corrId;
  });

  return { correctionId, reversedOperationId: opId, lotId: anyLotId, message: `Reversed transfer-in-bond #${opId}.` };
}
