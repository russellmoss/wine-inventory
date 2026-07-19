"use server";

import { revalidatePath } from "next/cache";
import { adminAction } from "@/lib/actions";
import { runInTenantTx } from "@/lib/tenant/tx";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";

/**
 * Plan 079 Unit 11 — toggle whether a GLOBAL knowledge source feeds THIS winery's assistant. Writes the
 * tenant-scoped KnowledgeSourceSubscription (RLS); absent a row, retrieval falls back to the source's
 * defaultEnabled (see resolveEnabledSources). Admin-only; audited; revalidates settings.
 */
export const setKnowledgeSourceEnabled = adminAction(
  async ({ actor }, sourceId: string, enabled: boolean): Promise<{ sourceId: string; enabled: boolean }> => {
    // The source id is a GLOBAL id from the settings list; confirm it's a real active source before we
    // mint a subscription row for it (a bogus id would otherwise create a dangling subscription).
    const source = await prisma.knowledgeSource.findFirst({
      where: { id: sourceId, active: true },
      select: { id: true, publisher: true },
    });
    if (!source) throw new ActionError("That knowledge source doesn't exist.");

    await runInTenantTx(async (tx) => {
      await tx.knowledgeSourceSubscription.upsert({
        where: { tenantId_sourceId: { tenantId: actor.tenantId, sourceId } },
        update: { enabled },
        create: { sourceId, enabled }, // tenantId auto-injected by the tenant extension
      });
      await writeAudit(tx, {
        ...actor,
        action: "UPDATE",
        entityType: "KnowledgeSourceSubscription",
        entityId: sourceId,
        summary: `Assistant knowledge source "${source.publisher}" ${enabled ? "enabled" : "disabled"}`,
      });
    });

    revalidatePath("/settings");
    return { sourceId, enabled };
  },
);
