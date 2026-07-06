"use server";

import { randomUUID } from "node:crypto";
import { action, adminAction } from "@/lib/actions";
import { runInTenantTx } from "@/lib/tenant/tx";
import { writeAudit } from "@/lib/audit";
import { renameLotCore, setDisplayNameCore, swapLotCodes, CodeCollisionError } from "@/lib/lot/rename";
import { searchLotsByIdentifier, describeLotIdentity, type LotSearchMatch, type LotIdentitySummary } from "@/lib/lot/identify";
import { assertValidTemplateSpec, type NamingTemplateSpec } from "@/lib/lot/naming-template";
import { revalidatePath } from "next/cache";

// Phase 1 (identity presentation) — server actions wrapping the cores. Rename/displayName are normal
// tenant-user actions (action(), ux-principle 1); naming-template authoring is admin-gated
// (adminAction) like WO templates. commandId is generated server-side (single-use idempotency).

export type RenameResult =
  | { ok: true; code: string }
  | { ok: false; collision: { attempted: string; suggestion: string } };

/** Rename a lot's code. Returns a structured collision OFFER (never silently applies) — the caller
 *  presents the suggestion and re-invokes with acceptSuggestion. */
export const renameLotAction = action(
  async ({ actor }, input: { lotId: string; newCode: string; acceptSuggestion?: boolean }): Promise<RenameResult> => {
    try {
      const r = await renameLotCore({
        lotId: input.lotId,
        newCode: input.newCode,
        actor: { actorUserId: actor.actorUserId, actorEmail: actor.actorEmail },
        commandId: randomUUID(),
        acceptSuggestion: input.acceptSuggestion,
      });
      revalidatePath(`/lots/${input.lotId}`);
      return { ok: true, code: r.code };
    } catch (e) {
      if (e instanceof CodeCollisionError) {
        return { ok: false, collision: { attempted: e.attemptedCode, suggestion: e.suggestion } };
      }
      throw e;
    }
  },
);

export const setLotDisplayNameAction = action(
  async ({ actor }, input: { lotId: string; displayName: string | null }) => {
    const r = await setDisplayNameCore({
      lotId: input.lotId,
      displayName: input.displayName,
      actor: { actorUserId: actor.actorUserId, actorEmail: actor.actorEmail },
      commandId: randomUUID(),
    });
    revalidatePath(`/lots/${input.lotId}`);
    return { displayName: r.displayName };
  },
);

export const swapLotCodesAction = action(async ({ actor }, input: { lotIdA: string; lotIdB: string }) => {
  const r = await swapLotCodes({
    lotIdA: input.lotIdA,
    lotIdB: input.lotIdB,
    actor: { actorUserId: actor.actorUserId, actorEmail: actor.actorEmail },
    commandId: randomUUID(),
  });
  revalidatePath(`/lots/${input.lotIdA}`);
  revalidatePath(`/lots/${input.lotIdB}`);
  return r;
});

/** Cross-identifier search for a lot picker/search box (reads; resolves to id via the resolver). */
export const searchLotsAction = action(
  async (_ctx, input: { query: string; limit?: number }): Promise<LotSearchMatch[]> => {
    return searchLotsByIdentifier(input.query, { limit: input.limit });
  },
);

/** A lot's identity summary (current code + displayName + aliases) for the "also-known-as" affordance. */
export const describeLotIdentityAction = action(
  async (_ctx, input: { lotId: string }): Promise<LotIdentitySummary | null> => {
    return describeLotIdentity(input.lotId);
  },
);

// ─────────────────────── naming-template authoring (admin) ───────────────────────

/** Create a custom naming template (+ version 1). Validates the blend-origin constraint at authoring. */
export const createNamingTemplateAction = adminAction(
  async ({ actor }, input: { code: string; name: string; spec: NamingTemplateSpec }) => {
    assertValidTemplateSpec(input.spec);
    const result = await runInTenantTx(async (tx) => {
      const tpl = await tx.namingTemplate.create({
        data: { code: input.code, name: input.name, isSystem: false, isDefault: false, currentVersion: 1 },
      });
      await tx.namingTemplateVersion.create({
        data: {
          templateId: tpl.id,
          version: 1,
          spec: input.spec as object,
          createdById: actor.actorUserId,
          createdByEmail: actor.actorEmail,
        },
      });
      await writeAudit(tx, {
        actorUserId: actor.actorUserId,
        actorEmail: actor.actorEmail,
        action: "CREATE",
        entityType: "NamingTemplate",
        entityId: tpl.id,
        summary: `Created naming template "${input.name}"`,
      });
      return tpl;
    });
    revalidatePath("/settings");
    return { id: result.id };
  },
);

/** Edit a template's spec: insert a new immutable version + bump currentVersion (clone-on-customize
 *  guard — a system template must be cloned first). */
export const updateNamingTemplateSpecAction = adminAction(
  async ({ actor }, input: { templateId: string; spec: NamingTemplateSpec }) => {
    assertValidTemplateSpec(input.spec);
    const result = await runInTenantTx(async (tx) => {
      const tpl = await tx.namingTemplate.findUniqueOrThrow({
        where: { id: input.templateId },
        select: { id: true, isSystem: true, currentVersion: true },
      });
      if (tpl.isSystem) throw new Error("The built-in default template is read-only — clone it first.");
      const nextVersion = tpl.currentVersion + 1;
      await tx.namingTemplateVersion.create({
        data: {
          templateId: tpl.id,
          version: nextVersion,
          spec: input.spec as object,
          createdById: actor.actorUserId,
          createdByEmail: actor.actorEmail,
        },
      });
      await tx.namingTemplate.update({ where: { id: tpl.id }, data: { currentVersion: nextVersion } });
      await writeAudit(tx, {
        actorUserId: actor.actorUserId,
        actorEmail: actor.actorEmail,
        action: "UPDATE",
        entityType: "NamingTemplate",
        entityId: tpl.id,
        summary: `Updated naming template to v${nextVersion}`,
      });
      return { id: tpl.id, version: nextVersion };
    });
    revalidatePath("/settings");
    return result;
  },
);

/** Make a template the tenant's active default (clears the prior default in the same tx — single
 *  active default is also a DB partial unique). */
export const setDefaultNamingTemplateAction = adminAction(async ({ actor }, input: { templateId: string }) => {
  await runInTenantTx(async (tx) => {
    await tx.namingTemplate.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    await tx.namingTemplate.update({ where: { id: input.templateId }, data: { isDefault: true, archivedAt: null } });
    await writeAudit(tx, {
      actorUserId: actor.actorUserId,
      actorEmail: actor.actorEmail,
      action: "UPDATE",
      entityType: "NamingTemplate",
      entityId: input.templateId,
      summary: `Set naming template as the tenant default`,
    });
  });
  revalidatePath("/settings");
  return { ok: true };
});
