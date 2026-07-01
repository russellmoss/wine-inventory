import { ActionError } from "@/lib/action-error";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { CaptureMethod } from "@/lib/ledger/vocabulary";
import type { LedgerActor } from "@/lib/vessels/rack-core";

// Phase 7 Unit 6: SCRIPT-SAFE core for RIDDLING (remuage) — a zero-volume work step. A RIDDLING
// LotOperation with NO volumetric lines (the chokepoint accepts a zero-line op, like ADDITION /
// CAP_MGMT) + a LotTreatment describing the method, and stage → RIDDLING. Volume and bottle count
// are untouched. UI is an inline one-tap quick-log, not a standalone form (K15).

export type RiddlingMethod = "pupitre" | "gyropalette";

export type RiddlingInput = {
  lotId: string;
  method?: RiddlingMethod;
  durationMin?: number; // optional cumulative riddling time
  note?: string;
  commandId?: string | null;
  captureMethod?: CaptureMethod;
};

export type RiddlingResult = { operationId: number; lotId: string };

export async function riddlingCore(actor: LedgerActor, input: RiddlingInput): Promise<RiddlingResult> {
  const state = await prisma.bottledLotState.findUnique({ where: { lotId: input.lotId }, include: { lot: { select: { code: true, status: true } } } });
  if (!state) throw new ActionError("That lot isn't an en-tirage bottle lot.");
  if (state.lot.status !== "ACTIVE") throw new ActionError(`Lot is ${state.lot.status.toLowerCase()}.`);
  const method = input.method ?? "pupitre";

  const operationId = await runLedgerWrite(async (tx) => {
    const opId = await writeLotOperation(tx, {
      type: "RIDDLING",
      lines: [], // zero-volume work step
      actorUserId: actor.actorUserId,
      enteredBy: actor.actorEmail,
      captureMethod: input.captureMethod,
      note: input.note?.trim() || null,
      commandId: input.commandId ?? null,
      lotCodes: new Map([[input.lotId, state.lot.code]]),
      vesselCodes: new Map(),
      capacityByVessel: new Map(),
    });
    await tx.lotTreatment.create({
      data: {
        operationId: opId,
        lotId: input.lotId,
        kind: "RIDDLING",
        medium: method,
        durationMin: input.durationMin ?? null,
        note: input.note?.trim() || null,
      },
    });
    await tx.bottledLotState.update({ where: { lotId: input.lotId }, data: { stage: "RIDDLING" } });
    await writeAudit(tx, {
      ...actor,
      action: "STOCK_MOVEMENT",
      entityType: "Lot",
      entityId: input.lotId,
      summary: `Riddling (${method}) logged for ${state.lot.code}`,
    });
    return opId;
  });

  return { operationId, lotId: input.lotId };
}
