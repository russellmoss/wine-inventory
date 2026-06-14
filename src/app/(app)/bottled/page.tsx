import { prisma } from "@/lib/prisma";
import { casesAndLoose } from "@/lib/bottling/draw";
import { BottledClient, type SkuOpt, type LocOpt, type BalanceRow } from "./BottledClient";

export default async function BottledPage() {
  const [skus, locations, balances] = await Promise.all([
    prisma.wineSku.findMany({ where: { isActive: true }, orderBy: [{ name: "asc" }, { vintage: "desc" }], select: { id: true, name: true, vintage: true, isActive: true } }),
    prisma.location.findMany({ where: { isActive: true }, orderBy: [{ isSystem: "desc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.bottledInventory.findMany({
      where: { totalBottles: { gt: 0 } },
      include: { wineSku: { select: { name: true, vintage: true } }, location: { select: { name: true } } },
      orderBy: [{ wineSku: { name: "asc" } }],
    }),
  ]);

  const balanceRows: BalanceRow[] = balances.map((b) => {
    const { cases, loose } = casesAndLoose(b.totalBottles);
    return {
      sku: `${b.wineSku.name} ${b.wineSku.vintage}`,
      location: b.location.name,
      totalBottles: b.totalBottles,
      cases,
      loose,
    };
  });

  return <BottledClient skus={skus} locations={locations} balances={balanceRows} />;
}
