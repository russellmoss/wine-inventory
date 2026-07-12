import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { runAsTenant, requireTenantId } from "@/lib/tenant/context";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { TASK_VOCABULARY } from "@/lib/work-orders/template-vocabulary";
import { validateCustomLogFields, normalizeCustomLogFields, customLogToTaskDef, type CustomLogFieldSpec } from "@/lib/work-orders/custom-log-fields";
import { assertUserTaskTypeSafe } from "@/lib/work-orders/vocabulary-resolver";
import type { Prisma } from "@prisma/client";

// Plan 053 C11: CRUD + reader for tenant-authored "Custom Logs" (record-only NOTE task types). Every write
// validates the field spec and re-asserts the record-only safety line before persist. `code` is derived
// from the label and can never collide with a built-in TASK_VOCABULARY key (else the resolver would skip it).

export type CustomLogInput = { label: string; fields: unknown };
export type CustomLogRow = { id: string; code: string; label: string; fields: CustomLogFieldSpec[]; archivedAt: string | null };

function slugCode(label: string, attempt: number): string {
  const base = (label || "log").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 28) || "CUSTOM_LOG";
  const suffix = attempt > 0 ? `_${Math.random().toString(36).slice(2, 5).toUpperCase()}` : "";
  return `${base}${suffix}`;
}

function validateOrThrow(fields: unknown): CustomLogFieldSpec[] {
  const v = validateCustomLogFields(fields);
  if (!v.ok) throw new ActionError(`Invalid custom log: ${v.errors.join(" ")}`);
  return normalizeCustomLogFields(fields);
}

export async function createUserTaskTypeCore(actor: LedgerActor, input: CustomLogInput): Promise<{ id: string; code: string }> {
  if (!input.label?.trim()) throw new ActionError("A custom log needs a name.");
  const fields = validateOrThrow(input.fields);
  // Re-assert the safety line on the built def (always NOTE by construction).
  assertUserTaskTypeSafe(customLogToTaskDef({ label: input.label, fieldsJson: fields }));

  for (let attempt = 0; ; attempt++) {
    const code = slugCode(input.label, attempt);
    if (TASK_VOCABULARY[code]) continue; // never collide with a governed built-in key
    try {
      return await runInTenantTx(async (tx) => {
        const tenantId = requireTenantId();
        const row = await tx.workOrderTaskType.create({
          data: { tenantId, code, label: input.label.trim(), fieldsJson: fields as unknown as Prisma.InputJsonValue },
          select: { id: true, code: true },
        });
        await writeAudit(tx, { ...actor, action: "CREATE", entityType: "WorkOrderTaskType", entityId: row.id, summary: `Created custom log ${input.label.trim()}` });
        return { id: row.id, code: row.code };
      });
    } catch (e) {
      if (e && typeof e === "object" && (e as { code?: string }).code === "P2002" && attempt < 5) continue;
      throw e;
    }
  }
}

export async function updateUserTaskTypeCore(actor: LedgerActor, input: { id: string; label?: string; fields?: unknown }): Promise<{ id: string }> {
  const fields = input.fields !== undefined ? validateOrThrow(input.fields) : undefined;
  if (fields) assertUserTaskTypeSafe(customLogToTaskDef({ label: input.label ?? "log", fieldsJson: fields }));
  return runInTenantTx(async (tx) => {
    const existing = await tx.workOrderTaskType.findUnique({ where: { id: input.id }, select: { id: true } });
    if (!existing) throw new ActionError("That custom log no longer exists.");
    await tx.workOrderTaskType.update({
      where: { id: input.id },
      data: { ...(input.label != null ? { label: input.label.trim() } : {}), ...(fields ? { fieldsJson: fields as unknown as Prisma.InputJsonValue } : {}) },
    });
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "WorkOrderTaskType", entityId: input.id, summary: "Updated custom log" });
    return { id: input.id };
  });
}

export async function archiveUserTaskTypeCore(actor: LedgerActor, input: { id: string; active: boolean }): Promise<{ id: string }> {
  return runInTenantTx(async (tx) => {
    await tx.workOrderTaskType.update({ where: { id: input.id }, data: { archivedAt: input.active ? null : new Date() } });
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "WorkOrderTaskType", entityId: input.id, summary: input.active ? "Restored custom log" : "Archived custom log" });
    return { id: input.id };
  });
}

/** All custom logs for a tenant (active first). K12-safe. */
export async function listUserTaskTypes(tenantId: string, opts?: { activeOnly?: boolean }): Promise<CustomLogRow[]> {
  return runAsTenant(tenantId, async () => {
    const rows = await prisma.workOrderTaskType.findMany({
      where: opts?.activeOnly ? { archivedAt: null } : {},
      orderBy: [{ archivedAt: "asc" }, { label: "asc" }],
      select: { id: true, code: true, label: true, fieldsJson: true, archivedAt: true },
    });
    return rows.map((r) => ({ id: r.id, code: r.code, label: r.label, fields: normalizeCustomLogFields(r.fieldsJson), archivedAt: r.archivedAt ? r.archivedAt.toISOString() : null }));
  });
}
