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

type UpdateOnHandInput = {
  kind: ItemKind;
  itemId: string;
  fromLocationId: string;
  name: string;
  vintage?: number; // wine only
  categoryId: string; // "" allowed for wine (nullable); required for goods
  toLocationId: string;
  qty: number;
};

/**
 * Edit everything about an on-hand entry from the inventory table:
 * the item's name / vintage / category (global to the item), plus this
 * entry's location and quantity. Renames/category changes are logged as an
 * UPDATE; location/quantity changes flow through the stock ledger.
 */
export const updateOnHand = action(async ({ actor }, input: UpdateOnHandInput) => {
  const { kind, itemId, fromLocationId } = input;
  const name = clean(input.name, kind === "BOTTLED_WINE" ? "Wine name" : "Item name");
  const toLocationId = String(input.toLocationId ?? "");
  if (!toLocationId) throw new ActionError("Pick a location.");
  if (!Number.isInteger(input.qty) || input.qty < 0) throw new ActionError("Quantity must be 0 or a positive whole number.");

  const toLoc = await prisma.location.findUnique({ where: { id: toLocationId }, select: { isActive: true } });
  if (!toLoc || !toLoc.isActive) throw new ActionError("That location is not available.");

  // 1) Update the item registry (name / vintage / category) — global across all locations.
  if (kind === "BOTTLED_WINE") {
    const vintage = parseVintage(input.vintage);
    const categoryId = input.categoryId ? input.categoryId : null;
    const before = await prisma.wineSku.findUnique({ where: { id: itemId }, select: { name: true, vintage: true, categoryId: true } });
    if (!before) throw new ActionError("Wine not found.");
    if (before.name !== name || before.vintage !== vintage) {
      const dup = await prisma.wineSku.findUnique({ where: { name_vintage_bottleSizeMl: { name, vintage, bottleSizeMl: 750 } }, select: { id: true } });
      if (dup && dup.id !== itemId) throw new ActionError("That wine + vintage already exists.", "CONFLICT");
    }
    if (categoryId && !(await prisma.finishedGoodCategory.findUnique({ where: { id: categoryId } }))) throw new ActionError("Pick a valid category.");
    const changes = diff({ name: before.name, vintage: before.vintage, categoryId: before.categoryId }, { name, vintage, categoryId });
    if (Object.keys(changes).length > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.wineSku.update({ where: { id: itemId }, data: { name, vintage, categoryId } });
        await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "WineSku", entityId: itemId, changes, summary: summarize("UPDATE", "Wine SKU", { label: `${name} ${vintage}`, changes }) });
      });
    }
  } else {
    const categoryId = String(input.categoryId ?? "");
    if (!categoryId || !(await prisma.finishedGoodCategory.findUnique({ where: { id: categoryId } }))) throw new ActionError("Pick a category.");
    const before = await prisma.finishedGood.findUnique({ where: { id: itemId }, select: { name: true, categoryId: true } });
    if (!before) throw new ActionError("Item not found.");
    const changes = diff({ name: before.name, categoryId: before.categoryId }, { name, categoryId });
    if (Object.keys(changes).length > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.finishedGood.update({ where: { id: itemId }, data: { name, categoryId } });
        await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "FinishedGood", entityId: itemId, changes, summary: summarize("UPDATE", "Item", { label: name, changes }) });
      });
    }
  }

  // 2) Move and/or re-quantify this entry through the stock ledger.
  const current = await currentBalance(kind, itemId, fromLocationId);
  if (toLocationId === fromLocationId) {
    const delta = input.qty - current;
    if (delta !== 0) await adjustStock(kind, itemId, fromLocationId, delta, actor, `Set on-hand to ${input.qty}`);
  } else {
    // Relocate this entry: empty the old location, then place the new quantity at
    // the new one (merging with any balance already there).
    if (current > 0) await adjustStock(kind, itemId, fromLocationId, -current, actor, "Moved on-hand to another location");
    if (input.qty > 0) await adjustStock(kind, itemId, toLocationId, input.qty, actor, "Moved on-hand from another location");
    if (kind === "BOTTLED_WINE") await prisma.bottledInventory.deleteMany({ where: { wineSkuId: itemId, locationId: fromLocationId } });
    else await prisma.finishedGoodInventory.deleteMany({ where: { finishedGoodId: itemId, locationId: fromLocationId } });
  }

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
