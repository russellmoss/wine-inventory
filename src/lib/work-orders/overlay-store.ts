import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { runAsTenant, requireTenantId } from "@/lib/tenant/context";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import type { Prisma } from "@prisma/client";
import { TASK_VOCABULARY } from "@/lib/work-orders/template-vocabulary";
import { assertOverlaySafe } from "@/lib/work-orders/overlays";

// Plan 053 C12: CRUD + reader for per-tenant built-in field overlays. Every write validates that the base
// type is a real built-in and that the hidden fields are on the HIDEABLE allowlist (assertOverlaySafe).

export type OverlayInput = { baseTaskType: string; hiddenFields?: string[]; relabels?: Record<string, string>; fieldOrder?: string[] };
export type OverlayStoreRow = { id: string; baseTaskType: string; hiddenFields: string[]; relabels: Record<string, string>; fieldOrder: string[]; archivedAt: string | null };

/** Create or update a tenant's overlay for a built-in task type (one per base type). */
export async function saveOverlayCore(actor: LedgerActor, input: OverlayInput): Promise<{ id: string }> {
  const base = TASK_VOCABULARY[input.baseTaskType];
  if (!base || base.isUserDefined) throw new ActionError(`"${input.baseTaskType}" is not a built-in task type.`);
  const hiddenFields = (input.hiddenFields ?? []).filter((f) => typeof f === "string");
  assertOverlaySafe(input.baseTaskType, hiddenFields); // reject hiding a field a governed core needs
  const relabels = (input.relabels ?? {}) as Prisma.InputJsonValue;
  const fieldOrder = (input.fieldOrder ?? []).filter((f) => typeof f === "string");
  return runInTenantTx(async (tx) => {
    const tenantId = requireTenantId();
    const row = await tx.workOrderTaskTypeOverlay.upsert({
      where: { tenantId_baseTaskType: { tenantId, baseTaskType: input.baseTaskType } },
      create: { tenantId, baseTaskType: input.baseTaskType, hiddenFields, relabels, fieldOrder, archivedAt: null },
      update: { hiddenFields, relabels, fieldOrder, archivedAt: null },
      select: { id: true },
    });
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "WorkOrderTaskTypeOverlay", entityId: row.id, summary: `Customized fields on ${input.baseTaskType}` });
    return { id: row.id };
  });
}

/** Remove a tenant's overlay (restores the built-in's default fields). */
export async function clearOverlayCore(actor: LedgerActor, input: { baseTaskType: string }): Promise<{ ok: boolean }> {
  return runInTenantTx(async (tx) => {
    const tenantId = requireTenantId();
    await tx.workOrderTaskTypeOverlay.deleteMany({ where: { tenantId, baseTaskType: input.baseTaskType } });
    await writeAudit(tx, { ...actor, action: "DELETE", entityType: "WorkOrderTaskTypeOverlay", entityId: input.baseTaskType, summary: `Reset fields on ${input.baseTaskType}` });
    return { ok: true };
  });
}

/** All overlays for a tenant. K12-safe. */
export async function listOverlays(tenantId: string): Promise<OverlayStoreRow[]> {
  return runAsTenant(tenantId, async () => {
    const rows = await prisma.workOrderTaskTypeOverlay.findMany({
      where: { archivedAt: null },
      select: { id: true, baseTaskType: true, hiddenFields: true, relabels: true, fieldOrder: true, archivedAt: true },
    });
    return rows.map((r) => ({ id: r.id, baseTaskType: r.baseTaskType, hiddenFields: r.hiddenFields, relabels: (r.relabels ?? {}) as Record<string, string>, fieldOrder: r.fieldOrder, archivedAt: r.archivedAt ? r.archivedAt.toISOString() : null }));
  });
}
