import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { runAsTenant, requireTenantId } from "@/lib/tenant/context";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { type EquipmentRow } from "@/lib/equipment/vocab";
import { normalizeEquipmentKind, normalizeEquipmentStatus, createEquipmentAssetCore } from "@/lib/equipment/equipment-core";

// Plan 053 B10: the equipment registry (presses, filters, pumps…) + its advisory link to work-order tasks.
// kind/status are VALIDATED STRINGS (no Prisma enum). Referenced equipment is advisory (WORKORDER-2):
// surfaced on tasks, never blocks. Maintenance of equipment stays record-only (no ledger/cost). The
// client-safe vocab (kinds/statuses/labels/EquipmentRow) lives in ./vocab so client components can import
// it without pulling this server module.
export { EQUIPMENT_KINDS, EQUIPMENT_STATUSES, equipmentKindLabel } from "@/lib/equipment/vocab";
export type { EquipmentKind, EquipmentStatus, EquipmentRow } from "@/lib/equipment/vocab";

// Plan 080 U3: kind/status normalization + the (now costed) creation path live in equipment-core.ts so there
// is ONE way to mint an asset. Re-exported here so every existing call site keeps importing from equipment.ts.
export { normalizeEquipmentKind, normalizeEquipmentStatus, createEquipmentAssetCore, createEquipmentAssetsFromInvoiceCore } from "@/lib/equipment/equipment-core";
export type { CreateEquipmentAssetInput, EquipmentCostInput } from "@/lib/equipment/equipment-core";

export type EquipmentInput = { name: string; kind: string; status?: string | null; locationId?: string | null; notes?: string | null };

/**
 * Create an UNCOSTED equipment asset (the plain registry path). Thin delegate to `createEquipmentAssetCore`
 * so the uncosted and costed paths can never drift; pass cost fields to that core directly to capitalize one.
 */
export async function createEquipmentCore(actor: LedgerActor, input: EquipmentInput): Promise<{ id: string }> {
  return createEquipmentAssetCore(actor, input);
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

/** Plan 071: set a task's advisory equipment links to EXACTLY `equipmentIds` — detach the ones no longer
 * chosen, attach the new ones. Used by the WO edit path (the create path only ever appends). Advisory,
 * never blocks. */
export async function setTaskEquipmentCore(taskId: string, equipmentIds: string[]): Promise<void> {
  const ids = [...new Set(equipmentIds.filter((x) => typeof x === "string" && x))];
  requireTenantId(); // tenant scoping enforced by the extended client
  await prisma.workOrderTaskEquipment.deleteMany({
    where: { taskId, ...(ids.length ? { equipmentId: { notIn: ids } } : {}) },
  });
  if (ids.length) await attachTaskEquipmentCore(taskId, ids);
}

/** Plan 055 U3: fuzzy-match ACTIVE equipment by name for the assistant's EQUIPMENT_SERVICE authoring.
 * Exact (normalized) match wins; otherwise a two-directional substring match. Returns the candidates so the
 * tool layer can pin a unique hit, show a choice picker for several, or report none — it never invents an
 * id. K12-safe (tenantId explicit). A `#<id>` ref pins that exact asset (survives a choice-token resume). */
export async function findEquipmentByName(tenantId: string, ref: string): Promise<EquipmentRow[]> {
  const all = await listEquipment(tenantId, { activeOnly: true });
  const raw = ref.trim();
  const idToken = raw.startsWith("#") ? raw.slice(1).replace(/-/g, "").toLowerCase() : null;
  if (idToken) {
    const pinned = all.find((e) => e.id.replace(/-/g, "").toLowerCase() === idToken);
    return pinned ? [pinned] : [];
  }
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const needle = norm(raw);
  if (!needle) return [];
  const exact = all.filter((e) => norm(e.name) === needle);
  if (exact.length) return exact;
  return all.filter((e) => {
    const h = norm(e.name);
    return h && (h.includes(needle) || needle.includes(h));
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
