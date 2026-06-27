import { ActionError } from "@/lib/action-error";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { round2 } from "@/lib/bottling/draw";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { CaptureMethod } from "@/lib/ledger/vocabulary";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import {
  computeAdditionTotal,
  RATE_BASIS_LABELS,
  type RateBasis,
} from "@/lib/cellar/additions-math";
import { upsertMaterialCore } from "@/lib/cellar/materials";

// Script-safe core for a volume-NEUTRAL material dose (Phase 3, Unit 4). An ADDITION is a
// LotOperation with NO volumetric lines (the chokepoint accepts a zero-line op — empty
// balance, no projection change) + one LotTreatment per resident lot. Open question #1
// resolved (lean): when the vessel holds >1 lot the dose attaches to EVERY resident lot,
// each with its own volume snapshot + proportional computed total, so each lot's timeline
// is complete and the totals stay summable for Phase 8 cost. The rate, basis, computed
// total + unit, and the volume snapshot are STORED, never recomputed (VISION D14).
// actions.ts wraps this as a server action; scripts call it directly with an explicit actor.

export type AddAdditionInput = {
  vesselId: string;
  lotId?: string; // optional: target one resident lot; omit = all resident lots
  materialId?: string; // catalog link (skips the upsert)
  materialName?: string; // free-text; upserted into the catalog on submit
  materialKind?: string; // hint for the upsert (SO2 | NUTRIENT | …)
  rateValue: number;
  rateBasis: RateBasis;
  note?: string;
  captureMethod?: CaptureMethod;
  batchId?: string; // set by the group fan-out (Unit 7)
};

export type CellarOpResult = {
  operationId: number;
  message: string;
  treatmentIds: string[];
  computedTotal: number;
  computedUnit: "g" | "mL";
};

function vesselLabel(v: { type: string; code: string }): string {
  return v.type === "BARREL" ? `Barrel ${v.code}` : `Tank ${v.code}`;
}

/** Record a material dose against a vessel's lot(s), volume-neutral, with the dose math. */
export async function addAdditionCore(actor: LedgerActor, input: AddAdditionInput): Promise<CellarOpResult> {
  const { vesselId, rateValue, rateBasis } = input;
  if (!vesselId) throw new ActionError("A vessel is required.");
  if (!(rateValue > 0)) throw new ActionError("Enter a dose rate greater than 0.");
  if (!RATE_BASIS_LABELS[rateBasis]) throw new ActionError("Pick a valid dose basis.");

  const vessel = await prisma.vessel.findUnique({ where: { id: vesselId } });
  if (!vessel) throw new ActionError("Vessel not found.");
  if (!vessel.isActive) throw new ActionError(`${vesselLabel(vessel)} is inactive.`);

  const residents = await prisma.vesselLot.findMany({ where: { vesselId }, include: { lot: true } });
  if (residents.length === 0) throw new ActionError(`${vesselLabel(vessel)} is empty — nothing to dose.`);

  // Resolve target lots: a chosen lot (must be resident) or every resident lot.
  const targets = input.lotId ? residents.filter((r) => r.lotId === input.lotId) : residents;
  if (input.lotId && targets.length === 0) {
    throw new ActionError("That lot is not in this vessel.");
  }

  // Resolve the material: an explicit catalog id, or upsert the free-text name.
  let materialId: string | null = null;
  let materialName: string | null = null;
  if (input.materialId) {
    const m = await prisma.cellarMaterial.findUnique({ where: { id: input.materialId } });
    if (!m) throw new ActionError("That material no longer exists.");
    materialId = m.id;
    materialName = m.name;
  } else if (input.materialName?.trim()) {
    const m = await upsertMaterialCore(actor, { name: input.materialName, kind: input.materialKind });
    materialId = m.id;
    materialName = m.name;
  } else {
    throw new ActionError("Pick or name a material to add.");
  }

  // Per-lot computed totals from each lot's volume-in-vessel (snapshot, never recomputed).
  const perLot = targets.map((t) => {
    const vol = round2(Number(t.volumeL));
    const { total, unit } = computeAdditionTotal(rateValue, rateBasis, vol);
    return { lotId: t.lotId, lotCode: t.lot.code, volumeLAtAddition: vol, computedTotal: total, computedUnit: unit };
  });
  const totalSum = round2(perLot.reduce((a, p) => a + p.computedTotal, 0));
  const unit = perLot[0].computedUnit;
  const basisLabel = RATE_BASIS_LABELS[rateBasis];
  const summary = `Added ${rateValue} ${basisLabel} ${materialName} to ${vesselLabel(vessel)} → ${totalSum} ${unit}`;

  const { operationId, treatmentIds } = await runLedgerWrite(async (tx) => {
    const opId = await writeLotOperation(tx, {
      type: "ADDITION",
      lines: [], // volume-neutral: no projection change
      actorUserId: actor.actorUserId,
      enteredBy: actor.actorEmail,
      captureMethod: input.captureMethod,
      note: input.note?.trim() || null,
      lotCodes: new Map(),
      vesselCodes: new Map(),
      capacityByVessel: new Map(),
    });
    if (input.batchId) {
      await tx.lotOperation.update({ where: { id: opId }, data: { batchId: input.batchId } });
    }
    const ids: string[] = [];
    for (const p of perLot) {
      const row = await tx.lotTreatment.create({
        data: {
          operationId: opId,
          lotId: p.lotId,
          vesselId,
          kind: "ADDITION",
          materialId,
          materialName,
          rateValue,
          rateBasis,
          computedTotal: p.computedTotal,
          computedUnit: p.computedUnit,
          volumeLAtAddition: p.volumeLAtAddition,
          note: input.note?.trim() || null,
        },
        select: { id: true },
      });
      ids.push(row.id);
    }
    await writeAudit(tx, {
      ...actor,
      action: "STOCK_MOVEMENT",
      entityType: "LotOperation",
      entityId: String(opId),
      summary,
    });
    return { operationId: opId, treatmentIds: ids };
  });

  return { operationId, message: `${summary}.`, treatmentIds, computedTotal: totalSum, computedUnit: unit };
}
