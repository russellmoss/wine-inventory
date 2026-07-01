"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { action, getActionUser, ActionError } from "@/lib/actions";
import { writeAudit } from "@/lib/audit";
import { cleanInputName, normalizeInputKey } from "@/lib/fieldnotes/sanitize";
import { INPUT_TYPES, type InputType } from "@/lib/fieldnotes/types";

const PATH = "/vineyards/field-notes";

export type FieldInputDTO = { id: string; type: InputType; name: string };

export type FieldInputLists = { sprays: FieldInputDTO[]; fertilizers: FieldInputDTO[] };

function assertType(raw: unknown): InputType {
  if (typeof raw === "string" && (INPUT_TYPES as readonly string[]).includes(raw)) {
    return raw as InputType;
  }
  throw new ActionError("Input type must be SPRAY or FERTILIZER.");
}

/** Read the active master lists, grouped by type, sorted by display name. */
export async function listFieldInputs(): Promise<FieldInputLists> {
  await getActionUser(); // any ready user
  const rows = await prisma.fieldInput.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, type: true, name: true },
  });
  const lists: FieldInputLists = { sprays: [], fertilizers: [] };
  for (const r of rows) {
    const dto: FieldInputDTO = { id: r.id, type: r.type as InputType, name: r.name };
    if (dto.type === "SPRAY") lists.sprays.push(dto);
    else lists.fertilizers.push(dto);
  }
  return lists;
}

/**
 * Add a custom input on the fly. Sanitizes to a display name + dedup key, then
 * upserts on [type, normalizedKey] so "NEEM OIL" / "NEEM-OIL" merge to one row.
 * Audits only on first creation; returns the canonical row either way.
 */
export const addFieldInput = action(
  async ({ actor }, rawType: unknown, rawName: unknown): Promise<FieldInputDTO> => {
    const type = assertType(rawType);
    let name: string;
    let normalizedKey: string;
    try {
      name = cleanInputName(rawName);
      normalizedKey = normalizeInputKey(rawName);
    } catch {
      throw new ActionError("Enter a valid name (letters or numbers).");
    }

    const existing = await prisma.fieldInput.findFirst({
      where: { type, normalizedKey },
      select: { id: true, type: true, name: true, isActive: true },
    });

    if (existing) {
      // Reactivate a previously deactivated entry, but don't re-audit a dedup hit.
      if (!existing.isActive) {
        await prisma.fieldInput.update({ where: { id: existing.id }, data: { isActive: true } });
      }
      revalidatePath(PATH);
      return { id: existing.id, type: existing.type as InputType, name: existing.name };
    }

    const created = await runInTenantTx(async (tx) => {
      const row = await tx.fieldInput.create({
        data: { type, name, normalizedKey, isActive: true },
        select: { id: true, type: true, name: true },
      });
      await writeAudit(tx, {
        ...actor,
        action: "FIELD_INPUT_CREATED",
        entityType: "FieldInput",
        entityId: row.id,
        summary: `Added ${type.toLowerCase()} "${name}"`,
      });
      return row;
    });
    revalidatePath(PATH);
    return { id: created.id, type: created.type as InputType, name: created.name };
  },
);
