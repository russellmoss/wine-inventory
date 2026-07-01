import { ActionError } from "@/lib/action-error";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { applyStateTransitionTx } from "@/lib/ferment/transition-core";
import { materializeFinishedGoods } from "@/lib/bottling/materialize";
import { planFinishHandoff } from "@/lib/sparkling/plan";

// Phase 7 Unit 9: SCRIPT-SAFE core for FINISH — turn a dosed/corked (or pét-nat sur lie)
// in-process bottle lot into a sellable WineSku via the SHARED materialization core. A FINISH op
// closes the BottledLotState (folds count + volume to zero → the projection row is deleted), then
// materializeFinishedGoods creates the WineSku (method + style; NV via find-or-create) +
// BottlingRun (batch disgorgedAt + actual dosageGramsPerL) + a REQUIRED BottlingSource.lotId with
// null variety/vineyard/vessel (K13 — a blended lot has no single origin) + inventory. Operates on
// a disgorged+dosed child (or a fully disgorged single lot); pét-nat may finish straight from
// EN_TIRAGE with no dosage (style null, sur lie).

export type FinalizeInput = {
  lotId: string;
  skuName: string;
  destinationLocationId: string;
  vintage?: number | null; // override; default = the lot's vintageYear (null ⇒ NV)
  isNonVintage?: boolean; // override; default = (lot.vintageYear == null)
  categoryName?: string;
  date?: Date;
  commandId?: string | null;
};

export type FinalizeResult = { operationId: number; runId: string; skuId: string; lotId: string; bottlesProduced: number };

export async function finalizeSparklingCore(actor: LedgerActor, input: FinalizeInput): Promise<FinalizeResult> {
  if (!input.skuName?.trim()) throw new ActionError("Give the finished wine a name.");
  const state = await prisma.bottledLotState.findUnique({
    where: { lotId: input.lotId },
    include: { lot: { select: { code: true, status: true, vintageYear: true } } },
  });
  if (!state) throw new ActionError("That lot isn't an en-tirage bottle lot.");
  if (state.lot.status !== "ACTIVE") throw new ActionError(`Lot is ${state.lot.status.toLowerCase()}.`);

  const location = await prisma.location.findUnique({ where: { id: input.destinationLocationId } });
  if (!location || !location.isActive) throw new ActionError("Pick an active destination location.");

  // Capture the descriptive attributes BEFORE the FINISH op deletes the projection row.
  const bottleCount = state.bottleCount;
  const volumeL = Number(state.volumeL);
  const nominalFillMl = state.nominalFillMl;
  const method = state.method;
  const dosageStyle = state.dosageStyle;
  const disgorgedAt = state.disgorgedAt;
  const dosageGramsPerL = state.dosageGramsPerL == null ? null : Number(state.dosageGramsPerL);

  const isNonVintage = input.isNonVintage ?? state.lot.vintageYear == null;
  const vintage = isNonVintage ? null : (input.vintage ?? state.lot.vintageYear);

  const plan = planFinishHandoff({ lotId: input.lotId, bottleCount, volumeL });

  const result = await runLedgerWrite(async (tx) => {
    // (1) FINISH op — the chokepoint drains the bottled lot to zero and deletes the projection.
    const opId = await writeLotOperation(tx, {
      type: "FINISH",
      lines: plan.lines,
      actorUserId: actor.actorUserId,
      enteredBy: actor.actorEmail,
      note: `Finalize ${state.lot.code}`,
      commandId: input.commandId ?? null,
      lotCodes: new Map([[input.lotId, state.lot.code]]),
      vesselCodes: new Map(),
      capacityByVessel: new Map(),
    });

    // (2) Shared finished-goods hand-off. One required BottlingSource.lotId; null origin is honest
    // (provenance is the lineage DAG). Sparkling batch facts land on the BottlingRun.
    const { runId, skuId } = await materializeFinishedGoods(tx, {
      skuName: input.skuName.trim(),
      vintage,
      isNonVintage,
      method,
      dosageStyle,
      bottleSizeMl: nominalFillMl,
      bottlesProduced: bottleCount,
      volumeConsumedL: volumeL,
      sources: [{ lotId: input.lotId, varietyId: null, vineyardId: null, vintage, volumeConsumedL: volumeL }],
      destinationLocationId: input.destinationLocationId,
      date: input.date ?? new Date(),
      disgorgedAt,
      dosageGramsPerL,
      categoryName: input.categoryName,
      actor,
    });

    // (3) form BOTTLED_IN_PROCESS → FINISHED (state machine + LotStateEvent).
    await applyStateTransitionTx(tx, actor, { lotId: input.lotId, kind: "FORM", to: "FINISHED", operationId: opId });

    await writeAudit(tx, {
      ...actor,
      action: "BOTTLING",
      entityType: "BottlingRun",
      entityId: runId,
      summary: `Finalized ${bottleCount} bottles of "${input.skuName.trim()}${vintage ? ` ${vintage}` : " NV"}"${dosageStyle ? ` (${dosageStyle})` : ""} from ${state.lot.code} into ${location.name}`,
    });

    return { operationId: opId, runId, skuId };
  });

  return { ...result, lotId: input.lotId, bottlesProduced: bottleCount };
}
