import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { writeAudit } from "../audit";
import { ActionError } from "../action-error";
import { computeProportionalDraw, consumedForBottles, casesAndLoose } from "./draw";

export type BottlingInput = {
  vesselIds: string[];
  destinationLocationId: string;
  skuName: string;
  skuVintage: number;
  bottlesProduced: number;
  date: Date;
};

export type Actor = { actorUserId: string | null; actorEmail: string };

const SERIAL = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 } as const;

async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const code = e instanceof Prisma.PrismaClientKnownRequestError ? e.code : undefined;
      if (code === "P2034" && i < attempts) continue;
      throw e;
    }
  }
}

/** Apply a bottling run within an existing transaction. Returns the new run id. */
async function applyBottling(tx: Prisma.TransactionClient, input: BottlingInput, actor: Actor): Promise<string> {
  const { vesselIds, destinationLocationId, skuName, skuVintage, bottlesProduced, date } = input;
  if (bottlesProduced < 1) throw new ActionError("Bottles produced must be at least 1.");
  if (!skuName) throw new ActionError("Give the bottled wine a name.");
  const ids = [...new Set(vesselIds)].filter(Boolean);
  if (ids.length === 0) throw new ActionError("Pick at least one vessel.");

  const location = await tx.location.findUnique({ where: { id: destinationLocationId } });
  if (!location || !location.isActive) throw new ActionError("Pick an active destination location.");

  const consumedL = consumedForBottles(bottlesProduced);
  const vessels = await tx.vessel.findMany({ where: { id: { in: ids } }, include: { components: true } });
  if (vessels.length !== ids.length) throw new ActionError("A selected vessel was not found.");
  const allComponents = vessels.flatMap((v) => v.components);
  const total = Math.round(allComponents.reduce((a, c) => a + Number(c.volumeL), 0) * 100) / 100;
  if (total <= 0) throw new ActionError("The selected vessels are empty.");
  if (consumedL > total + 1e-9) {
    throw new ActionError(`Not enough wine: ${bottlesProduced} bottles need ${consumedL} L but only ${total} L available across the selected vessels.`, "CONFLICT");
  }

  const draws = computeProportionalDraw(allComponents.map((c) => ({ id: c.id, volumeL: Number(c.volumeL) })), consumedL);
  const drawById = new Map(draws.map((d) => [d.id, d]));

  // Default wine to a "Wine" category (upsert avoids a P2002 race on first bottling).
  const wineCat = await tx.finishedGoodCategory.upsert({ where: { name: "Wine" }, update: {}, create: { name: "Wine" } });

  const sku = await tx.wineSku.upsert({
    where: { name_vintage_bottleSizeMl: { name: skuName, vintage: skuVintage, bottleSizeMl: 750 } },
    update: {},
    create: { name: skuName, vintage: skuVintage, bottleSizeMl: 750, categoryId: wineCat.id },
  });

  const run = await tx.bottlingRun.create({
    data: { date, wineSkuId: sku.id, bottlesProduced, volumeConsumedL: consumedL, destinationLocationId, createdById: actor.actorUserId, createdByEmail: actor.actorEmail },
  });

  for (const c of allComponents) {
    const d = drawById.get(c.id)!;
    if (d.deduct <= 0) continue;
    await tx.bottlingSource.create({ data: { bottlingRunId: run.id, vesselId: c.vesselId, varietyId: c.varietyId, vineyardId: c.vineyardId, vintage: c.vintage, volumeConsumedL: d.deduct } });
    if (d.remaining <= 0) await tx.vesselComponent.delete({ where: { id: c.id } });
    else await tx.vesselComponent.update({ where: { id: c.id }, data: { volumeL: d.remaining } });
  }

  await tx.stockMovement.create({
    data: { itemKind: "BOTTLED_WINE", wineSkuId: sku.id, locationId: destinationLocationId, kind: "RECEIVE", deltaUnits: bottlesProduced, bottlingRunId: run.id, createdById: actor.actorUserId, createdByEmail: actor.actorEmail, reason: "Bottling run" },
  });
  await tx.bottledInventory.upsert({
    where: { wineSkuId_locationId: { wineSkuId: sku.id, locationId: destinationLocationId } },
    update: { totalBottles: { increment: bottlesProduced } },
    create: { wineSkuId: sku.id, locationId: destinationLocationId, totalBottles: bottlesProduced },
  });

  const { cases, loose } = casesAndLoose(bottlesProduced);
  const codes = vessels.map((v) => v.code).join(", ");
  await writeAudit(tx, { ...actor, action: "BOTTLING", entityType: "BottlingRun", entityId: run.id, summary: `Bottled ${bottlesProduced} bottles (${cases}c + ${loose}) of "${skuName} ${skuVintage}" from ${codes} into ${location.name}` });
  return run.id;
}

/** Reverse a bottling run within a transaction: restore bulk, remove the bottles, delete the run. */
async function reverseBottlingTx(tx: Prisma.TransactionClient, runId: string, actor: Actor): Promise<void> {
  const run = await tx.bottlingRun.findUnique({
    where: { id: runId },
    include: { sources: true, wineSku: { select: { name: true, vintage: true } }, destinationLocation: { select: { name: true } } },
  });
  if (!run) throw new ActionError("Bottling run not found.");

  // Remove the bottles it produced from the destination (must still be on hand).
  const dec = await tx.bottledInventory.updateMany({
    where: { wineSkuId: run.wineSkuId, locationId: run.destinationLocationId, totalBottles: { gte: run.bottlesProduced } },
    data: { totalBottles: { decrement: run.bottlesProduced } },
  });
  if (dec.count === 0) {
    throw new ActionError("Can't delete: those bottles are no longer on hand at the destination (moved or sold). Adjust stock first.", "CONFLICT");
  }

  // Capacity guard: a vessel refilled since bottling must not overflow on restore.
  const restoreByVessel = new Map<string, number>();
  for (const s of run.sources) restoreByVessel.set(s.vesselId, (restoreByVessel.get(s.vesselId) ?? 0) + Number(s.volumeConsumedL));
  for (const [vesselId, restoreL] of restoreByVessel) {
    const vessel = await tx.vessel.findUnique({ where: { id: vesselId }, include: { components: { select: { volumeL: true } } } });
    if (!vessel) throw new ActionError("Can't restore wine: the source vessel no longer exists.", "CONFLICT");
    const current = vessel.components.reduce((a, c) => a + Number(c.volumeL), 0);
    if (current + restoreL > Number(vessel.capacityL) + 1e-9) {
      throw new ActionError(`Can't restore ${restoreL} L into ${vessel.code}: it would exceed the ${Number(vessel.capacityL)} L capacity (now holds ${Math.round(current * 100) / 100} L). Empty it first.`, "CONFLICT");
    }
  }

  // Restore consumed wine back into its vessel components.
  for (const s of run.sources) {
    await tx.vesselComponent.upsert({
      where: { vesselId_varietyId_vineyardId_vintage: { vesselId: s.vesselId, varietyId: s.varietyId, vineyardId: s.vineyardId, vintage: s.vintage } },
      update: { volumeL: { increment: s.volumeConsumedL } },
      create: { vesselId: s.vesselId, varietyId: s.varietyId, vineyardId: s.vineyardId, vintage: s.vintage, volumeL: s.volumeConsumedL },
    });
  }

  await tx.stockMovement.deleteMany({ where: { bottlingRunId: runId } });
  await tx.bottlingRun.delete({ where: { id: runId } }); // cascades sources

  await writeAudit(tx, {
    ...actor,
    action: "DELETE",
    entityType: "BottlingRun",
    entityId: runId,
    summary: `Reversed bottling of ${run.bottlesProduced} bottles of "${run.wineSku.name} ${run.wineSku.vintage}" (wine restored, bottles removed from ${run.destinationLocation.name})`,
  });
}

export async function executeBottling(input: BottlingInput, actor: Actor): Promise<void> {
  await withRetry(() => prisma.$transaction((tx) => applyBottling(tx, input, actor), SERIAL));
}

export async function deleteBottling(runId: string, actor: Actor): Promise<void> {
  await withRetry(() => prisma.$transaction((tx) => reverseBottlingTx(tx, runId, actor), SERIAL));
}

export async function editBottling(runId: string, input: BottlingInput, actor: Actor): Promise<void> {
  await withRetry(() =>
    prisma.$transaction(async (tx) => {
      await reverseBottlingTx(tx, runId, actor);
      await applyBottling(tx, input, actor);
    }, SERIAL),
  );
}
