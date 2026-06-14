"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { action, ActionError } from "@/lib/actions";
import { writeAudit, summarize, diff } from "@/lib/audit";
import { receiveStock, adjustStock, transferStock } from "@/lib/stock/movements";

const PATH = "/finished-goods";

function cleanName(raw: unknown, label: string): string {
  const name = String(raw ?? "").trim();
  if (name.length < 2) throw new ActionError(`${label} must be at least 2 characters.`);
  if (name.length > 80) throw new ActionError(`${label} is too long.`);
  return name;
}

export const createCategory = action(async ({ actor }, formData: FormData) => {
  const name = cleanName(formData.get("name"), "Category name");
  if (await prisma.finishedGoodCategory.findUnique({ where: { name } })) {
    throw new ActionError("That category already exists.", "CONFLICT");
  }
  await prisma.$transaction(async (tx) => {
    const cat = await tx.finishedGoodCategory.create({ data: { name } });
    await writeAudit(tx, { ...actor, action: "CREATE", entityType: "FinishedGoodCategory", entityId: cat.id, changes: diff(null, { name }), summary: summarize("CREATE", "Category", { label: name }) });
  });
  revalidatePath(PATH);
});

export const setCategoryActive = action(async ({ actor }, id: string, isActive: boolean) => {
  const cat = await prisma.finishedGoodCategory.findUnique({ where: { id } });
  if (!cat) throw new ActionError("Category not found.");
  if (!isActive) {
    const goods = await prisma.finishedGood.count({ where: { categoryId: id, isActive: true } });
    if (goods > 0) throw new ActionError("Cannot deactivate a category that still has active goods.", "CONFLICT");
  }
  await prisma.$transaction(async (tx) => {
    await tx.finishedGoodCategory.update({ where: { id }, data: { isActive } });
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "FinishedGoodCategory", entityId: id, changes: diff({ isActive: cat.isActive }, { isActive }), summary: summarize("UPDATE", "Category", { label: cat.name, changes: diff({ isActive: cat.isActive }, { isActive }) }) });
  });
  revalidatePath(PATH);
});

export const createGood = action(async ({ actor }, formData: FormData) => {
  const name = cleanName(formData.get("name"), "Item name");
  const categoryId = String(formData.get("categoryId") ?? "");
  const cat = await prisma.finishedGoodCategory.findUnique({ where: { id: categoryId } });
  if (!cat) throw new ActionError("Pick a category.");
  await prisma.$transaction(async (tx) => {
    const good = await tx.finishedGood.create({ data: { name, categoryId } });
    await writeAudit(tx, { ...actor, action: "CREATE", entityType: "FinishedGood", entityId: good.id, changes: diff(null, { name, categoryId }), summary: summarize("CREATE", "Finished good", { label: name }) });
  });
  revalidatePath(PATH);
});

export const setGoodActive = action(async ({ actor }, id: string, isActive: boolean) => {
  const good = await prisma.finishedGood.findUnique({ where: { id } });
  if (!good) throw new ActionError("Item not found.");
  await prisma.$transaction(async (tx) => {
    await tx.finishedGood.update({ where: { id }, data: { isActive } });
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "FinishedGood", entityId: id, changes: diff({ isActive: good.isActive }, { isActive }), summary: summarize("UPDATE", "Finished good", { label: good.name, changes: diff({ isActive: good.isActive }, { isActive }) }) });
  });
  revalidatePath(PATH);
});

function intField(formData: FormData, key: string): number {
  return Number(formData.get(key));
}

export const receiveGood = action(async ({ actor }, formData: FormData) => {
  await receiveStock("FINISHED_GOOD", String(formData.get("goodId")), String(formData.get("locationId")), intField(formData, "qty"), actor, String(formData.get("reason") ?? "Received"));
  revalidatePath(PATH);
});

export const adjustGood = action(async ({ actor }, formData: FormData) => {
  await adjustStock("FINISHED_GOOD", String(formData.get("goodId")), String(formData.get("locationId")), intField(formData, "delta"), actor, String(formData.get("reason") ?? ""));
  revalidatePath(PATH);
});

export const transferGood = action(async ({ actor }, formData: FormData) => {
  await transferStock("FINISHED_GOOD", String(formData.get("goodId")), String(formData.get("fromLocationId")), String(formData.get("toLocationId")), intField(formData, "qty"), actor, String(formData.get("reason") ?? "Transfer"));
  revalidatePath(PATH);
});
