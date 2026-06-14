"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { action, ActionError } from "@/lib/actions";
import { writeAudit, summarize, diff } from "@/lib/audit";
import { receiveStock, adjustStock, transferStock, type ItemKind } from "@/lib/stock/movements";

const PATH = "/inventory";

function clean(raw: unknown, label: string, min = 2, max = 80): string {
  const s = String(raw ?? "").trim();
  if (s.length < min) throw new ActionError(`${label} must be at least ${min} characters.`);
  if (s.length > max) throw new ActionError(`${label} is too long.`);
  return s;
}
function parseVintage(raw: unknown): number {
  const y = Number(raw);
  if (!Number.isInteger(y) || y < 1900 || y > 2027) throw new ActionError("Enter a valid vintage year.");
  return y;
}
function parseInt10(raw: unknown, label: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new ActionError(`${label} must be a whole number.`);
  return n;
}
function parseKind(raw: unknown): ItemKind {
  const k = String(raw ?? "");
  if (k !== "BOTTLED_WINE" && k !== "FINISHED_GOOD") throw new ActionError("Bad item kind.");
  return k;
}

export const createCategory = action(async ({ actor }, formData: FormData) => {
  const name = clean(formData.get("name"), "Category name");
  if (await prisma.finishedGoodCategory.findUnique({ where: { name } })) throw new ActionError("That category already exists.", "CONFLICT");
  await prisma.$transaction(async (tx) => {
    const cat = await tx.finishedGoodCategory.create({ data: { name } });
    await writeAudit(tx, { ...actor, action: "CREATE", entityType: "Category", entityId: cat.id, changes: diff(null, { name }), summary: summarize("CREATE", "Category", { label: name }) });
  });
  revalidatePath(PATH);
});

export const createWineSku = action(async ({ actor }, formData: FormData) => {
  const name = clean(formData.get("name"), "Wine name");
  const vintage = parseVintage(formData.get("vintage"));
  let categoryId = String(formData.get("categoryId") ?? "");
  if (await prisma.wineSku.findUnique({ where: { name_vintage_bottleSizeMl: { name, vintage, bottleSizeMl: 750 } } })) {
    throw new ActionError("That wine + vintage already exists.", "CONFLICT");
  }
  await prisma.$transaction(async (tx) => {
    if (!categoryId) {
      const wine = await tx.finishedGoodCategory.upsert({ where: { name: "Wine" }, update: {}, create: { name: "Wine" } });
      categoryId = wine.id;
    }
    const sku = await tx.wineSku.create({ data: { name, vintage, bottleSizeMl: 750, categoryId } });
    await writeAudit(tx, { ...actor, action: "CREATE", entityType: "WineSku", entityId: sku.id, changes: diff(null, { name, vintage }), summary: summarize("CREATE", "Wine SKU", { label: `${name} ${vintage}` }) });
  });
  revalidatePath(PATH);
});

export const createGood = action(async ({ actor }, formData: FormData) => {
  const name = clean(formData.get("name"), "Item name");
  const categoryId = String(formData.get("categoryId") ?? "");
  if (!(await prisma.finishedGoodCategory.findUnique({ where: { id: categoryId } }))) throw new ActionError("Pick a category.");
  await prisma.$transaction(async (tx) => {
    const good = await tx.finishedGood.create({ data: { name, categoryId } });
    await writeAudit(tx, { ...actor, action: "CREATE", entityType: "FinishedGood", entityId: good.id, changes: diff(null, { name }), summary: summarize("CREATE", "Item", { label: name }) });
  });
  revalidatePath(PATH);
});

export const moveStock = action(async ({ actor }, formData: FormData) => {
  const kind = parseKind(formData.get("kind"));
  const itemId = String(formData.get("itemId") ?? "");
  const mode = String(formData.get("mode") ?? "");
  if (!itemId) throw new ActionError("Choose an item.");
  if (mode === "RECEIVE") {
    await receiveStock(kind, itemId, String(formData.get("locationId")), parseInt10(formData.get("qty"), "Quantity"), actor, String(formData.get("reason") ?? "Received"));
  } else if (mode === "ADJUST") {
    await adjustStock(kind, itemId, String(formData.get("locationId")), parseInt10(formData.get("delta"), "Adjustment"), actor, String(formData.get("reason") ?? ""));
  } else if (mode === "TRANSFER") {
    await transferStock(kind, itemId, String(formData.get("fromLocationId")), String(formData.get("toLocationId")), parseInt10(formData.get("qty"), "Quantity"), actor, String(formData.get("reason") ?? "Transfer"));
  } else throw new ActionError("Unknown movement type.");
  revalidatePath(PATH);
});

/** Edit an on-hand entry: set it to an exact quantity (logged as an adjustment). */
export const setOnHand = action(async ({ actor }, kind: ItemKind, itemId: string, locationId: string, target: number) => {
  if (!Number.isInteger(target) || target < 0) throw new ActionError("Quantity must be 0 or a positive whole number.");
  const current = await currentBalance(kind, itemId, locationId);
  const delta = target - current;
  if (delta === 0) return;
  await adjustStock(kind, itemId, locationId, delta, actor, `Set on-hand to ${target}`);
  revalidatePath(PATH);
});

/** Delete an on-hand entry: zero it out (logged) and remove the balance row. */
export const deleteOnHand = action(async ({ actor }, kind: ItemKind, itemId: string, locationId: string) => {
  const current = await currentBalance(kind, itemId, locationId);
  if (current > 0) await adjustStock(kind, itemId, locationId, -current, actor, "Deleted on-hand entry");
  if (kind === "BOTTLED_WINE") await prisma.bottledInventory.deleteMany({ where: { wineSkuId: itemId, locationId } });
  else await prisma.finishedGoodInventory.deleteMany({ where: { finishedGoodId: itemId, locationId } });
  revalidatePath(PATH);
});

async function currentBalance(kind: ItemKind, itemId: string, locationId: string): Promise<number> {
  if (kind === "BOTTLED_WINE") {
    const b = await prisma.bottledInventory.findUnique({ where: { wineSkuId_locationId: { wineSkuId: itemId, locationId } } });
    return b?.totalBottles ?? 0;
  }
  const b = await prisma.finishedGoodInventory.findUnique({ where: { finishedGoodId_locationId: { finishedGoodId: itemId, locationId } } });
  return b?.quantity ?? 0;
}
