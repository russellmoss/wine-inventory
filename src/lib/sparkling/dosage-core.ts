import { ActionError } from "@/lib/action-error";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { round2 } from "@/lib/bottling/draw";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { CaptureMethod } from "@/lib/ledger/vocabulary";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import type { DosageStyle } from "@prisma/client";
import { planDosage } from "@/lib/sparkling/plan";
import { dosageSugarGpl, finalRS, doseMlForTargetRS, classifyStyle } from "@/lib/sparkling/sugar";

// Phase 7 Unit 8: SCRIPT-SAFE core for DOSAGE — add liqueur d'expédition back, compute the final
// residual sugar off a MEASURED pre-dosage RS, and set the EU sweetness style. Brut Nature ⇔ the
// dosage adds 0 g/L of sugar (a dry / SO₂-only top-up still counts). Operates on the disgorged
// (child) lot; the actual dosageGramsPerL is stored for carry to the BottlingRun at finalize.

export type DosageInput = {
  lotId: string; // the disgorged bottle lot
  bottlesDosed?: number; // default = current bottle count
  perBottleDoseMl?: number; // explicit dose; OR pass targetRS to solve for it
  targetRS?: number; // desired final RS (g/L) — requires liqueurGPerL
  liqueurMaterialId?: string;
  liqueurGPerL?: number; // liqueur strength; 0/undefined ⇒ dry top-up ⇒ Brut Nature
  preDosageRS?: number; // measured pre-dosage RS (g/L); default 0
  commandId?: string | null;
  captureMethod?: CaptureMethod;
  note?: string;
};

export type DosageResult = {
  operationId: number;
  lotId: string;
  addedL: number;
  perBottleDoseMl: number;
  dosageGramsPerL: number;
  finalRS: number;
  style: DosageStyle;
};

export async function dosageCore(actor: LedgerActor, input: DosageInput): Promise<DosageResult> {
  const state = await prisma.bottledLotState.findUnique({ where: { lotId: input.lotId }, include: { lot: { select: { code: true, status: true } } } });
  if (!state) throw new ActionError("That lot isn't an en-tirage bottle lot.");
  if (state.lot.status !== "ACTIVE") throw new ActionError(`Lot is ${state.lot.status.toLowerCase()}.`);

  const bottlesDosed = input.bottlesDosed ?? state.bottleCount;
  if (!(bottlesDosed > 0) || !Number.isInteger(bottlesDosed)) throw new ActionError("Bottles to dose must be a positive whole number.");
  if (bottlesDosed > state.bottleCount) throw new ActionError(`Can't dose ${bottlesDosed} bottles — the lot holds ${state.bottleCount}.`, "CONFLICT");

  const bottleMl = state.nominalFillMl;
  const liqueurGPerL = input.liqueurGPerL ?? 0;
  const preDosageRS = input.preDosageRS ?? 0;

  let perBottleDoseMl = input.perBottleDoseMl;
  if (perBottleDoseMl == null) {
    if (input.targetRS == null || !(liqueurGPerL > 0)) throw new ActionError("Provide a per-bottle dose, or a target RS + liqueur strength to compute it.");
    perBottleDoseMl = doseMlForTargetRS({ targetRS: input.targetRS, baseRS: preDosageRS, liqueurGPerL, bottleMl });
  }
  if (!(perBottleDoseMl > 0)) throw new ActionError("Dose is zero — no dosage needed (finalize as Brut Nature instead).");

  const dosageGramsPerL = dosageSugarGpl(perBottleDoseMl, liqueurGPerL, bottleMl);
  const finalRsVal = finalRS({ baseRS: preDosageRS, doseMl: perBottleDoseMl, liqueurGPerL, bottleMl });
  const style = classifyStyle(finalRsVal, dosageGramsPerL);

  let liqueurName: string | null = null;
  if (input.liqueurMaterialId) {
    const m = await prisma.cellarMaterial.findUnique({ where: { id: input.liqueurMaterialId }, select: { name: true } });
    if (!m) throw new ActionError("That liqueur material no longer exists.");
    liqueurName = m.name;
  }

  const plan = planDosage(input.lotId, bottlesDosed, perBottleDoseMl);

  const operationId = await runLedgerWrite(async (tx) => {
    const opId = await writeLotOperation(tx, {
      type: "DOSAGE",
      lines: plan.lines,
      actorUserId: actor.actorUserId,
      enteredBy: actor.actorEmail,
      captureMethod: input.captureMethod,
      note: input.note?.trim() || null,
      commandId: input.commandId ?? null,
      lotCodes: new Map([[input.lotId, state.lot.code]]),
      vesselCodes: new Map(),
      capacityByVessel: new Map(),
    });
    // Phase 3 ADDITION treatment for the liqueur d'expédition (sugar mass → Phase 8 draw-down).
    await tx.lotTreatment.create({
      data: {
        operationId: opId,
        lotId: input.lotId,
        kind: "DOSAGE",
        materialId: input.liqueurMaterialId ?? null,
        materialName: liqueurName,
        rateValue: perBottleDoseMl,
        rateBasis: "ML_L",
        computedTotal: round2(liqueurGPerL * plan.addedL), // grams of dosage sugar
        computedUnit: "g",
        note: input.note?.trim() || null,
      },
    });
    await tx.bottledLotState.update({ where: { lotId: input.lotId }, data: { stage: "DOSED", dosageStyle: style, dosageGramsPerL } });
    await writeAudit(tx, { ...actor, action: "STOCK_MOVEMENT", entityType: "Lot", entityId: input.lotId, summary: `Dosage: ${perBottleDoseMl} mL/bottle × ${bottlesDosed} (+${plan.addedL} L) → ${style} (${finalRsVal} g/L RS)` });
    return opId;
  });

  return { operationId, lotId: input.lotId, addedL: plan.addedL, perBottleDoseMl, dosageGramsPerL, finalRS: finalRsVal, style };
}
