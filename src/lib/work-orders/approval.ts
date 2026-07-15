import { Prisma, type WorkOrderTaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { withWriteRetry } from "@/lib/db/write-retry";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { reverseOperationCore } from "@/lib/ledger/reverse";
import { reverseVesselActivityTx } from "@/lib/work-orders/vessel-activity";
import { canApprove, type ApproverUser } from "@/lib/work-orders/authority";
import { bumpWorkOrderRollupTx, emitWorkOrderStatusTx } from "@/lib/work-orders/lifecycle";

// Approve / finalize / reject for work-order OPERATION tasks (Phase 9 Unit 7). Approve = flip task +
// attempt status (NO op mutation — the op was always real, WORKORDER-1). Reject = reverseOperationCore
// (plan-024): a new CORRECTION op that negates cost + restores stock, honoring LEDGER-10. A4: every
// review CLAIMS the row with a compare-and-swap (updateMany guarded on status + currentAttemptId), so a
// double-tap or a concurrent approve/reject can't both win. Authority is a pure canApprove (Phase 23
// will replace it). Bulk approve iterates with per-item results (D3: the UI forces deviations to
// individual review; the core approves the ids it's given).

export type ReviewResult = { taskId: string; status: string; message: string };

const REJECTABLE_STATUSES: WorkOrderTaskStatus[] = ["PENDING_APPROVAL", "APPROVED", "DONE"];

// ── Plan 054 (Phase 9.4b): a group-rack task can carry MANY batch attempts (one balanced op each), so
// approve must finalize every live batch and reject must reverse every live batch LIFO. ──

function hasGroupRackPayload(plannedPayload: unknown): boolean {
  const p = jsonObject(plannedPayload);
  const gr = p.groupRack;
  return !!(gr && typeof gr === "object" && !Array.isArray(gr));
}

/** Live (non-rejected) group-rack BATCH attempts with a real op, newest-first (LIFO reject order). */
async function liveGroupRackBatches(taskId: string): Promise<{ id: string; operationId: number; seq: number }[]> {
  const attempts = await prisma.workOrderTaskAttempt.findMany({
    where: { taskId, status: { not: "REJECTED" } },
    select: { id: true, seq: true, operationId: true, actualPayload: true },
    orderBy: { seq: "desc" },
  });
  return attempts
    .filter((a) => a.operationId != null && "groupRackBatch" in jsonObject(a.actualPayload))
    .map((a) => ({ id: a.id, operationId: a.operationId as number, seq: a.seq }));
}

/** Recover the compensating op id for a reversed op (rack/group-rack families return correctionId=null). */
async function correctionIdFor(operationId: number, revCorrectionId: number | null): Promise<number | null> {
  if (revCorrectionId != null) return revCorrectionId;
  const op = await prisma.lotOperation.findUnique({ where: { id: operationId }, select: { correctedBy: { select: { id: true } } } });
  return op?.correctedBy?.id ?? null;
}

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
  const finalizeRollup = await bumpWorkOrderRollupTx(tx, input.task.workOrderId);
  await emitWorkOrderStatusTx(tx, finalizeRollup, actor, input.task.workOrderId);
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

  const task = await prisma.workOrderTask.findUnique({ where: { id: input.taskId }, select: { id: true, status: true, currentAttemptId: true, workOrderId: true, plannedPayload: true } });
  if (!task) throw new ActionError("That task no longer exists.");
  if (task.status !== "PENDING_APPROVAL") throw new ActionError("That task isn't awaiting approval.", "CONFLICT");
  if (!task.currentAttemptId) throw new ActionError("That task has no attempt to approve.", "CONFLICT");

  // Plan 054: a group-rack task approves ALL its live batch attempts at once (one approval = accept every
  // batch). A single-op task has exactly one live attempt, so this is a superset of the prior behavior.
  const isGroupRack = hasGroupRackPayload(task.plannedPayload);
  const liveBatches = isGroupRack ? await liveGroupRackBatches(task.id) : [];
  const opIdsToCheck = isGroupRack && liveBatches.length > 0
    ? liveBatches.map((b) => b.operationId)
    : await prisma.workOrderTaskAttempt.findUnique({ where: { id: task.currentAttemptId }, select: { operationId: true } }).then((a) => (a?.operationId ? [a.operationId] : []));

  // Guard against finalizing an op that was already reversed elsewhere (e.g. the timeline Undo). Without
  // this, the WO would show APPROVED while the underlying stock movement was negated — silent divergence.
  for (const opId of opIdsToCheck) {
    const op = await prisma.lotOperation.findUnique({ where: { id: opId }, select: { correctedBy: { select: { id: true } } } });
    if (op?.correctedBy) {
      throw new ActionError("That task has a ledger operation that was already reversed. Reject it (to resubmit) instead of approving.", "CONFLICT");
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
    // Finalize every live attempt (all group-rack batches, or the single op attempt).
    await tx.workOrderTaskAttempt.updateMany({
      where: { taskId: task.id, status: { not: "REJECTED" }, operationId: { not: null } },
      data: { status: "APPROVED", reviewedAt: now, reviewedById: actor.actorUserId, reviewedByEmail: actor.actorEmail },
    });
    const rollupChange = await bumpWorkOrderRollupTx(tx, task.workOrderId);
    await emitWorkOrderStatusTx(tx, rollupChange, actor, task.workOrderId);
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "WorkOrderTask", entityId: task.id, summary: isGroupRack && liveBatches.length > 1 ? `Approved a work-order task (${liveBatches.length} batches)` : `Approved a work-order task` });
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
    select: { id: true, kind: true, status: true, currentAttemptId: true, workOrderId: true, observationType: true, blockId: true, plannedPayload: true },
  });
  if (!task) throw new ActionError("That task no longer exists.");
  if (!REJECTABLE_STATUSES.includes(task.status)) throw new ActionError("That task isn't completed or awaiting approval.", "CONFLICT");
  if (!task.currentAttemptId) throw new ActionError("That task has no attempt to reject.", "CONFLICT");

  // Plan 054: a multi-batch group-rack reverses EVERY live batch op, newest-first (LIFO — the ledger's
  // laterTouchedKeys guard requires undoing the most recent draw on the shared source before older ones).
  if (hasGroupRackPayload(task.plannedPayload)) {
    const batches = await liveGroupRackBatches(task.id);
    if (batches.length > 1) {
      const originalStatus = task.status;
      await runInTenantTx(async (tx) => {
        const claimed = await tx.workOrderTask.updateMany({ where: { id: task.id, status: originalStatus, currentAttemptId: task.currentAttemptId }, data: { status: "REJECTED" } });
        if (claimed.count === 0) throw new ActionError("That task was already reviewed or changed. Refresh and try again.", "CONFLICT");
      });
      const now = new Date();
      let reversedAny = false;
      for (const b of batches) {
        try {
          const rev = await reverseOperationCore(actor, { operationId: b.operationId, note: input.reason });
          const corr = await correctionIdFor(b.operationId, rev.correctionId ?? null);
          reversedAny = true;
          await runInTenantTx((tx) => tx.workOrderTaskAttempt.update({ where: { id: b.id }, data: { status: "REJECTED", correctionOperationId: corr, rejectedReason: input.reason?.trim() || null, reviewedAt: now, reviewedById: actor.actorUserId, reviewedByEmail: actor.actorEmail } }));
        } catch (e) {
          const already = await prisma.lotOperation.findUnique({ where: { id: b.operationId }, select: { correctedBy: { select: { id: true } } } });
          if (already?.correctedBy) {
            await runInTenantTx((tx) => tx.workOrderTaskAttempt.update({ where: { id: b.id }, data: { status: "REJECTED", correctionOperationId: already.correctedBy!.id, rejectedReason: input.reason?.trim() || null, reviewedAt: now, reviewedById: actor.actorUserId, reviewedByEmail: actor.actorEmail } }));
            reversedAny = true;
            continue;
          }
          if (!reversedAny) {
            await runInTenantTx((tx) => tx.workOrderTask.updateMany({ where: { id: task.id, status: "REJECTED" }, data: { status: originalStatus } }));
          }
          if (e instanceof ActionError && e.code === "CONFLICT") throw new ActionError(`Can't reject this task yet: ${e.message} Undo the later operation first, then reject.`, "CONFLICT");
          throw e;
        }
      }
      await runInTenantTx(async (tx) => {
        const rollupChange = await bumpWorkOrderRollupTx(tx, task.workOrderId);
    await emitWorkOrderStatusTx(tx, rollupChange, actor, task.workOrderId);
        await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "WorkOrderTask", entityId: task.id, summary: `Rejected a group-rack task — reversed ${batches.length} batches${input.reason ? `: ${input.reason}` : ""}` });
      });
      return { taskId: task.id, status: "REJECTED", message: `Rejected - all ${batches.length} batches were reversed.` };
    }
  }

  const currentAttemptId = task.currentAttemptId;
  const attempt = await prisma.workOrderTaskAttempt.findUnique({
    where: { id: currentAttemptId },
    select: { id: true, operationId: true, actualPayload: true, completedAt: true, completedByEmail: true },
  });
  if (!attempt) throw new ActionError("That task has no attempt to reject.", "CONFLICT");

  if (!attempt.operationId) {
    // Maintenance (record-only, no ledger op) is undone via undoMaintenanceTaskCore below — NOT here. It
    // auto-DONEs and never enters the review queue, so it doesn't belong in the reviewer reject path.
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
    const rollupChange = await bumpWorkOrderRollupTx(tx, task.workOrderId);
    await emitWorkOrderStatusTx(tx, rollupChange, actor, task.workOrderId);
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

/**
 * Plan 054: undo the LATEST recorded batch of an in-progress group-rack task (a mid-work correction, not a
 * review action). Reverses that batch's op (LIFO — it's the most recent draw on the shared source), marks
 * its attempt REJECTED, and reopens its members. The task returns to IN_PROGRESS (other batches remain) or
 * PENDING (that was the only batch). To reverse a fully-completed task under review, use rejectTaskCore.
 */
export async function rejectGroupRackBatchCore(user: ApproverUser, actor: LedgerActor, input: { taskId: string; reason?: string }): Promise<ReviewResult> {
  const task = await prisma.workOrderTask.findUnique({ where: { id: input.taskId }, select: { id: true, status: true, currentAttemptId: true, workOrderId: true, opType: true, kind: true, plannedPayload: true } });
  if (!task) throw new ActionError("That task no longer exists.");
  if (task.kind !== "OPERATION" || task.opType !== "RACK" || !hasGroupRackPayload(task.plannedPayload)) {
    throw new ActionError("That task isn't a group barrel-down / rack-to-tank.", "CONFLICT");
  }
  if (task.status !== "IN_PROGRESS") {
    throw new ActionError("You can only undo a batch while the task is still in progress. Use Reject to reverse a completed task that's under review.", "CONFLICT");
  }
  const batches = await liveGroupRackBatches(task.id);
  if (batches.length === 0) throw new ActionError("There's no recorded batch to undo.", "CONFLICT");
  const latest = batches[0];

  // Plan 055 D1 (LOOSEN, replaces the 054 admin-only gate): an admin/developer may undo any batch; a
  // non-admin may self-undo their OWN last batch while the task is still IN_PROGRESS (a mid-work correction,
  // not a review action). Settled / PENDING_APPROVAL reversal still goes through rejectTaskCore (admin) — the
  // IN_PROGRESS guard above already excludes those states here.
  if (!canApprove(user).ok) {
    const owner = await prisma.workOrderTaskAttempt.findUnique({ where: { id: latest.id }, select: { completedById: true } });
    if (!owner?.completedById || owner.completedById !== user.id) {
      throw new ActionError("Only an admin (or the person who recorded this batch) can undo it.", "FORBIDDEN");
    }
  }
  const remaining = batches.slice(1);
  const nextStatus: WorkOrderTaskStatus = remaining.length > 0 ? "IN_PROGRESS" : "PENDING";

  // Reverse the latest batch op (its own tx; validates LEDGER-11 reversibility).
  let correctionId: number | null = null;
  try {
    const rev = await reverseOperationCore(actor, { operationId: latest.operationId, note: input.reason });
    correctionId = await correctionIdFor(latest.operationId, rev.correctionId ?? null);
  } catch (e) {
    const already = await prisma.lotOperation.findUnique({ where: { id: latest.operationId }, select: { correctedBy: { select: { id: true } } } });
    if (already?.correctedBy) correctionId = already.correctedBy.id;
    else if (e instanceof ActionError && e.code === "CONFLICT") throw new ActionError(`Can't undo this batch yet: ${e.message} Undo the later operation first.`, "CONFLICT");
    else throw e;
  }

  return runInTenantTx(async (tx) => {
    const now = new Date();
    await tx.workOrderTaskAttempt.update({
      where: { id: latest.id },
      data: { status: "REJECTED", correctionOperationId: correctionId, rejectedReason: input.reason?.trim() || null, reviewedAt: now, reviewedById: actor.actorUserId, reviewedByEmail: actor.actorEmail },
    });
    const claimed = await tx.workOrderTask.updateMany({
      where: { id: task.id, status: "IN_PROGRESS", currentAttemptId: task.currentAttemptId },
      data: { status: nextStatus, currentAttemptId: remaining[0]?.id ?? null },
    });
    if (claimed.count === 0) throw new ActionError("That task changed while you were undoing a batch. Refresh and try again.", "CONFLICT");
    const rollupChange = await bumpWorkOrderRollupTx(tx, task.workOrderId);
    await emitWorkOrderStatusTx(tx, rollupChange, actor, task.workOrderId);
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "WorkOrderTask", entityId: task.id, summary: `Undid the last group-rack batch (ledger reversed)${input.reason ? `: ${input.reason}` : ""}` });
    return { taskId: task.id, status: nextStatus, message: "Undid the last batch — its wine was returned to the source." };
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

/**
 * Plan 061: UNDO a completed record-only maintenance task (single-vessel or a consolidated group). Reverses
 * every VesselActivityEvent the current completion wrote and REOPENS the task to PENDING so it can be re-done
 * — maintenance completes straight to DONE, so leaving it REJECTED would be a dead-end (REJECTED→DONE is not
 * a legal transition). Auth mirrors the group-rack self-undo: an admin/developer OR the person who recorded
 * the completion. This is the crew's "oops, undo that," NOT a reviewer action (maintenance never enters the
 * review queue). One Serializable tx (raised timeout for large groups).
 */
export async function undoMaintenanceTaskCore(user: ApproverUser, actor: LedgerActor, input: { taskId: string }): Promise<ReviewResult> {
  const task = await prisma.workOrderTask.findUnique({
    where: { id: input.taskId },
    select: { id: true, kind: true, status: true, currentAttemptId: true, workOrderId: true },
  });
  if (!task) throw new ActionError("That task no longer exists.");
  if (task.kind !== "MAINTENANCE" || task.status !== "DONE") throw new ActionError("Only a completed maintenance task can be undone.", "CONFLICT");
  if (!task.currentAttemptId) throw new ActionError("That task has no completion to undo.", "CONFLICT");
  const currentAttemptId = task.currentAttemptId;

  // Auth: admin/developer, OR the person who recorded this completion (self-undo — mirrors group-rack D1).
  if (!canApprove(user).ok) {
    const owner = await prisma.workOrderTaskAttempt.findUnique({ where: { id: currentAttemptId }, select: { completedById: true } });
    if (!owner?.completedById || owner.completedById !== user.id) {
      throw new ActionError("Only an admin (or the person who recorded it) can undo this maintenance.", "FORBIDDEN");
    }
  }

  const events = await prisma.vesselActivityEvent.findMany({ where: { taskId: task.id, attemptId: currentAttemptId, voidedAt: null }, select: { id: true } });
  return withWriteRetry(() => runInTenantTx(async (tx) => {
    // Claim the task (A4) and REOPEN to PENDING (not REJECTED — a record-only task must stay re-completable).
    const claimed = await tx.workOrderTask.updateMany({
      where: { id: task.id, status: "DONE", currentAttemptId },
      data: { status: "PENDING", currentAttemptId: null },
    });
    if (claimed.count === 0) throw new ActionError("That task was already changed. Refresh and try again.", "CONFLICT");
    for (const e of events) await reverseVesselActivityTx(tx, actor, e.id);
    await tx.workOrderTaskAttempt.update({
      where: { id: currentAttemptId },
      data: { status: "REJECTED", rejectedReason: "undo", reviewedAt: new Date(), reviewedById: actor.actorUserId, reviewedByEmail: actor.actorEmail },
    });
    const rollupChange = await bumpWorkOrderRollupTx(tx, task.workOrderId);
    await emitWorkOrderStatusTx(tx, rollupChange, actor, task.workOrderId);
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "WorkOrderTask", entityId: task.id, summary: `Undid a maintenance task — reversed ${events.length} activity event${events.length === 1 ? "" : "s"} and reopened it` });
    return { taskId: task.id, status: "PENDING", message: `Undone — ${events.length} activity record${events.length === 1 ? "" : "s"} reversed; the task is open again.` };
  }, { isolationLevel: "Serializable", timeout: 120_000 }), 5, "wo-maintenance:undo");
}
