"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { action, ActionError } from "@/lib/actions";
import { writeAudit, summarize, diff } from "@/lib/audit";

const PATH = "/vessels";
const TYPES = ["BARREL", "TANK"] as const;
type VesselType = (typeof TYPES)[number];
const CURRENT_YEAR = 2026;

// Barrel-only metadata. Volume is `capacityL` (handled above), not duplicated here.
type BarrelMeta = {
  barrelNumber: number | null;
  oakOrigin: string | null;
  cooperageYear: number | null;
  cooperage: string | null;
  toastLevel: string | null;
};

const EMPTY_META: BarrelMeta = { barrelNumber: null, oakOrigin: null, cooperageYear: null, cooperage: null, toastLevel: null };

function optText(formData: FormData, key: string, max = 80): string | null {
  const s = String(formData.get(key) ?? "").trim();
  if (s === "") return null;
  if (s.length > max) throw new ActionError(`${key} is too long (max ${max} chars).`);
  return s;
}

function parseBarrelMeta(formData: FormData): BarrelMeta {
  let barrelNumber: number | null = null;
  const rawNum = String(formData.get("barrelNumber") ?? "").trim();
  if (rawNum !== "") {
    const n = Number(rawNum);
    if (!Number.isInteger(n) || n <= 0) throw new ActionError("Barrel # must be a positive whole number.");
    barrelNumber = n;
  }
  let cooperageYear: number | null = null;
  const rawYear = String(formData.get("cooperageYear") ?? "").trim();
  if (rawYear !== "") {
    const y = Number(rawYear);
    if (!Number.isInteger(y) || y < 1900 || y > CURRENT_YEAR + 1) throw new ActionError("Enter a valid year of cooperage.");
    cooperageYear = y;
  }
  return {
    barrelNumber,
    oakOrigin: optText(formData, "oakOrigin"),
    cooperageYear,
    cooperage: optText(formData, "cooperage"),
    toastLevel: optText(formData, "toastLevel"),
  };
}

function parseInput(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();
  const type = String(formData.get("type") ?? "") as VesselType;
  const capacityL = Number(formData.get("capacityL"));
  if (code.length < 1 || code.length > 40) throw new ActionError("Code is required (max 40 chars).");
  if (!TYPES.includes(type)) throw new ActionError("Type must be BARREL or TANK.");
  if (!Number.isFinite(capacityL) || capacityL <= 0) throw new ActionError("Capacity must be a positive number of liters.");
  // Metadata applies to barrels only; tanks always store nulls.
  const meta = type === "BARREL" ? parseBarrelMeta(formData) : EMPTY_META;
  return { code, type, capacityL, meta };
}

async function assertBarrelNumberFree(barrelNumber: number | null, excludeId?: string) {
  if (barrelNumber == null) return;
  const clash = await prisma.vessel.findUnique({ where: { barrelNumber } });
  if (clash && clash.id !== excludeId) throw new ActionError(`Barrel # ${barrelNumber} is already in use.`, "CONFLICT");
}

export const createVessel = action(async ({ actor }, formData: FormData) => {
  const { code, type, capacityL, meta } = parseInput(formData);
  if (await prisma.vessel.findUnique({ where: { code } })) {
    throw new ActionError("A vessel with that code already exists.", "CONFLICT");
  }
  await assertBarrelNumberFree(meta.barrelNumber);
  await prisma.$transaction(async (tx) => {
    const v = await tx.vessel.create({ data: { code, type, capacityL, ...meta } });
    await writeAudit(tx, {
      ...actor,
      action: "CREATE",
      entityType: "Vessel",
      entityId: v.id,
      changes: diff(null, { code: v.code, type: v.type, capacityL: v.capacityL, ...meta }),
      summary: summarize("CREATE", "Vessel", { label: v.code }),
    });
  });
  revalidatePath(PATH);
});

export const updateVessel = action(async ({ actor }, id: string, formData: FormData) => {
  const { code, type, capacityL, meta } = parseInput(formData);
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
  await assertBarrelNumberFree(meta.barrelNumber, id);
  const before = { code: v.code, type: v.type, capacityL: v.capacityL, barrelNumber: v.barrelNumber, oakOrigin: v.oakOrigin, cooperageYear: v.cooperageYear, cooperage: v.cooperage, toastLevel: v.toastLevel };
  const after = { code, type, capacityL, ...meta };
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
