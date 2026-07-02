import { Prisma } from "@prisma/client";
import { requireTenantId } from "@/lib/tenant/context";
import { withWriteRetry as retryWrite } from "@/lib/db/write-retry";
import { prisma } from "../prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { writeAudit } from "../audit";
import { ActionError } from "../action-error";

export type ItemKind = "BOTTLED_WINE" | "FINISHED_GOOD";
export type Ctx = { actorUserId: string | null; actorEmail: string };

const INT32_MAX = 2147483647;
const UNIT = (k: ItemKind) => (k === "BOTTLED_WINE" ? "bottles" : "units");

// The shared serialization-retry wrapper (D18/H2), labelled for this domain's logs.
const withWriteRetry = <T>(fn: () => Promise<T>) => retryWrite(fn, 5, "stock");

function assertCount(n: number, label: string): void {
  if (!Number.isInteger(n) || n <= 0 || n > INT32_MAX) throw new ActionError(`${label} must be a whole number between 1 and ${INT32_MAX}.`);
}
function assertDelta(n: number): void {
  if (!Number.isInteger(n) || n === 0 || Math.abs(n) > INT32_MAX) throw new ActionError("Adjustment must be a non-zero whole number within range.");
}

async function itemLabel(kind: ItemKind, itemId: string): Promise<string> {
  if (kind === "BOTTLED_WINE") {
    const s = await prisma.wineSku.findUnique({ where: { id: itemId }, select: { name: true, vintage: true } });
    return s ? `${s.name} ${s.vintage}` : "wine";
  }
  const g = await prisma.finishedGood.findUnique({ where: { id: itemId }, select: { name: true } });
  return g?.name ?? "item";
}

function movementCreate(
  tx: Prisma.TransactionClient,
  kind: ItemKind,
  itemId: string,
  locationId: string,
  movementKind: "RECEIVE" | "ADJUST" | "TRANSFER",
  deltaUnits: number,
  ctx: Ctx,
  reason?: string,
  transferGroupId?: string,
) {
  return tx.stockMovement.create({
    data: {
      itemKind: kind,
      wineSkuId: kind === "BOTTLED_WINE" ? itemId : null,
      finishedGoodId: kind === "FINISHED_GOOD" ? itemId : null,
      locationId,
      kind: movementKind,
      deltaUnits,
      reason: reason ?? null,
      transferGroupId: transferGroupId ?? null,
      createdById: ctx.actorUserId,
      createdByEmail: ctx.actorEmail,
    },
  });
}

function increment(tx: Prisma.TransactionClient, kind: ItemKind, itemId: string, locationId: string, amount: number) {
  if (kind === "BOTTLED_WINE") {
    return tx.bottledInventory.upsert({
      where: { tenantId_wineSkuId_locationId: { tenantId: requireTenantId(), wineSkuId: itemId, locationId } },
      update: { totalBottles: { increment: amount } },
      create: { wineSkuId: itemId, locationId, totalBottles: amount },
    });
  }
  return tx.finishedGoodInventory.upsert({
    where: { tenantId_finishedGoodId_locationId: { tenantId: requireTenantId(), finishedGoodId: itemId, locationId } },
    update: { quantity: { increment: amount } },
    create: { finishedGoodId: itemId, locationId, quantity: amount },
  });
}

/** Atomic, race-safe decrement: only succeeds if the balance is >= amount. */
async function decrement(tx: Prisma.TransactionClient, kind: ItemKind, itemId: string, locationId: string, amount: number): Promise<boolean> {
  if (kind === "BOTTLED_WINE") {
    const r = await tx.bottledInventory.updateMany({
      where: { wineSkuId: itemId, locationId, totalBottles: { gte: amount } },
      data: { totalBottles: { decrement: amount } },
    });
    return r.count > 0;
  }
  const r = await tx.finishedGoodInventory.updateMany({
    where: { finishedGoodId: itemId, locationId, quantity: { gte: amount } },
    data: { quantity: { decrement: amount } },
  });
  return r.count > 0;
}

async function locationActive(tx: Prisma.TransactionClient, id: string): Promise<{ name: string; isActive: boolean } | null> {
  return tx.location.findUnique({ where: { id }, select: { name: true, isActive: true } });
}

export async function receiveStock(kind: ItemKind, itemId: string, locationId: string, qty: number, ctx: Ctx, reason?: string) {
  assertCount(qty, "Quantity");
  const label = await itemLabel(kind, itemId);
  await withWriteRetry(() =>
    runInTenantTx(async (tx) => {
      const loc = await locationActive(tx, locationId);
      if (!loc || !loc.isActive) throw new ActionError("That location is not available.");
      await movementCreate(tx, kind, itemId, locationId, "RECEIVE", qty, ctx, reason);
      await increment(tx, kind, itemId, locationId, qty);
      await writeAudit(tx, {
        ...ctx,
        action: "STOCK_MOVEMENT",
        entityType: kind === "BOTTLED_WINE" ? "BottledInventory" : "FinishedGoodInventory",
        entityId: itemId,
        summary: `Received ${qty} ${UNIT(kind)} of ${label} at ${loc.name}`,
      });
    }),
  );
}

export async function adjustStock(kind: ItemKind, itemId: string, locationId: string, delta: number, ctx: Ctx, reason: string) {
  assertDelta(delta);
  if (!reason.trim()) throw new ActionError("Give a reason for the adjustment.");
  const label = await itemLabel(kind, itemId);
  await withWriteRetry(() =>
    runInTenantTx(async (tx) => {
      if (delta > 0) {
        await increment(tx, kind, itemId, locationId, delta);
      } else {
        const ok = await decrement(tx, kind, itemId, locationId, -delta);
        if (!ok) throw new ActionError("Not enough stock at that location for this adjustment.", "CONFLICT");
      }
      await movementCreate(tx, kind, itemId, locationId, "ADJUST", delta, ctx, reason);
      await writeAudit(tx, {
        ...ctx,
        action: "STOCK_MOVEMENT",
        entityType: kind === "BOTTLED_WINE" ? "BottledInventory" : "FinishedGoodInventory",
        entityId: itemId,
        summary: `Adjusted ${label} by ${delta > 0 ? "+" : ""}${delta} ${UNIT(kind)} (${reason.trim()})`,
      });
    }),
  );
}

export async function transferStock(kind: ItemKind, itemId: string, fromLocationId: string, toLocationId: string, qty: number, ctx: Ctx, reason?: string) {
  assertCount(qty, "Quantity");
  if (fromLocationId === toLocationId) throw new ActionError("Choose two different locations.");
  const label = await itemLabel(kind, itemId);
  const group = crypto.randomUUID();

  await withWriteRetry(() =>
    runInTenantTx(async (tx) => {
      // Validate locations inside the tx (avoids racing a concurrent deactivation).
      const [from, to] = await Promise.all([locationActive(tx, fromLocationId), locationActive(tx, toLocationId)]);
      if (!from) throw new ActionError("Source location not found.");
      if (!to || !to.isActive) throw new ActionError("Destination location is not available.");

      // Touch rows in canonical (sorted) order to avoid A->B / B->A deadlocks.
      const decFirst = fromLocationId < toLocationId;
      if (decFirst) {
        const ok = await decrement(tx, kind, itemId, fromLocationId, qty);
        if (!ok) throw new ActionError(`Not enough stock at ${from.name} to transfer.`, "CONFLICT");
        await increment(tx, kind, itemId, toLocationId, qty);
      } else {
        await increment(tx, kind, itemId, toLocationId, qty);
        const ok = await decrement(tx, kind, itemId, fromLocationId, qty);
        if (!ok) throw new ActionError(`Not enough stock at ${from.name} to transfer.`, "CONFLICT");
      }

      await movementCreate(tx, kind, itemId, fromLocationId, "TRANSFER", -qty, ctx, reason, group);
      await movementCreate(tx, kind, itemId, toLocationId, "TRANSFER", qty, ctx, reason, group);
      await writeAudit(tx, {
        ...ctx,
        action: "STOCK_MOVEMENT",
        entityType: kind === "BOTTLED_WINE" ? "BottledInventory" : "FinishedGoodInventory",
        entityId: itemId,
        changes: { transfer: { from: from.name, to: to.name } } as unknown as Record<string, { from: unknown; to: unknown }>,
        summary: `Transferred ${qty} ${UNIT(kind)} of ${label} from ${from.name} to ${to.name} [grp ${group.slice(0, 8)}]`,
      });
    }),
  );
}
