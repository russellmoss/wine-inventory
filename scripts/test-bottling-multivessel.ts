/**
 * Integration test: bottle MULTIPLE vessels into one SKU (proportional draw across
 * both), then delete to confirm both vessels are restored. Run: npx tsx scripts/test-bottling-multivessel.ts
 */
import { prisma } from "../src/lib/prisma";
import { executeBottling, deleteBottling } from "../src/lib/bottling/run";

const TAG = "ZZMV_" + Math.random().toString(36).slice(2, 8);
const actor = { actorUserId: null, actorEmail: "multivessel-test@bhutanwine.com" };
const SKU = `${TAG} Blend`;

async function main() {
  const merlot = await prisma.variety.create({ data: { name: `${TAG}_Merlot` } });
  const syrah = await prisma.variety.create({ data: { name: `${TAG}_Syrah` } });
  const vy = await prisma.vineyard.create({ data: { name: `${TAG}_Y` } });
  const loc = await prisma.location.create({ data: { name: `${TAG}_L` } });
  const a = await prisma.vessel.create({ data: { code: `${TAG}_A`, type: "BARREL", capacityL: 600, components: { create: [{ varietyId: merlot.id, vineyardId: vy.id, vintage: 2025, volumeL: 600 }] } } });
  const b = await prisma.vessel.create({ data: { code: `${TAG}_B`, type: "BARREL", capacityL: 400, components: { create: [{ varietyId: syrah.id, vineyardId: vy.id, vintage: 2025, volumeL: 400 }] } } });

  const vL = async (id: string) => Number((await prisma.vesselComponent.aggregate({ where: { vesselId: id }, _sum: { volumeL: true } }))._sum.volumeL ?? 0);
  const bottled = async () => (await prisma.bottledInventory.findFirst({ where: { location: { id: loc.id }, wineSku: { name: SKU } } }))?.totalBottles ?? 0;
  const problems: string[] = [];

  // Bottle 1000 bottles (750 L) across BOTH vessels (1000 L total).
  await executeBottling({ vesselIds: [a.id, b.id], destinationLocationId: loc.id, skuName: SKU, skuVintage: 2025, bottlesProduced: 1000, abv: 13.5, date: new Date("2026-06-14") }, actor);
  const [aL, bL, bot] = [await vL(a.id), await vL(b.id), await bottled()];
  // 750 L drawn proportionally: A 450 -> 150 left; B 300 -> 100 left
  if (aL !== 150) problems.push(`vessel A ${aL} != 150`);
  if (bL !== 100) problems.push(`vessel B ${bL} != 100`);
  if (bot !== 1000) problems.push(`bottled ${bot} != 1000`);

  const run = (await prisma.bottlingRun.findFirst({ where: { wineSku: { name: SKU } }, orderBy: { createdAt: "desc" }, include: { sources: true } }))!;
  const vesselsInSources = new Set(run.sources.map((s) => s.vesselId));
  if (vesselsInSources.size !== 2) problems.push(`expected 2 source vessels, got ${vesselsInSources.size}`);

  // Delete -> both restored
  await deleteBottling(run.id, actor);
  if ((await vL(a.id)) !== 600) problems.push(`after delete: A ${await vL(a.id)} != 600`);
  if ((await vL(b.id)) !== 400) problems.push(`after delete: B ${await vL(b.id)} != 400`);
  if ((await bottled()) !== 0) problems.push(`after delete: bottled ${await bottled()} != 0`);

  console.log(`multi-vessel: A=${aL} B=${bL} bottled=${bot}, sources span ${vesselsInSources.size} vessels; after delete restored A=${await vL(a.id)} B=${await vL(b.id)}`);

  // cleanup
  await prisma.stockMovement.deleteMany({ where: { location: { id: loc.id } } });
  await prisma.bottledInventory.deleteMany({ where: { locationId: loc.id } });
  await prisma.bottlingRun.deleteMany({ where: { destinationLocationId: loc.id } });
  await prisma.wineSku.deleteMany({ where: { name: SKU } });
  await prisma.vessel.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  await prisma.variety.deleteMany({ where: { id: { in: [merlot.id, syrah.id] } } });
  await prisma.vineyard.delete({ where: { id: vy.id } });
  await prisma.location.delete({ where: { id: loc.id } });
  await prisma.auditLog.deleteMany({ where: { actorEmail: actor.actorEmail } });

  if (problems.length) { console.error("FAIL:\n - " + problems.join("\n - ")); process.exit(1); }
  console.log("PASS: multi-vessel bottling draws proportionally across vessels and reverses cleanly.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
