"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { action, ActionError } from "@/lib/actions";
import { writeAudit, summarize, diff } from "@/lib/audit";

const PATH = "/bulk";

function parseVolume(raw: unknown): number {
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0) throw new ActionError("Volume must be a positive number of liters.");
  return Math.round(v * 100) / 100;
}

function parseVintage(raw: unknown): number {
  const y = Number(raw);
  const now = 2026;
  if (!Number.isInteger(y) || y < 1900 || y > now + 1) throw new ActionError("Enter a valid vintage year.");
  return y;
}

async function currentTotal(vesselId: string, excludeComponentId?: string): Promise<number> {
  const comps = await prisma.vesselComponent.findMany({
    where: { vesselId, ...(excludeComponentId ? { id: { not: excludeComponentId } } : {}) },
    select: { volumeL: true },
  });
  return comps.reduce((a, c) => a + Number(c.volumeL), 0);
}

export const addComponent = action(async ({ actor }, formData: FormData) => {
  const vesselId = String(formData.get("vesselId") ?? "");
  const varietyId = String(formData.get("varietyId") ?? "");
  const vineyardId = String(formData.get("vineyardId") ?? "");
  const vintage = parseVintage(formData.get("vintage"));
  const volumeL = parseVolume(formData.get("volumeL"));

  const vessel = await prisma.vessel.findUnique({ where: { id: vesselId } });
  if (!vessel || !vessel.isActive) throw new ActionError("Vessel not found or inactive.");
  if (!varietyId || !vineyardId) throw new ActionError("Pick a variety and a vineyard.");

  const capacity = Number(vessel.capacityL);
  const existing = await prisma.vesselComponent.findUnique({
    where: { vesselId_varietyId_vineyardId_vintage: { vesselId, varietyId, vineyardId, vintage } },
  });
  const total = await currentTotal(vesselId);
  if (total + volumeL > capacity + 1e-9) {
    throw new ActionError(
      `That would exceed capacity: ${Math.round((total + volumeL) * 100) / 100} L into a ${capacity} L vessel.`,
      "CONFLICT",
    );
  }

  await prisma.$transaction(async (tx) => {
    if (existing) {
      const newVol = Math.round((Number(existing.volumeL) + volumeL) * 100) / 100;
      await tx.vesselComponent.update({ where: { id: existing.id }, data: { volumeL: newVol } });
      await writeAudit(tx, {
        ...actor,
        action: "UPDATE",
        entityType: "VesselComponent",
        entityId: existing.id,
        changes: diff({ volumeL: existing.volumeL }, { volumeL: newVol }),
        summary: `Added ${volumeL} L to ${vessel.code} (${vintage})`,
      });
    } else {
      const created = await tx.vesselComponent.create({
        data: { vesselId, varietyId, vineyardId, vintage, volumeL },
      });
      await writeAudit(tx, {
        ...actor,
        action: "CREATE",
        entityType: "VesselComponent",
        entityId: created.id,
        changes: diff(null, { vesselId, varietyId, vineyardId, vintage, volumeL }),
        summary: `Filled ${vessel.code} with ${volumeL} L (${vintage})`,
      });
    }
  });
  revalidatePath(PATH);
});

export const updateComponentVolume = action(async ({ actor }, componentId: string, formData: FormData) => {
  const volumeL = parseVolume(formData.get("volumeL"));
  const comp = await prisma.vesselComponent.findUnique({
    where: { id: componentId },
    include: { vessel: true },
  });
  if (!comp) throw new ActionError("Component not found.");
  const capacity = Number(comp.vessel.capacityL);
  const others = await currentTotal(comp.vesselId, componentId);
  if (others + volumeL > capacity + 1e-9) {
    throw new ActionError(`That would exceed the ${capacity} L capacity.`, "CONFLICT");
  }
  await prisma.$transaction(async (tx) => {
    await tx.vesselComponent.update({ where: { id: componentId }, data: { volumeL } });
    await writeAudit(tx, {
      ...actor,
      action: "UPDATE",
      entityType: "VesselComponent",
      entityId: componentId,
      changes: diff({ volumeL: comp.volumeL }, { volumeL }),
      summary: `Adjusted volume in ${comp.vessel.code} to ${volumeL} L`,
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
  const comp = await prisma.vesselComponent.findUnique({
    where: { id: componentId },
    include: { vessel: true },
  });
  if (!comp) throw new ActionError("Component not found.");
  await prisma.$transaction(async (tx) => {
    await tx.vesselComponent.delete({ where: { id: componentId } });
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
