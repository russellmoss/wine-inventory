import { ActionError } from "@/lib/action-error";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { round2 } from "@/lib/bottling/draw";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import { balanceKey, type LedgerLine } from "@/lib/ledger/math";
import { FUNCTIONAL_ZERO_L, type LedgerBucket } from "@/lib/ledger/vocabulary";
import { resolveBucket } from "@/lib/sparkling/projection";
import type { LedgerActor } from "@/lib/vessels/rack-core";

// Phase 7 Unit 11: corrections for bottle-phase ops (D6/D15). The D15 guard is EXTENDED to cover
// BOTTLE_STORAGE positions (a lot's bottled volume + count), which planCorrection ignores (it
// only looks at vesselId-bearing legs). Volumetric bottle ops (DISGORGEMENT/DOSAGE, incl. the
// partial-disgorgement SPLIT) correct via a compensating CORRECTION op whose inverse lines the
// chokepoint re-folds; a zero-volume RIDDLING corrects via void. TIRAGE isn't un-bottled here,
// and FINISH is reversed by reverseFinalizeCore below.

export type BottleCorrectResult = {
  correctionId: number;
  correctedOperationId: number;
  kind: "reverted" | "voided";
  message: string;
};

const CORRECTABLE = new Set(["DISGORGEMENT", "DOSAGE", "RIDDLING"]);

export async function correctBottleOperationCore(actor: LedgerActor, input: { operationId: number; note?: string }): Promise<BottleCorrectResult> {
  const opId = input.operationId;
  const op = await prisma.lotOperation.findUnique({ where: { id: opId }, include: { lines: true, treatments: true, correctedBy: true } });
  if (!op) throw new ActionError("That operation no longer exists.");
  if (op.correctedBy) throw new ActionError("That operation has already been corrected.");
  if (op.type === "FINISH" || op.type === "TIRAGE") throw new ActionError(`A ${op.type} can't be corrected here (finalize is reversed via its run; tirage un-bottling isn't supported).`);
  if (!CORRECTABLE.has(op.type)) throw new ActionError(`A ${op.type} operation isn't correctable here.`);

  // ── Zero-volume RIDDLING: void the treatment + reset stage ──
  if (op.lines.length === 0) {
    const treatLot = op.treatments[0]?.lotId;
    const summary = `Voided riddling #${opId}`;
    const correctionId = await runLedgerWrite(async (tx) => {
      const corrId = await writeLotOperation(tx, {
        type: "CORRECTION", lines: [], actorUserId: actor.actorUserId, enteredBy: actor.actorEmail,
        note: input.note?.trim() || `Voids operation ${opId}`, correctsOperationId: opId,
        lotCodes: new Map(), vesselCodes: new Map(), capacityByVessel: new Map(),
      });
      await tx.lotTreatment.updateMany({ where: { operationId: opId }, data: { voidedByOperationId: corrId } });
      if (treatLot) await tx.bottledLotState.updateMany({ where: { lotId: treatLot, stage: "RIDDLING" }, data: { stage: "EN_TIRAGE" } });
      await writeAudit(tx, { ...actor, action: "STOCK_MOVEMENT", entityType: "LotOperation", entityId: String(corrId), summary });
      return corrId;
    });
    return { correctionId, correctedOperationId: opId, kind: "voided", message: `${summary}.` };
  }

  // ── Volumetric bottle op: compensating inverse, guarded on BOTTLE_STORAGE + vessel positions ──
  const affectedBottleLots = new Set(op.lines.filter((l) => l.bucket === "BOTTLE_STORAGE").map((l) => l.lotId));
  const affectedVesselKeys = new Set(op.lines.filter((l) => l.vesselId).map((l) => balanceKey(l.vesselId as string, l.lotId)));

  // Later (non-correction) activity that touched the same bottle lot or vessel position blocks it.
  const laterLines = await prisma.lotOperationLine.findMany({
    where: { operationId: { gt: opId }, operation: { type: { not: "CORRECTION" } } },
    select: { vesselId: true, lotId: true, bucket: true },
  });
  for (const l of laterLines) {
    if (l.bucket === "BOTTLE_STORAGE" && affectedBottleLots.has(l.lotId)) {
      throw new ActionError(`Can't undo ${op.type.toLowerCase()} #${opId}: a later bottle operation has since touched this lot. Undo that first.`, "CONFLICT");
    }
    if (l.vesselId && affectedVesselKeys.has(balanceKey(l.vesselId, l.lotId))) {
      throw new ActionError(`Can't undo ${op.type.toLowerCase()} #${opId}: a later operation has since touched the same wine. Undo that first.`, "CONFLICT");
    }
  }

  // Negative-fold pre-check on the affected bottle lots (friendly error before the chokepoint).
  const states = await prisma.bottledLotState.findMany({ where: { lotId: { in: [...affectedBottleLots] } } });
  const stateByLot = new Map(states.map((s) => [s.lotId, s]));
  const inverse: LedgerLine[] = op.lines.map((l) => ({
    lotId: l.lotId,
    vesselId: l.vesselId,
    deltaL: round2(-Number(l.deltaL)),
    reason: (l.reason as LedgerLine["reason"]) ?? undefined,
    bucket: l.bucket as LedgerBucket,
    bottleDelta: l.bottleDelta == null ? undefined : -l.bottleDelta,
  }));
  for (const lotId of affectedBottleLots) {
    const s = stateByLot.get(lotId);
    let vol = s ? Number(s.volumeL) : 0;
    let count = s ? s.bottleCount : 0;
    for (const l of inverse) {
      if (l.bucket === "BOTTLE_STORAGE" && l.lotId === lotId) {
        vol = round2(vol + l.deltaL);
        count += l.bottleDelta ?? 0;
      }
    }
    if (count < 0 || vol < -FUNCTIONAL_ZERO_L) {
      throw new ActionError(`Can't undo ${op.type.toLowerCase()} #${opId}: the bottles it affected are no longer present.`, "CONFLICT");
    }
  }

  const lotCodes = new Map(op.lines.map((l) => [l.lotId, l.lotCode]));
  const summary = `Reverted ${op.type.toLowerCase()} #${opId}`;
  const correctionId = await runLedgerWrite(async (tx) => {
    const corrId = await writeLotOperation(tx, {
      type: "CORRECTION", lines: inverse, actorUserId: actor.actorUserId, enteredBy: actor.actorEmail,
      note: input.note?.trim() || `Reverts operation ${opId}`, correctsOperationId: opId,
      lotCodes, vesselCodes: new Map(), capacityByVessel: new Map(),
    });
    await tx.lotTreatment.updateMany({ where: { operationId: opId }, data: { voidedByOperationId: corrId } });

    if (op.type === "DOSAGE") {
      // Reverting dosage removes the volume and clears the style back to a disgorged state.
      for (const lotId of affectedBottleLots) {
        await tx.bottledLotState.updateMany({ where: { lotId }, data: { stage: "DISGORGED", dosageStyle: null, dosageGramsPerL: null } });
      }
    } else if (op.type === "DISGORGEMENT") {
      // A partial-disgorgement SPLIT peeled a child (drained to zero by the inverse → its
      // BottledLotState is deleted). Mark that child CORRECTED and remove the SPLIT edge; the
      // parent is restored by the fold. A full disgorgement returns the parent to EN_TIRAGE.
      for (const lotId of affectedBottleLots) {
        const stillHasState = await tx.bottledLotState.findUnique({ where: { lotId }, select: { lotId: true } });
        if (!stillHasState) {
          await tx.lot.update({ where: { id: lotId }, data: { status: "CORRECTED" } });
          await tx.lotLineage.deleteMany({ where: { childLotId: lotId, kind: "SPLIT" } });
        } else {
          await tx.bottledLotState.update({ where: { lotId }, data: { stage: "EN_TIRAGE", disgorgedAt: null, disgorgementRunId: null } });
        }
      }
    }
    await writeAudit(tx, { ...actor, action: "STOCK_MOVEMENT", entityType: "LotOperation", entityId: String(corrId), summary });
    return corrId;
  });

  return { correctionId, correctedOperationId: opId, kind: "reverted", message: `${summary}.` };
}

// ── Finalize reversal (mirrors reverseBottlingTx): reopen the bottle lot ──

export type ReverseFinalizeResult = { operationId: number; reopenedLotId: string; message: string };

/**
 * Reverse a sparkling finalize: the produced bottles must still be on hand at the destination
 * (else block). Reverse the StockMovement/BottledInventory, delete the BottlingRun, then a
 * compensating op re-adds the bottled volume + count (reopening BottledLotState) and moves the
 * lot FINISHED → BOTTLED_IN_PROCESS.
 */
export async function reverseFinalizeCore(actor: LedgerActor, input: { runId: string; note?: string }): Promise<ReverseFinalizeResult> {
  const run = await prisma.bottlingRun.findUnique({ where: { id: input.runId }, include: { sources: true, wineSku: { select: { bottleSizeMl: true, method: true, dosageStyle: true } } } });
  if (!run) throw new ActionError("Finalize run not found.");
  const source = run.sources.find((s) => s.lotId);
  if (!source?.lotId) throw new ActionError("This run isn't a sparkling finalize (no lot source).");
  const lotId = source.lotId;
  const lot = await prisma.lot.findUnique({ where: { id: lotId }, select: { code: true, form: true } });
  if (!lot) throw new ActionError("The finalized lot no longer exists.");
  if (lot.form !== "FINISHED") throw new ActionError("That lot isn't in a finished state.");

  const volumeL = Number(source.volumeConsumedL);
  const bottleCount = run.bottlesProduced;

  const operationId = await runLedgerWrite(async (tx) => {
    // Bottles must still be on hand at the destination.
    const dec = await tx.bottledInventory.updateMany({
      where: { wineSkuId: run.wineSkuId, locationId: run.destinationLocationId, totalBottles: { gte: bottleCount } },
      data: { totalBottles: { decrement: bottleCount } },
    });
    if (dec.count === 0) throw new ActionError("Can't reverse: those bottles are no longer on hand at the destination (moved or sold). Adjust stock first.", "CONFLICT");

    await tx.stockMovement.deleteMany({ where: { bottlingRunId: input.runId } });

    // Compensating op: re-add volume + count into BOTTLE_STORAGE (reopens the projection),
    // balanced against the EXTERNAL "bottle" leg the FINISH drained to.
    const lines: LedgerLine[] = [
      { lotId, vesselId: null, deltaL: volumeL, bucket: "BOTTLE_STORAGE", bottleDelta: bottleCount },
      { lotId, vesselId: null, deltaL: -volumeL, bucket: "EXTERNAL", reason: "bottle" },
    ];
    const opId = await writeLotOperation(tx, {
      type: "CORRECTION", lines, actorUserId: actor.actorUserId, enteredBy: actor.actorEmail,
      note: input.note?.trim() || `Reverses finalize (run ${input.runId})`,
      lotCodes: new Map([[lotId, lot.code]]), vesselCodes: new Map(), capacityByVessel: new Map(),
      // The projection row was deleted at FINISH — this re-creates it. tirageAt is reconstructed
      // from the run's disgorgedAt/date (the exact original tirageAt isn't retained post-finalize).
      bottleState: {
        nominalFillMl: run.wineSku.bottleSizeMl,
        method: run.wineSku.method ?? "TRADITIONAL",
        tirageAt: run.disgorgedAt ?? run.date,
        stage: "DOSED",
      },
    });
    // Restore the dosage facts on the reopened projection.
    await tx.bottledLotState.update({ where: { lotId }, data: { dosageStyle: run.wineSku.dosageStyle, dosageGramsPerL: run.dosageGramsPerL, disgorgedAt: run.disgorgedAt } });

    await tx.bottlingRun.delete({ where: { id: input.runId } }); // cascades sources

    // Move the lot FINISHED → BOTTLED_IN_PROCESS (reversal — recorded directly, not via the
    // forward state machine, which has no un-transition; mirrors reverseBottlingTx).
    await tx.lotStateEvent.create({
      data: { lotId, kind: "FORM", fromValue: "FINISHED", toValue: "BOTTLED_IN_PROCESS", observedAt: new Date(), enteredById: actor.actorUserId, enteredByEmail: actor.actorEmail, operationId: opId, note: "finalize reversal" },
    });
    await tx.lot.update({ where: { id: lotId }, data: { form: "BOTTLED_IN_PROCESS" } });
    await writeAudit(tx, { ...actor, action: "DELETE", entityType: "BottlingRun", entityId: input.runId, summary: `Reversed finalize of ${bottleCount} bottles of ${lot.code} (bottle lot reopened)` });
    return opId;
  });

  return { operationId, reopenedLotId: lotId, message: `Reopened bottle lot ${lot.code}.` };
}
