"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { action, ActionError } from "@/lib/actions";
import { writeAudit } from "@/lib/audit";
import { round2 } from "@/lib/bottling/draw";
import { planTransfer, planRevert, type SourceComponent, type SnapshotLot } from "./transfer-math";

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
      varietyId: a.varietyId,
      vineyardId: a.vineyardId,
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

// ───────────────────────── Revert / undo a rack ─────────────────────────

type SnapshotEntry = {
  varietyId?: string;
  vineyardId?: string;
  varietyName?: string | null;
  vineyardName?: string | null;
  vintage: number;
  volumeL: number;
};

/**
 * The most recent rack that can still be reverted: not already reverted, not
 * itself a reversal, optionally involving a specific vessel. Plain read used by
 * the assistant tool to resolve "revert that" / "the last rack of barrel 16".
 */
export async function findRevertableTransfer(opts: { vesselId?: string } = {}) {
  return prisma.vesselTransfer.findFirst({
    where: {
      revertedAt: null,
      revertsId: null,
      ...(opts.vesselId ? { OR: [{ fromVesselId: opts.vesselId }, { toVesselId: opts.vesselId }] } : {}),
    },
    orderBy: { rackedAt: "desc" },
    include: { fromVessel: { select: { type: true } }, toVessel: { select: { type: true } } },
  });
}

/** Resolve a snapshot entry's lot ids, falling back to name lookup for legacy rows. */
async function resolveLot(e: SnapshotEntry): Promise<SnapshotLot> {
  let varietyId = e.varietyId;
  let vineyardId = e.vineyardId;
  if (!varietyId && e.varietyName) {
    const v = await prisma.variety.findFirst({ where: { name: e.varietyName }, select: { id: true } });
    varietyId = v?.id;
  }
  if (!vineyardId && e.vineyardName) {
    const y = await prisma.vineyard.findFirst({ where: { name: e.vineyardName }, select: { id: true } });
    vineyardId = y?.id;
  }
  if (!varietyId || !vineyardId) {
    throw new ActionError(
      `Can't revert: a wine lot in this transfer (${e.varietyName ?? "?"} ${e.vintage}) can no longer be identified.`,
    );
  }
  return { varietyId, vineyardId, vintage: e.vintage, volumeL: Number(e.volumeL) };
}

export type RevertTransferResult = { transferId: string; message: string };

/**
 * Undo a rack: move the recorded lots back from the destination to the source.
 * Authoritative re-validation (state may have changed since preview): the rack
 * must not be already reverted or itself a reversal, the destination must still
 * hold the moved lots, and the source must have room. Records a linked reversal
 * VesselTransfer + audit, marks the original reverted, atomically.
 */
export const revertTransfer = action(
  async ({ actor }, input: { transferId: string }): Promise<RevertTransferResult> => {
    const original = await prisma.vesselTransfer.findUnique({ where: { id: input.transferId } });
    if (!original) throw new ActionError("That transfer no longer exists.");
    if (original.revertedAt) throw new ActionError("That rack has already been reverted.");
    if (original.revertsId) throw new ActionError("That entry is itself a reversal — rack it again instead of reverting.");
    if (!original.fromVesselId || !original.toVesselId) {
      throw new ActionError("Can't revert: one of the original vessels no longer exists.");
    }

    // Revert moves wine FROM the original destination BACK TO the original source.
    const include = { components: { include: { variety: true, vineyard: true } } } as const;
    const [dest, src] = await Promise.all([
      prisma.vessel.findUnique({ where: { id: original.toVesselId }, include }),
      prisma.vessel.findUnique({ where: { id: original.fromVesselId }, include }),
    ]);
    if (!dest) throw new ActionError(`The wine's current vessel (${original.toVesselCode}) no longer exists.`);
    if (!src) throw new ActionError(`The original source vessel (${original.fromVesselCode}) no longer exists.`);
    if (!dest.isActive) throw new ActionError(`${vesselLabel(dest)} is inactive.`);
    if (!src.isActive) throw new ActionError(`${vesselLabel(src)} is inactive.`);

    const entries = (original.components as unknown as SnapshotEntry[]) ?? [];
    if (entries.length === 0) throw new ActionError("That transfer recorded no wine to move back.");
    const snapshotLots = await Promise.all(entries.map(resolveLot));

    const destComponents = dest.components.map((c) => ({
      id: c.id,
      varietyId: c.varietyId,
      vineyardId: c.vineyardId,
      vintage: c.vintage,
      volumeL: Number(c.volumeL),
    }));
    const plan = planRevert(snapshotLots, destComponents);

    if (!plan.ok) {
      const vName = new Map(dest.components.map((c) => [c.varietyId, c.variety.name]));
      const missing = plan.shortfalls
        .map((s) => `${vName.get(s.varietyId) ?? "a lot"} ${s.vintage} (need ${s.need} L, ${vesselLabel(dest)} has ${s.have} L)`)
        .join("; ");
      throw new ActionError(
        `Can't revert: ${vesselLabel(dest)} no longer holds enough of the racked wine — it may have been bottled, blended, or racked on. Missing: ${missing}.`,
        "CONFLICT",
      );
    }

    const srcCapacity = Number(src.capacityL);
    const srcCurrent = round2(src.components.reduce((a, c) => a + Number(c.volumeL), 0));
    if (srcCurrent + plan.totalL > srcCapacity + EPS) {
      throw new ActionError(
        `Reverting would overfill ${vesselLabel(src)} (holds ${srcCurrent} L of ${srcCapacity} L; returning ${plan.totalL} L).`,
        "CONFLICT",
      );
    }

    const vName = new Map(dest.components.map((c) => [c.varietyId, c.variety.name]));
    const yName = new Map(dest.components.map((c) => [c.vineyardId, c.vineyard.name]));
    const snapshot = plan.additions.map((a) => ({
      varietyId: a.varietyId,
      vineyardId: a.vineyardId,
      varietyName: vName.get(a.varietyId) ?? null,
      vineyardName: yName.get(a.vineyardId) ?? null,
      vintage: a.vintage,
      volumeL: a.volumeL,
    }));

    const destLabel = vesselLabel(dest);
    const srcLabel = vesselLabel(src);
    const summary = `Reverted rack: moved ${plan.totalL} L back from ${destLabel} to ${srcLabel}`;

    const reversalId = await prisma.$transaction(async (tx) => {
      for (const d of plan.deductions) {
        if (d.remaining <= EPS) {
          await tx.vesselComponent.delete({ where: { id: d.id } });
        } else {
          await tx.vesselComponent.update({ where: { id: d.id }, data: { volumeL: round2(d.remaining) } });
        }
      }
      for (const a of plan.additions) {
        await tx.vesselComponent.upsert({
          where: {
            vesselId_varietyId_vineyardId_vintage: {
              vesselId: src.id,
              varietyId: a.varietyId,
              vineyardId: a.vineyardId,
              vintage: a.vintage,
            },
          },
          create: {
            vesselId: src.id,
            varietyId: a.varietyId,
            vineyardId: a.vineyardId,
            vintage: a.vintage,
            volumeL: a.volumeL,
          },
          update: { volumeL: { increment: a.volumeL } },
        });
      }
      const reversal = await tx.vesselTransfer.create({
        data: {
          fromVesselId: dest.id,
          toVesselId: src.id,
          fromVesselCode: dest.code,
          toVesselCode: src.code,
          volumeL: plan.totalL,
          lossL: 0,
          components: snapshot as unknown as Prisma.InputJsonValue,
          note: `Reverts rack ${original.id}`,
          actorUserId: actor.actorUserId,
          actorEmail: actor.actorEmail,
          revertsId: original.id,
        },
      });
      await tx.vesselTransfer.update({ where: { id: original.id }, data: { revertedAt: new Date() } });
      await writeAudit(tx, {
        ...actor,
        action: "STOCK_MOVEMENT",
        entityType: "VesselTransfer",
        entityId: reversal.id,
        summary,
      });
      return reversal.id;
    });

    for (const p of PATHS) revalidatePath(p);

    return {
      transferId: reversalId,
      message: `Reverted the rack — moved ${plan.totalL} L back from ${destLabel} to ${srcLabel}.`,
    };
  },
);
