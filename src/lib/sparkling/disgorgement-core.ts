import { ActionError } from "@/lib/action-error";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { round2 } from "@/lib/bottling/draw";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { LedgerLine } from "@/lib/ledger/math";
import type { CaptureMethod } from "@/lib/ledger/vocabulary";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { planDisgorgement } from "@/lib/sparkling/plan";

// Phase 7 Unit 7: SCRIPT-SAFE core for DISGORGEMENT — eject the lees plug as a per-bottle volume
// LOSS. FULL (all remaining bottles) disgorges the lot in place. PARTIAL (a tranche) is a SPLIT:
// one atomic DISGORGEMENT op peels a NEW disgorged child lot off the parent (LotLineage kind
// SPLIT, own code + BottledLotState + disgorgementRunId) AND applies the loss to the child; the
// parent keeps identity with reduced count/volume, stage back to EN_TIRAGE (K4). Sacrificial
// bottles are reallocated (count down, no extra volume loss); breakage drops count and volume.

export type DisgorgementMethod = "a_la_glace" | "a_la_volee";

export type DisgorgementInput = {
  lotId: string; // parent en-tirage lot
  bottlesDisgorged: number; // tranche size; == remaining ⇒ full, < remaining ⇒ partial (split)
  perBottleLossMl?: number; // default 25 mL
  method?: DisgorgementMethod;
  sacrificedBottleCount?: number;
  breakageCount?: number;
  disgorgedAt?: Date;
  disgorgementRunId?: string; // groups tranches of one physical run
  commandId?: string | null;
  captureMethod?: CaptureMethod;
  note?: string;
};

export type DisgorgementResult = {
  operationId: number;
  parentLotId: string;
  childLotId: string | null; // set on a partial disgorgement (the disgorged child)
  disgorgementRunId: string;
  volumeLostL: number;
  bottleCountAfter: number; // the disgorged lot's remaining count (child if partial, else parent)
};

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

export async function disgorgementCore(actor: LedgerActor, input: DisgorgementInput): Promise<DisgorgementResult> {
  const perBottleLossMl = input.perBottleLossMl ?? 25;
  const disgorgedAt = input.disgorgedAt ?? new Date();
  const disgorgementRunId = input.disgorgementRunId ?? crypto.randomUUID();
  const sacrificed = input.sacrificedBottleCount ?? 0;
  const breakage = input.breakageCount ?? 0;

  const parent = await prisma.bottledLotState.findUnique({
    where: { lotId: input.lotId },
    include: { lot: { select: { code: true, status: true, afState: true, mlfState: true, originVineyardId: true, originVarietyId: true, originBlockId: true, originSubblockId: true, vintageYear: true, provenanceComplete: true, sourceVineyards: { select: { vineyardId: true } } } } },
  });
  if (!parent) throw new ActionError("That lot isn't an en-tirage bottle lot.");
  if (parent.lot.status !== "ACTIVE") throw new ActionError(`Lot is ${parent.lot.status.toLowerCase()}.`);

  const parentCount = parent.bottleCount;
  const parentVol = Number(parent.volumeL);
  if (!(input.bottlesDisgorged > 0) || !Number.isInteger(input.bottlesDisgorged)) throw new ActionError("Bottles to disgorge must be a positive whole number.");
  if (input.bottlesDisgorged > parentCount) throw new ActionError(`Can't disgorge ${input.bottlesDisgorged} bottles — the lot holds ${parentCount}.`, "CONFLICT");
  if (sacrificed + breakage > input.bottlesDisgorged) throw new ActionError("Sacrificial + breakage bottles can't exceed the disgorged tranche.");

  const perBottleVolumeMl = round2((parentVol * 1000) / parentCount);
  const isPartial = input.bottlesDisgorged < parentCount;

  const result = await runLedgerWrite(async (tx) => {
    if (!isPartial) {
      // ── FULL: disgorge the whole lot in place ──
      const plan = planDisgorgement({ lotId: input.lotId, bottlesDisgorged: input.bottlesDisgorged, perBottleLossMl, perBottleVolumeMl, sacrificedBottleCount: sacrificed, breakageCount: breakage });
      const opId = await writeLotOperation(tx, {
        type: "DISGORGEMENT",
        lines: plan.lines,
        actorUserId: actor.actorUserId,
        enteredBy: actor.actorEmail,
        captureMethod: input.captureMethod,
        note: input.note?.trim() || null,
        commandId: input.commandId ?? null,
        lotCodes: new Map([[input.lotId, parent.lot.code]]),
        vesselCodes: new Map(),
        capacityByVessel: new Map(),
      });
      await writeDisgorgementTreatment(tx, opId, input.lotId, perBottleLossMl, sacrificed, breakage, input.method, input.note);
      const after = await tx.bottledLotState.update({
        where: { lotId: input.lotId },
        data: { stage: "DISGORGED", disgorgedAt, disgorgementRunId },
        select: { bottleCount: true },
      });
      await writeAudit(tx, { ...actor, action: "STOCK_MOVEMENT", entityType: "Lot", entityId: input.lotId, summary: `Disgorged ${input.bottlesDisgorged} bottles of ${parent.lot.code} (−${plan.volumeLostL} L)` });
      return { operationId: opId, parentLotId: input.lotId, childLotId: null as string | null, volumeLostL: plan.volumeLostL, bottleCountAfter: after.bottleCount };
    }

    // ── PARTIAL: peel a NEW disgorged child lot (SPLIT) + apply the loss to it, one atomic op ──
    const l = parent.lot;
    const childCode = `${l.code}-D-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    const child = await tx.lot.create({
      data: {
        code: childCode,
        form: "BOTTLED_IN_PROCESS",
        afState: l.afState,
        mlfState: l.mlfState,
        originVineyardId: l.originVineyardId,
        originVarietyId: l.originVarietyId,
        originBlockId: l.originBlockId,
        originSubblockId: l.originSubblockId,
        vintageYear: l.vintageYear,
        provenanceComplete: l.provenanceComplete,
      },
      select: { id: true, code: true },
    });
    // Inherit the parent's source-vineyard set (lineage scoping / lens).
    if (l.sourceVineyards.length > 0) {
      await tx.lotVineyard.createMany({ data: l.sourceVineyards.map((sv) => ({ lotId: child.id, vineyardId: sv.vineyardId })) });
    }

    const perBottleFill = parentVol / parentCount;
    const trancheVol = round2(perBottleFill * input.bottlesDisgorged);
    const disg = planDisgorgement({ lotId: child.id, bottlesDisgorged: input.bottlesDisgorged, perBottleLossMl, perBottleVolumeMl, sacrificedBottleCount: sacrificed, breakageCount: breakage });
    const lines: LedgerLine[] = [
      { lotId: input.lotId, vesselId: null, deltaL: -trancheVol, bucket: "BOTTLE_STORAGE", bottleDelta: -input.bottlesDisgorged }, // parent gives up the tranche
      { lotId: child.id, vesselId: null, deltaL: trancheVol, bucket: "BOTTLE_STORAGE", bottleDelta: input.bottlesDisgorged }, // child receives it
      ...disg.lines, // then the child is disgorged (loss)
    ];
    const opId = await writeLotOperation(tx, {
      type: "DISGORGEMENT",
      lines,
      actorUserId: actor.actorUserId,
      enteredBy: actor.actorEmail,
      captureMethod: input.captureMethod,
      note: input.note?.trim() || null,
      commandId: input.commandId ?? null,
      lotCodes: new Map([[input.lotId, parent.lot.code], [child.id, child.code]]),
      vesselCodes: new Map(),
      capacityByVessel: new Map(),
      // bottleState applies to the FIRST-CREATED bottle lot in this op — the child. It inherits
      // the parent's format/method/tirageAt and lands at stage DISGORGED.
      bottleState: { nominalFillMl: parent.nominalFillMl, method: parent.method, tirageAt: parent.tirageAt, locationId: parent.locationId, stage: "DISGORGED" },
    });

    // Lineage (SPLIT), child disgorgement metadata, parent stays en tirage.
    await tx.lotLineage.create({ data: { parentLotId: input.lotId, childLotId: child.id, kind: "SPLIT", fraction: round5(trancheVol / parentVol) } });
    await tx.bottledLotState.update({ where: { lotId: child.id }, data: { disgorgedAt, disgorgementRunId } });
    await tx.bottledLotState.update({ where: { lotId: input.lotId }, data: { stage: "EN_TIRAGE" } });
    await writeDisgorgementTreatment(tx, opId, child.id, perBottleLossMl, sacrificed, breakage, input.method, input.note);

    const childState = await tx.bottledLotState.findUniqueOrThrow({ where: { lotId: child.id }, select: { bottleCount: true } });
    await writeAudit(tx, { ...actor, action: "STOCK_MOVEMENT", entityType: "Lot", entityId: child.id, summary: `Partial disgorgement: peeled ${input.bottlesDisgorged} bottles off ${parent.lot.code} → ${child.code} (−${disg.volumeLostL} L), ${parentCount - input.bottlesDisgorged} left en tirage` });
    return { operationId: opId, parentLotId: input.lotId, childLotId: child.id, volumeLostL: disg.volumeLostL, bottleCountAfter: childState.bottleCount };
  });

  return { ...result, disgorgementRunId };
}

async function writeDisgorgementTreatment(
  tx: Parameters<typeof writeLotOperation>[0],
  operationId: number,
  lotId: string,
  perBottleLossMl: number,
  sacrificed: number,
  breakage: number,
  method: DisgorgementMethod | undefined,
  note: string | undefined,
): Promise<void> {
  await tx.lotTreatment.create({
    data: {
      operationId,
      lotId,
      kind: "DISGORGEMENT",
      medium: method ?? "a_la_glace",
      rateValue: perBottleLossMl,
      rateBasis: "ML_L",
      note: [note?.trim(), sacrificed ? `${sacrificed} sacrificial` : null, breakage ? `${breakage} breakage` : null].filter(Boolean).join("; ") || null,
    },
  });
}
