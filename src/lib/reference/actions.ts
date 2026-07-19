"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { action, ActionError } from "@/lib/actions";
import { writeAudit, summarize, diff } from "@/lib/audit";
import { isValidHex } from "@/lib/vineyard/colors";
import { normalizeAbbr } from "@/lib/lot/code";

const PATH = "/reference";

export type RefKind = "variety" | "vineyard";

function cleanName(raw: unknown): string {
  const name = String(raw ?? "").trim();
  if (name.length < 2) throw new ActionError("Name must be at least 2 characters.");
  if (name.length > 80) throw new ActionError("Name is too long.");
  return name;
}

/** Normalize an abbreviation to 2–4 uppercase alphanumerics, with a friendly error. */
function cleanAbbreviation(raw: unknown): string {
  try {
    return normalizeAbbr(raw);
  } catch {
    throw new ActionError("Abbreviation must be 2–4 letters or numbers.");
  }
}

/** Is this abbreviation already used by another row of the same kind? */
async function abbreviationTaken(kind: RefKind, value: string, exceptId: string | null): Promise<boolean> {
  const where = { abbreviation: value, ...(exceptId ? { id: { not: exceptId } } : {}) };
  const hit =
    kind === "variety"
      ? await prisma.variety.findFirst({ where, select: { id: true } })
      : await prisma.vineyard.findFirst({ where, select: { id: true } });
  return !!hit;
}

function entityType(kind: RefKind) {
  return kind === "variety" ? "Variety" : "Vineyard";
}

// Case-INSENSITIVE name match: the DB unique on (tenantId, name) is case-sensitive, so an exact-only
// check would let "syrah" slip in beside "Syrah" and fragment master data (NAMING-1). Match how the
// assistant's db_create guards identity, so both write paths agree on "this already exists".
async function findByName(kind: RefKind, name: string) {
  return kind === "variety"
    ? prisma.variety.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })
    : prisma.vineyard.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
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
  const abbrRaw = formData.get("abbreviation");
  const abbreviation = abbrRaw != null && String(abbrRaw).trim() !== "" ? cleanAbbreviation(abbrRaw) : null;
  if (abbreviation && (await abbreviationTaken(kind, abbreviation, null))) {
    throw new ActionError(`Abbreviation "${abbreviation}" is already used by another ${kind}.`, "CONFLICT");
  }
  await runInTenantTx(async (tx) => {
    const created =
      kind === "variety"
        ? await tx.variety.create({ data: { name, abbreviation } })
        : await tx.vineyard.create({ data: { name, abbreviation } });
    await writeAudit(tx, {
      ...actor,
      action: "CREATE",
      entityType: entityType(kind),
      entityId: created.id,
      changes: diff(null, { name: created.name, abbreviation }),
      summary: summarize("CREATE", entityType(kind), { label: created.name }),
    });
  });
  revalidatePath(PATH);
});

/** Set or clear (null / empty) a variety's or vineyard's lot-code abbreviation. */
export const setAbbreviation = action(async ({ actor }, kind: RefKind, id: string, value: string | null) => {
  const row = await findById(kind, id);
  if (!row) throw new ActionError(`${entityType(kind)} not found.`);
  const next = value == null || String(value).trim() === "" ? null : cleanAbbreviation(value);
  if (next && (await abbreviationTaken(kind, next, id))) {
    throw new ActionError(`Abbreviation "${next}" is already used by another ${kind}.`, "CONFLICT");
  }
  await runInTenantTx(async (tx) => {
    if (kind === "variety") await tx.variety.update({ where: { id }, data: { abbreviation: next } });
    else await tx.vineyard.update({ where: { id }, data: { abbreviation: next } });
    await writeAudit(tx, {
      ...actor,
      action: "UPDATE",
      entityType: entityType(kind),
      entityId: id,
      changes: diff({ abbreviation: row.abbreviation }, { abbreviation: next }),
      summary: summarize("UPDATE", entityType(kind), {
        label: row.name,
        changes: diff({ abbreviation: row.abbreviation }, { abbreviation: next }),
      }),
    });
  });
  revalidatePath(PATH);
});

/** Set a variety's canonical map color. Pass null to clear (revert to default). */
export const setVarietyColor = action(async ({ actor }, id: string, color: string | null) => {
  const next = color == null || color === "" ? null : color.trim();
  if (next !== null && !isValidHex(next)) {
    throw new ActionError("That isn't a valid color.");
  }
  const row = await prisma.variety.findUnique({ where: { id } });
  if (!row) throw new ActionError("Variety not found.");
  await runInTenantTx(async (tx) => {
    await tx.variety.update({ where: { id }, data: { color: next } });
    await writeAudit(tx, {
      ...actor,
      action: "UPDATE",
      entityType: "Variety",
      entityId: id,
      changes: diff({ color: row.color }, { color: next }),
      summary: summarize("UPDATE", "Variety", {
        label: row.name,
        changes: diff({ color: row.color }, { color: next }),
      }),
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
  await runInTenantTx(async (tx) => {
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
