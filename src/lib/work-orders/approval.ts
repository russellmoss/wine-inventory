import { Prisma, type WorkOrderTaskStatus } from "@prisma/client";
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

const REJECTABLE_STATUSES: WorkOrderTaskStatus[] = ["PENDING_APPROVAL", "APPROVED", "DONE"];

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asNum(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function sameUtcDay(date: Date): { gte: Date; lt: Date } {
  const gte = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const lt = new Date(gte);
  lt.setUTCDate(lt.getUTCDate() + 1);
  return { gte, lt };
}

function parsePickDate(value: unknown, fallback: Date): Date {
  if (typeof value !== "string" || value.trim() === "") return fallback;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return fallback;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function closeEnough(value: unknown, expected: number | null, tolerance: number): boolean {
  if (expected == null) return true;
  if (value == null) return false;
  return Math.abs(Number(value) - expected) <= tolerance;
}

async function reverseHarvestWeighInTx(
  tx: Prisma.TransactionClient,
  actor: LedgerActor,
  input: {
    task: { id: string; status: WorkOrderTaskStatus; currentAttemptId: string; workOrderId: string; blockId: string | null };
    attempt: { id: string; actualPayload: Prisma.JsonValue; completedAt: Date; completedByEmail: string | null };
    reason?: string;
  },
): Promise<void> {
  const payload = jsonObject(input.attempt.actualPayload);
  const blockId = input.task.blockId ?? (typeof payload.blockId === "string" ? payload.blockId : null);
  if (!blockId) throw new ActionError("That fruit weigh-in has no block to reverse.", "CONFLICT");
  const weightKg = asNum(payload.weightKg);
  if (weightKg == null) throw new ActionError("That fruit weigh-in is missing its recorded weight, so I can't safely match the harvest pick.", "CONFLICT");
  const pickDate = parsePickDate(payload.pickDate, input.attempt.completedAt);
  const day = sameUtcDay(pickDate);
  const brix = asNum(payload.brixAtPick);
  const ph = asNum(payload.phAtPick);
  const ta = asNum(payload.taAtPick);

  const candidatePicks = await tx.harvestPick.findMany({
    where: {
      harvestRecord: { blockId, vintageYear: pickDate.getUTCFullYear() },
      pickDate: { gte: day.gte, lt: day.lt },
      ...(input.attempt.completedByEmail ? { createdByEmail: input.attempt.completedByEmail } : {}),
    },
    select: { id: true, weightKg: true, brixAtPick: true, phAtPick: true, taAtPick: true, _count: { select: { crushSources: true } } },
  });
  const picks = candidatePicks.filter(
    (pick) =>
      closeEnough(pick.weightKg, weightKg, 0.01) &&
      closeEnough(pick.brixAtPick, brix, 0.05) &&
      closeEnough(pick.phAtPick, ph, 0.005) &&
      closeEnough(pick.taAtPick, ta, 0.05),
  );
  if (picks.length === 0) throw new ActionError("I couldn't find the harvest pick created by that weigh-in.", "CONFLICT");
  if (picks.length > 1) throw new ActionError("Several harvest picks match that weigh-in. Delete the exact pick from the harvest screen.", "CONFLICT");
  const pick = picks[0];
  if (pick._count.crushSources > 0) {
    throw new ActionError("That weigh-in has already been used in a crush. Reverse the crush first, then back out the weigh-in.", "CONFLICT");
  }

  const claimed = await tx.workOrderTask.updateMany({
    where: { id: input.task.id, status: input.task.status, currentAttemptId: input.task.currentAttemptId },
    data: { status: "REJECTED" },
  });
  if (claimed.count === 0) throw new ActionError("That task was already reviewed or changed. Refresh and try again.", "CONFLICT");
  await tx.harvestPick.delete({ where: { id: pick.id } });
  const now = new Date();
  await tx.workOrderTaskAttempt.update({
    where: { id: input.attempt.id },
    data: {
      status: "REJECTED",
      rejectedReason: input.reason?.trim() || null,
      reviewedAt: now,
      reviewedById: actor.actorUserId,
      reviewedByEmail: actor.actorEmail,
    },
  });
  await bumpWorkOrderRollupTx(tx, input.task.workOrderId);
  await writeAudit(tx, {
    ...actor,
    action: "UPDATE",
    entityType: "WorkOrderTask",
    entityId: input.task.id,
    summary: `Backed out a fruit weigh-in task and deleted harvest pick ${pick.id}${input.reason ? `: ${input.reason}` : ""}`,
  });
}

/** Approve (finalize) a task. A4: claim PENDING_APPROVAL→APPROVED guarded on currentAttemptId. */
export async function approveTaskCore(user: ApproverUser, actor: LedgerActor, input: { taskId: string }): Promise<ReviewResult> {
  const auth = canApprove(user);
  if (!auth.ok) throw new ActionError(auth.reason, "FORBIDDEN");

  const task = await prisma.workOrderTask.findUnique({ where: { id: input.taskId }, select: { id: true, status: true, currentAttemptId: true, workOrderId: true } });
  if (!task) throw new ActionError("That task no longer exists.");
  if (task.status !== "PENDING_APPROVAL") throw new ActionError("That task isn't awaiting approval.", "CONFLICT");
  if (!task.currentAttemptId) throw new ActionError("That task has no attempt to approve.", "CONFLICT");

  // Guard against finalizing an op that was already reversed elsewhere (e.g. the timeline Undo). Without
  // this, the WO would show APPROVED while the underlying stock movement was negated — silent divergence.
  const currentAttempt = await prisma.workOrderTaskAttempt.findUnique({ where: { id: task.currentAttemptId }, select: { operationId: true } });
  if (currentAttempt?.operationId) {
    const op = await prisma.lotOperation.findUnique({ where: { id: currentAttempt.operationId }, select: { correctedBy: { select: { id: true } } } });
    if (op?.correctedBy) {
      throw new ActionError("That task's ledger operation was already reversed. Reject it (to resubmit) instead of approving.", "CONFLICT");
    }
  }

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

  const task = await prisma.workOrderTask.findUnique({
    where: { id: input.taskId },
    select: { id: true, status: true, currentAttemptId: true, workOrderId: true, observationType: true, blockId: true },
  });
  if (!task) throw new ActionError("That task no longer exists.");
  if (!REJECTABLE_STATUSES.includes(task.status)) throw new ActionError("That task isn't completed or awaiting approval.", "CONFLICT");
  if (!task.currentAttemptId) throw new ActionError("That task has no attempt to reject.", "CONFLICT");
  const currentAttemptId = task.currentAttemptId;
  const attempt = await prisma.workOrderTaskAttempt.findUnique({
    where: { id: currentAttemptId },
    select: { id: true, operationId: true, actualPayload: true, completedAt: true, completedByEmail: true },
  });
  if (!attempt) throw new ActionError("That task has no attempt to reject.", "CONFLICT");

  if (!attempt.operationId) {
    if (task.observationType !== "HARVEST_WEIGH_IN" || task.status !== "DONE") {
      throw new ActionError("That task has no reversible ledger operation or harvest pick to back out.", "CONFLICT");
    }
    await runInTenantTx((tx) =>
      reverseHarvestWeighInTx(tx, actor, {
        task: { id: task.id, status: task.status, currentAttemptId, workOrderId: task.workOrderId, blockId: task.blockId },
        attempt,
        reason: input.reason,
      }),
    );
    return { taskId: task.id, status: "REJECTED", message: "Rejected - the harvest pick was deleted." };
  }
  const attemptId = attempt.id;
  const operationId = attempt.operationId;
  const originalStatus = task.status;

  // 1. Claim the task (A4) so a concurrent approve can't slip in while we reverse.
  await runInTenantTx(async (tx) => {
    const claimed = await tx.workOrderTask.updateMany({
      where: { id: task.id, status: originalStatus, currentAttemptId: attemptId },
      data: { status: "REJECTED" },
    });
    if (claimed.count === 0) throw new ActionError("That task was already reviewed or changed. Refresh and try again.", "CONFLICT");
  });

  // 2. Reverse the immutable op (its own tx; validates reversibility + LEDGER-11).
  let correctionId: number | null = null;
  try {
    const rev = await reverseOperationCore(actor, { operationId, note: input.reason });
    // reverseOperationCore returns correctionId=null for the rack/bottle families (their compensation is
    // a VesselTransfer/run, not a CORRECTION op). Recover the compensating op id from the corrected-by
    // link so the rejected attempt is always traceable to its reversal (audit-trace completeness).
    correctionId = rev.correctionId ?? (await prisma.lotOperation.findUnique({ where: { id: operationId }, select: { correctedBy: { select: { id: true } } } }))?.correctedBy?.id ?? null;
  } catch (e) {
    // If the op was ALREADY reversed (e.g. via the timeline Undo before this reject), the reversal goal
    // is already met — finalize the rejection and link the existing correction, rather than re-arm an
    // approvable task pointing at a negated op (which a reviewer could then wrongly Approve). Otherwise
    // (LEDGER-11 block, or a real error) compensate — restore PENDING_APPROVAL — and surface it.
    const already = await prisma.lotOperation.findUnique({ where: { id: operationId }, select: { correctedBy: { select: { id: true } } } });
    if (already?.correctedBy) {
      correctionId = already.correctedBy.id; // fall through to step 3, recording REJECTED
    } else {
      await runInTenantTx(async (tx) => {
        await tx.workOrderTask.updateMany({ where: { id: task.id, status: "REJECTED" }, data: { status: originalStatus } });
      });
      if (e instanceof ActionError && e.code === "CONFLICT") {
        throw new ActionError(`Can't reject this task yet: ${e.message} Undo the later operation first, then reject.`, "CONFLICT");
      }
      throw e;
    }
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
      summary: `${originalStatus === "APPROVED" ? "Reverted an approved" : "Rejected a"} work-order task (ledger reversed)${input.reason ? `: ${input.reason}` : ""}`,
    });
    return {
      taskId: task.id,
      status: "REJECTED",
      message: originalStatus === "APPROVED" ? "Reverted - the ledger operation was reversed and the work order was reopened." : "Rejected - the ledger operation was reversed.",
    };
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
