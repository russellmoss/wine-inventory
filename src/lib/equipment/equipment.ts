import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { runAsTenant, requireTenantId } from "@/lib/tenant/context";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { EQUIPMENT_KINDS, EQUIPMENT_STATUSES, type EquipmentKind, type EquipmentStatus, type EquipmentRow } from "@/lib/equipment/vocab";

// Plan 053 B10: the equipment registry (presses, filters, pumps…) + its advisory link to work-order tasks.
// kind/status are VALIDATED STRINGS (no Prisma enum). Referenced equipment is advisory (WORKORDER-2):
// surfaced on tasks, never blocks. Maintenance of equipment stays record-only (no ledger/cost). The
// client-safe vocab (kinds/statuses/labels/EquipmentRow) lives in ./vocab so client components can import
// it without pulling this server module.
export { EQUIPMENT_KINDS, EQUIPMENT_STATUSES, equipmentKindLabel } from "@/lib/equipment/vocab";
export type { EquipmentKind, EquipmentStatus, EquipmentRow } from "@/lib/equipment/vocab";

export function normalizeEquipmentKind(v: unknown): EquipmentKind {
  if (typeof v === "string" && (EQUIPMENT_KINDS as readonly string[]).includes(v)) return v as EquipmentKind;
  throw new ActionError(`Invalid equipment kind "${String(v)}" (allowed: ${EQUIPMENT_KINDS.join(", ")}).`);
}
export function normalizeEquipmentStatus(v: unknown): EquipmentStatus {
  if (v == null || v === "") return "available";
  if (typeof v === "string" && (EQUIPMENT_STATUSES as readonly string[]).includes(v)) return v as EquipmentStatus;
  throw new ActionError(`Invalid equipment status "${String(v)}" (allowed: ${EQUIPMENT_STATUSES.join(", ")}).`);
}

export type EquipmentInput = { name: string; kind: string; status?: string | null; locationId?: string | null; notes?: string | null };

export async function createEquipmentCore(actor: LedgerActor, input: EquipmentInput): Promise<{ id: string }> {
  if (!input.name?.trim()) throw new ActionError("Equipment needs a name.");
  const kind = normalizeEquipmentKind(input.kind);
  const status = normalizeEquipmentStatus(input.status);
  try {
    return await runInTenantTx(async (tx) => {
      const tenantId = requireTenantId();
      const row = await tx.equipmentAsset.create({
        data: { tenantId, name: input.name.trim(), kind, status, locationId: input.locationId || null, notes: input.notes?.trim() || null },
        select: { id: true },
      });
      await writeAudit(tx, { ...actor, action: "CREATE", entityType: "EquipmentAsset", entityId: row.id, summary: `Added equipment ${input.name.trim()}` });
      return { id: row.id };
    });
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") throw new ActionError(`Equipment "${input.name.trim()}" already exists.`, "CONFLICT");
    throw e;
  }
}

export async function updateEquipmentCore(actor: LedgerActor, input: { id: string } & Partial<EquipmentInput>): Promise<{ id: string }> {
  return runInTenantTx(async (tx) => {
    const existing = await tx.equipmentAsset.findUnique({ where: { id: input.id }, select: { id: true } });
    if (!existing) throw new ActionError("That equipment no longer exists.");
    await tx.equipmentAsset.update({
      where: { id: input.id },
      data: {
        ...(input.name != null ? { name: input.name.trim() } : {}),
        ...(input.kind != null ? { kind: normalizeEquipmentKind(input.kind) } : {}),
        ...(input.status != null ? { status: normalizeEquipmentStatus(input.status) } : {}),
        ...(input.locationId !== undefined ? { locationId: input.locationId || null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
      },
    });
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "EquipmentAsset", entityId: input.id, summary: `Updated equipment` });
    return { id: input.id };
  });
}

export async function archiveEquipmentCore(actor: LedgerActor, input: { id: string; active: boolean }): Promise<{ id: string }> {
  return runInTenantTx(async (tx) => {
    await tx.equipmentAsset.update({ where: { id: input.id }, data: { isActive: input.active } });
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "EquipmentAsset", entityId: input.id, summary: input.active ? "Restored equipment" : "Archived equipment" });
    return { id: input.id };
  });
}

/** Advisory: link equipment to a just-created task (append-only, dedup via the unique index). Never blocks. */
export async function attachTaskEquipmentCore(taskId: string, equipmentIds: string[]): Promise<void> {
  const ids = [...new Set(equipmentIds.filter((x) => typeof x === "string" && x))];
  if (ids.length === 0) return;
  const tenantId = requireTenantId();
  await prisma.workOrderTaskEquipment.createMany({
    data: ids.map((equipmentId) => ({ tenantId, taskId, equipmentId })),
    skipDuplicates: true,
  });
}

/** All equipment for a tenant (active first). K12-safe: tenantId explicit + runAsTenant. */
export async function listEquipment(tenantId: string, opts?: { activeOnly?: boolean }): Promise<EquipmentRow[]> {
  return runAsTenant(tenantId, async () => {
    const rows = await prisma.equipmentAsset.findMany({
      where: opts?.activeOnly ? { isActive: true } : {},
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: { id: true, name: true, kind: true, status: true, locationId: true, notes: true, isActive: true },
    });
    return rows;
  });
}
