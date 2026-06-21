import { prisma } from "@/lib/prisma";
import { casesAndLoose } from "@/lib/bottling/draw";
import { InventoryClient, type Cat, type ItemOpt, type LocOpt, type OnHandRow } from "./InventoryClient";

export default async function InventoryPage() {
  const [categories, skus, goods, locations, bottled, fg] = await Promise.all([
    prisma.finishedGoodCategory.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.wineSku.findMany({ where: { isActive: true }, orderBy: [{ name: "asc" }, { vintage: "desc" }], include: { category: { select: { name: true } } } }),
    prisma.finishedGood.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, include: { category: { select: { name: true } } } }),
    prisma.location.findMany({ where: { isActive: true }, orderBy: [{ isSystem: "desc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.bottledInventory.findMany({ where: { totalBottles: { gt: 0 } }, include: { wineSku: { select: { name: true, vintage: true, categoryId: true, category: { select: { name: true } } } }, location: { select: { name: true } } } }),
    prisma.finishedGoodInventory.findMany({ where: { quantity: { gt: 0 } }, include: { finishedGood: { select: { name: true, categoryId: true, category: { select: { name: true } } } }, location: { select: { name: true } } } }),
  ]);

  const items: ItemOpt[] = [
    ...skus.map((s) => ({ kind: "BOTTLED_WINE" as const, id: s.id, label: `${s.name} ${s.vintage}`, category: s.category?.name ?? "Wine" })),
    ...goods.map((g) => ({ kind: "FINISHED_GOOD" as const, id: g.id, label: g.name, category: g.category.name })),
  ];

  const onHand: OnHandRow[] = [
    ...bottled.map((b) => {
      const { cases, loose } = casesAndLoose(b.totalBottles);
      return { kind: "BOTTLED_WINE" as const, itemId: b.wineSkuId, item: `${b.wineSku.name} ${b.wineSku.vintage}`, name: b.wineSku.name, vintage: b.wineSku.vintage, categoryId: b.wineSku.categoryId, category: b.wineSku.category?.name ?? "Wine", locationId: b.locationId, location: b.location.name, qty: b.totalBottles, cases, loose, detail: `${cases}c + ${loose}` };
    }),
    ...fg.map((f) => ({ kind: "FINISHED_GOOD" as const, itemId: f.finishedGoodId, item: f.finishedGood.name, name: f.finishedGood.name, vintage: null, categoryId: f.finishedGood.categoryId, category: f.finishedGood.category.name, locationId: f.locationId, location: f.location.name, qty: f.quantity, cases: 0, loose: f.quantity, detail: "" })),
  ].sort((a, b) => a.category.localeCompare(b.category) || a.item.localeCompare(b.item));

  return <InventoryClient categories={categories} items={items} locations={locations} onHand={onHand} />;
}
