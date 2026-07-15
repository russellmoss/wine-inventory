import "server-only";

import {
  FeedbackAutomationSource,
  FeedbackItemStatus,
  type FeedbackSeverity,
  type FeedbackTriageClass,
} from "@prisma/client";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";

export type UpdateFeedbackItemCoreInput = {
  tenantId: string;
  sourceType: FeedbackAutomationSource;
  id: string;
  severity: FeedbackSeverity | null;
  triageClass: FeedbackTriageClass | null;
  status?: string;
  developerNotes?: string;
  expectedNotesVersion?: number;
};

export type DeveloperFeedbackActor = { id: string; email: string };

/** Tenant-scoped mutation core; callers must authenticate the developer first. */
export async function updateFeedbackItemCore(
  actor: DeveloperFeedbackActor,
  input: UpdateFeedbackItemCoreInput,
): Promise<void> {
  if (
    typeof input.tenantId !== "string" ||
    !input.tenantId ||
    input.tenantId.length > 160 ||
    typeof input.id !== "string" ||
    !input.id ||
    input.id.length > 191 ||
    !/^[A-Za-z0-9._:-]+$/.test(input.id) ||
    typeof actor.id !== "string" ||
    !actor.id ||
    actor.id.length > 191 ||
    typeof actor.email !== "string" ||
    !actor.email ||
    actor.email.length > 320 ||
    (input.sourceType !== FeedbackAutomationSource.ASSISTANT_FEEDBACK &&
      input.sourceType !== FeedbackAutomationSource.FEEDBACK_TICKET)
  ) {
    throw new ActionError("Invalid feedback item update.", "VALIDATION");
  }
  const notes = input.developerNotes?.slice(0, 5_000);
  if (
    notes !== undefined &&
    (!Number.isInteger(input.expectedNotesVersion) || input.expectedNotesVersion! < 1)
  ) {
    throw new ActionError("Reload this feedback item before editing its notes.", "CONFLICT");
  }

  await runAsTenant(input.tenantId, () =>
    runInTenantTx(async (tx) => {
      if (input.sourceType === FeedbackAutomationSource.ASSISTANT_FEEDBACK) {
        const updated = await tx.assistantFeedback.updateMany({
          where: {
            tenantId: input.tenantId,
            id: input.id,
            ...(notes !== undefined
              ? { developerNotesVersion: input.expectedNotesVersion }
              : {}),
          },
          data: {
            severity: input.severity,
            triageClass: input.triageClass,
            developerNotes: notes,
            ...(notes !== undefined
              ? { developerNotesVersion: { increment: 1 } }
              : {}),
            status:
              input.status && input.status !== FeedbackItemStatus.IN_PROGRESS
                ? input.status
                : undefined,
            resolvedAt: input.status === FeedbackItemStatus.RESOLVED ? new Date() : undefined,
            resolvedByUserId:
              input.status === FeedbackItemStatus.RESOLVED ? actor.id : undefined,
          },
        });
        if (updated.count !== 1) {
          throw new ActionError(
            "This item changed while you were editing. Reload and try again.",
            "CONFLICT",
          );
        }
      } else {
        const status = input.status ? (input.status as FeedbackItemStatus) : undefined;
        const updated = await tx.feedbackTicket.updateMany({
          where: {
            tenantId: input.tenantId,
            id: input.id,
            ...(notes !== undefined
              ? { developerNotesVersion: input.expectedNotesVersion }
              : {}),
          },
          data: {
            severity: input.severity,
            triageClass: input.triageClass,
            developerNotes: notes,
            ...(notes !== undefined
              ? { developerNotesVersion: { increment: 1 } }
              : {}),
            status,
            resolvedAt: status === FeedbackItemStatus.RESOLVED ? new Date() : undefined,
            resolvedByUserId:
              status === FeedbackItemStatus.RESOLVED ? actor.id : undefined,
          },
        });
        if (updated.count !== 1) {
          throw new ActionError(
            "This item changed while you were editing. Reload and try again.",
            "CONFLICT",
          );
        }
      }
      await writeAudit(tx, {
        actorUserId: actor.id,
        actorEmail: actor.email,
        tenantId: input.tenantId,
        action: "UPDATE",
        entityType: input.sourceType,
        entityId: input.id,
        summary: "Developer updated feedback item",
      });
    }),
  );
}
