"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { action, ActionError } from "@/lib/actions";
import { writeAudit } from "@/lib/audit";
import { round2 } from "@/lib/bottling/draw";
import { planTransfer, type SourceComponent } from "./transfer-math";

export type TransferWineInput = {
  fromVesselId: string;
  toVesselId: string;
  drawL?: number; // omit = full transfer (whole source)
  lossL?: number; // default 0
  note?: string;
};

export type TransferWineResult = {
  transferId: string;
  message: string;
  fromCode: string;
  toCode: string;
  volumeL: number; // drawn from source
  lossL: number;
  addedL: number; // into destination
};

const PATHS = ["/bulk", "/vessels"];
const EPS = 1e-9;

function vesselLabel(v: { type: string; code: string }): string {
  return v.type === "BARREL" ? `Barrel ${v.code}` : `Tank ${v.code}`;
}

/**
 * Move wine from one vessel to another (racking). Authoritative: re-validates
 * everything inside the transaction since state may have changed since a proposal
 * was previewed. Deducts from the source, merges the moved lots into the
 * destination, records a VesselTransfer + audit row, all atomically.
 */
export const transferWine = action(
  async ({ actor }, input: TransferWineInput): Promise<TransferWineResult> => {
    const { fromVesselId, toVesselId } = input;
    if (!fromVesselId || !toVesselId) {
      throw new ActionError("A source and a destination vessel are both required.");
    }
    if (fromVesselId === toVesselId) {
      throw new ActionError("Source and destination must be different vessels.");
    }

    const include = { components: { include: { variety: true, vineyard: true } } } as const;
    const [from, to] = await Promise.all([
      prisma.vessel.findUnique({ where: { id: fromVesselId }, include }),
      prisma.vessel.findUnique({ where: { id: toVesselId }, include }),
    ]);
    if (!from) throw new ActionError("Source vessel not found.");
    if (!to) throw new ActionError("Destination vessel not found.");
    if (!from.isActive) throw new ActionError(`${vesselLabel(from)} is inactive.`);
    if (!to.isActive) throw new ActionError(`${vesselLabel(to)} is inactive.`);

    const sourceTotal = round2(from.components.reduce((a, c) => a + Number(c.volumeL), 0));
    if (sourceTotal <= 0) throw new ActionError(`${vesselLabel(from)} is empty.`);

    const drawL = input.drawL == null ? sourceTotal : round2(input.drawL);
    if (!(drawL > 0)) throw new ActionError("Transfer volume must be greater than 0.");
    if (drawL > sourceTotal + EPS) {
      throw new ActionError(`${vesselLabel(from)} only holds ${sourceTotal} L; can't move ${drawL} L.`);
    }

    const lossL = input.lossL == null ? 0 : round2(input.lossL);
    if (lossL < 0) throw new ActionError("Loss can't be negative.");
    if (lossL > drawL + EPS) throw new ActionError("Loss can't exceed the transfer volume.");

    const addedL = round2(drawL - lossL);
    const toCapacity = Number(to.capacityL);
    const toCurrent = round2(to.components.reduce((a, c) => a + Number(c.volumeL), 0));
    if (toCurrent + addedL > toCapacity + EPS) {
      throw new ActionError(
        `That would exceed ${vesselLabel(to)}'s ${toCapacity} L capacity (it holds ${toCurrent} L, adding ${addedL} L).`,
        "CONFLICT",
      );
    }

    const sourceComponents: SourceComponent[] = from.components.map((c) => ({
      id: c.id,
      varietyId: c.varietyId,
      vineyardId: c.vineyardId,
      vintage: c.vintage,
      volumeL: Number(c.volumeL),
    }));
    const plan = planTransfer(sourceComponents, drawL, lossL);

    // Names for the history snapshot (look up by id from the source components).
    const varietyName = new Map(from.components.map((c) => [c.varietyId, c.variety.name]));
    const vineyardName = new Map(from.components.map((c) => [c.vineyardId, c.vineyard.name]));
    const snapshot = plan.additions.map((a) => ({
      varietyName: varietyName.get(a.varietyId) ?? null,
      vineyardName: vineyardName.get(a.vineyardId) ?? null,
      vintage: a.vintage,
      volumeL: a.volumeL,
    }));

    const fromCode = from.code;
    const toCode = to.code;
    const fromLabel = vesselLabel(from);
    const toLabel = vesselLabel(to);

    const transferId = await prisma.$transaction(async (tx) => {
      // 1. Deduct from the source: empty components are deleted, others updated.
      for (const d of plan.deductions) {
        if (d.remaining <= EPS) {
          await tx.vesselComponent.delete({ where: { id: d.id } });
        } else {
          await tx.vesselComponent.update({ where: { id: d.id }, data: { volumeL: round2(d.remaining) } });
        }
      }

      // 2. Merge the moved lots into the destination (increment if the lot exists).
      for (const a of plan.additions) {
        await tx.vesselComponent.upsert({
          where: {
            vesselId_varietyId_vineyardId_vintage: {
              vesselId: to.id,
              varietyId: a.varietyId,
              vineyardId: a.vineyardId,
              vintage: a.vintage,
            },
          },
          create: {
            vesselId: to.id,
            varietyId: a.varietyId,
            vineyardId: a.vineyardId,
            vintage: a.vintage,
            volumeL: a.volumeL,
          },
          update: { volumeL: { increment: a.volumeL } },
        });
      }

      // 3. Record the transfer + audit, in the same transaction.
      const lossNote = plan.lossL > 0 ? `, ${plan.lossL} L lost to lees` : "";
      const summary = `Racked ${addedL} L from ${fromLabel} to ${toLabel}${lossNote}`;
      const transfer = await tx.vesselTransfer.create({
        data: {
          fromVesselId: from.id,
          toVesselId: to.id,
          fromVesselCode: fromCode,
          toVesselCode: toCode,
          volumeL: plan.drawL,
          lossL: plan.lossL,
          components: snapshot as unknown as Prisma.InputJsonValue,
          note: input.note?.trim() || null,
          actorUserId: actor.actorUserId,
          actorEmail: actor.actorEmail,
        },
      });
      await writeAudit(tx, {
        ...actor,
        action: "STOCK_MOVEMENT",
        entityType: "VesselTransfer",
        entityId: transfer.id,
        summary,
      });
      return transfer.id;
    });

    for (const p of PATHS) revalidatePath(p);

    const lossClause = lossL > 0 ? ` (${lossL} L lost to lees)` : "";
    return {
      transferId,
      message: `Racked ${addedL} L from ${fromLabel} to ${toLabel}${lossClause}.`,
      fromCode,
      toCode,
      volumeL: plan.drawL,
      lossL: plan.lossL,
      addedL,
    };
  },
);
