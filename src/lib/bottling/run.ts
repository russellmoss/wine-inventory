import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { writeAudit } from "../audit";
import { ActionError } from "../action-error";
import { computeProportionalDraw, consumedForBottles, casesAndLoose } from "./draw";

export type BottlingInput = {
  vesselId: string;
  destinationLocationId: string;
  skuName: string;
  skuVintage: number;
  bottlesProduced: number;
  date: Date;
};

export type Actor = { actorUserId: string | null; actorEmail: string };

/**
 * Core bottling transaction (no auth). Serializable + retry so two concurrent
 * runs on the same vessel can never overdraw. Production callers go through
 * createBottlingRun (which adds auth + input parsing); tests call this directly.
 */
export async function executeBottling(input: BottlingInput, actor: Actor): Promise<void> {
  const { vesselId, destinationLocationId, skuName, skuVintage, bottlesProduced, date } = input;
  if (bottlesProduced < 1) throw new ActionError("Bottles produced must be at least 1.");
  if (!skuName) throw new ActionError("Give the bottled wine a name.");

  const location = await prisma.location.findUnique({ where: { id: destinationLocationId } });
  if (!location || !location.isActive) throw new ActionError("Pick an active destination location.");

  const consumedL = consumedForBottles(bottlesProduced);
  const MAX_ATTEMPTS = 4;

  for (let attempt = 1; ; attempt++) {
    try {
      await prisma.$transaction(
        async (tx) => {
          const vessel = await tx.vessel.findUnique({ where: { id: vesselId }, include: { components: true } });
          if (!vessel) throw new ActionError("Vessel not found.");
          const total = Math.round(vessel.components.reduce((a, c) => a + Number(c.volumeL), 0) * 100) / 100;
          if (total <= 0) throw new ActionError("That vessel is empty.");
          if (consumedL > total + 1e-9) {
            throw new ActionError(
              `Not enough wine: ${bottlesProduced} bottles need ${consumedL} L but only ${total} L available.`,
              "CONFLICT",
            );
          }

          const draws = computeProportionalDraw(
            vessel.components.map((c) => ({ id: c.id, volumeL: Number(c.volumeL) })),
            consumedL,
          );
          const drawById = new Map(draws.map((d) => [d.id, d]));

          const sku = await tx.wineSku.upsert({
            where: { name_vintage_bottleSizeMl: { name: skuName, vintage: skuVintage, bottleSizeMl: 750 } },
            update: {},
            create: { name: skuName, vintage: skuVintage, bottleSizeMl: 750 },
          });

          const run = await tx.bottlingRun.create({
            data: {
              date,
              wineSkuId: sku.id,
              bottlesProduced,
              volumeConsumedL: consumedL,
              destinationLocationId,
              createdById: actor.actorUserId,
              createdByEmail: actor.actorEmail,
            },
          });

          for (const c of vessel.components) {
            const d = drawById.get(c.id)!;
            if (d.deduct <= 0) continue;
            await tx.bottlingSource.create({
              data: {
                bottlingRunId: run.id,
                vesselId: vessel.id,
                varietyId: c.varietyId,
                vineyardId: c.vineyardId,
                vintage: c.vintage,
                volumeConsumedL: d.deduct,
              },
            });
            if (d.remaining <= 0) {
              await tx.vesselComponent.delete({ where: { id: c.id } });
            } else {
              await tx.vesselComponent.update({ where: { id: c.id }, data: { volumeL: d.remaining } });
            }
          }

          await tx.stockMovement.create({
            data: {
              itemKind: "BOTTLED_WINE",
              wineSkuId: sku.id,
              locationId: destinationLocationId,
              kind: "RECEIVE",
              deltaUnits: bottlesProduced,
              bottlingRunId: run.id,
              createdById: actor.actorUserId,
              createdByEmail: actor.actorEmail,
              reason: "Bottling run",
            },
          });
          await tx.bottledInventory.upsert({
            where: { wineSkuId_locationId: { wineSkuId: sku.id, locationId: destinationLocationId } },
            update: { totalBottles: { increment: bottlesProduced } },
            create: { wineSkuId: sku.id, locationId: destinationLocationId, totalBottles: bottlesProduced },
          });

          const { cases, loose } = casesAndLoose(bottlesProduced);
          await writeAudit(tx, {
            ...actor,
            action: "BOTTLING",
            entityType: "BottlingRun",
            entityId: run.id,
            summary: `Bottled ${bottlesProduced} bottles (${cases} cases + ${loose}) of "${skuName} ${skuVintage}" from ${vessel.code} into ${location.name}`,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 },
      );
      return;
    } catch (e) {
      // Retry only on serialization/write conflicts (P2034). Anything else
      // (incl. P2025 record-not-found) is a real error, not transient contention.
      const code = e instanceof Prisma.PrismaClientKnownRequestError ? e.code : undefined;
      if (code === "P2034" && attempt < MAX_ATTEMPTS) continue;
      throw e;
    }
  }
}
