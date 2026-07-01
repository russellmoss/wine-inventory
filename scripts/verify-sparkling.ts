/**
 * Phase 7 — sparkling (bottle-as-continuable-container) end-to-end verification.
 *
 * Drives the real CORES (no UI) through the traditional-method arc and asserts the ledger,
 * the BottledLotState projection (count ↔ volume tolerance at every step), lineage, and the
 * finished NV SKU. Tank-method + pét-nat cases and the migration smoke are added in Units 10/14.
 * Everything is created under ZZ-TEST fixtures and scrubbed in a finally block.
 *
 * Run:  npx tsx --env-file=.env scripts/verify-sparkling.ts
 */
import { prisma } from "@/lib/prisma";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { LedgerLine } from "@/lib/ledger/math";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { blendLotsCore } from "@/lib/blend/blend-core";
import { tirageCore } from "@/lib/sparkling/tirage-core";
import { riddlingCore } from "@/lib/sparkling/riddling-core";
import { disgorgementCore } from "@/lib/sparkling/disgorgement-core";
import { dosageCore } from "@/lib/sparkling/dosage-core";
import { finalizeSparklingCore } from "@/lib/sparkling/finalize-core";
import { correctBottleOperationCore, reverseFinalizeCore, reverseSparklingOperationCore } from "@/lib/sparkling/correct";
import { transitionStateCore } from "@/lib/ferment/transition-core";
import { addAdditionCore } from "@/lib/cellar/addition";
import { executeBottling } from "@/lib/bottling/run";
import { abvBumpForSugar } from "@/lib/sparkling/sugar";
import { isCountVolumeConsistent, type BottledStateProjection } from "@/lib/sparkling/projection";
import type { LotForm, AlcoholicFermState } from "@/lib/ledger/vocabulary";

const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-sparkling" };
const r2 = (n: number) => Math.round(n * 100) / 100;
let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ✓ ${msg}`);
}

const created = { vineyardIds: [] as string[], vesselIds: [] as string[], lotIds: [] as string[], locationIds: [] as string[], materialIds: [] as string[] };

async function seedLot(code: string, vesselId: string, volumeL: number, vineyardId: string, vintage: number, form: LotForm = "WINE", afState: AlcoholicFermState = "DRY"): Promise<string> {
  const lot = await prisma.lot.create({ data: { code, form, afState, originVineyardId: vineyardId, vintageYear: vintage } });
  created.lotIds.push(lot.id);
  await prisma.lotVineyard.create({ data: { lotId: lot.id, vineyardId } });
  await runLedgerWrite((tx) =>
    writeLotOperation(tx, {
      type: "SEED",
      lines: [{ lotId: lot.id, vesselId, deltaL: volumeL }, { lotId: lot.id, vesselId: null, deltaL: -volumeL, reason: "seed" }] as LedgerLine[],
      actorUserId: null, enteredBy: ACTOR.actorEmail, lotCodes: new Map([[lot.id, code]]), vesselCodes: new Map(), capacityByVessel: new Map([[vesselId, 3000]]),
    }),
  );
  return lot.id;
}
async function stateOf(lotId: string): Promise<BottledStateProjection & { stage: string; nominalFillMl: number } | null> {
  const s = await prisma.bottledLotState.findUnique({ where: { lotId } });
  return s ? { lotId, bottleCount: s.bottleCount, volumeL: Number(s.volumeL), stage: s.stage, nominalFillMl: s.nominalFillMl } : null;
}

// Migration smoke: the hand-authored Phase 7 DDL (CHECKs + partial unique indexes) that Prisma
// can't express must actually be present in the DB — a clean-DB deploy would recreate exactly
// these. Cheap catalog assertions guard against a migration that "validated" but dropped them.
async function migrationSmoke() {
  console.log("\n── 0. Migration smoke (Phase 7 DDL present) ──");
  const checks = await prisma.$queryRaw<{ conname: string }[]>`
    SELECT conname FROM pg_constraint
    WHERE conname IN ('bottled_lot_state_bottleCount_nonneg','bottled_lot_state_volumeL_nonneg','lot_operation_line_bottle_bucket_pairing')`;
  assert(checks.length === 3, "the 3 Phase 7 CHECK constraints exist (bottleCount>=0, volumeL>=0, bucket⇔bottleDelta)");
  const idx = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename = 'wine_sku' AND indexname IN ('wine_sku_name_vintage_bottleSizeMl_key','wine_sku_name_bottleSizeMl_nv_key')`;
  assert(idx.length === 2 && idx.every((i) => /WHERE/i.test(i.indexdef)), "the 2 partial unique indexes on wine_sku exist (vintaged + NV)");
}

async function main() {
  await migrationSmoke();
  const vyA = await prisma.vineyard.create({ data: { name: "ZZ-TEST Spark VY A" } });
  const vyB = await prisma.vineyard.create({ data: { name: "ZZ-TEST Spark VY B" } });
  created.vineyardIds.push(vyA.id, vyB.id);
  const tankA = await prisma.vessel.create({ data: { code: "ZZ-SPK-A", type: "TANK", capacityL: 3000 } });
  const tankB = await prisma.vessel.create({ data: { code: "ZZ-SPK-B", type: "TANK", capacityL: 3000 } });
  const cuvee = await prisma.vessel.create({ data: { code: "ZZ-SPK-CUVEE", type: "TANK", capacityL: 3000 } });
  created.vesselIds.push(tankA.id, tankB.id, cuvee.id);
  const loc = await prisma.location.create({ data: { name: "ZZ-TEST Riddling Cellar" } });
  created.locationIds.push(loc.id);
  const liqTirage = await prisma.cellarMaterial.create({ data: { name: "ZZ Liqueur de tirage", normalizedKey: "ZZLIQTIRAGE", kind: "OTHER" } });
  const liqExp = await prisma.cellarMaterial.create({ data: { name: "ZZ Liqueur d'expédition", normalizedKey: "ZZLIQEXP", kind: "OTHER" } });
  created.materialIds.push(liqTirage.id, liqExp.id);

  // ── 1. Multi-vintage assemblage (BLEND → NV cuvée) ──
  console.log("\n── 1. Multi-vintage assemblage ──");
  const baseA = await seedLot("ZZS-BASE-A", tankA.id, 800, vyA.id, 2022);
  const baseB = await seedLot("ZZS-BASE-B", tankB.id, 800, vyB.id, 2023);
  const blend = await blendLotsCore(ACTOR, {
    mode: "NEW_LOT",
    components: [{ vesselId: tankA.id, lotId: baseA, drawL: 750 }, { vesselId: tankB.id, lotId: baseB, drawL: 750 }],
    toVesselId: cuvee.id,
    token: "SPK",
    vintage: null, // NV cuvée (two vintages)
    form: "WINE",
  });
  created.lotIds.push(blend.childLotId);
  assert(blend.childTotalL === 1500, "assemblage yields 1500 L NV cuvée");
  const cuveeLot = await prisma.lot.findUnique({ where: { id: blend.childLotId }, select: { vintageYear: true, afState: true } });
  assert(cuveeLot?.vintageYear === null, "cuvée lot is NV (vintageYear null)");
  // blend child defaults afState NONE → tirage will start the 2nd ferment
  assert(cuveeLot?.afState === "NONE", "cuvée base afState NONE (fresh assemblage)");

  // ── 2. Tirage: 1500 L → 2000 × 750 mL, +24 g/L tirage sugar ──
  console.log("\n── 2. Tirage ──");
  const tir = await tirageCore(ACTOR, {
    lotId: blend.childLotId, sources: [{ vesselId: cuvee.id, drawL: 1500 }], bottleCount: 2000, nominalFillMl: 750,
    method: "TRADITIONAL", liqueurMaterialId: liqTirage.id, targetPressureAtm: 6, locationId: loc.id,
  });
  assert(tir.tirageSugarAddedGpl === 24, "tirage sugar 24 g/L for 6 atm");
  let st = await stateOf(blend.childLotId);
  assert(st?.bottleCount === 2000 && st?.volumeL === 1500 && st?.stage === "EN_TIRAGE", "en tirage: 2000 bottles / 1500 L");
  assert(isCountVolumeConsistent(st!, st!.nominalFillMl), "post-tirage count↔volume in tolerance");
  const bottledLot = await prisma.lot.findUnique({ where: { id: blend.childLotId }, select: { form: true, afState: true } });
  assert(bottledLot?.form === "BOTTLED_IN_PROCESS" && bottledLot.afState === "ACTIVE", "lot BOTTLED_IN_PROCESS, AF ACTIVE (2nd ferment)");

  // ── 3. Secondary ferment finishes: AF ACTIVE → DRY (advisory ABV bump) ──
  console.log("\n── 3. Secondary ferment complete ──");
  await transitionStateCore(ACTOR, { lotId: blend.childLotId, kind: "AF", to: "DRY" });
  const bump = abvBumpForSugar(24);
  assert(bump >= 1.2 && bump <= 1.5, `advisory ABV bump ${bump}% for 24 g/L`);

  // ── 4. Riddling (inline quick-log) ──
  console.log("\n── 4. Riddling ──");
  await riddlingCore(ACTOR, { lotId: blend.childLotId, method: "gyropalette" });
  st = await stateOf(blend.childLotId);
  assert(st?.stage === "RIDDLING" && st?.bottleCount === 2000 && st?.volumeL === 1500, "riddling: stage RIDDLING, count/volume unchanged");

  // ── 5. Partial disgorgement (500-bottle tranche, split off a disgorged child) ──
  console.log("\n── 5. Partial disgorgement ──");
  const disg = await disgorgementCore(ACTOR, {
    lotId: blend.childLotId, bottlesDisgorged: 500, perBottleLossMl: 25, sacrificedBottleCount: 10, method: "a_la_glace",
  });
  assert(disg.childLotId != null, "partial disgorgement peels a new child lot");
  created.lotIds.push(disg.childLotId!);
  const parentSt = await stateOf(blend.childLotId);
  assert(parentSt?.bottleCount === 1500 && parentSt?.volumeL === 1125 && parentSt?.stage === "EN_TIRAGE", "parent keeps 1500 bottles / 1125 L, back to EN_TIRAGE");
  const childSt = await stateOf(disg.childLotId!);
  // child: 500 peeled, −12.5 L plug loss, −10 sacrificial (no extra volume) → 490 bottles, 362.5 L
  assert(childSt?.bottleCount === 490 && childSt?.volumeL === 362.5 && childSt?.stage === "DISGORGED", "disgorged child: 490 bottles / 362.5 L");
  assert(isCountVolumeConsistent(childSt!, childSt!.nominalFillMl) && isCountVolumeConsistent(parentSt!, parentSt!.nominalFillMl), "both lots in count↔volume tolerance");
  const lineage = await prisma.lotLineage.findFirst({ where: { parentLotId: blend.childLotId, childLotId: disg.childLotId! } });
  assert(lineage?.kind === "SPLIT", "SPLIT lineage edge parent → disgorged child");
  const childBls = await prisma.bottledLotState.findUnique({ where: { lotId: disg.childLotId! } });
  assert(childBls?.disgorgementRunId === disg.disgorgementRunId, "disgorged child tagged with the disgorgementRunId");

  // ── 6. Dosage (Brut, off a measured pre-dosage RS) ──
  console.log("\n── 6. Dosage ──");
  const dose = await dosageCore(ACTOR, {
    lotId: disg.childLotId!, targetRS: 9, preDosageRS: 2, liqueurMaterialId: liqExp.id, liqueurGPerL: 600,
  });
  assert(dose.style === "BRUT", `dosage lands style BRUT (finalRS ${dose.finalRS} g/L)`);
  assert(dose.dosageGramsPerL === 7, "dosage adds 7 g/L sugar");
  const dosedSt = await stateOf(disg.childLotId!);
  assert(dosedSt?.stage === "DOSED", "child stage DOSED");

  // ── 7. Finalize → NV Brut SKU ──
  console.log("\n── 7. Finalize ──");
  const fin = await finalizeSparklingCore(ACTOR, { lotId: disg.childLotId!, skuName: "ZZ-TEST Cuvée Brut NV", destinationLocationId: loc.id });
  assert((await stateOf(disg.childLotId!)) === null, "BottledLotState closed (deleted) at finalize");
  const finLot = await prisma.lot.findUnique({ where: { id: disg.childLotId! }, select: { form: true } });
  assert(finLot?.form === "FINISHED", "disgorged child lot is FINISHED");
  const sku = await prisma.wineSku.findFirst({ where: { name: "ZZ-TEST Cuvée Brut NV" } });
  assert(sku?.isNonVintage === true && sku?.vintage === null, "finished SKU is NV (null vintage + isNonVintage)");
  assert(sku?.method === "TRADITIONAL" && sku?.dosageStyle === "BRUT", "SKU carries method TRADITIONAL + style BRUT");
  const run = await prisma.bottlingRun.findUnique({ where: { id: fin.runId }, include: { sources: true } });
  assert(run?.dosageGramsPerL != null && Number(run.dosageGramsPerL) === 7 && run.disgorgedAt != null, "run carries batch facts (dosage g/L + disgorgedAt)");
  assert(run!.sources.length === 1 && run!.sources[0].lotId === disg.childLotId && run!.sources[0].varietyId === null && run!.sources[0].vesselId === null, "one required BottlingSource.lotId, null variety/vessel (blended lot)");
  const inv = await prisma.bottledInventory.findFirst({ where: { wineSkuId: sku!.id, locationId: loc.id } });
  assert(inv?.totalBottles === 490, "inventory holds 490 finished bottles");

  // Lineage DAG back to the assemblage: finished child → cuvée (SPLIT) → base A + base B (BLEND)
  const cuveeParents = await prisma.lotLineage.findMany({ where: { childLotId: blend.childLotId }, select: { parentLotId: true, kind: true } });
  assert(cuveeParents.length === 2 && cuveeParents.every((e) => e.kind === "BLEND"), "cuvée traces to two base lots via BLEND lineage");

  // ── 8. Tank method (Charmat) — stays BULK, never bottled-in-process ──
  console.log("\n── 8. Tank method (bulk) ──");
  const tankVessel = await prisma.vessel.create({ data: { code: "ZZ-SPK-TANK", type: "TANK", capacityL: 3000 } });
  created.vesselIds.push(tankVessel.id);
  const tankLot = await seedLot("ZZS-TANK", tankVessel.id, 900, vyA.id, 2024, "WINE", "DRY");
  // Tirage sugar/yeast for the in-tank 2nd ferment is a normal ADDITION to the tank (the lot
  // stays bulk WINE). NB: the Phase 6 matrix treats WINE+AF:ACTIVE as incoherent, so the in-tank
  // 2nd ferment isn't modeled as an AF vector here — the ADDITION + isobaric bottling carry it.
  await addAdditionCore(ACTOR, { vesselId: tankVessel.id, materialId: liqTirage.id, rateValue: 24, rateBasis: "G_L" });
  assert((await stateOf(tankLot)) === null, "tank lot never gets a BottledLotState (stays bulk)");
  await executeBottling({ vesselIds: [tankVessel.id], destinationLocationId: loc.id, skuName: "ZZ-TEST Tank Frizzante", skuVintage: 2024, bottlesProduced: 1000, date: new Date("2026-07-01"), method: "TANK", dosageStyle: "EXTRA_DRY" }, ACTOR);
  const tankSku = await prisma.wineSku.findFirst({ where: { name: "ZZ-TEST Tank Frizzante" } });
  assert(tankSku?.method === "TANK" && tankSku?.dosageStyle === "EXTRA_DRY", "tank-method SKU tagged method TANK + style");
  assert((await stateOf(tankLot)) === null, "still no BottledLotState after isobaric bottling");
  const tankLotForm = await prisma.lot.findUnique({ where: { id: tankLot }, select: { form: true } });
  assert(tankLotForm?.form === "WINE", "tank lot stays LotForm WINE (bulk, not bottled-in-process)");

  // ── 9. Pét-nat — bottled mid-ferment (JUICE + AF ACTIVE), finalize sur lie (no dosage) ──
  console.log("\n── 9. Pét-nat (finalize sur lie) ──");
  const petVessel = await prisma.vessel.create({ data: { code: "ZZ-SPK-PET", type: "TANK", capacityL: 2000 } });
  created.vesselIds.push(petVessel.id);
  const petLot = await seedLot("ZZS-PETNAT", petVessel.id, 750, vyB.id, 2024, "JUICE", "ACTIVE");
  const petTir = await tirageCore(ACTOR, { lotId: petLot, sources: [{ vesselId: petVessel.id, drawL: 750 }], bottleCount: 1000, method: "PETNAT", locationId: loc.id });
  assert(petTir.tirageSugarAddedGpl === null, "pét-nat tirage has no liqueur de tirage");
  const petLotState = await prisma.lot.findUnique({ where: { id: petLot }, select: { form: true, afState: true } });
  assert(petLotState?.form === "BOTTLED_IN_PROCESS" && petLotState.afState === "ACTIVE", "pét-nat: BOTTLED_IN_PROCESS with AF ACTIVE carried into the bottle");
  const petFin = await finalizeSparklingCore(ACTOR, { lotId: petLot, skuName: "ZZ-TEST Pét-Nat", destinationLocationId: loc.id, vintage: 2024, isNonVintage: false });
  assert((await stateOf(petLot)) === null, "pét-nat BottledLotState closed at finalize");
  const petSku = await prisma.wineSku.findFirst({ where: { name: "ZZ-TEST Pét-Nat" } });
  assert(petSku?.method === "PETNAT" && petSku?.dosageStyle === null, "pét-nat SKU: method PETNAT, no dosage style (sur lie)");
  assert(petFin.bottlesProduced === 1000, "pét-nat finalized 1000 bottles with no disgorge/dosage");

  // ── 9b. Multi-tank tirage — one cuvée drawn from two tanks in a single TIRAGE ──
  console.log("\n── 9b. Multi-tank tirage ──");
  const mtA = await prisma.vessel.create({ data: { code: "ZZ-SPK-MTA", type: "TANK", capacityL: 2000 } });
  const mtB = await prisma.vessel.create({ data: { code: "ZZ-SPK-MTB", type: "TANK", capacityL: 2000 } });
  created.vesselIds.push(mtA.id, mtB.id);
  const mtLot = await prisma.lot.create({ data: { code: "ZZS-MULTI", form: "WINE", afState: "NONE", originVineyardId: vyA.id, vintageYear: 2024 } });
  created.lotIds.push(mtLot.id);
  await prisma.lotVineyard.create({ data: { lotId: mtLot.id, vineyardId: vyA.id } });
  await runLedgerWrite((tx) =>
    writeLotOperation(tx, {
      type: "SEED",
      lines: [
        { lotId: mtLot.id, vesselId: mtA.id, deltaL: 400 }, { lotId: mtLot.id, vesselId: null, deltaL: -400, reason: "seed" },
        { lotId: mtLot.id, vesselId: mtB.id, deltaL: 300 }, { lotId: mtLot.id, vesselId: null, deltaL: -300, reason: "seed" },
      ] as LedgerLine[],
      actorUserId: null, enteredBy: ACTOR.actorEmail, lotCodes: new Map([[mtLot.id, "ZZS-MULTI"]]), vesselCodes: new Map(), capacityByVessel: new Map([[mtA.id, 2000], [mtB.id, 2000]]),
    }),
  );
  const mtTir = await tirageCore(ACTOR, { lotId: mtLot.id, sources: [{ vesselId: mtA.id, drawL: 400 }, { vesselId: mtB.id, drawL: 300 }], bottleCount: 933, nominalFillMl: 750, method: "TRADITIONAL", locationId: loc.id });
  assert(mtTir.volumeL === 700, "multi-tank tirage draws 700 L total across two tanks");
  const mtState = await stateOf(mtLot.id);
  assert(mtState?.bottleCount === 933 && mtState?.volumeL === 700, "one bottle lot from two tanks: 933 bottles / 700 L");
  const mtDrainedA = await prisma.vesselLot.findFirst({ where: { vesselId: mtA.id, lotId: mtLot.id } });
  const mtDrainedB = await prisma.vesselLot.findFirst({ where: { vesselId: mtB.id, lotId: mtLot.id } });
  assert(mtDrainedA === null && mtDrainedB === null, "both source tanks drained by the single tirage");

  // ── 10. Corrections (D6/D15): guard, dosage reverse, finalize reversal ──
  console.log("\n── 10. Corrections ──");
  const cTank = await prisma.vessel.create({ data: { code: "ZZ-SPK-CORR", type: "TANK", capacityL: 3000 } });
  created.vesselIds.push(cTank.id);
  const cLot = await seedLot("ZZS-CORR", cTank.id, 750, vyA.id, 2024, "WINE", "NONE");
  await tirageCore(ACTOR, { lotId: cLot, sources: [{ vesselId: cTank.id, drawL: 750 }], bottleCount: 1000, method: "TRADITIONAL", locationId: loc.id });
  const cDisg = await disgorgementCore(ACTOR, { lotId: cLot, bottlesDisgorged: 1000, perBottleLossMl: 25 });
  const cDose = await dosageCore(ACTOR, { lotId: cLot, perBottleDoseMl: 9, liqueurGPerL: 600 });
  let cGuardBlocked = false;
  try { await correctBottleOperationCore(ACTOR, { operationId: cDisg.operationId }); } catch { cGuardBlocked = true; }
  assert(cGuardBlocked, "D15 guard blocks correcting a disgorgement after a later dosage");
  await correctBottleOperationCore(ACTOR, { operationId: cDose.operationId });
  const cAfterDose = await stateOf(cLot);
  assert(cAfterDose?.stage === "DISGORGED", "dosage reversal re-folds bottle state (stage → DISGORGED, style cleared)");
  const cDoseState = await prisma.bottledLotState.findUnique({ where: { lotId: cLot } });
  assert(cDoseState?.dosageStyle === null, "dosage reversal clears the style");
  const cFin = await finalizeSparklingCore(ACTOR, { lotId: cLot, skuName: "ZZ-TEST Corr Cuvée", destinationLocationId: loc.id, vintage: 2024, isNonVintage: false });
  await reverseFinalizeCore(ACTOR, { runId: cFin.runId });
  const cReopened = await stateOf(cLot);
  const cLotForm = await prisma.lot.findUnique({ where: { id: cLot }, select: { form: true } });
  assert(cReopened != null && cReopened.bottleCount === 1000 && cLotForm?.form === "BOTTLED_IN_PROCESS", "finalize reversal reopens the bottle lot (1000 bottles, BOTTLED_IN_PROCESS)");
  assert((await prisma.bottlingRun.findUnique({ where: { id: cFin.runId } })) === null, "finalize reversal deletes the BottlingRun");

  // ── 11. Full chain reversal — un-bottle all the way back to the tank ──
  console.log("\n── 11. Full chain reversal (back to tank) ──");
  const rvTank = await prisma.vessel.create({ data: { code: "ZZ-SPK-RV", type: "TANK", capacityL: 3000 } });
  created.vesselIds.push(rvTank.id);
  const rvLot = await seedLot("ZZS-REVERSE", rvTank.id, 750, vyA.id, 2024, "WINE", "NONE");
  await tirageCore(ACTOR, { lotId: rvLot, sources: [{ vesselId: rvTank.id, drawL: 750 }], bottleCount: 1000, method: "TRADITIONAL", locationId: loc.id });
  await riddlingCore(ACTOR, { lotId: rvLot, method: "gyropalette" });
  await disgorgementCore(ACTOR, { lotId: rvLot, bottlesDisgorged: 1000, perBottleLossMl: 25 });
  await dosageCore(ACTOR, { lotId: rvLot, perBottleDoseMl: 8, liqueurGPerL: 600 });
  const rvFin = await finalizeSparklingCore(ACTOR, { lotId: rvLot, skuName: "ZZ-TEST Reverse Cuvée", destinationLocationId: loc.id, vintage: 2024, isNonVintage: false });
  assert((await prisma.lot.findUnique({ where: { id: rvLot }, select: { form: true } }))?.form === "FINISHED", "reverse fixture reached FINISHED before unwinding");

  // Unwind LIFO via the dispatcher (the same core the UI + dev script call) until nothing remains.
  let rvGuard = 0;
  for (;;) {
    if (rvGuard++ > 50) throw new Error("reversal loop runaway");
    const next = await prisma.lotOperation.findFirst({
      where: { type: { in: ["TIRAGE", "RIDDLING", "DISGORGEMENT", "DOSAGE", "FINISH"] }, correctedBy: { is: null }, OR: [{ lines: { some: { lotId: rvLot } } }, { treatments: { some: { lotId: rvLot } } }] },
      orderBy: { id: "desc" },
      select: { id: true },
    });
    if (!next) break;
    await reverseSparklingOperationCore(ACTOR, { operationId: next.id });
  }

  assert((await stateOf(rvLot)) === null, "reversal: BottledLotState gone (bottles un-bottled)");
  const rvLotAfter = await prisma.lot.findUnique({ where: { id: rvLot }, select: { form: true, afState: true } });
  assert(rvLotAfter?.form === "WINE" && rvLotAfter.afState === "NONE", "reversal: lot back to WINE / AF NONE (as before tirage)");
  const rvPos = await prisma.vesselLot.findFirst({ where: { vesselId: rvTank.id, lotId: rvLot } });
  assert(rvPos != null && Number(rvPos.volumeL) === 750, "reversal: 750 L back in the source tank");
  assert((await prisma.bottlingRun.findUnique({ where: { id: rvFin.runId } })) === null, "reversal: bottling run removed");
  const rvInv = await prisma.bottledInventory.findFirst({ where: { wineSku: { name: "ZZ-TEST Reverse Cuvée" } } });
  assert(rvInv == null || rvInv.totalBottles === 0, "reversal: finished-goods inventory drained to 0");
  const rvVesselFold = await prisma.lotOperationLine.aggregate({ where: { lotId: rvLot, bucket: "VESSEL" }, _sum: { deltaL: true } });
  const rvProj = await prisma.vesselLot.aggregate({ where: { lotId: rvLot }, _sum: { volumeL: true } });
  assert(Number(rvVesselFold._sum.deltaL ?? 0) === 750 && Number(rvProj._sum.volumeL ?? 0) === 750, "reversal: ledger vessel-fold == projection (750 L)");
  const rvBottleFold = await prisma.lotOperationLine.aggregate({ where: { lotId: rvLot, bucket: "BOTTLE_STORAGE" }, _sum: { deltaL: true } });
  assert(Number(rvBottleFold._sum.deltaL ?? 0) === 0, "reversal: BOTTLE_STORAGE legs net to zero");

  console.log(`\nALL ${passed} SPARKLING ASSERTIONS PASSED (traditional + multi-tank + tank + pét-nat + corrections + full reversal)`);
}

async function scrub() {
  const ids = created.lotIds;
  await prisma.bottlingSource.deleteMany({ where: { OR: [{ lotId: { in: ids } }, { bottlingRun: { wineSku: { name: { startsWith: "ZZ-TEST" } } } }] } }).catch(() => {});
  const runs = await prisma.bottlingRun.findMany({ where: { wineSku: { name: { startsWith: "ZZ-TEST" } } }, select: { id: true } });
  await prisma.stockMovement.deleteMany({ where: { bottlingRunId: { in: runs.map((r) => r.id) } } }).catch(() => {});
  await prisma.bottlingRun.deleteMany({ where: { id: { in: runs.map((r) => r.id) } } }).catch(() => {});
  await prisma.bottledInventory.deleteMany({ where: { wineSku: { name: { startsWith: "ZZ-TEST" } } } }).catch(() => {});
  await prisma.wineSku.deleteMany({ where: { name: { startsWith: "ZZ-TEST" } } }).catch(() => {});
  await prisma.lotTreatment.deleteMany({ where: { lotId: { in: ids } } }).catch(() => {});
  await prisma.bottledLotState.deleteMany({ where: { lotId: { in: ids } } }).catch(() => {});
  await prisma.lotStateEvent.deleteMany({ where: { lotId: { in: ids } } }).catch(() => {});
  await prisma.lotLineage.deleteMany({ where: { OR: [{ parentLotId: { in: ids } }, { childLotId: { in: ids } }] } }).catch(() => {});
  await prisma.lotOperationLine.deleteMany({ where: { lotId: { in: ids } } }).catch(() => {});
  await prisma.vesselLot.deleteMany({ where: { lotId: { in: ids } } }).catch(() => {});
  await prisma.lotVineyard.deleteMany({ where: { lotId: { in: ids } } }).catch(() => {});
  const orphanOps = await prisma.lotOperation.findMany({ where: { lines: { none: {} }, enteredBy: ACTOR.actorEmail }, select: { id: true } });
  await prisma.lotTreatment.deleteMany({ where: { operationId: { in: orphanOps.map((o) => o.id) } } }).catch(() => {});
  await prisma.lotOperation.deleteMany({ where: { id: { in: orphanOps.map((o) => o.id) } } }).catch(() => {});
  await prisma.lot.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
  await prisma.cellarMaterial.deleteMany({ where: { id: { in: created.materialIds } } }).catch(() => {});
  await prisma.vessel.deleteMany({ where: { id: { in: created.vesselIds } } }).catch(() => {});
  await prisma.location.deleteMany({ where: { id: { in: created.locationIds } } }).catch(() => {});
  await prisma.vineyard.deleteMany({ where: { id: { in: created.vineyardIds } } }).catch(() => {});
}

main()
  .then(scrub)
  .then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error("\nFAILED:", e); try { await scrub(); } catch (se) { console.error("scrub error:", se); } await prisma.$disconnect(); process.exit(1); });
