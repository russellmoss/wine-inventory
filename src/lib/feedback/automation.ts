import "server-only";
import {
  type AutomationRun,
  FeedbackAutomationKind,
  FeedbackAutomationMode,
  FeedbackAutomationSource,
  FeedbackAutomationStatus,
  FeedbackItemStatus,
  FeedbackTriageClass,
  FeedbackTicketKind,
  Prisma,
} from "@prisma/client";
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { withWriteRetry } from "@/lib/db/write-retry";

export type FeedbackSource =
  | { sourceType: "ASSISTANT_FEEDBACK"; sourceId: string }
  | { sourceType: "FEEDBACK_TICKET"; sourceId: string; ticketKind?: FeedbackTicketKind };

export function automationKindForMode(
  mode: FeedbackAutomationMode,
  source?: { ticketKind?: FeedbackTicketKind },
): FeedbackAutomationKind | null {
  if (mode === FeedbackAutomationMode.REPORT_ONLY) return null;
  if (mode === FeedbackAutomationMode.PLAN_MODE) return FeedbackAutomationKind.PLAN;
  if (source?.ticketKind === FeedbackTicketKind.FEATURE_REQUEST) return null;
  return FeedbackAutomationKind.AGENTIC_FIX;
}

export function automationIdempotencyKey(input: {
  tenantId: string;
  sourceType: FeedbackAutomationSource;
  sourceId: string;
  kind: FeedbackAutomationKind;
  attempt?: number;
}): string {
  return `${input.tenantId}:${input.sourceType}:${input.sourceId}:${input.kind}:${input.attempt ?? 1}`;
}

export type DeveloperAutomationRun = Pick<AutomationRun, "id" | "kind" | "status" | "error"> & {
  canRetryDispatch: boolean;
};

export type AutomationConflict = {
  code: "PRODUCT_GAP_WITH_ACTIVE_FIX";
  runId: string;
  runKind: typeof FeedbackAutomationKind.AGENTIC_FIX;
  runStatus:
    | typeof FeedbackAutomationStatus.QUEUED
    | typeof FeedbackAutomationStatus.RUNNING
    | typeof FeedbackAutomationStatus.PR_OPENED;
  message: string;
};

const FIX_CONFLICT_STATUSES = new Set<FeedbackAutomationStatus>([
  FeedbackAutomationStatus.QUEUED,
  FeedbackAutomationStatus.RUNNING,
  FeedbackAutomationStatus.PR_OPENED,
]);

const REUSABLE_PLAN_STATUSES = new Set<FeedbackAutomationStatus>([
  FeedbackAutomationStatus.AWAITING_APPROVAL,
  FeedbackAutomationStatus.QUEUED,
  FeedbackAutomationStatus.RUNNING,
  FeedbackAutomationStatus.PLANNED,
  FeedbackAutomationStatus.PR_OPENED,
]);

const PLAN_ROUTING_SKIP_REASON = JSON.stringify({
  code: "SUPERSEDED_BY_PRODUCT_GAP_PLAN",
  message: "Awaiting AGENTIC_FIX was skipped because triage classified the source as PRODUCT_GAP.",
  targetKind: FeedbackAutomationKind.PLAN,
});

const GITHUB_DISPATCH_TIMEOUT_MS = 15_000;
const PLAN_RUNNING_RECONCILIATION_MS = 60 * 60 * 1000;
const DISPATCH_NOT_CONFIGURED =
  "GitHub dispatch is not configured. Set GITHUB_REPOSITORY and GITHUB_DISPATCH_TOKEN.";
const DISPATCH_REJECTED_PREFIX = "GitHub dispatch failed:";

export function canRetryAutomationDispatch(
  run: Pick<AutomationRun, "status" | "error">,
): boolean {
  return Boolean(
    run.error &&
      ((run.status === FeedbackAutomationStatus.QUEUED &&
        run.error === DISPATCH_NOT_CONFIGURED) ||
        (run.status === FeedbackAutomationStatus.FAILED &&
          run.error.startsWith(DISPATCH_REJECTED_PREFIX))),
  );
}

export function automationRetryMatchesRoute(
  kind: FeedbackAutomationKind,
  triageClass: FeedbackTriageClass | null,
): boolean {
  return !(
    kind === FeedbackAutomationKind.AGENTIC_FIX &&
    triageClass === FeedbackTriageClass.PRODUCT_GAP
  );
}

function openAutomationSourceWhere(): Prisma.AutomationRunWhereInput {
  return {
    OR: [
      {
        sourceType: FeedbackAutomationSource.ASSISTANT_FEEDBACK,
        assistantFeedback: { is: { status: { notIn: ["RESOLVED", "DISMISSED"] } } },
      },
      {
        sourceType: FeedbackAutomationSource.FEEDBACK_TICKET,
        ticket: {
          is: {
            status: {
              notIn: [FeedbackItemStatus.RESOLVED, FeedbackItemStatus.DISMISSED],
            },
          },
        },
      },
    ],
  };
}

export function planRunNeedsReconciliation(
  run: Pick<AutomationRun, "kind" | "status" | "claimedAt" | "githubUrl">,
  now = new Date(),
): boolean {
  if (
    run.kind !== FeedbackAutomationKind.PLAN ||
    run.status !== FeedbackAutomationStatus.RUNNING ||
    run.githubUrl
  ) {
    return false;
  }
  return !run.claimedAt || now.getTime() - run.claimedAt.getTime() > PLAN_RUNNING_RECONCILIATION_MS;
}

export function deriveAutomationConflict(
  triageClass: FeedbackTriageClass | null,
  run: Pick<AutomationRun, "id" | "kind" | "status"> | null,
): AutomationConflict | null {
  if (
    triageClass !== FeedbackTriageClass.PRODUCT_GAP ||
    run?.kind !== FeedbackAutomationKind.AGENTIC_FIX ||
    !FIX_CONFLICT_STATUSES.has(run.status)
  ) {
    return null;
  }

  const runStatus = run.status as AutomationConflict["runStatus"];
  return {
    code: "PRODUCT_GAP_WITH_ACTIVE_FIX",
    runId: run.id,
    runKind: FeedbackAutomationKind.AGENTIC_FIX,
    runStatus,
    message: `AGENTIC_FIX run ${run.id} is ${runStatus}; no PLAN was created. Review the existing GitHub work before rerouting.`,
  };
}

export function repositoryDispatchEventForRun(input: {
  kind: FeedbackAutomationKind;
  sourceType: FeedbackAutomationSource;
}): "feedback_plan" | "assistant_feedback" | "feedback_bug_fix" {
  if (input.kind === FeedbackAutomationKind.PLAN) return "feedback_plan";
  return input.sourceType === FeedbackAutomationSource.ASSISTANT_FEEDBACK
    ? "assistant_feedback"
    : "feedback_bug_fix";
}

async function updateSourceAutomationStatus(
  tx: Prisma.TransactionClient,
  source: FeedbackSource,
  status: FeedbackAutomationStatus,
) {
  if (source.sourceType === "ASSISTANT_FEEDBACK") {
    await tx.assistantFeedback.update({ where: { id: source.sourceId }, data: { automationStatus: status } });
    return;
  }
  await tx.feedbackTicket.update({ where: { id: source.sourceId }, data: { automationStatus: status } });
}

class ClosedFeedbackSourceError extends Error {}

async function updateOpenSourceAutomationStatus(
  tx: Prisma.TransactionClient,
  source: FeedbackSource,
  status: FeedbackAutomationStatus,
) {
  const updated =
    source.sourceType === "ASSISTANT_FEEDBACK"
      ? await tx.assistantFeedback.updateMany({
          where: { id: source.sourceId, status: { notIn: ["RESOLVED", "DISMISSED"] } },
          data: { automationStatus: status },
        })
      : await tx.feedbackTicket.updateMany({
          where: {
            id: source.sourceId,
            status: { notIn: [FeedbackItemStatus.RESOLVED, FeedbackItemStatus.DISMISSED] },
          },
          data: { automationStatus: status },
        });
  if (updated.count !== 1) throw new ClosedFeedbackSourceError();
}

async function updateRunAndSourceAutomationStatus(input: {
  tenantId: string;
  run: {
    id: string;
    sourceType: FeedbackAutomationSource;
    sourceId: string;
  };
  status: FeedbackAutomationStatus;
  error?: string | null;
  claimedAt?: Date | null;
  completedAt?: Date | null;
}) {
  await runAsTenant(input.tenantId, () =>
    runInTenantTx(async (tx) => {
      await tx.automationRun.update({
        where: { id: input.run.id },
        data: {
          status: input.status,
          error: input.error,
          claimedAt: input.claimedAt,
          completedAt: input.completedAt,
        },
      });
      await updateSourceAutomationStatus(
        tx,
        input.run.sourceType === FeedbackAutomationSource.ASSISTANT_FEEDBACK
          ? { sourceType: "ASSISTANT_FEEDBACK", sourceId: input.run.sourceId }
          : { sourceType: "FEEDBACK_TICKET", sourceId: input.run.sourceId },
        input.status,
      );
    }),
  );
}

export async function recordAutomationGate(
  tx: Prisma.TransactionClient,
  input: FeedbackSource & {
    tenantId: string;
    mode: FeedbackAutomationMode;
    attempt?: number;
  },
) {
  const kind = automationKindForMode(
    input.mode,
    "ticketKind" in input ? { ticketKind: input.ticketKind } : undefined,
  );
  if (!kind) {
    await updateSourceAutomationStatus(tx, input, FeedbackAutomationStatus.NOT_REQUESTED);
    return null;
  }

  const idempotencyKey = automationIdempotencyKey({
    tenantId: input.tenantId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    kind,
    attempt: input.attempt,
  });
  const run = await tx.automationRun.upsert({
    where: { idempotencyKey },
    update: {},
    create: {
      tenantId: input.tenantId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      assistantFeedbackId:
        input.sourceType === "ASSISTANT_FEEDBACK" ? input.sourceId : null,
      ticketId: input.sourceType === "FEEDBACK_TICKET" ? input.sourceId : null,
      kind,
      attempt: input.attempt ?? 1,
      status: FeedbackAutomationStatus.AWAITING_APPROVAL,
      idempotencyKey,
    },
  });
  await updateSourceAutomationStatus(tx, input, FeedbackAutomationStatus.AWAITING_APPROVAL);
  return run;
}

export type EnsurePlanAutomationRunResult =
  | {
      ok: true;
      run: AutomationRun;
      skippedRunIds: string[];
    }
  | {
      ok: false;
      reason:
        | "SOURCE_NOT_FOUND"
        | "SOURCE_CLOSED"
        | "SOURCE_NOT_PRODUCT_GAP"
        | "ACTIVE_FIX_CONFLICT"
        | "PLAN_RUN_TERMINAL";
      conflict?: AutomationConflict;
      run?: AutomationRun;
    };

function mergeAutomationConflictNote(
  existing: string | null,
  conflict: AutomationConflict,
  now: Date,
): string {
  const marker = `[automation-conflict:${conflict.runId}]`;
  if (existing?.includes(marker)) return existing;
  const stamp =
    `[bug-triage ${now.toISOString()}] [product-gap] Automation conflict — ` +
    `${conflict.message} ${marker}`;
  return (existing ? `${stamp}\n\n---\n${existing}` : stamp).slice(0, 5000);
}

/**
 * Route a triaged product gap into the existing PLAN pipeline without ever
 * treating a fix run as a plan. The serializable transaction makes repeated
 * goalie calls converge on the same PLAN idempotency key.
 */
export async function ensurePlanAutomationRun(input: {
  tenantId: string;
  sourceType: FeedbackAutomationSource;
  sourceId: string;
}): Promise<EnsurePlanAutomationRunResult> {
  try {
    return await runAsTenant(input.tenantId, () =>
      withWriteRetry(() => runInTenantTx(async (tx) => {
      const source =
        input.sourceType === FeedbackAutomationSource.ASSISTANT_FEEDBACK
          ? await tx.assistantFeedback.findUnique({
              where: { id: input.sourceId },
              select: {
                status: true,
                triageClass: true,
                developerNotes: true,
                developerNotesVersion: true,
              },
            })
          : await tx.feedbackTicket.findUnique({
              where: { id: input.sourceId },
              select: {
                status: true,
                triageClass: true,
                developerNotes: true,
                developerNotesVersion: true,
              },
            });
      if (!source) return { ok: false, reason: "SOURCE_NOT_FOUND" };
      if (source.status === "RESOLVED" || source.status === "DISMISSED") {
        return { ok: false, reason: "SOURCE_CLOSED" };
      }
      if (source.triageClass !== FeedbackTriageClass.PRODUCT_GAP) {
        return { ok: false, reason: "SOURCE_NOT_PRODUCT_GAP" };
      }
      const feedbackSource: FeedbackSource =
        input.sourceType === FeedbackAutomationSource.ASSISTANT_FEEDBACK
          ? { sourceType: "ASSISTANT_FEEDBACK", sourceId: input.sourceId }
          : { sourceType: "FEEDBACK_TICKET", sourceId: input.sourceId };

      const runs = await tx.automationRun.findMany({
        where: {
          tenantId: input.tenantId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });

      const blockingFix = runs.find(
        (run) =>
          run.kind === FeedbackAutomationKind.AGENTIC_FIX &&
          FIX_CONFLICT_STATUSES.has(run.status),
      );
      const conflict = deriveAutomationConflict(source.triageClass, blockingFix ?? null);
      if (conflict) {
        const developerNotes = mergeAutomationConflictNote(source.developerNotes, conflict, new Date());
        if (developerNotes !== source.developerNotes) {
          let notesUpdated: { count: number };
          if (input.sourceType === FeedbackAutomationSource.ASSISTANT_FEEDBACK) {
            notesUpdated = await tx.assistantFeedback.updateMany({
              where: {
                tenantId: input.tenantId,
                id: input.sourceId,
                developerNotesVersion: source.developerNotesVersion,
              },
              data: { developerNotes, developerNotesVersion: { increment: 1 } },
            });
          } else {
            notesUpdated = await tx.feedbackTicket.updateMany({
              where: {
                tenantId: input.tenantId,
                id: input.sourceId,
                developerNotesVersion: source.developerNotesVersion,
              },
              data: { developerNotes, developerNotesVersion: { increment: 1 } },
            });
          }
          if (notesUpdated.count !== 1) {
            throw new Error("Feedback notes changed while recording an automation conflict.");
          }
        }
        return { ok: false, reason: "ACTIVE_FIX_CONFLICT", conflict };
      }

      const awaitingFixes = runs.filter(
        (run) =>
          run.kind === FeedbackAutomationKind.AGENTIC_FIX &&
          run.status === FeedbackAutomationStatus.AWAITING_APPROVAL,
      );
      if (awaitingFixes.length > 0) {
        await tx.automationRun.updateMany({
          where: { id: { in: awaitingFixes.map((run) => run.id) } },
          data: {
            status: FeedbackAutomationStatus.SKIPPED,
            completedAt: new Date(),
            error: PLAN_ROUTING_SKIP_REASON,
          },
        });
      }

      const existingPlan = runs.find(
        (run) =>
          run.kind === FeedbackAutomationKind.PLAN &&
          REUSABLE_PLAN_STATUSES.has(run.status),
      );
      if (existingPlan) {
        await updateOpenSourceAutomationStatus(tx, feedbackSource, existingPlan.status);
        return { ok: true, run: existingPlan, skippedRunIds: awaitingFixes.map((run) => run.id) };
      }
      const terminalPlan = runs.find((run) => run.kind === FeedbackAutomationKind.PLAN);
      if (terminalPlan) {
        await updateOpenSourceAutomationStatus(tx, feedbackSource, terminalPlan.status);
        return { ok: false, reason: "PLAN_RUN_TERMINAL", run: terminalPlan };
      }

      const idempotencyKey = automationIdempotencyKey({
        tenantId: input.tenantId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        kind: FeedbackAutomationKind.PLAN,
      });
      const run = await tx.automationRun.upsert({
        where: { idempotencyKey },
        update: {},
        create: {
          tenantId: input.tenantId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          assistantFeedbackId:
            input.sourceType === FeedbackAutomationSource.ASSISTANT_FEEDBACK ? input.sourceId : null,
          ticketId: input.sourceType === FeedbackAutomationSource.FEEDBACK_TICKET ? input.sourceId : null,
          kind: FeedbackAutomationKind.PLAN,
          attempt: 1,
          status: FeedbackAutomationStatus.AWAITING_APPROVAL,
          idempotencyKey,
        },
      });
      await updateOpenSourceAutomationStatus(tx, feedbackSource, run.status);
      return { ok: true, run, skippedRunIds: awaitingFixes.map((existing) => existing.id) };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }), 5, "feedback-plan-route"),
    );
  } catch (error) {
    if (error instanceof ClosedFeedbackSourceError) {
      return { ok: false, reason: "SOURCE_CLOSED" };
    }
    throw error;
  }
}

export async function approveAutomationRun(input: {
  tenantId: string;
  runId: string;
  approverUserId: string;
  expectedKind?: FeedbackAutomationKind;
  onApproved?: (tx: Prisma.TransactionClient, run: AutomationRun) => Promise<unknown>;
}) {
  return runAsTenant(input.tenantId, () =>
    runInTenantTx(async (tx) => {
      const updated = await tx.automationRun.updateMany({
        where: {
          id: input.runId,
          tenantId: input.tenantId,
          status: FeedbackAutomationStatus.AWAITING_APPROVAL,
          kind: input.expectedKind,
          ...openAutomationSourceWhere(),
        },
        data: {
          status: FeedbackAutomationStatus.QUEUED,
          approvedByUserId: input.approverUserId,
          approvedAt: new Date(),
        },
      });
      if (updated.count !== 1) return null;
      const run = await tx.automationRun.findUniqueOrThrow({ where: { id: input.runId } });
      await updateSourceAutomationStatus(
        tx,
        run.sourceType === "ASSISTANT_FEEDBACK"
          ? { sourceType: "ASSISTANT_FEEDBACK", sourceId: run.sourceId }
          : { sourceType: "FEEDBACK_TICKET", sourceId: run.sourceId },
        FeedbackAutomationStatus.QUEUED,
      );
      await input.onApproved?.(tx, run);
      return run;
    }),
  );
}

export async function retryApprovedAutomationRun(input: {
  tenantId: string;
  runId: string;
  onRetried?: (tx: Prisma.TransactionClient, run: AutomationRun) => Promise<unknown>;
}) {
  return runAsTenant(input.tenantId, () =>
    withWriteRetry(() => runInTenantTx(async (tx) => {
      const target = await tx.automationRun.findUnique({
        where: { id: input.runId },
        select: {
          id: true,
          tenantId: true,
          sourceType: true,
          sourceId: true,
          kind: true,
          status: true,
          error: true,
          approvedByUserId: true,
          createdAt: true,
        },
      });
      if (
        !target ||
        target.tenantId !== input.tenantId ||
        !target.approvedByUserId ||
        !canRetryAutomationDispatch(target)
      ) {
        return null;
      }
      const source =
        target.sourceType === FeedbackAutomationSource.ASSISTANT_FEEDBACK
          ? await tx.assistantFeedback.findFirst({
              where: { tenantId: input.tenantId, id: target.sourceId },
              select: { status: true, triageClass: true },
            })
          : await tx.feedbackTicket.findFirst({
              where: { tenantId: input.tenantId, id: target.sourceId },
              select: { status: true, triageClass: true },
            });
      if (
        !source ||
        source.status === "RESOLVED" ||
        source.status === "DISMISSED" ||
        !automationRetryMatchesRoute(target.kind, source.triageClass)
      ) {
        return null;
      }
      const newerRun = await tx.automationRun.findFirst({
        where: {
          tenantId: input.tenantId,
          sourceType: target.sourceType,
          sourceId: target.sourceId,
          OR: [
            { createdAt: { gt: target.createdAt } },
            { createdAt: target.createdAt, id: { gt: target.id } },
          ],
        },
        select: { id: true },
      });
      if (newerRun) return null;
      const updated = await tx.automationRun.updateMany({
        where: {
          id: input.runId,
          tenantId: input.tenantId,
          approvedByUserId: { not: null },
          AND: [
            openAutomationSourceWhere(),
            {
              OR: [
                {
                  status: FeedbackAutomationStatus.QUEUED,
                  error: DISPATCH_NOT_CONFIGURED,
                },
                {
                  status: FeedbackAutomationStatus.FAILED,
                  error: { startsWith: DISPATCH_REJECTED_PREFIX },
                },
              ],
            },
          ],
        },
        data: {
          status: FeedbackAutomationStatus.QUEUED,
          claimedAt: null,
          completedAt: null,
          error: null,
        },
      });
      if (updated.count !== 1) return null;
      const run = await tx.automationRun.findUniqueOrThrow({ where: { id: input.runId } });
      await updateSourceAutomationStatus(
        tx,
        run.sourceType === FeedbackAutomationSource.ASSISTANT_FEEDBACK
          ? { sourceType: "ASSISTANT_FEEDBACK", sourceId: run.sourceId }
          : { sourceType: "FEEDBACK_TICKET", sourceId: run.sourceId },
        FeedbackAutomationStatus.QUEUED,
      );
      await input.onRetried?.(tx, run);
      return run;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }), 5, "feedback-dispatch-retry"),
  );
}

export async function claimAutomationRun(input: { tenantId: string; runId: string }) {
  return runAsTenant(input.tenantId, () =>
    runInTenantTx(async (tx) => {
      const updated = await tx.automationRun.updateMany({
        where: { id: input.runId, tenantId: input.tenantId, status: FeedbackAutomationStatus.QUEUED },
        data: { status: FeedbackAutomationStatus.RUNNING, claimedAt: new Date(), error: null },
      });
      if (updated.count !== 1) return null;
      const run = await tx.automationRun.findUniqueOrThrow({ where: { id: input.runId } });
      await updateSourceAutomationStatus(
        tx,
        run.sourceType === "ASSISTANT_FEEDBACK"
          ? { sourceType: "ASSISTANT_FEEDBACK", sourceId: run.sourceId }
          : { sourceType: "FEEDBACK_TICKET", sourceId: run.sourceId },
        FeedbackAutomationStatus.RUNNING,
      );
      return run;
    }),
  );
}

export async function completeAutomationRun(input: {
  tenantId: string;
  runId: string;
  githubUrl: string;
  githubNumber?: number;
}) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(input.githubUrl);
  } catch {
    throw new Error("Invalid GitHub artifact URL.");
  }
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== "github.com" ||
    parsedUrl.username ||
    parsedUrl.password
  ) {
    throw new Error("Invalid GitHub artifact URL.");
  }
  if (
    input.githubNumber !== undefined &&
    (!Number.isInteger(input.githubNumber) || input.githubNumber < 1)
  ) {
    throw new Error("Invalid GitHub artifact number.");
  }

  return runAsTenant(input.tenantId, () =>
    runInTenantTx(async (tx) => {
      const run = await tx.automationRun.findFirst({
        where: { id: input.runId, tenantId: input.tenantId },
      });
      if (!run) return null;
      const status =
        run.kind === FeedbackAutomationKind.PLAN
          ? FeedbackAutomationStatus.PLANNED
          : FeedbackAutomationStatus.PR_OPENED;
      const completedAt = new Date();
      await tx.automationRun.update({
        where: { id: run.id },
        data: {
          status,
          completedAt,
          error: null,
          githubUrl: parsedUrl.toString(),
          githubIssueNumber:
            run.kind === FeedbackAutomationKind.PLAN ? input.githubNumber : undefined,
          githubPrNumber:
            run.kind === FeedbackAutomationKind.AGENTIC_FIX ? input.githubNumber : undefined,
        },
      });
      const sourceData =
        run.kind === FeedbackAutomationKind.PLAN
          ? { automationStatus: status, githubIssueUrl: parsedUrl.toString() }
          : { automationStatus: status, prUrl: parsedUrl.toString() };
      if (run.sourceType === FeedbackAutomationSource.ASSISTANT_FEEDBACK) {
        const open = await tx.assistantFeedback.updateMany({
          where: {
            tenantId: input.tenantId,
            id: run.sourceId,
            status: { notIn: ["RESOLVED", "DISMISSED"] },
          },
          data: { ...sourceData, status: "TRIAGED" },
        });
        if (open.count === 0) {
          await tx.assistantFeedback.updateMany({
            where: { tenantId: input.tenantId, id: run.sourceId },
            data: sourceData,
          });
        }
      } else {
        const open = await tx.feedbackTicket.updateMany({
          where: {
            tenantId: input.tenantId,
            id: run.sourceId,
            status: {
              notIn: [FeedbackItemStatus.RESOLVED, FeedbackItemStatus.DISMISSED],
            },
          },
          data: { ...sourceData, status: FeedbackItemStatus.TRIAGED },
        });
        if (open.count === 0) {
          await tx.feedbackTicket.updateMany({
            where: { tenantId: input.tenantId, id: run.sourceId },
            data: sourceData,
          });
        }
      }
      return { runId: run.id, status, completedAt };
    }),
  );
}

export async function markAutomationRunFailed(input: {
  tenantId: string;
  runId: string;
  error: string;
}): Promise<boolean> {
  return runAsTenant(input.tenantId, () =>
    runInTenantTx(async (tx) => {
      const run = await tx.automationRun.findUnique({
        where: { id: input.runId },
        select: { id: true, sourceType: true, sourceId: true },
      });
      if (!run) return false;
      const updated = await tx.automationRun.updateMany({
        where: {
          id: input.runId,
          tenantId: input.tenantId,
          status: FeedbackAutomationStatus.RUNNING,
        },
        data: {
          status: FeedbackAutomationStatus.FAILED,
          completedAt: new Date(),
          error: input.error.slice(0, 1000),
        },
      });
      if (updated.count !== 1) return false;
      await updateSourceAutomationStatus(
        tx,
        run.sourceType === FeedbackAutomationSource.ASSISTANT_FEEDBACK
          ? { sourceType: "ASSISTANT_FEEDBACK", sourceId: run.sourceId }
          : { sourceType: "FEEDBACK_TICKET", sourceId: run.sourceId },
        FeedbackAutomationStatus.FAILED,
      );
      return true;
    }),
  );
}

export async function dispatchApprovedRun(runId: string, tenantId: string): Promise<boolean> {
  const claimed = await claimAutomationRun({ runId, tenantId });
  if (!claimed) return false;
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) {
    await updateRunAndSourceAutomationStatus({
      tenantId,
      run: claimed,
      status: FeedbackAutomationStatus.QUEUED,
      claimedAt: null,
      error: DISPATCH_NOT_CONFIGURED,
    });
    return false;
  }

  const eventType = repositoryDispatchEventForRun(claimed);

  let response: Response;
  try {
    response = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        event_type: eventType,
        client_payload: {
          automationRunId: claimed.id,
          tenantId,
          sourceType: claimed.sourceType,
          sourceId: claimed.sourceId,
          feedbackId:
            claimed.sourceType === "ASSISTANT_FEEDBACK" ? claimed.sourceId : undefined,
          ticketId: claimed.sourceType === "FEEDBACK_TICKET" ? claimed.sourceId : undefined,
        },
      }),
      signal: AbortSignal.timeout(GITHUB_DISPATCH_TIMEOUT_MS),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown transport failure";
    await updateRunAndSourceAutomationStatus({
      tenantId,
      run: claimed,
      status: FeedbackAutomationStatus.FAILED,
      completedAt: new Date(),
      error:
        `GitHub dispatch outcome is unknown after a transport failure: ${detail}. ` +
        "Inspect GitHub Actions before creating or retrying automation.",
    });
    return false;
  }

  if (!response.ok) {
    await updateRunAndSourceAutomationStatus({
      tenantId,
      run: claimed,
      status: FeedbackAutomationStatus.FAILED,
      completedAt: new Date(),
      error: `GitHub dispatch failed: ${response.status}`,
    });
    return false;
  }
  return true;
}
