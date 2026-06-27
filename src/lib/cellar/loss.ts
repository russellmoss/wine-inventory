import { ActionError } from "@/lib/action-error";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { round2 } from "@/lib/bottling/draw";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import { planVesselLoss, type VesselLotBalance } from "@/lib/ledger/math";
import type { CaptureMethod } from "@/lib/ledger/vocabulary";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { vesselLabel, type CellarBaseResult } from "@/lib/cellar/addition";

// Script-safe core for standalone volume LOSS / angel's share (Phase 3, Unit 5). Reuses
// the existing LOSS op type (D7): a volume-CHANGING op that removes `lossL` from the
// vessel proportionally across its lots, with the external counter-account legs tagged
// `evaporation`. No treatment row — there's no material/medium to record, the volumetric
// lines tell the whole story and the Phase-2 timeline already renders LOSS.

export type RecordLossInput = {
  vesselId: string;
  lossL: number;
  note?: string;
  captureMethod?: CaptureMethod;
  batchId?: string;
};

/** Record evaporation / angel's share leaving a vessel (volume drops; nothing moves in). */
export async function recordLossCore(actor: LedgerActor, input: RecordLossInput): Promise<CellarBaseResult> {
  const { vesselId } = input;
  if (!vesselId) throw new ActionError("A vessel is required.");
  const lossL = round2(input.lossL);
  if (!(lossL > 0)) throw new ActionError("Enter a volume lost greater than 0.");

  const vessel = await prisma.vessel.findUnique({ where: { id: vesselId } });
  if (!vessel) throw new ActionError("Vessel not found.");
  if (!vessel.isActive) throw new ActionError(`${vesselLabel(vessel)} is inactive.`);

  const residents = await prisma.vesselLot.findMany({ where: { vesselId }, include: { lot: true } });
  const total = round2(residents.reduce((a, r) => a + Number(r.volumeL), 0));
  if (total <= 0) throw new ActionError(`${vesselLabel(vessel)} is empty.`);
  if (lossL > total + 1e-9) throw new ActionError(`${vesselLabel(vessel)} only holds ${total} L; can't lose ${lossL} L.`);

  const balances: VesselLotBalance[] = residents.map((r) => ({ vesselId, lotId: r.lotId, volumeL: Number(r.volumeL) }));
  const plan = planVesselLoss(balances, lossL, "evaporation");

  const lotCodes = new Map(residents.map((r) => [r.lotId, r.lot.code]));
  const vesselCodes = new Map([[vesselId, vessel.code]]);
  const capacityByVessel = new Map([[vesselId, Number(vessel.capacityL)]]);
  const summary = `Lost ${plan.removedL} L from ${vesselLabel(vessel)} to evaporation`;

  const operationId = await runLedgerWrite(async (tx) => {
    const opId = await writeLotOperation(tx, {
      type: "LOSS",
      lines: plan.lines,
      actorUserId: actor.actorUserId,
      enteredBy: actor.actorEmail,
      captureMethod: input.captureMethod,
      note: input.note?.trim() || null,
      lotCodes,
      vesselCodes,
      capacityByVessel,
    });
    if (input.batchId) await tx.lotOperation.update({ where: { id: opId }, data: { batchId: input.batchId } });
    await writeAudit(tx, {
      ...actor,
      action: "STOCK_MOVEMENT",
      entityType: "LotOperation",
      entityId: String(opId),
      summary,
    });
    return opId;
  });

  return { operationId, message: `${summary}.`, treatmentIds: [] };
}
