/**
 * Integration test: two concurrent bottling runs on the same vessel must never
 * overdraw or leave a negative volume. Uses the real executeBottling path against
 * the live DB, with isolated test data that is cleaned up afterward.
 * Run: npx tsx scripts/test-bottling-concurrency.ts
 */
import { prisma } from "../src/lib/prisma";
import { executeBottling } from "../src/lib/bottling/run";

const TAG = "ZZTEST_" + Math.random().toString(36).slice(2, 8);
const actor = { actorUserId: null, actorEmail: "concurrency-test@bhutanwine.com" };

async function main() {
  // --- setup: variety, vineyard, location, vessel(1000L = 600 Merlot + 400 Syrah) ---
  const variety = await prisma.variety.create({ data: { name: `${TAG}_Merlot` } });
  const variety2 = await prisma.variety.create({ data: { name: `${TAG}_Syrah` } });
  const vineyard = await prisma.vineyard.create({ data: { name: `${TAG}_Vineyard` } });
  const location = await prisma.location.create({ data: { name: `${TAG}_Cellar` } });
  const vessel = await prisma.vessel.create({
    data: {
      code: `${TAG}_TANK`,
      type: "TANK",
      capacityL: 1000,
      components: {
        create: [
          { varietyId: variety.id, vineyardId: vineyard.id, vintage: 2025, volumeL: 600 },
          { varietyId: variety2.id, vineyardId: vineyard.id, vintage: 2025, volumeL: 400 },
        ],
      },
    },
  });

  const input = (n: number) => ({
    vesselIds: [vessel.id],
    destinationLocationId: location.id,
    skuName: `${TAG} Reserve`,
    skuVintage: 2025,
    bottlesProduced: 1000, // 750 L each; two together = 1500 L > 1000 L available
    date: new Date("2026-06-14"),
  });

  // --- fire two concurrent runs ---
  const results = await Promise.allSettled([executeBottling(input(1), actor), executeBottling(input(2), actor)]);
  const ok = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected");

  // --- assertions ---
  const comps = await prisma.vesselComponent.findMany({ where: { vesselId: vessel.id } });
  const remaining = comps.reduce((a, c) => a + Number(c.volumeL), 0);
  const negative = comps.some((c) => Number(c.volumeL) < 0);
  const bottled = await prisma.bottledInventory.aggregate({
    where: { location: { id: location.id } },
    _sum: { totalBottles: true },
  });
  const totalBottled = bottled._sum.totalBottles ?? 0;

  const problems: string[] = [];
  if (ok !== 1) problems.push(`expected exactly 1 success, got ${ok}`);
  if (negative) problems.push("a component went NEGATIVE");
  if (Math.round(remaining * 100) / 100 !== 250) problems.push(`expected 250 L remaining, got ${remaining}`);
  if (totalBottled !== 1000) problems.push(`expected 1000 bottled, got ${totalBottled}`);

  console.log(`runs: ${ok} ok, ${failed.length} failed`);
  console.log(`failure reason: ${failed[0] && (failed[0] as PromiseRejectedResult).reason?.message}`);
  console.log(`vessel remaining: ${remaining} L (negative=${negative})`);
  console.log(`total bottled: ${totalBottled}`);

  // --- cleanup (dependency order) ---
  await prisma.stockMovement.deleteMany({ where: { locationId: location.id } });
  await prisma.bottledInventory.deleteMany({ where: { locationId: location.id } });
  await prisma.bottlingRun.deleteMany({ where: { destinationLocationId: location.id } });
  await prisma.wineSku.deleteMany({ where: { name: `${TAG} Reserve` } });
  await prisma.vessel.delete({ where: { id: vessel.id } }); // cascades components + sources
  await prisma.variety.deleteMany({ where: { id: { in: [variety.id, variety2.id] } } });
  await prisma.vineyard.delete({ where: { id: vineyard.id } });
  await prisma.location.delete({ where: { id: location.id } });
  await prisma.auditLog.deleteMany({ where: { actorEmail: actor.actorEmail } });

  if (problems.length) {
    console.error("FAIL:\n - " + problems.join("\n - "));
    process.exit(1);
  }
  console.log("PASS: concurrent bottling did not overdraw; exactly one run committed.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
