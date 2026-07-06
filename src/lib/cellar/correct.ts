import { ActionError } from "@/lib/action-error";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import { planCorrection, type LedgerLine, type VesselLotBalance } from "@/lib/ledger/math";
import { laterTouchedKeys } from "@/lib/ledger/reverse-guard";
import { negateCostForReversedOp } from "@/lib/cost/reverse";
import type { LedgerActor } from "@/lib/vessels/rack-core";

// Correction across the Phase 3 ops (Unit 8, D6/D15). Two shapes:
//  - VOLUMETRIC ops (TOPPING, FILTRATION, LOSS) carry lines → a compensating CORRECTION op
//    with the inverse lines, guarded by planCorrection (refuses if a later non-correction op
//    touched an affected position). Any treatment rows the op created are voided too.
//  - NEUTRAL ops (ADDITION, FINING, CAP_MGMT) have no lines → a zero-line CORRECTION op that
//    sets LotTreatment.voidedByOperationId. Always allowed (no volumetric positions to guard).
// Originals are never mutated/deleted; the correction is a new immutable op. correctsOperationId
// is unique, so any op can be corrected at most once (double-correct is rejected by the DB).

export type CorrectResult = {
  correctionId: number;
  correctedOperationId: number;
  kind: "reverted" | "voided";
  message: string;
};

// Phase 2 (TAXPAID-1): REMOVE_TAXPAID is deliberately NOT correctable here — the tax-paid boundary is
// terminal, so an ordinary compensating inverse must never re-admit tax-paid volume in-bond. The only
// re-admission is a refund-flagged RETURN_TO_BOND (compliance/return-to-bond-core.ts).
const CORRECTABLE = new Set(["ADDITION", "FINING", "CAP_MGMT", "FILTRATION", "TOPPING", "LOSS"]);

/** Correct (revert volumetric / void neutral) a single Phase 3 operation. */
export async function correctOperationCore(
  actor: LedgerActor,
  input: { operationId: number; note?: string },
): Promise<CorrectResult> {
  const opId = input.operationId;
  const op = await prisma.lotOperation.findUnique({
    where: { id: opId },
    include: { lines: true, treatments: true, correctedBy: true },
  });
  if (!op) throw new ActionError("That operation no longer exists.");
  if (op.type === "CORRECTION") throw new ActionError("A correction can't itself be corrected.");
  if (!CORRECTABLE.has(op.type)) throw new ActionError(`A ${op.type} operation isn't correctable here.`);
  if (op.correctedBy) throw new ActionError("That operation has already been corrected.");

  // ── Neutral op (no volumetric lines): void the treatment(s) ──
  if (op.lines.length === 0) {
    const summary = `Voided ${op.type.toLowerCase()} #${opId}`;
    const correctionId = await runLedgerWrite(async (tx) => {
      const corrId = await writeLotOperation(tx, {
        type: "CORRECTION",
        lines: [],
        actorUserId: actor.actorUserId,
        enteredBy: actor.actorEmail,
        // C5: the compensating entry belongs to the period of the op it corrects (by observedAt),
        // so amending a filed period drives an Amended report instead of double-counting in "now".
        observedAt: op.observedAt,
        note: input.note?.trim() || `Voids operation ${opId}`,
        correctsOperationId: opId,
        lotCodes: new Map(),
        vesselCodes: new Map(),
        capacityByVessel: new Map(),
      });
      await tx.lotTreatment.updateMany({ where: { operationId: opId }, data: { voidedByOperationId: corrId } });
      // Phase 8 (Unit 11): negate this op's cost + restore drawn stock, by identity, on the correction.
      await negateCostForReversedOp(tx, opId, corrId);
      await writeAudit(tx, {
        ...actor,
        action: "STOCK_MOVEMENT",
        entityType: "LotOperation",
        entityId: String(corrId),
        summary,
      });
      return corrId;
    });
    return { correctionId, correctedOperationId: opId, kind: "voided", message: `${summary}.` };
  }

  // ── Volumetric op: compensating inverse, guarded by D15 ──
  // Preserve each leg's `reason` so the inverse legs stay self-describing (e.g. a reversed
  // REMOVE_TAXPAID keeps "tax_removal", letting the compliance fold NET it against the original).
  const origLines: LedgerLine[] = op.lines.map((l) => ({ lotId: l.lotId, vesselId: l.vesselId, deltaL: Number(l.deltaL), reason: (l.reason as LedgerLine["reason"]) ?? undefined }));

  // Shared LIFO guard: later ops that touched an affected position block the reverse — UNLESS they
  // are themselves already reversed (so a chain can unwind newest-first). See reverse-guard.ts.
  const touchedKeys = await laterTouchedKeys(opId);

  const affectedVesselIds = [...new Set(op.lines.filter((l) => l.vesselId).map((l) => l.vesselId as string))];
  const [projRows, vessels] = await Promise.all([
    prisma.vesselLot.findMany({ where: { vesselId: { in: affectedVesselIds } } }),
    prisma.vessel.findMany({ where: { id: { in: affectedVesselIds } }, select: { id: true, code: true, capacityL: true } }),
  ]);
  const currentBalances: VesselLotBalance[] = projRows.map((r) => ({ vesselId: r.vesselId, lotId: r.lotId, volumeL: Number(r.volumeL) }));

  const corr = planCorrection(origLines, currentBalances, touchedKeys);
  if (!corr.ok) {
    if (corr.reason === "downstream-activity") {
      throw new ActionError(
        `Can't undo ${op.type.toLowerCase()} #${opId}: a later operation has since touched the same wine. Undo that first.`,
        "CONFLICT",
      );
    }
    throw new ActionError(
      `Can't undo ${op.type.toLowerCase()} #${opId}: the wine it moved is no longer where it was.`,
      "CONFLICT",
    );
  }

  // Durable code snapshots come straight off the original lines.
  const lotCodes = new Map(op.lines.map((l) => [l.lotId, l.lotCode]));
  const vesselCodes = new Map(op.lines.filter((l) => l.vesselId).map((l) => [l.vesselId as string, l.vesselCode ?? ""]));
  const capacityByVessel = new Map(vessels.map((v) => [v.id, Number(v.capacityL)]));
  const summary = `Reverted ${op.type.toLowerCase()} #${opId}`;

  const correctionId = await runLedgerWrite(async (tx) => {
    const corrId = await writeLotOperation(tx, {
      type: "CORRECTION",
      lines: corr.lines,
      actorUserId: actor.actorUserId,
      enteredBy: actor.actorEmail,
      observedAt: op.observedAt, // C5: correction folds into the corrected op's period
      note: input.note?.trim() || `Reverts operation ${opId}`,
      correctsOperationId: opId,
      lotCodes,
      vesselCodes,
      capacityByVessel,
    });
    // A volumetric op may also carry treatment detail (filtration medium/micron) — void it.
    if (op.treatments.length > 0) {
      await tx.lotTreatment.updateMany({ where: { operationId: opId }, data: { voidedByOperationId: corrId } });
    }
    // Phase 8 (Unit 11): negate any cost + restore any drawn stock this op recorded (uniform contract).
    await negateCostForReversedOp(tx, opId, corrId);
    await writeAudit(tx, {
      ...actor,
      action: "STOCK_MOVEMENT",
      entityType: "LotOperation",
      entityId: String(corrId),
      summary,
    });
    return corrId;
  });

  return { correctionId, correctedOperationId: opId, kind: "reverted", message: `${summary}.` };
}

export type BatchCorrectOutcome = {
  operationId: number;
  status: "corrected" | "blocked" | "error";
  message: string;
};

export type BatchCorrectResult = {
  batchId: string;
  total: number;
  corrected: number;
  blocked: number;
  errored: number;
  outcomes: BatchCorrectOutcome[];
};

/**
 * Correct every member op of a group fan-out (shared batchId), honoring each op's own D15
 * guard. A member that can't be undone (later activity, or already corrected) is reported,
 * not thrown — the batch correction always completes.
 */
export async function correctBatchCore(actor: LedgerActor, input: { batchId: string }): Promise<BatchCorrectResult> {
  const ops = await prisma.lotOperation.findMany({
    where: { batchId: input.batchId, type: { not: "CORRECTION" } },
    orderBy: { id: "desc" }, // newest first — fewer false downstream blocks
    select: { id: true },
  });
  if (ops.length === 0) throw new ActionError("No operations found for that batch.");

  const outcomes: BatchCorrectOutcome[] = [];
  for (const o of ops) {
    try {
      const res = await correctOperationCore(actor, { operationId: o.id });
      outcomes.push({ operationId: o.id, status: "corrected", message: res.message });
    } catch (e) {
      if (e instanceof ActionError) {
        outcomes.push({ operationId: o.id, status: "blocked", message: e.message });
      } else {
        outcomes.push({ operationId: o.id, status: "error", message: e instanceof Error ? e.message : "Unexpected error" });
      }
    }
  }

  const corrected = outcomes.filter((o) => o.status === "corrected").length;
  const blocked = outcomes.filter((o) => o.status === "blocked").length;
  const errored = outcomes.filter((o) => o.status === "error").length;
  return { batchId: input.batchId, total: ops.length, corrected, blocked, errored, outcomes };
}
