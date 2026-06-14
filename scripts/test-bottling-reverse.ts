/**
 * Integration test for bottling delete + edit (reverse + redo).
 * Run: npx tsx scripts/test-bottling-reverse.ts
 */
import { prisma } from "../src/lib/prisma";
import { executeBottling, deleteBottling, editBottling } from "../src/lib/bottling/run";

const TAG = "ZZREV_" + Math.random().toString(36).slice(2, 8);
const actor = { actorUserId: null, actorEmail: "reverse-test@bhutanwine.com" };
const SKU = `${TAG} Wine`;

async function main() {
  const variety = await prisma.variety.create({ data: { name: `${TAG}_V` } });
  const vineyard = await prisma.vineyard.create({ data: { name: `${TAG}_Y` } });
  const loc = await prisma.location.create({ data: { name: `${TAG}_L` } });
  const vessel = await prisma.vessel.create({
    data: { code: `${TAG}_T`, type: "TANK", capacityL: 1000, components: { create: [{ varietyId: variety.id, vineyardId: vineyard.id, vintage: 2025, volumeL: 1000 }] } },
  });

  const vesselL = async () => (await prisma.vesselComponent.aggregate({ where: { vesselId: vessel.id }, _sum: { volumeL: true } }))._sum.volumeL ?? 0;
  const bottledAt = async () => (await prisma.bottledInventory.findFirst({ where: { location: { id: loc.id }, wineSku: { name: SKU } } }))?.totalBottles ?? 0;
  const latestRun = async () => (await prisma.bottlingRun.findFirst({ where: { wineSku: { name: SKU } }, orderBy: { createdAt: "desc" } }))!;
  const problems: string[] = [];

  const input = (bottles: number) => ({ vesselIds: [vessel.id], destinationLocationId: loc.id, skuName: SKU, skuVintage: 2025, bottlesProduced: bottles, date: new Date("2026-06-14") });

  // 1) bottle 1000 (750 L)
  await executeBottling(input(1000), actor);
  if (Number(await vesselL()) !== 250) problems.push(`after bottle: vessel ${await vesselL()} != 250`);
  if ((await bottledAt()) !== 1000) problems.push(`after bottle: bottled ${await bottledAt()} != 1000`);

  // 2) delete -> full reversal
  await deleteBottling((await latestRun()).id, actor);
  if (Number(await vesselL()) !== 1000) problems.push(`after delete: vessel ${await vesselL()} != 1000 (bulk not restored)`);
  if ((await bottledAt()) !== 0) problems.push(`after delete: bottled ${await bottledAt()} != 0`);

  // 3) bottle 500 then edit to 800
  await executeBottling(input(500), actor); // 375 L -> vessel 625
  await editBottling((await latestRun()).id, input(800), actor); // reverse(625->1000) then apply 800=600L -> 400
  if (Number(await vesselL()) !== 400) problems.push(`after edit: vessel ${await vesselL()} != 400`);
  if ((await bottledAt()) !== 800) problems.push(`after edit: bottled ${await bottledAt()} != 800`);

  console.log(`final: vessel ${await vesselL()} L, bottled ${await bottledAt()}`);

  // cleanup
  await prisma.stockMovement.deleteMany({ where: { location: { id: loc.id } } });
  await prisma.bottledInventory.deleteMany({ where: { locationId: loc.id } });
  await prisma.bottlingRun.deleteMany({ where: { destinationLocationId: loc.id } });
  await prisma.wineSku.deleteMany({ where: { name: SKU } });
  await prisma.vessel.delete({ where: { id: vessel.id } });
  await prisma.variety.delete({ where: { id: variety.id } });
  await prisma.vineyard.delete({ where: { id: vineyard.id } });
  await prisma.location.delete({ where: { id: loc.id } });
  await prisma.auditLog.deleteMany({ where: { actorEmail: actor.actorEmail } });

  if (problems.length) { console.error("FAIL:\n - " + problems.join("\n - ")); process.exit(1); }
  console.log("PASS: delete reverses fully (bulk restored, bottles removed); edit reverses + reapplies.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
