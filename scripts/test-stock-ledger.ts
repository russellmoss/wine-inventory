/**
 * Integration test for the stock movement ledger: receive / transfer / adjust,
 * balance conservation on transfer, and no-negative guards. Isolated data,
 * cleaned up after. Run: npx tsx scripts/test-stock-ledger.ts
 */
import { prisma } from "../src/lib/prisma";
import { receiveStock, transferStock, adjustStock } from "../src/lib/stock/movements";

const TAG = "ZZLEDGER_" + Math.random().toString(36).slice(2, 8);
const actor = { actorUserId: null, actorEmail: "ledger-test@bhutanwine.com" };

async function expectThrow(label: string, fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    console.error(`  ✗ ${label}: expected an error but it succeeded`);
    return false;
  } catch {
    return true;
  }
}

async function main() {
  const locA = await prisma.location.create({ data: { name: `${TAG}_A` } });
  const locB = await prisma.location.create({ data: { name: `${TAG}_B` } });
  const sku = await prisma.wineSku.create({ data: { name: `${TAG} Wine`, vintage: 2025, bottleSizeMl: 750 } });

  const balance = async (locId: string) =>
    (await prisma.bottledInventory.findFirst({ where: { wineSkuId: sku.id, locationId: locId } }))?.totalBottles ?? 0;

  const problems: string[] = [];

  await receiveStock("BOTTLED_WINE", sku.id, locA.id, 100, actor, "initial");
  if ((await balance(locA.id)) !== 100) problems.push(`receive: A expected 100, got ${await balance(locA.id)}`);

  await transferStock("BOTTLED_WINE", sku.id, locA.id, locB.id, 30, actor);
  const [a1, b1] = [await balance(locA.id), await balance(locB.id)];
  if (a1 !== 70 || b1 !== 30) problems.push(`transfer: expected A70/B30, got A${a1}/B${b1}`);
  if (a1 + b1 !== 100) problems.push("transfer did not conserve total");

  await adjustStock("BOTTLED_WINE", sku.id, locB.id, -10, actor, "breakage");
  if ((await balance(locB.id)) !== 20) problems.push(`adjust: B expected 20, got ${await balance(locB.id)}`);

  const overAdjust = await expectThrow("over-adjust rejected", () => adjustStock("BOTTLED_WINE", sku.id, locA.id, -1000, actor, "oops"));
  const overTransfer = await expectThrow("over-transfer rejected", () => transferStock("BOTTLED_WINE", sku.id, locA.id, locB.id, 1000, actor));
  if (!overAdjust) problems.push("over-adjust was NOT rejected");
  if (!overTransfer) problems.push("over-transfer was NOT rejected");

  // finished-good branch smoke
  const cat = await prisma.finishedGoodCategory.create({ data: { name: `${TAG}_Cat` } });
  const good = await prisma.finishedGood.create({ data: { name: `${TAG}_Shirt`, categoryId: cat.id } });
  await receiveStock("FINISHED_GOOD", good.id, locA.id, 50, actor, "merch");
  const gq = (await prisma.finishedGoodInventory.findFirst({ where: { finishedGoodId: good.id, locationId: locA.id } }))?.quantity ?? 0;
  if (gq !== 50) problems.push(`finished good receive: expected 50, got ${gq}`);

  const [fa, fb] = [await balance(locA.id), await balance(locB.id)];
  const negative = fa < 0 || fb < 0;
  console.log(`final bottled: A=${fa} B=${fb} (total ${fa + fb}, negative=${negative})`);
  console.log(`finished good qty at A: ${gq}`);
  if (negative) problems.push("a balance went negative");

  // cleanup
  await prisma.stockMovement.deleteMany({ where: { OR: [{ wineSkuId: sku.id }, { finishedGoodId: good.id }] } });
  await prisma.bottledInventory.deleteMany({ where: { wineSkuId: sku.id } });
  await prisma.finishedGoodInventory.deleteMany({ where: { finishedGoodId: good.id } });
  await prisma.wineSku.delete({ where: { id: sku.id } });
  await prisma.finishedGood.delete({ where: { id: good.id } });
  await prisma.finishedGoodCategory.delete({ where: { id: cat.id } });
  await prisma.location.deleteMany({ where: { id: { in: [locA.id, locB.id] } } });
  await prisma.auditLog.deleteMany({ where: { actorEmail: actor.actorEmail } });

  if (problems.length) {
    console.error("FAIL:\n - " + problems.join("\n - "));
    process.exit(1);
  }
  console.log("PASS: ledger receive/transfer/adjust correct; transfers conserve; no negatives.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
