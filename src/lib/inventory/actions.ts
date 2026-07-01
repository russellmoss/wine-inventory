"use server";

import { revalidatePath } from "next/cache";
import { requireTenantId } from "@/lib/tenant/context";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { action, ActionError } from "@/lib/actions";
import { writeAudit, summarize, diff } from "@/lib/audit";
import { receiveStock, adjustStock, transferStock, type ItemKind } from "@/lib/stock/movements";
import { MAX_IMPORT_ROWS, type ParsedInventoryRow } from "@/lib/inventory/csv";
import { findWineSku } from "@/lib/bottling/sku";

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
  if (await prisma.finishedGoodCategory.findFirst({ where: { name } })) throw new ActionError("That category already exists.", "CONFLICT");
  await runInTenantTx(async (tx) => {
    const cat = await tx.finishedGoodCategory.create({ data: { name } });
    await writeAudit(tx, { ...actor, action: "CREATE", entityType: "Category", entityId: cat.id, changes: diff(null, { name }), summary: summarize("CREATE", "Category", { label: name }) });
  });
  revalidatePath(PATH);
});

export const createWineSku = action(async ({ actor }, formData: FormData) => {
  const name = clean(formData.get("name"), "Wine name");
  const vintage = parseVintage(formData.get("vintage"));
  let categoryId = String(formData.get("categoryId") ?? "");
  if (await findWineSku(prisma as unknown as Parameters<typeof findWineSku>[0], { name, vintage, isNonVintage: false, bottleSizeMl: 750 })) {
    throw new ActionError("That wine + vintage already exists.", "CONFLICT");
  }
  await runInTenantTx(async (tx) => {
    if (!categoryId) {
      const wine = await tx.finishedGoodCategory.upsert({ where: { tenantId_name: { tenantId: requireTenantId(), name: "Wine" } }, update: {}, create: { name: "Wine" } });
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
  await runInTenantTx(async (tx) => {
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
      const dup = await findWineSku(prisma as unknown as Parameters<typeof findWineSku>[0], { name, vintage, isNonVintage: false, bottleSizeMl: 750 });
      if (dup && dup.id !== itemId) throw new ActionError("That wine + vintage already exists.", "CONFLICT");
    }
    if (categoryId && !(await prisma.finishedGoodCategory.findUnique({ where: { id: categoryId } }))) throw new ActionError("Pick a valid category.");
    const changes = diff({ name: before.name, vintage: before.vintage, categoryId: before.categoryId }, { name, vintage, categoryId });
    if (Object.keys(changes).length > 0) {
      await runInTenantTx(async (tx) => {
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
      await runInTenantTx(async (tx) => {
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

// ───────────────────────── Bulk CSV import ─────────────────────────

type Actor = { actorUserId: string | null; actorEmail: string };

export type ImportSummary = {
  received: number; // rows successfully received
  newCategories: string[];
  newLocations: string[];
  newSkus: string[]; // "Name Vintage"
  newGoods: string[];
  rowErrors: Array<{ lineNo: number; message: string }>;
};

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/**
 * Find-or-create with two safeguards: the lookup is case-insensitive (so "wine"
 * reuses an existing "Wine" instead of forking a duplicate), and a unique-constraint
 * race on create is recovered by re-running the lookup. `create` returns the new id
 * and records the audit + tracks the name as newly created; on a recovered race it is
 * not re-run, so nothing is double-audited.
 */
async function findOrCreate(
  find: () => Promise<{ id: string } | null>,
  create: () => Promise<string>,
): Promise<string> {
  const existing = await find();
  if (existing) return existing.id;
  try {
    return await create();
  } catch (e) {
    if (isUniqueViolation(e)) {
      const again = await find();
      if (again) return again.id;
    }
    throw e;
  }
}

const ciName = (name: string) => ({ name: { equals: name, mode: "insensitive" as const } });

/** Find-or-create a category by name (case-insensitive); audits creation. */
async function ensureCategory(actor: Actor, name: string, created: Set<string>): Promise<string> {
  return findOrCreate(
    () => prisma.finishedGoodCategory.findFirst({ where: ciName(name), select: { id: true } }),
    () =>
      runInTenantTx(async (tx) => {
        const cat = await tx.finishedGoodCategory.create({ data: { name } });
        await writeAudit(tx, { ...actor, action: "CREATE", entityType: "Category", entityId: cat.id, changes: diff(null, { name }), summary: summarize("CREATE", "Category", { label: name }) });
        created.add(name);
        return cat.id;
      }),
  );
}

/** Find-or-create an active location by name (case-insensitive); audits creation. */
async function ensureLocation(actor: Actor, name: string, created: Set<string>): Promise<string> {
  return findOrCreate(
    () => prisma.location.findFirst({ where: ciName(name), select: { id: true } }),
    () =>
      runInTenantTx(async (tx) => {
        const loc = await tx.location.create({ data: { name } });
        await writeAudit(tx, { ...actor, action: "CREATE", entityType: "Location", entityId: loc.id, changes: diff(null, { name }), summary: summarize("CREATE", "Location", { label: name }) });
        created.add(name);
        return loc.id;
      }),
  );
}

/** Find-or-create a wine SKU (name+vintage+750ml) under the given category; audits creation. */
async function ensureWineSku(actor: Actor, name: string, vintage: number, categoryId: string, created: Set<string>): Promise<string> {
  return findOrCreate(
    () => findWineSku(prisma as unknown as Parameters<typeof findWineSku>[0], { name, vintage, isNonVintage: false, bottleSizeMl: 750 }),
    () =>
      runInTenantTx(async (tx) => {
        const sku = await tx.wineSku.create({ data: { name, vintage, bottleSizeMl: 750, categoryId } });
        await writeAudit(tx, { ...actor, action: "CREATE", entityType: "WineSku", entityId: sku.id, changes: diff(null, { name, vintage }), summary: summarize("CREATE", "Wine SKU", { label: `${name} ${vintage}` }) });
        created.add(`${name} ${vintage}`);
        return sku.id;
      }),
  );
}

/** Find-or-create a finished good (name within category, case-insensitive); audits creation. */
async function ensureGood(actor: Actor, name: string, categoryId: string, created: Set<string>): Promise<string> {
  return findOrCreate(
    () => prisma.finishedGood.findFirst({ where: { ...ciName(name), categoryId }, select: { id: true } }),
    () =>
      runInTenantTx(async (tx) => {
        const good = await tx.finishedGood.create({ data: { name, categoryId } });
        await writeAudit(tx, { ...actor, action: "CREATE", entityType: "FinishedGood", entityId: good.id, changes: diff(null, { name }), summary: summarize("CREATE", "Item", { label: name }) });
        created.add(name);
        return good.id;
      }),
  );
}

/**
 * Bulk import inventory rows parsed from a CSV. Each row is RECEIVED (additive) into
 * the stock ledger after find-or-creating its category, location, and item. Rows are
 * processed independently: a failing row is recorded and skipped, the rest still land.
 */
export const importInventory = action(async ({ actor }, rows: ParsedInventoryRow[]): Promise<ImportSummary> => {
  if (!Array.isArray(rows) || rows.length === 0) throw new ActionError("No rows to import.");
  if (rows.length > MAX_IMPORT_ROWS) throw new ActionError(`Too many rows. Limit is ${MAX_IMPORT_ROWS} per upload.`);

  const newCategories = new Set<string>();
  const newLocations = new Set<string>();
  const newSkus = new Set<string>();
  const newGoods = new Set<string>();
  const rowErrors: ImportSummary["rowErrors"] = [];
  let received = 0;

  for (const row of rows) {
    try {
      // Re-validate server-side — never trust the client payload.
      const name = clean(row.name, row.kind === "BOTTLED_WINE" ? "Wine name" : "Item name");
      const categoryName = clean(row.category, "Category");
      const locationName = clean(row.location, "Location");
      const qty = parseInt10(row.qty, "Quantity");
      if (qty <= 0) throw new ActionError("Quantity must be greater than 0.");

      const categoryId = await ensureCategory(actor, categoryName, newCategories);
      const locationId = await ensureLocation(actor, locationName, newLocations);

      let kind: ItemKind;
      let itemId: string;
      if (row.kind === "BOTTLED_WINE") {
        const vintage = parseVintage(row.vintage);
        itemId = await ensureWineSku(actor, name, vintage, categoryId, newSkus);
        kind = "BOTTLED_WINE";
      } else {
        itemId = await ensureGood(actor, name, categoryId, newGoods);
        kind = "FINISHED_GOOD";
      }

      await receiveStock(kind, itemId, locationId, qty, actor, "CSV import");
      received++;
    } catch (e) {
      rowErrors.push({ lineNo: row?.lineNo ?? 0, message: e instanceof Error ? e.message : "Could not import this row." });
    }
  }

  revalidatePath(PATH);
  return {
    received,
    newCategories: [...newCategories],
    newLocations: [...newLocations],
    newSkus: [...newSkus],
    newGoods: [...newGoods],
    rowErrors,
  };
});

async function currentBalance(kind: ItemKind, itemId: string, locationId: string): Promise<number> {
  if (kind === "BOTTLED_WINE") {
    const b = await prisma.bottledInventory.findFirst({ where: { wineSkuId: itemId, locationId } });
    return b?.totalBottles ?? 0;
  }
  const b = await prisma.finishedGoodInventory.findFirst({ where: { finishedGoodId: itemId, locationId } });
  return b?.quantity ?? 0;
}
