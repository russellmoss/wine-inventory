import "server-only";
import type { Prisma } from "@prisma/client";
import {
  FeedbackAutomationKind,
  FeedbackAutomationMode,
  FeedbackAutomationSource,
  FeedbackAutomationStatus,
  FeedbackTicketKind,
} from "@prisma/client";
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";

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
}) {
  await runAsTenant(input.tenantId, () =>
    runInTenantTx(async (tx) => {
      await tx.automationRun.update({
        where: { id: input.run.id },
        data: {
          status: input.status,
          error: input.error,
          claimedAt: input.claimedAt,
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

export async function approveAutomationRun(input: {
  tenantId: string;
  runId: string;
  approverUserId: string;
}) {
  return runAsTenant(input.tenantId, () =>
    runInTenantTx(async (tx) => {
      const updated = await tx.automationRun.updateMany({
        where: {
          id: input.runId,
          tenantId: input.tenantId,
          status: FeedbackAutomationStatus.AWAITING_APPROVAL,
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
      return run;
    }),
  );
}

export async function claimAutomationRun(input: { tenantId: string; runId: string }) {
  return runAsTenant(input.tenantId, () =>
    runInTenantTx(async (tx) => {
      const updated = await tx.automationRun.updateMany({
        where: { id: input.runId, tenantId: input.tenantId, status: FeedbackAutomationStatus.QUEUED },
        data: { status: FeedbackAutomationStatus.RUNNING, claimedAt: new Date() },
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
      error: "GitHub dispatch is not configured. Set GITHUB_REPOSITORY and GITHUB_DISPATCH_TOKEN.",
    });
    return false;
  }

  const eventType =
    claimed.kind === FeedbackAutomationKind.PLAN
      ? "feedback_plan"
      : claimed.sourceType === "ASSISTANT_FEEDBACK"
        ? "assistant_feedback"
        : "feedback_bug_fix";

  const response = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
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
  });

  if (!response.ok) {
    await updateRunAndSourceAutomationStatus({
      tenantId,
      run: claimed,
      status: FeedbackAutomationStatus.FAILED,
      error: `GitHub dispatch failed: ${response.status}`,
    });
    return false;
  }
  return true;
}
