"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { action, ActionError } from "@/lib/actions";
import { writeAudit, summarize, diff } from "@/lib/audit";

const PATH = "/vessels";
const TYPES = ["BARREL", "TANK"] as const;
type VesselType = (typeof TYPES)[number];

function parseInput(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();
  const type = String(formData.get("type") ?? "") as VesselType;
  const capacityL = Number(formData.get("capacityL"));
  if (code.length < 1 || code.length > 40) throw new ActionError("Code is required (max 40 chars).");
  if (!TYPES.includes(type)) throw new ActionError("Type must be BARREL or TANK.");
  if (!Number.isFinite(capacityL) || capacityL <= 0) throw new ActionError("Capacity must be a positive number of liters.");
  return { code, type, capacityL };
}

export const createVessel = action(async ({ actor }, formData: FormData) => {
  const { code, type, capacityL } = parseInput(formData);
  if (await prisma.vessel.findUnique({ where: { code } })) {
    throw new ActionError("A vessel with that code already exists.", "CONFLICT");
  }
  await prisma.$transaction(async (tx) => {
    const v = await tx.vessel.create({ data: { code, type, capacityL } });
    await writeAudit(tx, {
      ...actor,
      action: "CREATE",
      entityType: "Vessel",
      entityId: v.id,
      changes: diff(null, { code: v.code, type: v.type, capacityL: v.capacityL }),
      summary: summarize("CREATE", "Vessel", { label: v.code }),
    });
  });
  revalidatePath(PATH);
});

export const updateVessel = action(async ({ actor }, id: string, formData: FormData) => {
  const { code, type, capacityL } = parseInput(formData);
  const v = await prisma.vessel.findUnique({ where: { id }, include: { components: true } });
  if (!v) throw new ActionError("Vessel not found.");
  if (v.code !== code) {
    const clash = await prisma.vessel.findUnique({ where: { code } });
    if (clash) throw new ActionError("A vessel with that code already exists.", "CONFLICT");
  }
  const filled = v.components.reduce((a, c) => a + Number(c.volumeL), 0);
  if (capacityL < filled) {
    throw new ActionError(`Capacity (${capacityL} L) is below current contents (${filled} L).`, "CONFLICT");
  }
  const before = { code: v.code, type: v.type, capacityL: v.capacityL };
  const after = { code, type, capacityL };
  await prisma.$transaction(async (tx) => {
    await tx.vessel.update({ where: { id }, data: after });
    await writeAudit(tx, {
      ...actor,
      action: "UPDATE",
      entityType: "Vessel",
      entityId: id,
      changes: diff(before, after),
      summary: summarize("UPDATE", "Vessel", { label: code, changes: diff(before, after) }),
    });
  });
  revalidatePath(PATH);
});

export const setVesselActive = action(async ({ actor }, id: string, isActive: boolean) => {
  const v = await prisma.vessel.findUnique({ where: { id }, include: { _count: { select: { components: true } } } });
  if (!v) throw new ActionError("Vessel not found.");
  if (!isActive && v._count.components > 0) {
    throw new ActionError("Cannot deactivate a vessel that still holds wine. Empty or bottle it first.", "CONFLICT");
  }
  await prisma.$transaction(async (tx) => {
    await tx.vessel.update({ where: { id }, data: { isActive } });
    await writeAudit(tx, {
      ...actor,
      action: "UPDATE",
      entityType: "Vessel",
      entityId: id,
      changes: diff({ isActive: v.isActive }, { isActive }),
      summary: summarize("UPDATE", "Vessel", { label: v.code, changes: diff({ isActive: v.isActive }, { isActive }) }),
    });
  });
  revalidatePath(PATH);
});
