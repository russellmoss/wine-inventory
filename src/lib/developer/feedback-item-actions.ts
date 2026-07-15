import "server-only";

import {
  FeedbackAutomationStatus,
  FeedbackAutomationSource,
  FeedbackItemStatus,
  Prisma,
  type FeedbackSeverity,
  type FeedbackTriageClass,
} from "@prisma/client";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import {
  parseDeveloperOutcome,
  prependDeveloperOutcomeNote,
  type DeveloperCloseStatus,
} from "@/lib/developer/feedback-outcome";
import { assertFeedbackStatusForSource } from "@/lib/developer/feedback-item-input";
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { withWriteRetry } from "@/lib/db/write-retry";

export type UpdateFeedbackItemCoreInput = {
  tenantId: string;
  sourceType: FeedbackAutomationSource;
  id: string;
  severity: FeedbackSeverity | null;
  triageClass: FeedbackTriageClass | null;
  status?: FeedbackItemStatus;
  developerNotes?: string;
  expectedNotesVersion: number;
};

export type DeveloperFeedbackActor = { id: string; email: string };

function validActorAndSource(
  actor: DeveloperFeedbackActor,
  input: { tenantId: string; sourceType: FeedbackAutomationSource; id: string },
): boolean {
  return (
    typeof input.tenantId === "string" &&
    Boolean(input.tenantId) &&
    input.tenantId.length <= 160 &&
    typeof input.id === "string" &&
    Boolean(input.id) &&
    input.id.length <= 191 &&
    /^[A-Za-z0-9._:-]+$/.test(input.id) &&
    typeof actor.id === "string" &&
    Boolean(actor.id) &&
    actor.id.length <= 191 &&
    typeof actor.email === "string" &&
    Boolean(actor.email) &&
    actor.email.length <= 320 &&
    (input.sourceType === FeedbackAutomationSource.ASSISTANT_FEEDBACK ||
      input.sourceType === FeedbackAutomationSource.FEEDBACK_TICKET)
  );
}

/** Tenant-scoped mutation core; callers must authenticate the developer first. */
export async function updateFeedbackItemCore(
  actor: DeveloperFeedbackActor,
  input: UpdateFeedbackItemCoreInput,
): Promise<void> {
  if (!validActorAndSource(actor, input)) {
    throw new ActionError("Invalid feedback item update.", "VALIDATION");
  }
  if (
    input.status === FeedbackItemStatus.RESOLVED ||
    input.status === FeedbackItemStatus.DISMISSED
  ) {
    throw new ActionError("Close this item with a meaningful outcome.", "VALIDATION");
  }
  assertFeedbackStatusForSource(input.sourceType, input.status);
  const notes = input.developerNotes?.slice(0, 5_000);
  if (!Number.isInteger(input.expectedNotesVersion) || input.expectedNotesVersion < 1) {
    throw new ActionError("Reload this feedback item before saving.", "CONFLICT");
  }

  await runAsTenant(input.tenantId, () =>
    runInTenantTx(async (tx) => {
      if (input.sourceType === FeedbackAutomationSource.ASSISTANT_FEEDBACK) {
        const updated = await tx.assistantFeedback.updateMany({
          where: {
            tenantId: input.tenantId,
            id: input.id,
            developerNotesVersion: input.expectedNotesVersion,
            status: { notIn: ["RESOLVED", "DISMISSED"] },
          },
          data: {
            severity: input.severity,
            triageClass: input.triageClass,
            developerNotes: notes,
            developerNotesVersion: { increment: 1 },
            status: input.status,
          },
        });
        if (updated.count !== 1) {
          throw new ActionError(
            "This item changed while you were editing. Reload and try again.",
            "CONFLICT",
          );
        }
      } else {
        const status = input.status;
        const updated = await tx.feedbackTicket.updateMany({
          where: {
            tenantId: input.tenantId,
            id: input.id,
            developerNotesVersion: input.expectedNotesVersion,
            status: { notIn: [FeedbackItemStatus.RESOLVED, FeedbackItemStatus.DISMISSED] },
          },
          data: {
            severity: input.severity,
            triageClass: input.triageClass,
            developerNotes: notes,
            developerNotesVersion: { increment: 1 },
            status,
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

export async function closeFeedbackItemCore(
  actor: DeveloperFeedbackActor,
  input: {
    tenantId: string;
    sourceType: FeedbackAutomationSource;
    id: string;
    status: DeveloperCloseStatus;
    outcome: string;
    expectedNotesVersion: number;
  },
): Promise<void> {
  if (!validActorAndSource(actor, input)) {
    throw new ActionError("Invalid feedback close request.", "VALIDATION");
  }
  if (input.status !== "RESOLVED" && input.status !== "DISMISSED") {
    throw new ActionError("Choose Resolve or Dismiss.", "VALIDATION");
  }
  const parsedOutcome = parseDeveloperOutcome(input.outcome);
  if (!parsedOutcome.ok) throw new ActionError(parsedOutcome.error, "VALIDATION");
  if (!Number.isInteger(input.expectedNotesVersion) || input.expectedNotesVersion < 1) {
    throw new ActionError("Reload this feedback item before closing it.", "CONFLICT");
  }

  await runAsTenant(input.tenantId, () =>
    withWriteRetry(() => runInTenantTx(async (tx) => {
      const source =
        input.sourceType === FeedbackAutomationSource.ASSISTANT_FEEDBACK
          ? await tx.assistantFeedback.findFirst({
              where: { tenantId: input.tenantId, id: input.id },
              select: { developerNotes: true, developerNotesVersion: true },
            })
          : await tx.feedbackTicket.findFirst({
              where: { tenantId: input.tenantId, id: input.id },
              select: { developerNotes: true, developerNotesVersion: true },
            });
      if (!source) throw new ActionError("Feedback item not found.", "VALIDATION");
      const closedAt = new Date();
      const developerNotes = prependDeveloperOutcomeNote({
        existing: source.developerNotes,
        at: closedAt,
        actorEmail: actor.email,
        status: input.status,
        outcome: parsedOutcome.value,
      });
      const data = {
        status: input.status,
        developerNotes,
        developerNotesVersion: { increment: 1 },
        resolvedAt: closedAt,
        resolvedByUserId: actor.id,
      } as const;
      const skipPendingRuns = () =>
        tx.automationRun.updateMany({
          where: {
            tenantId: input.tenantId,
            sourceType: input.sourceType,
            sourceId: input.id,
            status: {
              in: [
                FeedbackAutomationStatus.AWAITING_APPROVAL,
                FeedbackAutomationStatus.QUEUED,
              ],
            },
          },
          data: {
            status: FeedbackAutomationStatus.SKIPPED,
            completedAt: closedAt,
            error: "Feedback item was closed before automation started.",
          },
        });
      const countRunning = () =>
        tx.automationRun.count({
          where: {
            tenantId: input.tenantId,
            sourceType: input.sourceType,
            sourceId: input.id,
            status: FeedbackAutomationStatus.RUNNING,
          },
        });
      const skippedBeforeClose = await skipPendingRuns();
      const running = await countRunning();
      if (running) {
        throw new ActionError(
          "Automation is currently running. Wait for it to finish before closing this item.",
          "CONFLICT",
        );
      }
      const updated =
        input.sourceType === FeedbackAutomationSource.ASSISTANT_FEEDBACK
          ? await tx.assistantFeedback.updateMany({
              where: {
                tenantId: input.tenantId,
                id: input.id,
                developerNotesVersion: input.expectedNotesVersion,
                status: { notIn: ["RESOLVED", "DISMISSED"] },
              },
              data,
            })
          : await tx.feedbackTicket.updateMany({
              where: {
                tenantId: input.tenantId,
                id: input.id,
                developerNotesVersion: input.expectedNotesVersion,
                status: {
                  notIn: [FeedbackItemStatus.RESOLVED, FeedbackItemStatus.DISMISSED],
                },
              },
              data,
            });
      if (updated.count !== 1) {
        throw new ActionError(
          "This item changed while you were closing it. Reload and try again.",
          "CONFLICT",
        );
      }
      const skippedAfterClose = await skipPendingRuns();
      if (await countRunning()) {
        throw new ActionError(
          "Automation started while this item was closing. Reload and try again after it finishes.",
          "CONFLICT",
        );
      }
      if (skippedBeforeClose.count + skippedAfterClose.count > 0) {
        if (input.sourceType === FeedbackAutomationSource.ASSISTANT_FEEDBACK) {
          await tx.assistantFeedback.updateMany({
            where: { tenantId: input.tenantId, id: input.id },
            data: { automationStatus: FeedbackAutomationStatus.SKIPPED },
          });
        } else {
          await tx.feedbackTicket.updateMany({
            where: { tenantId: input.tenantId, id: input.id },
            data: { automationStatus: FeedbackAutomationStatus.SKIPPED },
          });
        }
      }
      await writeAudit(tx, {
        actorUserId: actor.id,
        actorEmail: actor.email,
        tenantId: input.tenantId,
        action: "UPDATE",
        entityType: input.sourceType,
        entityId: input.id,
        summary:
          input.status === "RESOLVED"
            ? "Developer resolved feedback with outcome"
            : "Developer dismissed feedback with outcome",
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }), 5, "developer-feedback-close"),
  );
}
