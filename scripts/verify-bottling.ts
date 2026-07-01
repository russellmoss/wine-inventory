/**
 * Phase 7 Unit 9 CHARACTERIZATION / REGRESSION guard for still-wine bottling.
 *
 * Seeds a still-wine scenario, runs the real `executeBottling`, and asserts the exact
 * finished-goods output — SKU, BottlingRun, BottlingSource rows, the BOTTLE ledger op lines,
 * StockMovement, BottledInventory. Run it BEFORE and AFTER the `materializeFinishedGoods`
 * extraction: identical output proves the refactor left still-wine bottling byte-identical
 * (eng-review IRON rule). Everything is scrubbed in a finally block.
 *
 * Run:  npx tsx --env-file=.env scripts/verify-bottling.ts
 */
import { prisma } from "@/lib/prisma";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { LedgerLine } from "@/lib/ledger/math";
import { executeBottling, type Actor } from "@/lib/bottling/run";
import { consumedForBottles } from "@/lib/bottling/draw";

const ACTOR: Actor = { actorUserId: null, actorEmail: "system@verify-bottling" };
let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  passed++;
  console.log(`  ✓ ${msg}`);
}

const created = { vineyardIds: [] as string[], varietyIds: [] as string[], vesselIds: [] as string[], lotIds: [] as string[], locationIds: [] as string[], skuIds: [] as string[] };

async function main() {
  const vy = await prisma.vineyard.create({ data: { name: "ZZ-TEST BotVY" } });
  created.vineyardIds.push(vy.id);
  const variety = await prisma.variety.create({ data: { name: "ZZ-TEST BotVar" } });
  created.varietyIds.push(variety.id);
  const vessel = await prisma.vessel.create({ data: { code: "ZZ-BOT1", type: "TANK", capacityL: 2000 } });
  created.vesselIds.push(vessel.id);
  const loc = await prisma.location.create({ data: { name: "ZZ-TEST BotCellar" } });
  created.locationIds.push(loc.id);

  const lot = await prisma.lot.create({ data: { code: "ZZ-BOTLOT", form: "WINE", originVineyardId: vy.id, originVarietyId: variety.id, vintageYear: 2023 } });
  created.lotIds.push(lot.id);
  await runLedgerWrite((tx) =>
    writeLotOperation(tx, {
      type: "SEED",
      lines: [
        { lotId: lot.id, vesselId: vessel.id, deltaL: 750 },
        { lotId: lot.id, vesselId: null, deltaL: -750, reason: "seed" },
      ] as LedgerLine[],
      actorUserId: null, enteredBy: ACTOR.actorEmail, lotCodes: new Map([[lot.id, lot.code]]), vesselCodes: new Map([[vessel.id, vessel.code]]), capacityByVessel: new Map([[vessel.id, 2000]]),
    }),
  );

  const bottles = 960; // 960 × 0.75 L = 720 L consumed
  await executeBottling({ vesselIds: [vessel.id], destinationLocationId: loc.id, skuName: "ZZ-TEST Still Rosé", skuVintage: 2023, bottlesProduced: bottles, date: new Date("2026-07-01") }, ACTOR);

  const consumedL = consumedForBottles(bottles);
  const sku = await prisma.wineSku.findFirst({ where: { name: "ZZ-TEST Still Rosé", vintage: 2023, bottleSizeMl: 750 }, include: { category: true } });
  assert(!!sku, "SKU created for the still wine");
  if (sku) created.skuIds.push(sku.id);
  assert(sku?.category?.name === "Wine", "SKU defaulted to the Wine category");
  assert(sku?.isNonVintage === false && sku?.vintage === 2023, "SKU is vintaged (not NV)");
  assert(sku?.method === null && sku?.dosageStyle === null, "still-wine SKU has no sparkling method/style");

  const run = await prisma.bottlingRun.findFirst({ where: { wineSkuId: sku!.id }, include: { sources: true, stockMovements: true } });
  assert(!!run, "BottlingRun created");
  assert(run!.bottlesProduced === bottles && Number(run!.volumeConsumedL) === consumedL, `run records ${bottles} bottles / ${consumedL} L`);
  assert(run!.disgorgedAt === null && run!.dosageGramsPerL === null, "still-wine run has no sparkling batch facts");
  assert(run!.sources.length === 1, "one BottlingSource for the single source lot");
  const src = run!.sources[0];
  assert(src.lotId === lot.id && src.vesselId === vessel.id, "source carries lot + vessel provenance");
  assert(src.varietyId === variety.id && src.vineyardId === vy.id && src.vintage === 2023, "source carries full origin (variety/vineyard/vintage)");
  assert(Number(src.volumeConsumedL) === consumedL, "source volume == consumed");
  assert(run!.stockMovements.length === 1 && run!.stockMovements[0].deltaUnits === bottles && run!.stockMovements[0].kind === "RECEIVE", "one RECEIVE stock movement for the bottles");

  const inv = await prisma.bottledInventory.findUnique({ where: { wineSkuId_locationId: { wineSkuId: sku!.id, locationId: loc.id } } });
  assert(inv?.totalBottles === bottles, `inventory holds ${bottles} bottles at the destination`);

  // The BOTTLE ledger op: −consumed out of the vessel + a matching +consumed EXTERNAL "bottle" leg.
  const bottleOp = await prisma.lotOperation.findFirst({ where: { type: "BOTTLE", note: `Bottling run ${run!.id}` }, include: { lines: true } });
  assert(!!bottleOp, "BOTTLE ledger op written, noted with the run id");
  const vesselLeg = bottleOp!.lines.find((l) => l.vesselId === vessel.id);
  const extLeg = bottleOp!.lines.find((l) => l.vesselId === null);
  assert(Number(vesselLeg!.deltaL) === -consumedL && vesselLeg!.bucket === "VESSEL", "vessel leg draws −consumed, bucket VESSEL");
  assert(Number(extLeg!.deltaL) === consumedL && extLeg!.reason === "bottle" && extLeg!.bucket === "EXTERNAL", "external leg +consumed, reason bottle, bucket EXTERNAL");

  // Vessel drained (750 − 720 = 30 L remains).
  const vl = await prisma.vesselLot.findFirst({ where: { vesselId: vessel.id, lotId: lot.id } });
  assert(vl != null && Math.round(Number(vl.volumeL) * 100) / 100 === Math.round((750 - consumedL) * 100) / 100, `vessel holds ${Math.round((750 - consumedL) * 100) / 100} L after bottling`);

  console.log(`\nALL ${passed} CHARACTERIZATION ASSERTIONS PASSED (still-wine bottling)`);
}

async function scrub() {
  for (const id of created.lotIds) {
    await prisma.bottlingSource.deleteMany({ where: { lotId: id } }).catch(() => {});
  }
  const runs = await prisma.bottlingRun.findMany({ where: { wineSku: { name: { startsWith: "ZZ-TEST" } } }, select: { id: true } });
  const runIds = runs.map((r) => r.id);
  await prisma.stockMovement.deleteMany({ where: { bottlingRunId: { in: runIds } } }).catch(() => {});
  await prisma.bottlingSource.deleteMany({ where: { bottlingRunId: { in: runIds } } }).catch(() => {});
  await prisma.bottlingRun.deleteMany({ where: { id: { in: runIds } } }).catch(() => {});
  await prisma.bottledInventory.deleteMany({ where: { wineSku: { name: { startsWith: "ZZ-TEST" } } } }).catch(() => {});
  await prisma.wineSku.deleteMany({ where: { name: { startsWith: "ZZ-TEST" } } }).catch(() => {});
  await prisma.lotOperationLine.deleteMany({ where: { lotId: { in: created.lotIds } } }).catch(() => {});
  await prisma.vesselLot.deleteMany({ where: { lotId: { in: created.lotIds } } }).catch(() => {});
  const orphanOps = await prisma.lotOperation.findMany({ where: { lines: { none: {} }, enteredBy: ACTOR.actorEmail }, select: { id: true } });
  await prisma.lotOperation.deleteMany({ where: { id: { in: orphanOps.map((o) => o.id) } } }).catch(() => {});
  await prisma.lot.deleteMany({ where: { id: { in: created.lotIds } } }).catch(() => {});
  await prisma.vessel.deleteMany({ where: { id: { in: created.vesselIds } } }).catch(() => {});
  await prisma.location.deleteMany({ where: { id: { in: created.locationIds } } }).catch(() => {});
  await prisma.variety.deleteMany({ where: { id: { in: created.varietyIds } } }).catch(() => {});
  await prisma.vineyard.deleteMany({ where: { id: { in: created.vineyardIds } } }).catch(() => {});
}

main()
  .then(scrub)
  .then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (e) => { console.error("\nFAILED:", e); try { await scrub(); } catch (se) { console.error("scrub error:", se); } await prisma.$disconnect(); process.exit(1); });
