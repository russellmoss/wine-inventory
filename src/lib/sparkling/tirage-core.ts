import { ActionError } from "@/lib/action-error";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { round2 } from "@/lib/bottling/draw";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import { balanceKey, type VesselLotBalance } from "@/lib/ledger/math";
import type { CaptureMethod } from "@/lib/ledger/vocabulary";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { applyStateTransitionTx } from "@/lib/ferment/transition-core";
import { planTirageBottlingMulti, type TirageDraw } from "@/lib/sparkling/plan";
import { tirageSugarForPressure } from "@/lib/sparkling/sugar";

// Phase 7 Unit 5: SCRIPT-SAFE core for TIRAGE — bottle a (usually assembled) bulk lot into a
// continuable BOTTLED_IN_PROCESS bottle lot. Sparkling is an operation SEQUENCE on the existing
// ledger: an optional liqueur-de-tirage ADDITION, then the TIRAGE bottling op (which folds the
// BottledLotState via the chokepoint), then the form transition — all in ONE runLedgerWrite tx.
// No "use server"; the action wraps this and adds auth + commandId idempotency (Phase 6).

export type TirageMethod = "TRADITIONAL" | "PETNAT";

export type TirageInput = {
  lotId: string; // the base (assembled) cuvée lot to bottle
  // The lot's own positions to draw from — one entry per source tank (a cuvée can span tanks).
  // Combining DIFFERENT wines is the upstream assemblage (a BLEND), not tirage.
  sources: TirageDraw[];
  bottleCount: number;
  nominalFillMl?: number; // default 750
  method?: TirageMethod; // default TRADITIONAL (TANK never bottles-in-process)
  tirageAt?: Date; // materialized, backdatable (months-on-lees + legacy seed)
  locationId?: string | null;
  // Liqueur de tirage (optional). Resolve the CellarMaterial in the catalog BEFORE this call
  // (its own tx) and pass the id, so this stays a single atomic ledger write.
  liqueurMaterialId?: string;
  targetPressureAtm?: number; // → suggested tirage sugar (Unit 3)
  tirageSugarGpl?: number; // explicit g/L (overrides the pressure suggestion)
  commandId?: string | null; // action-level idempotency (unique on the TIRAGE op)
  captureMethod?: CaptureMethod;
  note?: string;
};

export type TirageResult = {
  operationId: number;
  lotId: string;
  bottleCount: number;
  volumeL: number;
  tirageSugarAddedGpl: number | null;
};

export async function tirageCore(actor: LedgerActor, input: TirageInput): Promise<TirageResult> {
  const nominalFillMl = input.nominalFillMl ?? 750;
  const method: TirageMethod = input.method ?? "TRADITIONAL";
  const tirageAt = input.tirageAt ?? new Date();
  const sources = input.sources ?? [];
  if (sources.length === 0) throw new ActionError("Pick at least one source tank.");
  if (!(input.bottleCount > 0) || !Number.isInteger(input.bottleCount)) throw new ActionError("Bottle count must be a positive whole number.");

  const vesselIds = [...new Set(sources.map((s) => s.vesselId))];
  const vessels = await prisma.vessel.findMany({ where: { id: { in: vesselIds } } });
  if (vessels.length !== vesselIds.length) throw new ActionError("A source vessel was not found.");
  const vesselCodes = new Map(vessels.map((v) => [v.id, v.code]));
  const lot = await prisma.lot.findUnique({ where: { id: input.lotId }, select: { id: true, code: true, form: true, afState: true, status: true } });
  if (!lot) throw new ActionError("Lot not found.");
  if (lot.status !== "ACTIVE") throw new ActionError(`Lot is ${lot.status.toLowerCase()}.`);
  // WINE = traditional (finished base). JUICE = pét-nat bottled mid-ferment (AF still ACTIVE).
  if (lot.form !== "WINE" && !(lot.form === "JUICE" && method === "PETNAT")) {
    throw new ActionError(`Only a WINE lot (or a JUICE pét-nat) can go to tirage (this lot is ${lot.form}).`);
  }

  const residents = await prisma.vesselLot.findMany({ where: { vesselId: { in: vesselIds }, lotId: input.lotId } });
  const sourceBalances: VesselLotBalance[] = residents.map((r) => ({ vesselId: r.vesselId, lotId: r.lotId, volumeL: Number(r.volumeL) }));
  for (const s of sources) {
    const have = sourceBalances.find((b) => balanceKey(b.vesselId, b.lotId) === balanceKey(s.vesselId, input.lotId))?.volumeL ?? 0;
    if (round2(s.drawL) > round2(have) + 1e-9) {
      throw new ActionError(`That cuvée holds ${round2(have)} L in ${vesselCodes.get(s.vesselId) ?? "that tank"}; can't draw ${round2(s.drawL)} L.`, "CONFLICT");
    }
  }
  const totalDrawL = round2(sources.reduce((a, s) => a + s.drawL, 0));

  const tirageSugarGpl =
    input.tirageSugarGpl != null
      ? round2(input.tirageSugarGpl)
      : input.targetPressureAtm != null
        ? tirageSugarForPressure(input.targetPressureAtm)
        : null;

  let liqueurName: string | null = null;
  if (input.liqueurMaterialId) {
    const m = await prisma.cellarMaterial.findUnique({ where: { id: input.liqueurMaterialId }, select: { name: true } });
    if (!m) throw new ActionError("That liqueur material no longer exists.");
    liqueurName = m.name;
  }

  const plan = planTirageBottlingMulti(sourceBalances, input.lotId, sources, input.bottleCount, nominalFillMl);
  const lotCodes = new Map([[input.lotId, lot.code]]);

  const result = await runLedgerWrite(async (tx) => {
    // (1) Optional liqueur de tirage — a volume-neutral ADDITION carrying the material + computed
    // sugar mass, so Phase 8 can draw it down (LotTreatment + CellarMaterial).
    if (input.liqueurMaterialId && tirageSugarGpl != null) {
      const addOpId = await writeLotOperation(tx, {
        type: "ADDITION",
        lines: [],
        actorUserId: actor.actorUserId,
        enteredBy: actor.actorEmail,
        captureMethod: input.captureMethod,
        note: "Liqueur de tirage",
        lotCodes,
        vesselCodes,
        capacityByVessel: new Map(),
      });
      await tx.lotTreatment.create({
        data: {
          operationId: addOpId,
          lotId: input.lotId,
          vesselId: sources.length === 1 ? sources[0].vesselId : null, // lot-scoped when it spans tanks
          kind: "TIRAGE",
          materialId: input.liqueurMaterialId,
          materialName: liqueurName,
          rateValue: tirageSugarGpl,
          rateBasis: "G_L",
          computedTotal: round2(tirageSugarGpl * totalDrawL), // grams of sugar across the whole draw
          computedUnit: "g",
          volumeLAtAddition: totalDrawL,
          note: input.note?.trim() || null,
        },
      });
    }

    // (2) TIRAGE bottling — the chokepoint creates + folds BottledLotState (stage EN_TIRAGE).
    const opId = await writeLotOperation(tx, {
      type: "TIRAGE",
      lines: plan.lines,
      actorUserId: actor.actorUserId,
      enteredBy: actor.actorEmail,
      captureMethod: input.captureMethod,
      note: input.note?.trim() || null,
      commandId: input.commandId ?? null,
      lotCodes,
      vesselCodes,
      capacityByVessel: new Map(),
      bottleState: { nominalFillMl, method, tirageAt, locationId: input.locationId ?? null, stage: "EN_TIRAGE" },
    });

    // Store the advisory tirage-sugar figure on the projection (descriptive, not folded).
    if (tirageSugarGpl != null) {
      await tx.bottledLotState.update({ where: { lotId: input.lotId }, data: { tirageSugarAddedGpl: tirageSugarGpl } });
    }

    const contextVesselId = sources.length === 1 ? sources[0].vesselId : null;

    // (3) form WINE → BOTTLED_IN_PROCESS (state machine + LotStateEvent).
    await applyStateTransitionTx(tx, actor, { lotId: input.lotId, kind: "FORM", to: "BOTTLED_IN_PROCESS", vesselId: contextVesselId, operationId: opId });

    // (4) Start the (secondary / pét-nat) ferment: AF NONE → ACTIVE. A pét-nat bottled mid-ferment
    // is already ACTIVE (skip); a dry base that skipped a fresh assemblage stays as-is (no rewind).
    if (lot.afState === "NONE") {
      await applyStateTransitionTx(tx, actor, { lotId: input.lotId, kind: "AF", to: "ACTIVE", vesselId: contextVesselId, operationId: opId });
    }

    const tankLabel = vessels.length === 1 ? vessels[0].code : `${vessels.length} tanks`;
    await writeAudit(tx, {
      ...actor,
      action: "STOCK_MOVEMENT",
      entityType: "Lot",
      entityId: input.lotId,
      summary: `Tirage: bottled ${input.bottleCount} × ${nominalFillMl} mL (${totalDrawL} L from ${tankLabel}) of ${lot.code} en tirage${tirageSugarGpl != null ? ` (+${tirageSugarGpl} g/L tirage sugar)` : ""}`,
    });

    return opId;
  });

  return { operationId: result, lotId: input.lotId, bottleCount: input.bottleCount, volumeL: totalDrawL, tirageSugarAddedGpl: tirageSugarGpl };
}
