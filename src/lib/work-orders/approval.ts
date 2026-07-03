import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { reverseOperationCore } from "@/lib/ledger/reverse";
import { canApprove, type ApproverUser } from "@/lib/work-orders/authority";
import { bumpWorkOrderRollupTx } from "@/lib/work-orders/lifecycle";

// Approve / finalize / reject for work-order OPERATION tasks (Phase 9 Unit 7). Approve = flip task +
// attempt status (NO op mutation — the op was always real, WORKORDER-1). Reject = reverseOperationCore
// (plan-024): a new CORRECTION op that negates cost + restores stock, honoring LEDGER-10. A4: every
// review CLAIMS the row with a compare-and-swap (updateMany guarded on status + currentAttemptId), so a
// double-tap or a concurrent approve/reject can't both win. Authority is a pure canApprove (Phase 23
// will replace it). Bulk approve iterates with per-item results (D3: the UI forces deviations to
// individual review; the core approves the ids it's given).

export type ReviewResult = { taskId: string; status: string; message: string };

/** Approve (finalize) a task. A4: claim PENDING_APPROVAL→APPROVED guarded on currentAttemptId. */
export async function approveTaskCore(user: ApproverUser, actor: LedgerActor, input: { taskId: string }): Promise<ReviewResult> {
  const auth = canApprove(user);
  if (!auth.ok) throw new ActionError(auth.reason, "FORBIDDEN");

  const task = await prisma.workOrderTask.findUnique({ where: { id: input.taskId }, select: { id: true, status: true, currentAttemptId: true, workOrderId: true } });
  if (!task) throw new ActionError("That task no longer exists.");
  if (task.status !== "PENDING_APPROVAL") throw new ActionError("That task isn't awaiting approval.", "CONFLICT");
  if (!task.currentAttemptId) throw new ActionError("That task has no attempt to approve.", "CONFLICT");

  return runInTenantTx(async (tx) => {
    const now = new Date();
    // A4 compare-and-swap: only the reviewer who sees PENDING_APPROVAL + this exact attempt wins.
    const claimed = await tx.workOrderTask.updateMany({
      where: { id: task.id, status: "PENDING_APPROVAL", currentAttemptId: task.currentAttemptId },
      data: { status: "APPROVED" },
    });
    if (claimed.count === 0) throw new ActionError("That task was already reviewed or changed. Refresh and try again.", "CONFLICT");
    await tx.workOrderTaskAttempt.update({
      where: { id: task.currentAttemptId! },
      data: { status: "APPROVED", reviewedAt: now, reviewedById: actor.actorUserId, reviewedByEmail: actor.actorEmail },
    });
    await bumpWorkOrderRollupTx(tx, task.workOrderId);
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "WorkOrderTask", entityId: task.id, summary: `Approved a work-order task` });
    return { taskId: task.id, status: "APPROVED", message: "Approved." };
  });
}

/**
 * Reject a task = reverse its ledger op (plan-024) and mark the attempt REJECTED. A resubmit is a NEW
 * attempt (decision 1). Order: CLAIM the task first (A4) so a concurrent approve can't win, then reverse;
 * if the reversal is blocked (LEDGER-11: a later op touched the same wine), COMPENSATE — restore
 * PENDING_APPROVAL and surface the conflict so the reviewer undoes the dependent op first.
 */
export async function rejectTaskCore(user: ApproverUser, actor: LedgerActor, input: { taskId: string; reason?: string }): Promise<ReviewResult> {
  const auth = canApprove(user);
  if (!auth.ok) throw new ActionError(auth.reason, "FORBIDDEN");

  const task = await prisma.workOrderTask.findUnique({ where: { id: input.taskId }, select: { id: true, status: true, currentAttemptId: true, workOrderId: true } });
  if (!task) throw new ActionError("That task no longer exists.");
  if (task.status !== "PENDING_APPROVAL") throw new ActionError("That task isn't awaiting approval.", "CONFLICT");
  if (!task.currentAttemptId) throw new ActionError("That task has no attempt to reject.", "CONFLICT");
  const attempt = await prisma.workOrderTaskAttempt.findUnique({ where: { id: task.currentAttemptId }, select: { id: true, operationId: true } });
  if (!attempt?.operationId) throw new ActionError("That task's attempt has no ledger operation to reverse.", "CONFLICT");
  const attemptId = attempt.id;
  const operationId = attempt.operationId;

  // 1. Claim the task (A4) so a concurrent approve can't slip in while we reverse.
  await runInTenantTx(async (tx) => {
    const claimed = await tx.workOrderTask.updateMany({
      where: { id: task.id, status: "PENDING_APPROVAL", currentAttemptId: attemptId },
      data: { status: "REJECTED" },
    });
    if (claimed.count === 0) throw new ActionError("That task was already reviewed or changed. Refresh and try again.", "CONFLICT");
  });

  // 2. Reverse the immutable op (its own tx; validates reversibility + LEDGER-11).
  let correctionId: number | null = null;
  try {
    const rev = await reverseOperationCore(actor, { operationId, note: input.reason });
    correctionId = rev.correctionId;
  } catch (e) {
    // Compensate: restore PENDING_APPROVAL so the task is reviewable again. Surface LEDGER-11 clearly.
    await runInTenantTx(async (tx) => {
      await tx.workOrderTask.updateMany({ where: { id: task.id, status: "REJECTED" }, data: { status: "PENDING_APPROVAL" } });
    });
    if (e instanceof ActionError && e.code === "CONFLICT") {
      throw new ActionError(
        `Can't reject this task yet: ${e.message} Undo the later operation first, then reject.`,
        "CONFLICT",
      );
    }
    throw e;
  }

  // 3. Record the rejection on the attempt + roll up the shell.
  return runInTenantTx(async (tx) => {
    const now = new Date();
    await tx.workOrderTaskAttempt.update({
      where: { id: attemptId },
      data: {
        status: "REJECTED",
        correctionOperationId: correctionId,
        rejectedReason: input.reason?.trim() || null,
        reviewedAt: now,
        reviewedById: actor.actorUserId,
        reviewedByEmail: actor.actorEmail,
      },
    });
    await bumpWorkOrderRollupTx(tx, task.workOrderId);
    await writeAudit(tx, {
      ...actor,
      action: "UPDATE",
      entityType: "WorkOrderTask",
      entityId: task.id,
      summary: `Rejected a work-order task (ledger reversed)${input.reason ? `: ${input.reason}` : ""}`,
    });
    return { taskId: task.id, status: "REJECTED", message: "Rejected — the ledger operation was reversed." };
  });
}

export type BulkApproveResult = { approved: number; failed: number; results: (ReviewResult & { ok: boolean; error?: string })[] };

/** Bulk approve. Iterates approveTaskCore with per-item results (a partial failure doesn't abort the
 * rest). D3: the UI only offers bulk-approve on exact-match (no-deviation) tasks; deviations are forced
 * to individual review. */
export async function bulkApproveTasksCore(user: ApproverUser, actor: LedgerActor, input: { taskIds: string[] }): Promise<BulkApproveResult> {
  const auth = canApprove(user);
  if (!auth.ok) throw new ActionError(auth.reason, "FORBIDDEN");
  const results: (ReviewResult & { ok: boolean; error?: string })[] = [];
  for (const taskId of input.taskIds) {
    try {
      const r = await approveTaskCore(user, actor, { taskId });
      results.push({ ...r, ok: true });
    } catch (e) {
      results.push({ taskId, status: "PENDING_APPROVAL", message: "", ok: false, error: e instanceof Error ? e.message : "Failed to approve." });
    }
  }
  return { approved: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
}
