import { ActionError } from "@/lib/action-error";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { round2 } from "@/lib/bottling/draw";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import { balanceKey, type LedgerLine } from "@/lib/ledger/math";
import { FUNCTIONAL_ZERO_L, type LedgerBucket } from "@/lib/ledger/vocabulary";
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

  // Later activity that touched the same bottle lot or vessel position blocks it — UNLESS that
  // later op has itself already been reversed/corrected (correctedBy set). Excluding corrected ops
  // is what lets a whole sparkling chain unwind LIFO: reverse FINISH, then its DOSAGE stops blocking
  // the DISGORGEMENT reversal, and so on back to the tirage (Phase 7 "reverse to tank").
  const laterLines = await prisma.lotOperationLine.findMany({
    where: { operationId: { gt: opId }, operation: { type: { not: "CORRECTION" }, correctedBy: { is: null } } },
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

  // The FINISH op that this run materialized — so the compensating op can mark it corrected
  // (unblocks the rest of the chain guard) and it shows as reverted on the timeline.
  const finishOp = await prisma.lotOperation.findFirst({
    where: { type: "FINISH", correctedBy: { is: null }, lines: { some: { lotId } } },
    orderBy: { id: "desc" },
    select: { id: true },
  });

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
      correctsOperationId: finishOp?.id ?? null,
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

// ── Tirage reversal (un-bottle → back to tank): the step correctBottleOperationCore refuses ──

export type ReverseTirageResult = { operationId: number; lotId: string; returnedToVessels: number; message: string };

/**
 * Reverse a TIRAGE: send the en-tirage wine back to the tank(s) it was drawn from. Inverse the
 * TIRAGE ledger lines through the chokepoint (VESSEL legs re-fill the source tanks, the
 * BOTTLE_STORAGE leg drains the bottled projection to zero → the row is deleted), void the
 * liqueur-de-tirage treatment, and rewind the form/AF transitions the tirage recorded (back to
 * WINE/JUICE + AF to its pre-tirage value). Guarded like the other bottle corrections: a later,
 * not-yet-reversed op on the same lot blocks it (so you must unwind riddling/disgorge/dose/finish
 * first — the LIFO chain). Mirrors reverseFinalizeCore's direct state-event rewind.
 */
export async function reverseTirageCore(actor: LedgerActor, input: { operationId: number; note?: string }): Promise<ReverseTirageResult> {
  const opId = input.operationId;
  const op = await prisma.lotOperation.findUnique({ where: { id: opId }, include: { lines: true, correctedBy: true } });
  if (!op) throw new ActionError("That operation no longer exists.");
  if (op.type !== "TIRAGE") throw new ActionError(`Operation #${opId} is a ${op.type}, not a tirage.`);
  if (op.correctedBy) throw new ActionError("That tirage has already been reversed.");

  const bottleLotIds = [...new Set(op.lines.filter((l) => l.bucket === "BOTTLE_STORAGE").map((l) => l.lotId))];
  if (bottleLotIds.length !== 1) throw new ActionError("Unexpected tirage shape — can't reverse.");
  const lotId = bottleLotIds[0];

  const lot = await prisma.lot.findUnique({ where: { id: lotId }, select: { code: true, form: true, afState: true, status: true } });
  if (!lot) throw new ActionError("The bottled lot no longer exists.");
  if (lot.status !== "ACTIVE") throw new ActionError(`Lot ${lot.code} is ${lot.status.toLowerCase()}.`);
  if (lot.form !== "BOTTLED_IN_PROCESS") throw new ActionError(`Lot ${lot.code} is ${lot.form}, not an en-tirage bottle lot — reverse the later steps first.`);

  // Chain guard: any later, not-yet-reversed op that touched this lot must be undone first (LIFO).
  const laterLines = await prisma.lotOperationLine.findMany({
    where: { operationId: { gt: opId }, lotId, operation: { type: { not: "CORRECTION" }, correctedBy: { is: null } } },
    select: { operationId: true },
  });
  if (laterLines.length > 0) {
    throw new ActionError(`Can't reverse tirage #${opId}: a later bottle operation still stands on this lot. Undo that first.`, "CONFLICT");
  }

  // Inverse every tirage leg: VESSEL legs pour the wine back into the tanks; the BOTTLE_STORAGE
  // leg (−volume, −count) drains the projection to zero (the chokepoint then deletes the row).
  const inverse: LedgerLine[] = op.lines.map((l) => ({
    lotId: l.lotId,
    vesselId: l.vesselId,
    deltaL: round2(-Number(l.deltaL)),
    reason: (l.reason as LedgerLine["reason"]) ?? undefined,
    bucket: l.bucket as LedgerBucket,
    bottleDelta: l.bottleDelta == null ? undefined : -l.bottleDelta,
  }));

  const vesselIds = [...new Set(op.lines.filter((l) => l.vesselId).map((l) => l.vesselId as string))];
  const vessels = await prisma.vessel.findMany({ where: { id: { in: vesselIds } }, select: { id: true, code: true, capacityL: true, isActive: true } });
  for (const v of vessels) if (!v.isActive) throw new ActionError(`Can't return wine to ${v.code}: that vessel is inactive.`, "CONFLICT");
  const capacityByVessel = new Map(vessels.map((v) => [v.id, Number(v.capacityL)]));
  const vesselCodes = new Map(vessels.map((v) => [v.id, v.code]));
  const lotCodes = new Map(op.lines.map((l) => [l.lotId, l.lotCode]));

  // The form/AF transitions this tirage recorded — reverse to their fromValue (WINE|JUICE, and AF
  // back to NONE when tirage started the 2nd ferment). Reading them keeps the rewind exact.
  const [formEvent, afEvent] = await Promise.all([
    prisma.lotStateEvent.findFirst({ where: { operationId: opId, kind: "FORM" }, select: { fromValue: true } }),
    prisma.lotStateEvent.findFirst({ where: { operationId: opId, kind: "AF" }, select: { fromValue: true } }),
  ]);
  const formBack = formEvent?.fromValue ?? "WINE";

  const summary = `Reversed tirage #${opId}: un-bottled ${lot.code} back to ${vessels.length === 1 ? vessels[0].code : `${vessels.length} tanks`}`;
  const correctionId = await runLedgerWrite(async (tx) => {
    const corrId = await writeLotOperation(tx, {
      type: "CORRECTION",
      lines: inverse,
      actorUserId: actor.actorUserId,
      enteredBy: actor.actorEmail,
      note: input.note?.trim() || `Reverses tirage ${opId} (un-bottled to tank)`,
      correctsOperationId: opId,
      lotCodes,
      vesselCodes,
      capacityByVessel,
    });
    // Void any liqueur-de-tirage treatment the tirage recorded (the sugar figure lived on the
    // now-deleted BottledLotState). Treatments attached to the tirage op itself.
    await tx.lotTreatment.updateMany({ where: { operationId: opId }, data: { voidedByOperationId: corrId } });

    // Rewind form BOTTLED_IN_PROCESS → WINE/JUICE, and AF ACTIVE → NONE if tirage started it.
    // Recorded directly (the forward state machine has no un-transition), mirroring reverseFinalize.
    await tx.lotStateEvent.create({
      data: { lotId, kind: "FORM", fromValue: "BOTTLED_IN_PROCESS", toValue: formBack, observedAt: new Date(), enteredById: actor.actorUserId, enteredByEmail: actor.actorEmail, operationId: corrId, note: "tirage reversal" },
    });
    const lotData: { form: string; afState?: string } = { form: formBack };
    if (afEvent) {
      await tx.lotStateEvent.create({
        data: { lotId, kind: "AF", fromValue: "ACTIVE", toValue: afEvent.fromValue, observedAt: new Date(), enteredById: actor.actorUserId, enteredByEmail: actor.actorEmail, operationId: corrId, note: "tirage reversal" },
      });
      lotData.afState = afEvent.fromValue;
    }
    await tx.lot.update({ where: { id: lotId }, data: lotData as never });

    await writeAudit(tx, { ...actor, action: "STOCK_MOVEMENT", entityType: "Lot", entityId: lotId, summary });
    return corrId;
  });

  return { operationId: correctionId, lotId, returnedToVessels: vesselIds.length, message: `${summary}.` };
}

// ── One entry point: reverse whichever bottle-phase op you point at, routed to the right core ──

export type ReverseSparklingResult = {
  correctionId: number;
  reversedOperationId: number;
  reversedType: string;
  lotId: string;
  message: string;
};

const REVERSIBLE_SPARKLING = new Set(["TIRAGE", "RIDDLING", "DISGORGEMENT", "DOSAGE", "FINISH"]);

/**
 * Reverse a single sparkling bottle-phase operation, dispatching by type: TIRAGE → un-bottle to
 * tank; RIDDLING/DISGORGEMENT/DOSAGE → compensating correction; FINISH → reverse the finalize
 * (reopen the bottle lot, pull the finished bottles). Callers unwind a whole chain by reversing
 * LIFO — newest op first — because each core's guard refuses while a not-yet-reversed later op
 * still stands on the lot.
 */
export async function reverseSparklingOperationCore(actor: LedgerActor, input: { operationId: number; note?: string }): Promise<ReverseSparklingResult> {
  const op = await prisma.lotOperation.findUnique({
    where: { id: input.operationId },
    include: { correctedBy: true, lines: { select: { lotId: true } } },
  });
  if (!op) throw new ActionError("That operation no longer exists.");
  if (op.correctedBy) throw new ActionError("That operation has already been reversed.");
  if (!REVERSIBLE_SPARKLING.has(op.type)) throw new ActionError(`A ${op.type} operation can't be reversed here.`);

  const anyLotId = op.lines[0]?.lotId ?? "";

  if (op.type === "TIRAGE") {
    const r = await reverseTirageCore(actor, { operationId: input.operationId, note: input.note });
    return { correctionId: r.operationId, reversedOperationId: input.operationId, reversedType: op.type, lotId: r.lotId, message: r.message };
  }

  if (op.type === "FINISH") {
    // Resolve the run this FINISH materialized: the id stamped on op.metadata (new finishes), else
    // the most recent run whose source is this lot (older finishes predate the metadata stamp).
    let runId = (op.metadata as { runId?: string } | null)?.runId ?? null;
    if (!runId) {
      const run = await prisma.bottlingRun.findFirst({ where: { sources: { some: { lotId: anyLotId } } }, orderBy: { date: "desc" }, select: { id: true } });
      runId = run?.id ?? null;
    }
    if (!runId) throw new ActionError("Couldn't find the finished-goods run for that finalize.");
    const r = await reverseFinalizeCore(actor, { runId, note: input.note });
    return { correctionId: r.operationId, reversedOperationId: input.operationId, reversedType: op.type, lotId: r.reopenedLotId, message: r.message };
  }

  // RIDDLING / DISGORGEMENT / DOSAGE
  const r = await correctBottleOperationCore(actor, { operationId: input.operationId, note: input.note });
  return { correctionId: r.correctionId, reversedOperationId: r.correctedOperationId, reversedType: op.type, lotId: anyLotId, message: r.message };
}
