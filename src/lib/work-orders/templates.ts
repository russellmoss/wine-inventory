import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { requireTenantId } from "@/lib/tenant/context";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { validateTemplateSpec, canonicalizeTemplateSpec, instantiateTasksFromSpec, instantiateTaskBuilds, type TemplateSpec, type ResolvedTaskVocabulary } from "@/lib/work-orders/template-vocabulary";
import { resolveTaskVocabulary } from "@/lib/work-orders/vocabulary-resolver";
import { createWorkOrderCore, type WorkOrderResult } from "@/lib/work-orders/lifecycle";

// Versioned, clone-on-customize work-order templates (Phase 9 Unit 10). Typed-field spec (validated
// against the vocabulary — never free-form). System defaults ship seeded; a tenant clones one to
// customize (clonedFromId lineage). Editing creates a NEW immutable version; issuing snaps the current
// version onto the instance (issueWorkOrderCore records templateVersionId), so later edits never
// rewrite history.

export type TemplateResult = { templateId: string; version: number };

/** Validate the (untrusted) client spec, then canonicalize to ONLY the known shape before persisting
 * (Codex/council: unknown keys are stripped server-side, never trusted). Throws on invalid. */
function validateAndCanonicalize(spec: TemplateSpec, vocab: ResolvedTaskVocabulary): TemplateSpec {
  const v = validateTemplateSpec(spec, vocab);
  if (!v.ok) throw new ActionError(`Invalid template: ${v.errors.join(" ")}`);
  return canonicalizeTemplateSpec(spec, vocab);
}

/** Derive a per-tenant stable code from the name: an uppercase slug + a short suffix, so two templates
 * with the same name never collide on @@unique([tenantId, code]). The suffix varies per attempt (see
 * the bounded retry in createTemplateCore) so a rare collision resolves on the next try. */
function generateTemplateCode(name: string, attempt: number): string {
  const slug = (name || "template").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "TEMPLATE";
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${slug}-${suffix}${attempt > 0 ? `-${attempt}` : ""}`;
}

/** Create a template + its version 1. `code` is auto-generated server-side when absent (council: end
 * users never type it) — bounded retry regenerates a fresh candidate on the @@unique collision, so
 * concurrent creates of the same name can't livelock (Codex CRITICAL). */
export async function createTemplateCore(
  actor: LedgerActor,
  input: { code?: string; name: string; description?: string; category?: string; spec: TemplateSpec; recurringCadence?: string | null; isSystem?: boolean; clonedFromId?: string | null },
): Promise<TemplateResult> {
  if (!input.name?.trim()) throw new ActionError("A template needs a name.");
  const spec = validateAndCanonicalize(input.spec, await resolveTaskVocabulary());
  const explicitCode = input.code?.trim();

  for (let attempt = 0; ; attempt++) {
    const code = explicitCode || generateTemplateCode(input.name, attempt);
    try {
      return await runInTenantTx(async (tx) => {
        const tenantId = requireTenantId();
        const tpl = await tx.workOrderTemplate.create({
          data: {
            code,
            name: input.name.trim(),
            description: input.description?.trim() || null,
            category: input.category?.trim() || null,
            isSystem: input.isSystem ?? false,
            clonedFromId: input.clonedFromId ?? null,
            recurringCadence: input.recurringCadence ?? null,
            currentVersion: 1,
            versions: {
              // tenantId explicit on the nested create (the extension only injects on top-level data).
              create: { tenantId, version: 1, spec: spec as unknown as Prisma.InputJsonValue, createdById: actor.actorUserId, createdByEmail: actor.actorEmail },
            },
          },
          select: { id: true },
        });
        await writeAudit(tx, { ...actor, action: "CREATE", entityType: "WorkOrderTemplate", entityId: tpl.id, summary: `Created work-order template ${input.name.trim()}` });
        return { templateId: tpl.id, version: 1 };
      });
    } catch (e) {
      // Auto-generated code collided on @@unique([tenantId, code]) → retry with a fresh candidate (bounded).
      // An EXPLICIT code that collides is a real conflict the caller must fix — surface it.
      const isCodeCollision = e && typeof e === "object" && (e as { code?: string }).code === "P2002";
      if (isCodeCollision && explicitCode) throw new ActionError(`A template with code "${explicitCode}" already exists.`, "CONFLICT");
      if (isCodeCollision && attempt < 5) continue;
      throw e;
    }
  }
}

/** Edit a template's spec: create a NEW version (old versions stay immutable) and bump currentVersion.
 * The currentVersion read + the version+1 insert happen in ONE tx (Codex: no stale-read window). A
 * concurrent edit loses the @@unique([tenantId, templateId, version]) race → P2002, surfaced as a
 * friendly "reload" conflict rather than a raw error (council). */
export async function updateTemplateSpecCore(actor: LedgerActor, input: { templateId: string; spec: TemplateSpec }): Promise<TemplateResult> {
  const spec = validateAndCanonicalize(input.spec, await resolveTaskVocabulary());
  try {
    return await runInTenantTx(async (tx) => {
      const tpl = await tx.workOrderTemplate.findUnique({ where: { id: input.templateId }, select: { id: true, currentVersion: true, isSystem: true } });
      if (!tpl) throw new ActionError("That template no longer exists.");
      if (tpl.isSystem) throw new ActionError("System templates can't be edited — clone it first, then customize the copy.", "CONFLICT");
      const nextVersion = tpl.currentVersion + 1;
      await tx.workOrderTemplateVersion.create({
        data: { templateId: tpl.id, version: nextVersion, spec: spec as unknown as Prisma.InputJsonValue, createdById: actor.actorUserId, createdByEmail: actor.actorEmail },
      });
      await tx.workOrderTemplate.update({ where: { id: tpl.id }, data: { currentVersion: nextVersion } });
      await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "WorkOrderTemplate", entityId: tpl.id, summary: `Updated template to version ${nextVersion}` });
      return { templateId: tpl.id, version: nextVersion };
    });
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
      throw new ActionError("This template changed since you opened it — reload and reapply your edits.", "CONFLICT");
    }
    throw e;
  }
}

/** Archive (soft-delete) a custom template — it drops out of the pickers + list. System templates can't
 * be archived (clone them instead). Idempotent-ish: archiving an archived template just re-stamps it. */
export async function archiveTemplateCore(actor: LedgerActor, input: { templateId: string }): Promise<{ templateId: string }> {
  return runInTenantTx(async (tx) => {
    const tpl = await tx.workOrderTemplate.findUnique({ where: { id: input.templateId }, select: { id: true, name: true, isSystem: true } });
    if (!tpl) throw new ActionError("That template no longer exists.");
    if (tpl.isSystem) throw new ActionError("System templates can't be archived — they ship with the app.", "CONFLICT");
    await tx.workOrderTemplate.update({ where: { id: tpl.id }, data: { archivedAt: new Date() } });
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "WorkOrderTemplate", entityId: tpl.id, summary: `Archived template ${tpl.name}` });
    return { templateId: tpl.id };
  });
}

/** Restore an archived template. */
export async function unarchiveTemplateCore(actor: LedgerActor, input: { templateId: string }): Promise<{ templateId: string }> {
  return runInTenantTx(async (tx) => {
    const tpl = await tx.workOrderTemplate.findUnique({ where: { id: input.templateId }, select: { id: true, name: true } });
    if (!tpl) throw new ActionError("That template no longer exists.");
    await tx.workOrderTemplate.update({ where: { id: tpl.id }, data: { archivedAt: null } });
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "WorkOrderTemplate", entityId: tpl.id, summary: `Restored template ${tpl.name}` });
    return { templateId: tpl.id };
  });
}

/** Clone a template (system or other) into an editable tenant copy — clone-on-customize. Independent of
 * the source: the clone gets its own version-1 snapshot of the source's current spec. */
export async function cloneTemplateCore(actor: LedgerActor, input: { templateId: string; code?: string; name?: string }): Promise<TemplateResult> {
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
    // Explicit flat task list (new-WO form: multi-vessel fan-out + appended additions). Wins over
    // perTaskOverrides when present. The template version is still snapped for lineage.
    taskBuilds?: { taskType: string; title?: string; values: Record<string, unknown> }[];
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
  const vocab = await resolveTaskVocabulary();
  const tasks = input.taskBuilds && input.taskBuilds.length > 0
    ? instantiateTaskBuilds(input.taskBuilds, vocab)
    : instantiateTasksFromSpec(spec, vocab, input.perTaskOverrides);
  if (tasks.length === 0) throw new ActionError("A work order needs at least one task.");
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
