import { ActionError } from "@/lib/action-error";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { computeProportionalDraw, round2 } from "@/lib/bottling/draw";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { LedgerLine } from "@/lib/ledger/math";
import type { CaptureMethod } from "@/lib/ledger/vocabulary";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { vesselLabel } from "@/lib/cellar/addition";
import {
  allocateProportionalIncrease,
  normalizeCorrectionReason,
  planRecordedVolumeCorrection,
  MAX_REASON_CHARS,
} from "@/lib/cellar/volume-correction-plan";

// Script-safe core for a RECORDED-VOLUME CORRECTION — "the number is wrong, the wine never moved".
// The decision is pure (volume-correction-plan.ts); this is the DB half: read the vessel's current
// occupancy, ask the plan, and — only if it says CORRECT — write ONE ADJUST that moves the
// difference. The original SEED/fill is never touched: the books read 100 L until the correction,
// and 225 L after it, with the op in between saying who changed it and why.
//
// Distribution across residents is proportional, matching every other volumetric core. Under
// LEDGER-12 a vessel holds one lot, so in practice this is a single pair of legs; the proportional
// path exists for legacy co-residence and can only SCALE existing positions, never create one.

export type CorrectRecordedVolumeInput = {
  vesselId: string;
  /** What the vessel should read, in canonical liters. */
  targetVolumeL: number;
  /** Why the recorded number was wrong. Required — this is the audit trail. */
  reason: string;
  captureMethod?: CaptureMethod;
};

export type CorrectRecordedVolumeResult = {
  /** null when the submitted number already matched the books — nothing was appended. Never 0:
   *  a caller that offers "undo" must be able to tell "no op" from "operation #0". */
  operationId: number | null;
  message: string;
  fromL: number;
  toL: number;
  deltaL: number;
};

/** Correct a vessel's recorded volume as a data-entry fix — no wine moves, one ADJUST is appended. */
export async function correctRecordedVolumeCore(
  actor: LedgerActor,
  input: CorrectRecordedVolumeInput,
): Promise<CorrectRecordedVolumeResult> {
  const { vesselId } = input;
  if (!vesselId) throw new ActionError("A vessel is required.");

  const reason = normalizeCorrectionReason(input.reason);
  if (!reason) {
    throw new ActionError(
      `Say why the recorded volume was wrong (up to ${MAX_REASON_CHARS} characters) — a volume correction is only auditable with a reason.`,
    );
  }

  const targetVolumeL = round2(input.targetVolumeL);
  if (!Number.isFinite(targetVolumeL) || targetVolumeL <= 0) {
    throw new ActionError("Enter the volume the vessel actually holds, greater than 0. To empty it, use Dump instead.");
  }

  const vessel = await prisma.vessel.findUnique({ where: { id: vesselId } });
  if (!vessel) throw new ActionError("Vessel not found.");
  if (!vessel.isActive) throw new ActionError(`${vesselLabel(vessel)} is inactive.`);

  const residents = await prisma.vesselLot.findMany({ where: { vesselId }, include: { lot: true } });
  const currentL = round2(residents.reduce((a, r) => a + Number(r.volumeL), 0));
  const capacityL = Number(vessel.capacityL);

  const plan = planRecordedVolumeCorrection({ currentL, targetL: targetVolumeL, capacityL });

  if (plan.kind === "BLOCKED_EMPTY") {
    throw new ActionError(
      `${vesselLabel(vessel)} is empty, so there is no wine whose volume could be wrong. Fill it instead.`,
      "CONFLICT",
    );
  }
  if (plan.kind === "BLOCKED_OVER_CAPACITY") {
    throw new ActionError(
      `${vesselLabel(vessel)} holds ${plan.capacityL} L; it can't be corrected to ${plan.targetL} L.`,
      "CONFLICT",
    );
  }
  if (plan.kind === "NO_OP") {
    return {
      operationId: null,
      message: `${vesselLabel(vessel)} already reads ${plan.currentL} L — nothing to correct.`,
      fromL: plan.currentL,
      toL: plan.currentL,
      deltaL: 0,
    };
  }

  // Proportional over the residents, but the two directions are NOT symmetric helpers: taking
  // volume out is a draw (capped per position, so nothing goes negative), while putting it back is
  // an unbounded increase. Routing an increase through the draw helper is precisely the defect
  // that made B3 un-editable — it throws once the delta exceeds what the position holds.
  const positions = residents.map((r) => ({ id: r.lotId, volumeL: Number(r.volumeL) }));
  const shares =
    plan.deltaL > 0
      ? allocateProportionalIncrease(positions, plan.deltaL).map((s) => ({ id: s.id, amount: s.addL }))
      : computeProportionalDraw(positions, -plan.deltaL).map((s) => ({ id: s.id, amount: -s.deduct }));

  const lines: LedgerLine[] = [];
  for (const s of shares) {
    if (s.amount === 0) continue;
    const d = round2(s.amount);
    lines.push({ lotId: s.id, vesselId, deltaL: d });
    lines.push({ lotId: s.id, vesselId: null, deltaL: round2(-d), reason: "adjust" });
  }
  if (lines.length === 0) {
    throw new ActionError("Couldn't attribute that correction to the wine in this vessel.", "CONFLICT");
  }

  const lotCodes = new Map(residents.map((r) => [r.lotId, r.lot.code]));
  const vesselCodes = new Map([[vesselId, vessel.code]]);
  const capacityByVessel = new Map([[vesselId, capacityL]]);
  const summary = `Corrected recorded volume in ${vesselLabel(vessel)} from ${plan.fromL} L to ${plan.toL} L`;

  const metadata: Prisma.InputJsonValue = {
    adjustKind: "RECORDED_VOLUME_CORRECTION",
    reason,
    fromL: plan.fromL,
    toL: plan.toL,
    deltaL: plan.deltaL,
  };

  const operationId = await runLedgerWrite(async (tx) => {
    const opId = await writeLotOperation(tx, {
      type: "ADJUST",
      lines,
      actorUserId: actor.actorUserId,
      enteredBy: actor.actorEmail,
      captureMethod: input.captureMethod,
      note: `${summary} — ${reason}`,
      metadata,
      lotCodes,
      vesselCodes,
      capacityByVessel,
    });
    await writeAudit(tx, {
      ...actor,
      action: "STOCK_MOVEMENT",
      entityType: "LotOperation",
      entityId: String(opId),
      summary,
    });
    return opId;
  });

  return {
    operationId,
    message: `${summary}.`,
    fromL: plan.fromL,
    toL: plan.toL,
    deltaL: plan.deltaL,
  };
}
