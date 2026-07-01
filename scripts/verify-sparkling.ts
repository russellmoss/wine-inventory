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
import { transitionStateCore } from "@/lib/ferment/transition-core";
import { abvBumpForSugar } from "@/lib/sparkling/sugar";
import { isCountVolumeConsistent, type BottledStateProjection } from "@/lib/sparkling/projection";

const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@verify-sparkling" };
const r2 = (n: number) => Math.round(n * 100) / 100;
let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ✓ ${msg}`);
}

const created = { vineyardIds: [] as string[], vesselIds: [] as string[], lotIds: [] as string[], locationIds: [] as string[], materialIds: [] as string[] };

async function seedLot(code: string, vesselId: string, volumeL: number, vineyardId: string, vintage: number): Promise<string> {
  const lot = await prisma.lot.create({ data: { code, form: "WINE", afState: "DRY", originVineyardId: vineyardId, vintageYear: vintage } });
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

async function main() {
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
    sourceVesselId: cuvee.id, lotId: blend.childLotId, drawL: 1500, bottleCount: 2000, nominalFillMl: 750,
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

  console.log(`\nALL ${passed} SPARKLING ASSERTIONS PASSED (traditional arc)`);
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
