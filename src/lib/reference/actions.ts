"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { action, ActionError } from "@/lib/actions";
import { writeAudit, summarize, diff } from "@/lib/audit";

const PATH = "/reference";

export type RefKind = "variety" | "vineyard";

function cleanName(raw: unknown): string {
  const name = String(raw ?? "").trim();
  if (name.length < 2) throw new ActionError("Name must be at least 2 characters.");
  if (name.length > 80) throw new ActionError("Name is too long.");
  return name;
}

function entityType(kind: RefKind) {
  return kind === "variety" ? "Variety" : "Vineyard";
}

async function findByName(kind: RefKind, name: string) {
  return kind === "variety"
    ? prisma.variety.findUnique({ where: { name } })
    : prisma.vineyard.findUnique({ where: { name } });
}

async function findById(kind: RefKind, id: string) {
  return kind === "variety"
    ? prisma.variety.findUnique({ where: { id } })
    : prisma.vineyard.findUnique({ where: { id } });
}

/** How many vessel components / bottling sources reference this row. */
async function referenceCount(kind: RefKind, id: string): Promise<number> {
  if (kind === "variety") {
    const [c, s] = await Promise.all([
      prisma.vesselComponent.count({ where: { varietyId: id } }),
      prisma.bottlingSource.count({ where: { varietyId: id } }),
    ]);
    return c + s;
  }
  const [c, s] = await Promise.all([
    prisma.vesselComponent.count({ where: { vineyardId: id } }),
    prisma.bottlingSource.count({ where: { vineyardId: id } }),
  ]);
  return c + s;
}

export const createRef = action(async ({ actor }, kind: RefKind, formData: FormData) => {
  const name = cleanName(formData.get("name"));
  if (await findByName(kind, name)) {
    throw new ActionError(`That ${kind} already exists.`, "CONFLICT");
  }
  await prisma.$transaction(async (tx) => {
    const created =
      kind === "variety"
        ? await tx.variety.create({ data: { name } })
        : await tx.vineyard.create({ data: { name } });
    await writeAudit(tx, {
      ...actor,
      action: "CREATE",
      entityType: entityType(kind),
      entityId: created.id,
      changes: diff(null, { name: created.name }),
      summary: summarize("CREATE", entityType(kind), { label: created.name }),
    });
  });
  revalidatePath(PATH);
});

export const setRefActive = action(async ({ actor }, kind: RefKind, id: string, isActive: boolean) => {
  const row = await findById(kind, id);
  if (!row) throw new ActionError(`${entityType(kind)} not found.`);
  if (!isActive && (await referenceCount(kind, id)) > 0) {
    throw new ActionError(
      `Cannot deactivate a ${kind} that is used by a vessel or bottling run. It stays in history.`,
      "CONFLICT",
    );
  }
  await prisma.$transaction(async (tx) => {
    if (kind === "variety") await tx.variety.update({ where: { id }, data: { isActive } });
    else await tx.vineyard.update({ where: { id }, data: { isActive } });
    await writeAudit(tx, {
      ...actor,
      action: "UPDATE",
      entityType: entityType(kind),
      entityId: id,
      changes: diff({ isActive: row.isActive }, { isActive }),
      summary: summarize("UPDATE", entityType(kind), {
        label: row.name,
        changes: diff({ isActive: row.isActive }, { isActive }),
      }),
    });
  });
  revalidatePath(PATH);
});
