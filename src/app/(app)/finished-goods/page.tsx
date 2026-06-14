import { prisma } from "@/lib/prisma";
import { FinishedGoodsClient, type Cat, type Good, type LocOpt, type GoodBalance } from "./FinishedGoodsClient";

export default async function FinishedGoodsPage() {
  const [categories, goods, locations, balances] = await Promise.all([
    prisma.finishedGoodCategory.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.finishedGood.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, include: { category: { select: { name: true } } } }),
    prisma.location.findMany({ where: { isActive: true }, orderBy: [{ isSystem: "desc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.finishedGoodInventory.findMany({
      where: { quantity: { gt: 0 } },
      include: { finishedGood: { select: { name: true, category: { select: { name: true } } } }, location: { select: { name: true } } },
    }),
  ]);

  const goodRows: Good[] = goods.map((g) => ({ id: g.id, name: g.name, category: g.category.name }));
  const balanceRows: GoodBalance[] = balances.map((b) => ({
    good: b.finishedGood.name,
    category: b.finishedGood.category.name,
    location: b.location.name,
    quantity: b.quantity,
  }));

  return <FinishedGoodsClient categories={categories} goods={goodRows} locations={locations} balances={balanceRows} />;
}
