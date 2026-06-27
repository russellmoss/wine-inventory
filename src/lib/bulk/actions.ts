"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { action, ActionError } from "@/lib/actions";
import { writeAudit, diff } from "@/lib/audit";
import { computeProportionalDraw, round2 } from "@/lib/bottling/draw";
import { runLedgerWrite, writeLotOperation } from "@/lib/ledger/write";
import type { LedgerLine } from "@/lib/ledger/math";
import { nextLotCode, isUniqueViolation } from "@/lib/lot/generate";
import { normalizeToken } from "@/lib/lot/code";

const PATH = "/bulk";
const EPS = 1e-9;

function parseVolume(raw: unknown): number {
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0) throw new ActionError("Volume must be a positive number of liters.");
  return round2(v);
}

function parseVintage(raw: unknown): number {
  const y = Number(raw);
  const now = 2026;
  if (!Number.isInteger(y) || y < 1900 || y > now + 1) throw new ActionError("Enter a valid vintage year.");
  return y;
}

/** Current total in a vessel from the ledger projection (vessel_lot). */
async function vesselTotal(vesselId: string): Promise<number> {
  const rows = await prisma.vesselLot.findMany({ where: { vesselId }, select: { volumeL: true } });
  return round2(rows.reduce((a, r) => a + Number(r.volumeL), 0));
}

/** The lots (with codes) backing one vessel_component tuple. */
async function lotsForTuple(vesselId: string, varietyId: string, vineyardId: string, vintage: number) {
  return prisma.vesselLot.findMany({
    where: {
      vesselId,
      lot: { originVarietyId: varietyId, originVineyardId: vineyardId, vintageYear: vintage },
    },
    include: { lot: { select: { id: true, code: true } } },
  });
}

export const addComponent = action(async ({ actor }, formData: FormData) => {
  const vesselId = String(formData.get("vesselId") ?? "");
  const varietyId = String(formData.get("varietyId") ?? "");
  const vineyardId = String(formData.get("vineyardId") ?? "");
  const blockId = String(formData.get("blockId") ?? "") || null;
  const subblockId = String(formData.get("subblockId") ?? "") || null;
  const tag = normalizeToken(formData.get("sublotTag")) || null;
  const vintage = parseVintage(formData.get("vintage"));
  const volumeL = parseVolume(formData.get("volumeL"));

  const vessel = await prisma.vessel.findUnique({ where: { id: vesselId } });
  if (!vessel || !vessel.isActive) throw new ActionError("Vessel not found or inactive.");
  if (!varietyId || !vineyardId) throw new ActionError("Pick a variety and a vineyard.");

  // Abbreviations are required to build a readable code (the user chose required+unique).
  const [variety, vineyard] = await Promise.all([
    prisma.variety.findUnique({ where: { id: varietyId }, select: { name: true, abbreviation: true } }),
    prisma.vineyard.findUnique({ where: { id: vineyardId }, select: { name: true, abbreviation: true } }),
  ]);
  if (!variety?.abbreviation) {
    throw new ActionError(`Set an abbreviation for variety "${variety?.name ?? varietyId}" in Varieties & vineyards first.`);
  }
  if (!vineyard?.abbreviation) {
    throw new ActionError(`Set an abbreviation for vineyard "${vineyard?.name ?? vineyardId}" in Varieties & vineyards first.`);
  }
  // Optional block (must belong to the chosen vineyard to count toward the code).
  const block = blockId
    ? await prisma.vineyardBlock.findUnique({ where: { id: blockId }, select: { id: true, vineyardId: true, code: true, blockLabel: true } })
    : null;
  const blockForCode = block && block.vineyardId === vineyardId ? block : null;
  // Optional subblock (must belong to the chosen block).
  const subblock = subblockId && blockForCode
    ? await prisma.vineyardSubblock.findUnique({ where: { id: subblockId }, select: { id: true, blockId: true, code: true, label: true } })
    : null;
  const subblockForCode = subblock && subblock.blockId === blockForCode?.id ? subblock : null;

  const capacity = Number(vessel.capacityL);
  const total = await vesselTotal(vesselId);
  if (total + volumeL > capacity + EPS) {
    throw new ActionError(
      `That would exceed capacity: ${round2(total + volumeL)} L into a ${capacity} L vessel.`,
      "CONFLICT",
    );
  }

  for (let attempt = 0; ; attempt++) {
    try {
      await runLedgerWrite(async (tx) => {
        const code = await nextLotCode(tx, {
          vintage,
          vineyardAbbr: vineyard.abbreviation!,
          varietyAbbr: variety.abbreviation!,
          blockCode: blockForCode?.code,
          blockLabel: blockForCode?.blockLabel,
          subblockCode: subblockForCode?.code,
          tag,
        });
        const lot = await tx.lot.create({
          data: {
            code,
            form: "WINE",
            originVarietyId: varietyId,
            originVineyardId: vineyardId,
            originBlockId: blockForCode?.id ?? null,
            originSubblockId: subblockForCode?.id ?? null,
            vintageYear: vintage,
            sublotTag: tag,
          },
          select: { id: true },
        });
        const lines: LedgerLine[] = [
          { lotId: lot.id, vesselId, deltaL: volumeL },
          { lotId: lot.id, vesselId: null, deltaL: -volumeL, reason: "seed" },
        ];
        await writeLotOperation(tx, {
          type: "SEED",
          lines,
          actorUserId: actor.actorUserId,
          enteredBy: actor.actorEmail,
          note: `Filled ${vessel.code} with ${volumeL} L (${vintage}) — lot ${code}`,
          lotCodes: new Map([[lot.id, code]]),
          vesselCodes: new Map([[vesselId, vessel.code]]),
          capacityByVessel: new Map([[vesselId, capacity]]),
        });
        await writeAudit(tx, {
          ...actor,
          action: "CREATE",
          entityType: "Lot",
          entityId: lot.id,
          changes: diff(null, { code, vesselId, varietyId, vineyardId, blockId: blockForCode?.id ?? null, vintage, volumeL, sublotTag: tag }),
          summary: `Filled ${vessel.code} with ${volumeL} L — lot ${code}`,
        });
      });
      break;
    } catch (e) {
      // Rare race: another create took the same code between disambiguation and insert.
      if (isUniqueViolation(e) && attempt < 3) continue;
      throw e;
    }
  }
  revalidatePath(PATH);
});

export const updateComponentVolume = action(async ({ actor }, componentId: string, formData: FormData) => {
  const target = parseVolume(formData.get("volumeL"));
  const comp = await prisma.vesselComponent.findUnique({ where: { id: componentId }, include: { vessel: true } });
  if (!comp) throw new ActionError("Component not found.");

  const capacity = Number(comp.vessel.capacityL);
  const lots = await lotsForTuple(comp.vesselId, comp.varietyId, comp.vineyardId, comp.vintage);
  if (lots.length === 0) throw new ActionError("Can't adjust: no lot backs this wine anymore.");

  const tupleTotal = round2(lots.reduce((a, r) => a + Number(r.volumeL), 0));
  const others = round2((await vesselTotal(comp.vesselId)) - tupleTotal);
  if (others + target > capacity + EPS) {
    throw new ActionError(`That would exceed the ${capacity} L capacity.`, "CONFLICT");
  }

  const delta = round2(target - tupleTotal);
  if (Math.abs(delta) < EPS) return; // no change

  // Distribute the change across the tuple's lots proportionally to current volume.
  const shares = computeProportionalDraw(
    lots.map((r) => ({ id: r.lotId, volumeL: Number(r.volumeL) })),
    Math.abs(delta),
  );
  const sign = delta > 0 ? 1 : -1;
  const lines: LedgerLine[] = [];
  for (const s of shares) {
    if (s.deduct <= 0) continue;
    const d = round2(sign * s.deduct);
    lines.push({ lotId: s.id, vesselId: comp.vesselId, deltaL: d });
    lines.push({ lotId: s.id, vesselId: null, deltaL: round2(-d), reason: "adjust" });
  }

  await runLedgerWrite(async (tx) => {
    await writeLotOperation(tx, {
      type: "ADJUST",
      lines,
      actorUserId: actor.actorUserId,
      enteredBy: actor.actorEmail,
      note: `Adjusted volume in ${comp.vessel.code} to ${target} L`,
      lotCodes: new Map(lots.map((r) => [r.lotId, r.lot.code])),
      vesselCodes: new Map([[comp.vesselId, comp.vessel.code]]),
      capacityByVessel: new Map([[comp.vesselId, capacity]]),
    });
    await writeAudit(tx, {
      ...actor,
      action: "UPDATE",
      entityType: "VesselComponent",
      entityId: componentId,
      changes: diff({ volumeL: comp.volumeL }, { volumeL: target }),
      summary: `Adjusted volume in ${comp.vessel.code} to ${target} L`,
    });
  });
  revalidatePath(PATH);
});

export const setBlendName = action(async ({ actor }, vesselId: string, formData: FormData) => {
  const raw = String(formData.get("blendName") ?? "").trim();
  if (raw.length > 80) throw new ActionError("Blend name is too long.");
  const name = raw || null;
  const vessel = await prisma.vessel.findUnique({ where: { id: vesselId } });
  if (!vessel) throw new ActionError("Vessel not found.");
  await prisma.$transaction(async (tx) => {
    await tx.vessel.update({ where: { id: vesselId }, data: { blendName: name } });
    await writeAudit(tx, {
      ...actor,
      action: "UPDATE",
      entityType: "Vessel",
      entityId: vesselId,
      changes: diff({ blendName: vessel.blendName }, { blendName: name }),
      summary: name ? `Named ${vessel.code} blend "${name}"` : `Cleared blend name on ${vessel.code}`,
    });
  });
  revalidatePath(PATH);
});

export const removeComponent = action(async ({ actor }, componentId: string) => {
  const comp = await prisma.vesselComponent.findUnique({ where: { id: componentId }, include: { vessel: true } });
  if (!comp) throw new ActionError("Component not found.");

  const lots = await lotsForTuple(comp.vesselId, comp.varietyId, comp.vineyardId, comp.vintage);
  const lines: LedgerLine[] = [];
  for (const r of lots) {
    const vol = round2(Number(r.volumeL));
    if (vol <= 0) continue;
    lines.push({ lotId: r.lotId, vesselId: comp.vesselId, deltaL: round2(-vol) });
    lines.push({ lotId: r.lotId, vesselId: null, deltaL: vol, reason: "deplete" });
  }

  await runLedgerWrite(async (tx) => {
    if (lines.length > 0) {
      await writeLotOperation(tx, {
        type: "DEPLETE",
        lines,
        actorUserId: actor.actorUserId,
        enteredBy: actor.actorEmail,
        note: `Removed ${Number(comp.volumeL)} L from ${comp.vessel.code}`,
        lotCodes: new Map(lots.map((r) => [r.lotId, r.lot.code])),
        vesselCodes: new Map([[comp.vesselId, comp.vessel.code]]),
        capacityByVessel: new Map([[comp.vesselId, Number(comp.vessel.capacityL)]]),
      });
    } else {
      // No backing lot (legacy edge): drop the stale projection row directly.
      await tx.vesselComponent.delete({ where: { id: componentId } });
    }
    await writeAudit(tx, {
      ...actor,
      action: "DELETE",
      entityType: "VesselComponent",
      entityId: componentId,
      changes: diff({ volumeL: comp.volumeL }, null),
      summary: `Removed ${Number(comp.volumeL)} L from ${comp.vessel.code}`,
    });
  });
  revalidatePath(PATH);
});
