"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { action, safeAction, ActionError } from "@/lib/actions";
import { writeAudit, summarize, diff } from "@/lib/audit";
import { receiveStock, adjustStock, transferStock, type ItemKind } from "@/lib/stock/movements";
import { MAX_IMPORT_ROWS, type ParsedInventoryRow } from "@/lib/inventory/csv";
import { findWineSku } from "@/lib/bottling/sku";
import { recordFinishedGoodReceiptCore } from "@/lib/inventory/fg-cost-core";
import { findOrCreateVendorCore } from "@/lib/vendors/vendors";

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







// `safeAction`, not `action`: a move can be legitimately blocked (empty/short source, inactive
// location, same-location transfer) and the user needs the SPECIFIC reason. A thrown `ActionError`
// is redacted to Next's opaque "an error occurred" in production; settling it into `{ ok:false, error }`
// ships the real message to the client, which `unwrap`s it back into its existing try/catch.
export const moveStock = safeAction(async ({ actor }, formData: FormData) => {
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

/**
 * Plan 080 U7 — receive PURCHASED finished goods: the units land as stock AND a FinishedGoodReceipt records
 * what they cost, so valuation is a weighted average over receipts (council C4).
 *
 * Ordering is deliberate: stock FIRST, then the cost layer. If the receipt write fails, the goods are on
 * hand with no receipt, so the weighted average reports UNKNOWN — the same D14/COST-2 degradation the rest
 * of the system already models. The inverse order could book cost for stock that never arrived, which is
 * strictly worse. A null unitCost skips the receipt entirely rather than inventing a $0 basis.
 */
export const receivePurchasedFinishedGoodAction = action(
  async (
    { actor },
    input: { kind: ItemKind; itemId: string; qty: number; locationId: string; unitCost?: number | null; vendorName?: string | null; note?: string | null },
  ) => {
    const qty = Math.trunc(Number(input.qty));
    if (!Number.isInteger(qty) || qty <= 0) throw new ActionError("Quantity must be a whole number greater than zero.");
    await receiveStock(input.kind, input.itemId, input.locationId, qty, actor, input.note ?? "Purchased receipt");

    const unitCost = input.unitCost;
    if (unitCost != null && Number.isFinite(unitCost) && unitCost >= 0) {
      const vendorId = input.vendorName?.trim() ? (await findOrCreateVendorCore({ name: input.vendorName.trim() }))?.id ?? null : null;
      await recordFinishedGoodReceiptCore(actor, {
        ...(input.kind === "BOTTLED_WINE" ? { wineSkuId: input.itemId } : { finishedGoodId: input.itemId }),
        qty,
        unitCostBase: unitCost,
        locationId: input.locationId,
        vendorId,
        note: input.note ?? null,
      } as Parameters<typeof recordFinishedGoodReceiptCore>[1]);
    }
    revalidatePath("/inventory");
    return { ok: true as const };
  },
);

/**
 * Plan 080 U7 — the "+ Add inventory" modal's single entry point: define a finished good and, optionally,
 * bring in opening stock with its cost, in one step.
 *
 * Vintage is OPTIONAL (the schema already allows it) — the UI soft-confirms a blank one for WINE only
 * (council S8); a blank vintage on merchandise is normal and must never nag. MSRP is a price and lives on
 * the SKU; COGS does NOT (council C4) — opening stock's cost becomes a FinishedGoodReceipt, so valuation
 * stays a weighted average over receipts.
 *
 * `safeAction`: a duplicate wine+vintage or a taken category name is a block the user must SEE.
 */
export const addFinishedGoodAction = safeAction(
  async (
    { actor },
    input: {
      kind: ItemKind;
      name: string;
      categoryId?: string | null;
      newCategoryName?: string | null;
      vintage?: number | null;
      msrp?: number | null;
      openingQty?: number | null;
      locationId?: string | null;
      unitCost?: number | null;
    },
  ) => {
    const name = clean(input.name, input.kind === "BOTTLED_WINE" ? "Wine name" : "Item name");
    const msrp = input.msrp != null && Number.isFinite(input.msrp) && input.msrp >= 0 ? input.msrp : null;

    // Category: pick an existing one or create it inline (the modal offers both).
    let categoryId = input.categoryId?.trim() || "";
    const newCat = input.newCategoryName?.trim();
    if (!categoryId && newCat) {
      const existing = await prisma.finishedGoodCategory.findFirst({ where: { name: newCat }, select: { id: true } });
      categoryId = existing?.id ?? (await runInTenantTx(async (tx) => {
        const cat = await tx.finishedGoodCategory.create({ data: { name: newCat }, select: { id: true } });
        await writeAudit(tx, { ...actor, action: "CREATE", entityType: "Category", entityId: cat.id, summary: summarize("CREATE", "Category", { label: newCat }) });
        return cat.id;
      }));
    }

    let itemId: string;
    if (input.kind === "BOTTLED_WINE") {
      const vintage = input.vintage != null && Number.isInteger(input.vintage) ? input.vintage : null;
      if (vintage != null && (vintage < 1900 || vintage > 2100)) throw new ActionError("Enter a valid vintage year.");
      // A blank vintage means NON-VINTAGE, and it must be STORED that way. WineSku's uniqueness is two
      // PARTIAL indexes — UNIQUE(name,vintage,bottleSize) WHERE vintage IS NOT NULL, and
      // UNIQUE(name,bottleSize) WHERE isNonVintage. Writing vintage:null WITHOUT isNonVintage matches
      // NEITHER, so the same no-vintage wine could be created unlimited times with nothing to stop it —
      // and the modal already tells the user it is adding "a non-vintage wine", so the data would also
      // contradict what they were shown.
      const isNonVintage = vintage == null;
      if (await findWineSku(prisma as unknown as Parameters<typeof findWineSku>[0], { name, vintage, isNonVintage, bottleSizeMl: 750 })) {
        throw new ActionError(
          isNonVintage ? `A non-vintage "${name}" already exists.` : "That wine + vintage already exists.",
          "CONFLICT",
        );
      }
      itemId = await runInTenantTx(async (tx) => {
        const sku = await tx.wineSku.create({ data: { name, vintage, isNonVintage, categoryId: categoryId || null, msrp }, select: { id: true } });
        await writeAudit(tx, { ...actor, action: "CREATE", entityType: "WineSku", entityId: sku.id, summary: summarize("CREATE", "Wine", { label: `${name}${vintage ? ` ${vintage}` : ""}` }) });
        return sku.id;
      });
    } else {
      if (!categoryId) throw new ActionError("Pick a category.");
      itemId = await runInTenantTx(async (tx) => {
        const good = await tx.finishedGood.create({ data: { name, categoryId, msrp }, select: { id: true } });
        await writeAudit(tx, { ...actor, action: "CREATE", entityType: "FinishedGood", entityId: good.id, summary: summarize("CREATE", "Item", { label: name }) });
        return good.id;
      });
    }

    // Optional opening stock. Reuses the purchased-receipt path so the physical balance and the cost layer
    // are one decision — including its ordering rationale (stock first; a failed receipt values as UNKNOWN).
    const qty = input.openingQty != null ? Math.trunc(Number(input.openingQty)) : 0;
    if (qty > 0 && input.locationId) {
      await receivePurchasedFinishedGoodAction({ kind: input.kind, itemId, qty, locationId: input.locationId, unitCost: input.unitCost ?? null, note: "Opening stock" });
    }

    revalidatePath("/inventory");
    return { itemId };
  },
);
