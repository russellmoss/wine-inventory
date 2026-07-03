import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { requireTenantId } from "@/lib/tenant/context";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { validateTemplateSpec, instantiateTasksFromSpec, type TemplateSpec } from "@/lib/work-orders/template-vocabulary";
import { createWorkOrderCore, type WorkOrderResult } from "@/lib/work-orders/lifecycle";

// Versioned, clone-on-customize work-order templates (Phase 9 Unit 10). Typed-field spec (validated
// against the vocabulary — never free-form). System defaults ship seeded; a tenant clones one to
// customize (clonedFromId lineage). Editing creates a NEW immutable version; issuing snaps the current
// version onto the instance (issueWorkOrderCore records templateVersionId), so later edits never
// rewrite history.

export type TemplateResult = { templateId: string; version: number };

function assertSpec(spec: TemplateSpec) {
  const v = validateTemplateSpec(spec);
  if (!v.ok) throw new ActionError(`Invalid template: ${v.errors.join(" ")}`);
}

/** Create a template + its version 1. */
export async function createTemplateCore(
  actor: LedgerActor,
  input: { code: string; name: string; description?: string; category?: string; spec: TemplateSpec; recurringCadence?: string | null; isSystem?: boolean; clonedFromId?: string | null },
): Promise<TemplateResult> {
  if (!input.code?.trim()) throw new ActionError("A template needs a code.");
  if (!input.name?.trim()) throw new ActionError("A template needs a name.");
  assertSpec(input.spec);

  return runInTenantTx(async (tx) => {
    const tenantId = requireTenantId();
    const tpl = await tx.workOrderTemplate.create({
      data: {
        code: input.code.trim(),
        name: input.name.trim(),
        description: input.description?.trim() || null,
        category: input.category?.trim() || null,
        isSystem: input.isSystem ?? false,
        clonedFromId: input.clonedFromId ?? null,
        recurringCadence: input.recurringCadence ?? null,
        currentVersion: 1,
        versions: {
          // tenantId explicit on the nested create (the extension only injects on top-level data).
          create: { tenantId, version: 1, spec: input.spec as unknown as Prisma.InputJsonValue, createdById: actor.actorUserId, createdByEmail: actor.actorEmail },
        },
      },
      select: { id: true },
    });
    await writeAudit(tx, { ...actor, action: "CREATE", entityType: "WorkOrderTemplate", entityId: tpl.id, summary: `Created work-order template ${input.name.trim()}` });
    return { templateId: tpl.id, version: 1 };
  });
}

/** Edit a template's spec: create a NEW version (old versions stay immutable) and bump currentVersion. */
export async function updateTemplateSpecCore(actor: LedgerActor, input: { templateId: string; spec: TemplateSpec }): Promise<TemplateResult> {
  assertSpec(input.spec);
  const tpl = await prisma.workOrderTemplate.findUnique({ where: { id: input.templateId }, select: { id: true, currentVersion: true, isSystem: true } });
  if (!tpl) throw new ActionError("That template no longer exists.");
  if (tpl.isSystem) throw new ActionError("System templates can't be edited — clone it first, then customize the copy.", "CONFLICT");

  return runInTenantTx(async (tx) => {
    const nextVersion = tpl.currentVersion + 1;
    await tx.workOrderTemplateVersion.create({
      data: { templateId: tpl.id, version: nextVersion, spec: input.spec as unknown as Prisma.InputJsonValue, createdById: actor.actorUserId, createdByEmail: actor.actorEmail },
    });
    await tx.workOrderTemplate.update({ where: { id: tpl.id }, data: { currentVersion: nextVersion } });
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "WorkOrderTemplate", entityId: tpl.id, summary: `Updated template to version ${nextVersion}` });
    return { templateId: tpl.id, version: nextVersion };
  });
}

/** Clone a template (system or other) into an editable tenant copy — clone-on-customize. Independent of
 * the source: the clone gets its own version-1 snapshot of the source's current spec. */
export async function cloneTemplateCore(actor: LedgerActor, input: { templateId: string; code: string; name?: string }): Promise<TemplateResult> {
  if (!input.code?.trim()) throw new ActionError("The clone needs a new code.");
  const source = await prisma.workOrderTemplate.findUnique({
    where: { id: input.templateId },
    select: { id: true, name: true, description: true, category: true, currentVersion: true },
  });
  if (!source) throw new ActionError("That template no longer exists.");
  const currentSpec = await prisma.workOrderTemplateVersion.findFirst({
    where: { templateId: source.id, version: source.currentVersion },
    select: { spec: true },
  });
  if (!currentSpec) throw new ActionError("That template has no current version to clone.");

  return createTemplateCore(actor, {
    code: input.code,
    name: input.name?.trim() || `${source.name} (copy)`,
    description: source.description ?? undefined,
    category: source.category ?? undefined,
    spec: currentSpec.spec as unknown as TemplateSpec,
    isSystem: false,
    clonedFromId: source.id,
  });
}

/**
 * Issue a work order FROM a template: snap the current version, instantiate its tasks (manager overrides
 * merged per task), create the WO, then issue it (assigns number, reserves). Returns the WO + version.
 */
export async function createWorkOrderFromTemplateCore(
  actor: LedgerActor,
  input: {
    templateId: string;
    title?: string;
    instructions?: string;
    assigneeId?: string | null;
    assigneeEmail?: string | null;
    dueAt?: Date | null;
    scheduledFor?: Date | null;
    autoFinalize?: boolean;
    perTaskOverrides?: Record<string, unknown>[];
  },
): Promise<WorkOrderResult & { templateVersionId: string }> {
  const tpl = await prisma.workOrderTemplate.findUnique({ where: { id: input.templateId }, select: { id: true, name: true, currentVersion: true } });
  if (!tpl) throw new ActionError("That template no longer exists.");
  const version = await prisma.workOrderTemplateVersion.findFirst({
    where: { templateId: tpl.id, version: tpl.currentVersion },
    select: { id: true, spec: true },
  });
  if (!version) throw new ActionError("That template has no current version.");

  const spec = version.spec as unknown as TemplateSpec;
  const tasks = instantiateTasksFromSpec(spec, input.perTaskOverrides);
  const wo = await createWorkOrderCore(actor, {
    title: input.title?.trim() || tpl.name,
    instructions: input.instructions,
    assigneeId: input.assigneeId,
    assigneeEmail: input.assigneeEmail,
    dueAt: input.dueAt,
    scheduledFor: input.scheduledFor,
    autoFinalize: input.autoFinalize,
    templateVersionId: version.id, // snap the version onto the instance (immutable thereafter)
    tasks,
  });
  return { ...wo, templateVersionId: version.id };
}
