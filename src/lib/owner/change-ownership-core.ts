import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { LedgerLine } from "@/lib/ledger/math";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { deriveBond } from "@/lib/compliance/bond";

// Plan 093 (custom-crush data foundation), Unit 5: CHANGE_OWNERSHIP — a change of PROPRIETOR (ownerId).
//
// ⚠️ Council C1 (both models): owner change ≠ bond change. A standard custom-crush client operates under
// the HOST's bond; a host↔client ownership change is a PURE TITLE TRANSFER with ZERO 5120.17 impact.
// Posting a transfer-in-bond there is a FALSE filing that fails a TTB audit. TIB applies ONLY when the
// wine crosses distinct bonded-winery numbers (host ↔ an AP proprietor with their own bond). So the op is
// CONDITIONAL on the bond delta:
//   • old bond == new bond → TITLE-ONLY: re-stamp ownerId, NO TTB line (a zero-line op, like a tax-class
//     event — LEDGER-2 forbids a zero-volume line, so a title move posts NO line at all).
//   • old bond != new bond → TITLE + a symmetric Removed/Received-in-Bond pair (in place), the real TIB.
//
// The old/new bond are computed with deriveBond: base = the owner-INDEPENDENT bond (skipOwnerPrecedence);
// oldBond = the AP bond of the CURRENT owner ?? base; newBond = the AP bond of the NEW owner ?? base.
// ownerId is a maintained PROJECTION (like vessel_component) — re-stamping the lot + its live positions is
// consistent with append-only; the immutable record is this CHANGE_OWNERSHIP op.

export type ChangeOwnershipInput = {
  lotId: string;
  /** the new proprietor; NULL transfers the wine to the facility (Estate). */
  newOwnerId: string | null;
  observedAt?: Date;
  note?: string | null;
  correctsOperationId?: number | null;
};

export type ChangeOwnershipResult = {
  operationId: number;
  lotId: string;
  lotCode: string;
  oldOwnerId: string | null;
  newOwnerId: string | null;
  oldBondId: string;
  newBondId: string;
  kind: "TITLE_ONLY" | "TRANSFER_IN_BOND";
  message: string;
};

/** The AP bond a given owner carries (Bond.ownerId link), or null (facility / a non-AP client). */
async function apBondForOwner(tx: Prisma.TransactionClient, ownerId: string | null): Promise<string | null> {
  if (!ownerId) return null;
  const b = await tx.bond.findFirst({ where: { ownerId }, select: { id: true } });
  return b?.id ?? null;
}

/** Re-stamp the lot's owner projection: the lot row + its LIVE positions (vessel_lot, bottled_lot_state).
 *  Historical operation lines keep their as-of owner — the immutable record is the CHANGE_OWNERSHIP op. */
async function restampOwner(tx: Prisma.TransactionClient, lotId: string, newOwnerId: string | null): Promise<void> {
  await tx.lot.update({ where: { id: lotId }, data: { ownerId: newOwnerId } });
  await tx.vesselLot.updateMany({ where: { lotId }, data: { ownerId: newOwnerId } });
  await tx.bottledLotState.updateMany({ where: { lotId }, data: { ownerId: newOwnerId } });
}

/**
 * CHANGE_OWNERSHIP inside the caller's tx. Computes the bond delta and branches title-only vs TIB.
 */
export async function changeOwnershipTx(
  tx: Prisma.TransactionClient,
  actor: LedgerActor,
  input: ChangeOwnershipInput,
): Promise<ChangeOwnershipResult> {
  if (!input.lotId) throw new ActionError("Pick a lot to change ownership of.");
  const observedAt = input.observedAt ?? new Date();

  const lot = await tx.lot.findUnique({ where: { id: input.lotId }, select: { id: true, code: true, ownerId: true } });
  if (!lot) throw new ActionError("That lot doesn't exist in this winery.", "CONFLICT");

  const oldOwnerId = lot.ownerId;
  const newOwnerId = input.newOwnerId ?? null;
  if (oldOwnerId === newOwnerId) {
    throw new ActionError("That lot is already owned by that party — nothing to change.", "CONFLICT");
  }
  if (newOwnerId) {
    const owner = await tx.owner.findUnique({ where: { id: newOwnerId }, select: { id: true, name: true } });
    if (!owner) throw new ActionError("That owner doesn't exist in this winery.", "CONFLICT");
  }

  // Bond delta: base (owner-independent) + each side's AP bond.
  const baseBond = await deriveBond(input.lotId, observedAt, tx, { skipOwnerPrecedence: true });
  const oldBondId = (await apBondForOwner(tx, oldOwnerId)) ?? baseBond;
  const newBondId = (await apBondForOwner(tx, newOwnerId)) ?? baseBond;

  const metaBase = { lotId: input.lotId, lotCode: lot.code, oldOwnerId, newOwnerId, oldBondId, newBondId };

  // ── TITLE-ONLY (same bond) — ZERO TTB. A zero-line op (LEDGER-2 forbids a zero-volume line, so a pure
  //    title move carries no line at all); the op + its metadata is the record a billing/invoice reads. ──
  if (oldBondId === newBondId) {
    const op = await tx.lotOperation.create({
      data: {
        type: "CHANGE_OWNERSHIP",
        observedAt,
        actorUserId: actor.actorUserId,
        enteredBy: actor.actorEmail,
        captureMethod: "MANUAL",
        note: input.note?.trim() || `Title transfer of ${lot.code} (no TTB — same bond)`,
        correctsOperationId: input.correctsOperationId ?? null,
        metadata: { ...metaBase, kind: "TITLE_ONLY" },
      },
      select: { id: true },
    });
    await restampOwner(tx, input.lotId, newOwnerId);
    await writeAudit(tx, {
      ...actor,
      action: "STOCK_MOVEMENT",
      entityType: "LotOperation",
      entityId: String(op.id),
      summary: `Change of ownership (title only): ${lot.code} → owner ${newOwnerId ?? "Estate"}`,
    });
    return { operationId: op.id, lotId: input.lotId, lotCode: lot.code, oldOwnerId, newOwnerId, oldBondId, newBondId, kind: "TITLE_ONLY", message: `Title of ${lot.code} transferred (no TTB — same bond).` };
  }

  // ── TITLE + TRANSFER-IN-BOND (host ↔ AP, distinct BWN). The wine does not physically move, so the bond
  //    flips IN PLACE: a symmetric Removed-in-Bond (source, oldBond) / Received-in-Bond (dest, newBond)
  //    pair on the SAME vessel (net-zero volume, non-zero legs → LEDGER-2 ok). Whole-lot, single-vessel
  //    (a partial cross-bond move would put one lot on two bonds — same guard as transferInBondTx). ──
  const positions = await tx.vesselLot.findMany({
    where: { lotId: input.lotId },
    select: { vesselId: true, volumeL: true, vessel: { select: { code: true, capacityL: true } } },
  });
  const held = positions.filter((p) => Number(p.volumeL) > 0);
  if (held.length === 0) throw new ActionError(`${lot.code} has no wine in a vessel — a cross-bond ownership change needs wine to move in bond.`, "CONFLICT");
  if (held.length > 1) throw new ActionError(`${lot.code} is split across ${held.length} vessels. Consolidate it into one vessel before a cross-bond ownership change.`, "CONFLICT");
  const pos = held[0];
  const volumeL = Number(pos.volumeL);

  const lines: LedgerLine[] = [
    { lotId: input.lotId, vesselId: pos.vesselId, deltaL: -volumeL, sourceBondId: oldBondId },
    { lotId: input.lotId, vesselId: pos.vesselId, deltaL: volumeL, destBondId: newBondId },
  ];
  const opId = await writeLotOperation(tx, {
    type: "CHANGE_OWNERSHIP",
    lines,
    actorUserId: actor.actorUserId,
    enteredBy: actor.actorEmail,
    captureMethod: "MANUAL",
    observedAt,
    note: input.note?.trim() || `Change of ownership of ${lot.code} with transfer-in-bond`,
    correctsOperationId: input.correctsOperationId ?? null,
    lotCodes: new Map([[input.lotId, lot.code]]),
    vesselCodes: new Map([[pos.vesselId, pos.vessel.code]]),
    capacityByVessel: new Map([[pos.vesselId, Number(pos.vessel.capacityL)]]),
  });
  await tx.lotOperation.update({ where: { id: opId }, data: { metadata: { ...metaBase, kind: "TRANSFER_IN_BOND", volumeL } } });
  await restampOwner(tx, input.lotId, newOwnerId);
  await writeAudit(tx, {
    ...actor,
    action: "STOCK_MOVEMENT",
    entityType: "LotOperation",
    entityId: String(opId),
    summary: `Change of ownership (transfer-in-bond): ${lot.code} → owner ${newOwnerId ?? "Estate"} (bond ${oldBondId} → ${newBondId})`,
  });
  return { operationId: opId, lotId: input.lotId, lotCode: lot.code, oldOwnerId, newOwnerId, oldBondId, newBondId, kind: "TRANSFER_IN_BOND", message: `${lot.code} ownership changed with a transfer-in-bond.` };
}

/** Standalone CHANGE_OWNERSHIP. Admin/assistant-gated at the action layer. */
export async function changeOwnershipCore(actor: LedgerActor, input: ChangeOwnershipInput): Promise<ChangeOwnershipResult> {
  return runLedgerWrite((tx) => changeOwnershipTx(tx, actor, input));
}

/**
 * Reverse a CHANGE_OWNERSHIP by re-applying the INVERSE change (swap owner back). This mirrors the exact
 * bond delta: a title-only change reverses title-only (no TTB); a TIB reverses as the mirror TIB. The
 * reversal is itself a CHANGE_OWNERSHIP op stamped correctsOperationId (append-only — the original stays).
 */
export async function reverseChangeOwnershipCore(actor: LedgerActor, input: { operationId: number; note?: string | null }): Promise<ChangeOwnershipResult & { correctionId: number }> {
  const op = await prisma.lotOperation.findUnique({ where: { id: input.operationId }, select: { id: true, type: true, metadata: true } });
  if (!op || op.type !== "CHANGE_OWNERSHIP") throw new ActionError("That operation isn't a change of ownership.", "CONFLICT");
  const m = (op.metadata ?? {}) as Record<string, unknown>;
  const lotId = String(m.lotId ?? "");
  const oldOwnerId = (m.oldOwnerId ?? null) as string | null;
  const newOwnerId = (m.newOwnerId ?? null) as string | null;
  // Re-apply the inverse: the lot currently sits on newOwnerId; put it back to oldOwnerId.
  const r = await changeOwnershipCore(actor, {
    lotId,
    newOwnerId: oldOwnerId,
    note: input.note ?? `Reversal of ownership change #${op.id}`,
    correctsOperationId: op.id,
  });
  return { ...r, correctionId: r.operationId, oldOwnerId: newOwnerId, newOwnerId: oldOwnerId };
}
