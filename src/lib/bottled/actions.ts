"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { action, ActionError } from "@/lib/actions";
import { writeAudit, summarize, diff } from "@/lib/audit";
import { receiveStock, adjustStock, transferStock } from "@/lib/stock/movements";

const PATH = "/bottled";

function parseVintage(raw: unknown): number {
  const y = Number(raw);
  if (!Number.isInteger(y) || y < 1900 || y > 2027) throw new ActionError("Enter a valid vintage year.");
  return y;
}

export const createSku = action(async ({ actor }, formData: FormData) => {
  const name = String(formData.get("name") ?? "").trim();
  const vintage = parseVintage(formData.get("vintage"));
  if (name.length < 2) throw new ActionError("Wine name is required.");
  const exists = await prisma.wineSku.findUnique({
    where: { name_vintage_bottleSizeMl: { name, vintage, bottleSizeMl: 750 } },
  });
  if (exists) throw new ActionError("That wine + vintage already exists.", "CONFLICT");
  await prisma.$transaction(async (tx) => {
    const sku = await tx.wineSku.create({ data: { name, vintage, bottleSizeMl: 750 } });
    await writeAudit(tx, {
      ...actor,
      action: "CREATE",
      entityType: "WineSku",
      entityId: sku.id,
      changes: diff(null, { name, vintage }),
      summary: summarize("CREATE", "WineSku", { label: `${name} ${vintage}` }),
    });
  });
  revalidatePath(PATH);
});

export const setSkuActive = action(async ({ actor }, id: string, isActive: boolean) => {
  const sku = await prisma.wineSku.findUnique({ where: { id } });
  if (!sku) throw new ActionError("SKU not found.");
  await prisma.$transaction(async (tx) => {
    await tx.wineSku.update({ where: { id }, data: { isActive } });
    await writeAudit(tx, {
      ...actor,
      action: "UPDATE",
      entityType: "WineSku",
      entityId: id,
      changes: diff({ isActive: sku.isActive }, { isActive }),
      summary: summarize("UPDATE", "WineSku", { label: `${sku.name} ${sku.vintage}`, changes: diff({ isActive: sku.isActive }, { isActive }) }),
    });
  });
  revalidatePath(PATH);
});

function intField(formData: FormData, key: string): number {
  return Number(formData.get(key));
}

export const receiveBottled = action(async ({ actor }, formData: FormData) => {
  await receiveStock("BOTTLED_WINE", String(formData.get("skuId")), String(formData.get("locationId")), intField(formData, "qty"), actor, String(formData.get("reason") ?? "Received"));
  revalidatePath(PATH);
});

export const adjustBottled = action(async ({ actor }, formData: FormData) => {
  await adjustStock("BOTTLED_WINE", String(formData.get("skuId")), String(formData.get("locationId")), intField(formData, "delta"), actor, String(formData.get("reason") ?? ""));
  revalidatePath(PATH);
});

export const transferBottled = action(async ({ actor }, formData: FormData) => {
  await transferStock("BOTTLED_WINE", String(formData.get("skuId")), String(formData.get("fromLocationId")), String(formData.get("toLocationId")), intField(formData, "qty"), actor, String(formData.get("reason") ?? "Transfer"));
  revalidatePath(PATH);
});
