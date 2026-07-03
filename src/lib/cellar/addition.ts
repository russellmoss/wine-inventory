import type { Prisma } from "@prisma/client";
import { ActionError } from "@/lib/action-error";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { round2 } from "@/lib/bottling/draw";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { CaptureMethod, OperationType } from "@/lib/ledger/vocabulary";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import {
  computeAdditionTotal,
  RATE_BASIS_LABELS,
  type RateBasis,
} from "@/lib/cellar/additions-math";
import { upsertMaterialCore } from "@/lib/cellar/materials";
import { consumeMaterialCore } from "@/lib/cost/consume";

// Script-safe cores for volume-NEUTRAL material doses (Phase 3, Units 4–5). A neutral op
// (ADDITION, FINING) is a LotOperation with NO volumetric lines — the chokepoint accepts a
// zero-line op (empty balance, no projection change) — plus one LotTreatment per resident
// lot. Open question #1 resolved (lean): when the vessel holds >1 lot the dose attaches to
// EVERY resident lot, each with its own volume snapshot + proportional computed total, so
// each lot's timeline is complete and the totals stay summable for Phase 8 cost. The rate,
// basis, computed total + unit, and the volume snapshot are STORED, never recomputed
// (VISION D14). actions.ts wraps these; scripts/the group engine call them with an actor.

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

export type CellarBaseResult = {
  operationId: number;
  message: string;
  treatmentIds: string[];
};

export type CellarOpResult = CellarBaseResult & {
  computedTotal: number;
  computedUnit: "g" | "mL";
};

export function vesselLabel(v: { type: string; code: string }): string {
  return v.type === "BARREL" ? `Barrel ${v.code}` : `Tank ${v.code}`;
}

type NeutralDoseConfig = {
  opType: OperationType; // ADDITION | FINING
  treatmentKind: string; // ADDITION | FINING (LotTreatment.kind)
  defaultMaterialKind: string; // upsert hint when none given
  makeSummary: (ctx: { rateValue: number; basisLabel: string; materialName: string; vessel: string; total: number; unit: string }) => string;
};

// The ADDITION / FINING dose configs, exported so the Phase-9 WO completion seam can dispatch by op type.
export const ADDITION_CONFIG: NeutralDoseConfig = {
  opType: "ADDITION",
  treatmentKind: "ADDITION",
  defaultMaterialKind: "OTHER",
  makeSummary: (c) => `Added ${c.rateValue} ${c.basisLabel} ${c.materialName} to ${c.vessel} → ${c.total} ${c.unit}`,
};
export const FINING_CONFIG: NeutralDoseConfig = {
  opType: "FINING",
  treatmentKind: "FINING",
  defaultMaterialKind: "FINING",
  makeSummary: (c) => `Fined ${c.vessel}: ${c.rateValue} ${c.basisLabel} ${c.materialName} → ${c.total} ${c.unit}`,
};

/**
 * Record a neutral material dose WITHIN the caller's tx (Phase 9 A2). The material MUST already be
 * resolved (materialId + materialName) — the free-text upsert opens its own tx and stays in the
 * standalone wrapper. Reads vessel + residents through `tx`, writes the zero-line op + treatments +
 * consumption + audit. WO completion composes this with the attempt row in ONE runLedgerWrite.
 */
export async function recordNeutralDoseTx(
  tx: Prisma.TransactionClient,
  actor: LedgerActor,
  input: AddAdditionInput,
  cfg: NeutralDoseConfig,
  resolved: { materialId: string; materialName: string },
): Promise<CellarOpResult> {
  const { vesselId, rateValue, rateBasis } = input;
  const vessel = await tx.vessel.findUnique({ where: { id: vesselId } });
  if (!vessel) throw new ActionError("Vessel not found.");
  if (!vessel.isActive) throw new ActionError(`${vesselLabel(vessel)} is inactive.`);

  const residents = await tx.vesselLot.findMany({ where: { vesselId }, include: { lot: true } });
  if (residents.length === 0) throw new ActionError(`${vesselLabel(vessel)} is empty — nothing to dose.`);

  const targets = input.lotId ? residents.filter((r) => r.lotId === input.lotId) : residents;
  if (input.lotId && targets.length === 0) throw new ActionError("That lot is not in this vessel.");

  // A3: the amount is computed from each lot's CURRENT (open-time) volume-in-vessel — never frozen at
  // issue — so an intervening rack can't over/under-dose. Snapshot, never recomputed after write (D14).
  const perLot = targets.map((t) => {
    const vol = round2(Number(t.volumeL));
    const { total, unit } = computeAdditionTotal(rateValue, rateBasis, vol);
    return { lotId: t.lotId, volumeLAtAddition: vol, computedTotal: total, computedUnit: unit };
  });
  const totalSum = round2(perLot.reduce((a, p) => a + p.computedTotal, 0));
  const unit = perLot[0].computedUnit;
  const basisLabel = RATE_BASIS_LABELS[rateBasis];
  const summary = cfg.makeSummary({
    rateValue,
    basisLabel,
    materialName: resolved.materialName,
    vessel: vesselLabel(vessel),
    total: totalSum,
    unit,
  });

  const opId = await writeLotOperation(tx, {
    type: cfg.opType,
    lines: [], // volume-neutral: no projection change
    actorUserId: actor.actorUserId,
    enteredBy: actor.actorEmail,
    captureMethod: input.captureMethod,
    note: input.note?.trim() || null,
    lotCodes: new Map(),
    vesselCodes: new Map(),
    capacityByVessel: new Map(),
  });
  if (input.batchId) await tx.lotOperation.update({ where: { id: opId }, data: { batchId: input.batchId } });
  const ids: string[] = [];
  for (const p of perLot) {
    const row = await tx.lotTreatment.create({
      data: {
        operationId: opId,
        lotId: p.lotId,
        vesselId,
        kind: cfg.treatmentKind,
        materialId: resolved.materialId,
        materialName: resolved.materialName,
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
  // Phase 8 (Unit 3): draw down stock + record MATERIAL cost for this dose, in the SAME tx. No parallel
  // consumption path — the addition/fining op IS the consumption. Untracked/unknown-cost materials
  // record an UNKNOWN-cost line (D14 contagion), so physical dosing is unaffected.
  await consumeMaterialCore(tx, {
    operationId: opId,
    materialId: resolved.materialId,
    doseUnit: unit,
    perLot: perLot.map((p) => ({ lotId: p.lotId, amount: p.computedTotal })),
  });
  await writeAudit(tx, { ...actor, action: "STOCK_MOVEMENT", entityType: "LotOperation", entityId: String(opId), summary });

  return { operationId: opId, message: `${summary}.`, treatmentIds: ids, computedTotal: totalSum, computedUnit: unit };
}

/** Resolve a dose's material to a catalog id (Phase 9: the WO seam resolves it pre-tx too, since the
 * free-text upsert opens its own tx). Explicit materialId, or upsert the free-text name. */
export async function resolveDoseMaterial(
  actor: LedgerActor,
  input: AddAdditionInput,
  cfg: NeutralDoseConfig,
): Promise<{ materialId: string; materialName: string }> {
  if (input.materialId) {
    const m = await prisma.cellarMaterial.findUnique({ where: { id: input.materialId } });
    if (!m) throw new ActionError("That material no longer exists.");
    return { materialId: m.id, materialName: m.name };
  }
  if (input.materialName?.trim()) {
    const m = await upsertMaterialCore(actor, { name: input.materialName, kind: input.materialKind ?? cfg.defaultMaterialKind });
    return { materialId: m.id, materialName: m.name };
  }
  throw new ActionError("Pick or name a material to add.");
}

/** Shared engine for a neutral material dose; ADDITION and FINING differ only in copy/kind. Standalone
 * wrapper — resolves the material (may upsert, own tx) then owns the SERIALIZABLE ledger tx. */
async function recordNeutralDose(actor: LedgerActor, input: AddAdditionInput, cfg: NeutralDoseConfig): Promise<CellarOpResult> {
  const { vesselId, rateValue, rateBasis } = input;
  if (!vesselId) throw new ActionError("A vessel is required.");
  if (!(rateValue > 0)) throw new ActionError("Enter a dose rate greater than 0.");
  if (!RATE_BASIS_LABELS[rateBasis]) throw new ActionError("Pick a valid dose basis.");
  const resolved = await resolveDoseMaterial(actor, input, cfg);
  return runLedgerWrite((tx) => recordNeutralDoseTx(tx, actor, input, cfg, resolved));
}

/** Record an addition (volume-neutral material dose) against a vessel's lot(s). */
export function addAdditionCore(actor: LedgerActor, input: AddAdditionInput): Promise<CellarOpResult> {
  return recordNeutralDose(actor, input, {
    opType: "ADDITION",
    treatmentKind: "ADDITION",
    defaultMaterialKind: "OTHER",
    makeSummary: (c) => `Added ${c.rateValue} ${c.basisLabel} ${c.materialName} to ${c.vessel} → ${c.total} ${c.unit}`,
  });
}

/** Record a fining (volume-neutral; the loss comes later at racking). */
export function addFiningCore(actor: LedgerActor, input: AddAdditionInput): Promise<CellarOpResult> {
  return recordNeutralDose(actor, input, {
    opType: "FINING",
    treatmentKind: "FINING",
    defaultMaterialKind: "FINING",
    makeSummary: (c) => `Fined ${c.vessel}: ${c.rateValue} ${c.basisLabel} ${c.materialName} → ${c.total} ${c.unit}`,
  });
}
