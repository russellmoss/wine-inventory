import type { Prisma, OperationType, WorkOrderTaskKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { requireTenantId } from "@/lib/tenant/context";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { assertWorkOrderTransition, rollUpWorkOrderStatus } from "@/lib/work-orders/status";
import { reserveForWorkOrderTx, releaseReservationsForWorkOrderTx } from "@/lib/work-orders/reservations";

// Script-safe cores for the work-order SHELL lifecycle (Phase 9 Unit 4): create (DRAFT) → issue
// (assign/schedule/reserve) → start (D5 claim) → cancel. Guarded by the status machine (status.ts).
// Execution + approval are Units 6/7. Cores take a LedgerActor and own their tenant tx + audit; the
// server actions (actions.ts) wrap them. Reads live in data.ts (K12: tenantId passed explicitly).

export type CreateTaskInput = {
  seq: number;
  kind: WorkOrderTaskKind;
  title: string;
  opType?: OperationType | null;
  observationType?: string | null;
  activityType?: string | null; // A3: set for MAINTENANCE tasks (TEMP_SETPOINT/CLEAN/SANITIZE/STEAM/GAS)
  instructions?: string | null;
  sourceVesselId?: string | null;
  destVesselId?: string | null;
  lotId?: string | null;
  materialId?: string | null;
  blockId?: string | null; // plan 039: vineyard-block target (HARVEST_WEIGH_IN)
  assigneeId?: string | null;
  assigneeEmail?: string | null;
  dueAt?: Date | null;
  plannedPayload: Prisma.InputJsonValue;
};

export type CreateWorkOrderInput = {
  title: string;
  instructions?: string | null;
  assigneeId?: string | null;
  assigneeEmail?: string | null;
  dueAt?: Date | null;
  scheduledFor?: Date | null;
  autoFinalize?: boolean;
  templateVersionId?: string | null;
  tasks: CreateTaskInput[];
};

export type WorkOrderResult = { workOrderId: string; number: number; status: string };

/** The next per-tenant human WO number (max+1, starting at 1). Computed in-tx; the (tenantId, number)
 * unique is the real guard against a concurrent-create collision (a rare P2002 → caller retries). */
async function nextWorkOrderNumber(tx: Prisma.TransactionClient, tenantId: string): Promise<number> {
  const top = await tx.workOrder.findFirst({
    where: { tenantId },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return (top?.number ?? 0) + 1;
}

/** Create a DRAFT work order with its tasks. The WO gets its per-tenant number now (a draft is still a
 * real, referenceable order). Tasks start PENDING. Nothing is reserved until issue. */
export async function createWorkOrderCore(actor: LedgerActor, input: CreateWorkOrderInput): Promise<WorkOrderResult> {
  if (!input.title?.trim()) throw new ActionError("A work order needs a title.");
  if (!input.tasks?.length) throw new ActionError("A work order needs at least one task.");
  for (const t of input.tasks) {
    if (t.kind === "OPERATION" && !t.opType) throw new ActionError(`Task "${t.title}" is an operation but has no operation type.`);
    if (t.kind === "OBSERVATION" && !t.observationType) throw new ActionError(`Task "${t.title}" is an observation but has no observation type.`);
    if (t.kind === "MAINTENANCE" && !t.activityType) throw new ActionError(`Task "${t.title}" is a maintenance task but has no activity type.`);
  }

  // The per-tenant WO number is max+1 computed in-tx (not SERIALIZABLE), so two concurrent creates can
  // collide on @@unique([tenantId, number]) → P2002. withWriteRetry only retries P2034, so retry P2002
  // here (recomputes max+1 on the next attempt). Bounded; the unique is the real guard against dupes.
  return withWorkOrderNumberRetry(() => createWorkOrderTx(actor, input));
}

async function withWorkOrderNumberRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const isNumberCollision = e && typeof e === "object" && (e as { code?: string }).code === "P2002" && attempt < 5;
      if (!isNumberCollision) throw e;
    }
  }
}

async function createWorkOrderTx(actor: LedgerActor, input: CreateWorkOrderInput): Promise<WorkOrderResult> {
  const created = await runInTenantTx(async (tx) => {
    const tenantId = requireTenantId();
    const number = await nextWorkOrderNumber(tx, tenantId);
    const wo = await tx.workOrder.create({
      data: {
        number,
        title: input.title.trim(),
        status: "DRAFT",
        instructions: input.instructions?.trim() || null,
        assigneeId: input.assigneeId ?? null,
        assigneeEmail: input.assigneeEmail ?? null,
        dueAt: input.dueAt ?? null,
        scheduledFor: input.scheduledFor ?? null,
        autoFinalize: input.autoFinalize ?? false,
        templateVersionId: input.templateVersionId ?? null,
        tasks: {
          // tenantId is set EXPLICITLY on nested creates — the tenant extension only auto-injects it on
          // the TOP-LEVEL create's data, so a nested row would otherwise land with '' and fail RLS.
          create: input.tasks.map((t) => ({
            tenantId,
            seq: t.seq,
            kind: t.kind,
            title: t.title.trim(),
            opType: t.opType ?? null,
            observationType: t.observationType ?? null,
            activityType: t.activityType ?? null,
            instructions: t.instructions?.trim() || null,
            sourceVesselId: t.sourceVesselId ?? null,
            destVesselId: t.destVesselId ?? null,
            lotId: t.lotId ?? null,
            materialId: t.materialId ?? null,
            blockId: t.blockId ?? null,
            assigneeId: t.assigneeId ?? null,
            assigneeEmail: t.assigneeEmail ?? null,
            dueAt: t.dueAt ?? null,
            plannedPayload: t.plannedPayload,
          })),
        },
      },
      select: { id: true, number: true, status: true },
    });
    await writeAudit(tx, {
      ...actor,
      action: "CREATE",
      entityType: "WorkOrder",
      entityId: wo.id,
      summary: `Drafted work order #${wo.number}: ${input.title.trim()}`,
    });
    return wo;
  });
  return { workOrderId: created.id, number: created.number, status: created.status };
}

/** Issue a DRAFT work order: transition to ISSUED, stamp issuer, and create the soft reservations
 * (source-lot volume, destination capacity, supply qty) for its operation tasks (warn-not-block). */
export async function issueWorkOrderCore(
  actor: LedgerActor,
  input: { workOrderId: string; validUntil?: Date },
): Promise<WorkOrderResult & { reservationWarnings: string[] }> {
  const wo = await prisma.workOrder.findUnique({ where: { id: input.workOrderId }, select: { id: true, number: true, status: true } });
  if (!wo) throw new ActionError("That work order no longer exists.");
  // Issue is DRAFT-only. assertWorkOrderTransition treats from===to as legal, so it would let an
  // already-ISSUED WO re-issue and double its reservations — guard on DRAFT explicitly.
  if (wo.status !== "DRAFT") throw new ActionError("Only a draft work order can be issued.", "CONFLICT");

  const result = await runInTenantTx(async (tx) => {
    const now = new Date();
    const updated = await tx.workOrder.update({
      where: { id: wo.id },
      data: { status: "ISSUED", issuedAt: now, issuedById: actor.actorUserId, issuedByEmail: actor.actorEmail },
      select: { id: true, number: true, status: true },
    });
    const warnings = await reserveForWorkOrderTx(tx, { workOrderId: wo.id, validUntil: input.validUntil });
    await writeAudit(tx, {
      ...actor,
      action: "UPDATE",
      entityType: "WorkOrder",
      entityId: wo.id,
      summary: `Issued work order #${wo.number}`,
    });
    return { updated, warnings };
  });
  return { workOrderId: result.updated.id, number: result.updated.number, status: result.updated.status, reservationWarnings: result.warnings };
}

/** Set/replace the default assignee (allowed while DRAFT or ISSUED). */
export async function assignWorkOrderCore(
  actor: LedgerActor,
  input: { workOrderId: string; assigneeId: string | null; assigneeEmail: string | null },
): Promise<WorkOrderResult> {
  const wo = await prisma.workOrder.findUnique({ where: { id: input.workOrderId }, select: { id: true, number: true, status: true } });
  if (!wo) throw new ActionError("That work order no longer exists.");
  if (wo.status !== "DRAFT" && wo.status !== "ISSUED") {
    throw new ActionError("You can only reassign a draft or issued work order.", "CONFLICT");
  }
  const updated = await runInTenantTx(async (tx) => {
    const row = await tx.workOrder.update({
      where: { id: wo.id },
      data: { assigneeId: input.assigneeId, assigneeEmail: input.assigneeEmail },
      select: { id: true, number: true, status: true },
    });
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "WorkOrder", entityId: wo.id, summary: `Reassigned work order #${wo.number}` });
    return row;
  });
  return { workOrderId: updated.id, number: updated.number, status: updated.status };
}

/** Set/replace the due date + scheduled date. */
export async function scheduleWorkOrderCore(
  actor: LedgerActor,
  input: { workOrderId: string; dueAt?: Date | null; scheduledFor?: Date | null },
): Promise<WorkOrderResult> {
  const wo = await prisma.workOrder.findUnique({ where: { id: input.workOrderId }, select: { id: true, number: true, status: true } });
  if (!wo) throw new ActionError("That work order no longer exists.");
  if (wo.status === "APPROVED" || wo.status === "CANCELLED") {
    throw new ActionError("You can't reschedule a finalized work order.", "CONFLICT");
  }
  const updated = await runInTenantTx(async (tx) => {
    const row = await tx.workOrder.update({
      where: { id: wo.id },
      data: {
        dueAt: input.dueAt !== undefined ? input.dueAt : undefined,
        scheduledFor: input.scheduledFor !== undefined ? input.scheduledFor : undefined,
      },
      select: { id: true, number: true, status: true },
    });
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "WorkOrder", entityId: wo.id, summary: `Rescheduled work order #${wo.number}` });
    return row;
  });
  return { workOrderId: updated.id, number: updated.number, status: updated.status };
}

/** Cancel a work order: transition to CANCELLED and release all its active reservations. Blocked once
 * finalized. Tasks that already wrote a real op keep their (immutable) op — cancelling the shell does
 * not reverse the ledger (reject does that, Unit 7). */
export async function cancelWorkOrderCore(actor: LedgerActor, input: { workOrderId: string; reason?: string }): Promise<WorkOrderResult> {
  const wo = await prisma.workOrder.findUnique({ where: { id: input.workOrderId }, select: { id: true, number: true, status: true } });
  if (!wo) throw new ActionError("That work order no longer exists.");
  assertWorkOrderTransition(wo.status, "CANCELLED");
  const updated = await runInTenantTx(async (tx) => {
    const row = await tx.workOrder.update({
      where: { id: wo.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
      select: { id: true, number: true, status: true },
    });
    await releaseReservationsForWorkOrderTx(tx, { workOrderId: wo.id, reason: "cancelled" });
    await writeAudit(tx, {
      ...actor,
      action: "UPDATE",
      entityType: "WorkOrder",
      entityId: wo.id,
      summary: `Cancelled work order #${wo.number}${input.reason ? `: ${input.reason}` : ""}`,
    });
    return row;
  });
  return { workOrderId: updated.id, number: updated.number, status: updated.status };
}

/** D5 live claim: a crew member taps Start on a task. Sets the task IN_PROGRESS + claim provenance, and
 * rolls the shell to IN_PROGRESS (so the dashboard shows "in progress by …"). */
export async function startTaskCore(actor: LedgerActor, input: { taskId: string }): Promise<{ taskId: string; status: string }> {
  const task = await prisma.workOrderTask.findUnique({ where: { id: input.taskId }, select: { id: true, status: true, workOrderId: true } });
  if (!task) throw new ActionError("That task no longer exists.");
  if (task.status !== "PENDING") throw new ActionError("Only a pending task can be started.", "CONFLICT");
  const updated = await runInTenantTx(async (tx) => {
    const now = new Date();
    const row = await tx.workOrderTask.update({
      where: { id: task.id },
      data: { status: "IN_PROGRESS", startedAt: now, startedById: actor.actorUserId, startedByEmail: actor.actorEmail },
      select: { id: true, status: true },
    });
    await bumpWorkOrderRollupTx(tx, task.workOrderId);
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "WorkOrderTask", entityId: task.id, summary: `Started a task` });
    return row;
  });
  return { taskId: updated.id, status: updated.status };
}

/** Recompute + persist the shell status from the current task statuses (called after every task move).
 * In-tx; the caller owns the transaction. No-op when the rollup doesn't change the status. */
export async function bumpWorkOrderRollupTx(tx: Prisma.TransactionClient, workOrderId: string): Promise<void> {
  const wo = await tx.workOrder.findUnique({ where: { id: workOrderId }, select: { status: true, startedAt: true } });
  if (!wo) return;
  const tasks = await tx.workOrderTask.findMany({ where: { workOrderId }, select: { status: true } });
  const next = rollUpWorkOrderStatus(wo.status, tasks.map((t) => t.status));
  const data: Prisma.WorkOrderUpdateInput = {};
  if (next !== wo.status) data.status = next;
  if (next === "IN_PROGRESS" && !wo.startedAt) data.startedAt = new Date();
  if (next === "APPROVED") data.completedAt = new Date();
  if (Object.keys(data).length > 0) await tx.workOrder.update({ where: { id: workOrderId }, data });
}
