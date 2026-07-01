"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { action, ActionError } from "@/lib/actions";
import { writeAudit, summarize, diff } from "@/lib/audit";

const PATH = "/locations";

function cleanName(raw: unknown): string {
  const name = String(raw ?? "").trim();
  if (name.length < 2) throw new ActionError("Name must be at least 2 characters.");
  if (name.length > 60) throw new ActionError("Name is too long.");
  return name;
}

export const createLocation = action(async ({ actor }, formData: FormData) => {
  const name = cleanName(formData.get("name"));
  const existing = await prisma.location.findFirst({ where: { name } });
  if (existing) throw new ActionError("A location with that name already exists.", "CONFLICT");

  await runInTenantTx(async (tx) => {
    const created = await tx.location.create({ data: { name } });
    await writeAudit(tx, {
      ...actor,
      action: "CREATE",
      entityType: "Location",
      entityId: created.id,
      changes: diff(null, { name: created.name, isActive: created.isActive }),
      summary: summarize("CREATE", "Location", { label: created.name }),
    });
  });
  revalidatePath(PATH);
});

export const renameLocation = action(async ({ actor }, id: string, formData: FormData) => {
  const name = cleanName(formData.get("name"));
  const loc = await prisma.location.findUnique({ where: { id } });
  if (!loc) throw new ActionError("Location not found.");
  if (loc.isSystem) throw new ActionError("The Winery location is reserved and cannot be renamed.");
  if (loc.name === name) return;
  const clash = await prisma.location.findFirst({ where: { name } });
  if (clash) throw new ActionError("A location with that name already exists.", "CONFLICT");

  await runInTenantTx(async (tx) => {
    const updated = await tx.location.update({ where: { id }, data: { name } });
    await writeAudit(tx, {
      ...actor,
      action: "UPDATE",
      entityType: "Location",
      entityId: id,
      changes: diff({ name: loc.name }, { name: updated.name }),
      summary: summarize("UPDATE", "Location", {
        label: updated.name,
        changes: diff({ name: loc.name }, { name: updated.name }),
      }),
    });
  });
  revalidatePath(PATH);
});

export const setLocationActive = action(async ({ actor }, id: string, isActive: boolean) => {
  const loc = await prisma.location.findUnique({ where: { id } });
  if (!loc) throw new ActionError("Location not found.");
  if (loc.isSystem) throw new ActionError("The Winery location is reserved and cannot be deactivated.");

  if (!isActive) {
    // Block deactivation while the location still holds inventory.
    const [bottled, goods] = await Promise.all([
      prisma.bottledInventory.aggregate({ where: { locationId: id }, _sum: { totalBottles: true } }),
      prisma.finishedGoodInventory.aggregate({ where: { locationId: id }, _sum: { quantity: true } }),
    ]);
    if ((bottled._sum.totalBottles ?? 0) > 0 || (goods._sum.quantity ?? 0) > 0) {
      throw new ActionError("Cannot deactivate a location that still holds inventory.", "CONFLICT");
    }
  }

  await runInTenantTx(async (tx) => {
    await tx.location.update({ where: { id }, data: { isActive } });
    await writeAudit(tx, {
      ...actor,
      action: "UPDATE",
      entityType: "Location",
      entityId: id,
      changes: diff({ isActive: loc.isActive }, { isActive }),
      summary: summarize("UPDATE", "Location", {
        label: loc.name,
        changes: diff({ isActive: loc.isActive }, { isActive }),
      }),
    });
  });
  revalidatePath(PATH);
});
