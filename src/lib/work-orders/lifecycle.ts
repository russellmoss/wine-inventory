import type { Prisma, OperationType, WorkOrderTaskKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { requireTenantId } from "@/lib/tenant/context";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { assertWorkOrderTransition, rollUpWorkOrderStatus } from "@/lib/work-orders/status";
import { reserveForWorkOrderTx, releaseReservationsForWorkOrderTx } from "@/lib/work-orders/reservations";
import { emitNotificationTx, buildWorkOrderNotificationPayload } from "@/lib/inbox/notifications";

/** Plan 068 Unit 5 — what a rollup recompute did, so a caller can emit a WO_STATUS notification from
 *  its own tx WITHOUT the pure rollup taking an actor (council amendment 2). `changed` is true only
 *  when the conditional UPDATE actually transitioned the row (amendment 3 — a real concurrency gate). */
export type WorkOrderRollupChange = {
  changed: boolean;
  prev: string | null;
  next: string | null;
  number: number | null;
  assigneeId: string | null;
  assigneeEmail: string | null;
};

function humanizeWorkOrderStatus(status: string): string {
  return status.toLowerCase().replace(/_/g, " ");
}

/** Resolve a free-text assignee email to a tenant member's User id. The WO's canonical `assigneeId` is
 *  what drives the inbox "my work orders" bucket (inbox/buckets.ts) AND the WO_STATUS / assignment inbox
 *  notifications — a WO assigned only by an email STRING (assigneeId null) is invisible in both. Both WO
 *  builders capture the assignee as an email, so resolve it here at the single write choke point (covers
 *  the palette builder, the vessel-modal composer, the assistant, and NL authoring). Returns null when the
 *  email matches no member of this tenant (a genuine external/unknown assignee stays email-only — never a
 *  bad link). `member` is a GLOBAL table keyed by organizationId → queried directly, not RLS-scoped. */
export async function resolveAssigneeIdByEmail(
  tx: Prisma.TransactionClient,
  tenantId: string,
  email: string | null | undefined,
): Promise<string | null> {
  const normalized = email?.trim();
  if (!normalized) return null;
  const member = await tx.member.findFirst({
    where: { organizationId: tenantId, user: { email: { equals: normalized, mode: "insensitive" } } },
    select: { userId: true },
  });
  return member?.userId ?? null;
}

/** Emit a WO_STATUS notification to the current assignee for a real status transition. No-op when
 *  nothing changed or the WO is unassigned; self-notification is suppressed inside emitNotificationTx.
 *  Called by the status-changing lifecycle/approval cores with their own actor. */
export async function emitWorkOrderStatusTx(
  tx: Prisma.TransactionClient,
  change: WorkOrderRollupChange,
  actor: LedgerActor,
  workOrderId: string,
): Promise<void> {
  if (!change.changed || !change.assigneeId || change.number == null || !change.next) return;
  await emitNotificationTx(tx, {
    recipientUserId: change.assigneeId,
    recipientEmail: change.assigneeEmail ?? "",
    ...buildWorkOrderNotificationPayload({
      workOrderId,
      workOrderNumber: change.number,
      event: "status",
      statusLabel: humanizeWorkOrderStatus(change.next),
    }),
    actor: { actorUserId: actor.actorUserId, actorEmail: actor.actorEmail },
  });
}

// Script-safe cores for the work-order SHELL lifecycle (Phase 9 Unit 4): create (DRAFT) → issue
// (assign/schedule/reserve) → start (D5 claim) → cancel. Guarded by the status machine (status.ts).
// Execution + approval are Units 6/7. Cores take a LedgerActor and own their tenant tx + audit; the
// server actions (actions.ts) wrap them. Reads live in data.ts (K12: tenantId passed explicitly).

export type CreateTaskInput = {
  seq: number;
  groupSeq?: number; // plan 053 A3: sequential-group index (0 = first group / ungated). Parallel within a group.
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
  // Plan 053 B8: per-task planning fields (data capture only).
  priority?: string | null;
  estimatedDurationMin?: number | null;
  scheduledStart?: Date | null;
  scheduledEnd?: Date | null;
  locationId?: string | null; // plan 053 B9
  plannedPayload: Prisma.InputJsonValue;
};

export type CreateWorkOrderInput = {
  title: string;
  instructions?: string | null;
  assigneeId?: string | null;
  assigneeEmail?: string | null;
  dueAt?: Date | null;
  scheduledFor?: Date | null;
  // Plan 053 B8: ERP planning fields (validated by the action layer; persisted as-is).
  priority?: string | null;
  estimatedDurationMin?: number | null;
  scheduledStart?: Date | null;
  scheduledEnd?: Date | null;
  locationId?: string | null; // plan 053 B9
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
    // Resolve the free-text assignee email to a member's User id so the WO lands in the assignee's inbox
    // bucket + gets a notification. An explicit assigneeId (NL/assistant path) always wins.
    const assigneeId = input.assigneeId ?? (await resolveAssigneeIdByEmail(tx, tenantId, input.assigneeEmail));
    const wo = await tx.workOrder.create({
      data: {
        number,
        title: input.title.trim(),
        status: "DRAFT",
        instructions: input.instructions?.trim() || null,
        assigneeId,
        assigneeEmail: input.assigneeEmail ?? null,
        dueAt: input.dueAt ?? null,
        scheduledFor: input.scheduledFor ?? null,
        priority: input.priority ?? null,
        estimatedDurationMin: input.estimatedDurationMin ?? null,
        scheduledStart: input.scheduledStart ?? null,
        scheduledEnd: input.scheduledEnd ?? null,
        locationId: input.locationId ?? null,
        autoFinalize: input.autoFinalize ?? false,
        templateVersionId: input.templateVersionId ?? null,
        tasks: {
          // tenantId is set EXPLICITLY on nested creates — the tenant extension only auto-injects it on
          // the TOP-LEVEL create's data, so a nested row would otherwise land with '' and fail RLS.
          create: input.tasks.map((t) => ({
            tenantId,
            seq: t.seq,
            groupSeq: t.groupSeq ?? 0,
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
            priority: t.priority ?? null,
            estimatedDurationMin: t.estimatedDurationMin ?? null,
            scheduledStart: t.scheduledStart ?? null,
            scheduledEnd: t.scheduledEnd ?? null,
            locationId: t.locationId ?? null,
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
  const wo = await prisma.workOrder.findUnique({ where: { id: input.workOrderId }, select: { id: true, number: true, status: true, assigneeId: true, assigneeEmail: true } });
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
    // Inbox hook (Unit 5): the DRAFT→ISSUED transition doesn't go through the rollup; notify directly.
    await emitWorkOrderStatusTx(
      tx,
      { changed: true, prev: "DRAFT", next: "ISSUED", number: wo.number, assigneeId: wo.assigneeId, assigneeEmail: wo.assigneeEmail },
      actor,
      wo.id,
    );
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
    // An explicit assigneeId wins; otherwise resolve the email to a member so the reassignment actually
    // lands in that user's inbox bucket + fires the "assigned" notification (not just a display string).
    const assigneeId = input.assigneeId ?? (await resolveAssigneeIdByEmail(tx, requireTenantId(), input.assigneeEmail));
    const row = await tx.workOrder.update({
      where: { id: wo.id },
      data: { assigneeId, assigneeEmail: input.assigneeEmail },
      select: { id: true, number: true, status: true },
    });
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "WorkOrder", entityId: wo.id, summary: `Reassigned work order #${wo.number}` });
    // Inbox hook (Unit 5): tell the NEW assignee the WO is theirs (self-assign is suppressed).
    if (assigneeId) {
      await emitNotificationTx(tx, {
        recipientUserId: assigneeId,
        recipientEmail: input.assigneeEmail ?? "",
        ...buildWorkOrderNotificationPayload({ workOrderId: wo.id, workOrderNumber: wo.number, event: "assigned" }),
        actor: { actorUserId: actor.actorUserId, actorEmail: actor.actorEmail },
      });
    }
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
  const wo = await prisma.workOrder.findUnique({ where: { id: input.workOrderId }, select: { id: true, number: true, status: true, assigneeId: true, assigneeEmail: true } });
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
    // Inbox hook (Unit 5): notify the assignee their WO was cancelled (self-cancel suppressed).
    await emitWorkOrderStatusTx(
      tx,
      { changed: true, prev: wo.status, next: "CANCELLED", number: wo.number, assigneeId: wo.assigneeId, assigneeEmail: wo.assigneeEmail },
      actor,
      wo.id,
    );
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
    const change = await bumpWorkOrderRollupTx(tx, task.workOrderId);
    await emitWorkOrderStatusTx(tx, change, actor, task.workOrderId);
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "WorkOrderTask", entityId: task.id, summary: `Started a task` });
    return row;
  });
  return { taskId: updated.id, status: updated.status };
}

/** Recompute + persist the shell status from the current task statuses (called after every task move).
 * In-tx; the caller owns the transaction. PURE of notification concerns (amendment 2): it RETURNS what
 * changed so a caller can emit. No-op (changed:false) when the rollup doesn't change the status. */
export async function bumpWorkOrderRollupTx(
  tx: Prisma.TransactionClient,
  workOrderId: string,
): Promise<WorkOrderRollupChange> {
  const wo = await tx.workOrder.findUnique({
    where: { id: workOrderId },
    select: { status: true, startedAt: true, number: true, assigneeId: true, assigneeEmail: true },
  });
  if (!wo) return { changed: false, prev: null, next: null, number: null, assigneeId: null, assigneeEmail: null };
  const base = { prev: wo.status, number: wo.number, assigneeId: wo.assigneeId, assigneeEmail: wo.assigneeEmail };
  const tasks = await tx.workOrderTask.findMany({ where: { workOrderId }, select: { status: true } });
  const next = rollUpWorkOrderStatus(
    wo.status,
    tasks.map((t) => t.status),
  );

  if (next === wo.status) {
    // No status transition. Preserve the original side effect: stamp startedAt if we're IN_PROGRESS
    // without one. Not a "change" for notification purposes.
    if (next === "IN_PROGRESS" && !wo.startedAt) {
      await tx.workOrder.update({ where: { id: workOrderId }, data: { startedAt: new Date() } });
    }
    return { changed: false, next, ...base };
  }

  const data: Prisma.WorkOrderUpdateInput = { status: next };
  if (next === "IN_PROGRESS" && !wo.startedAt) data.startedAt = new Date();
  if (next === "APPROVED") data.completedAt = new Date();
  if (next !== "APPROVED" && wo.status === "APPROVED") data.completedAt = null;
  // Conditional UPDATE gated on the observed status — the real concurrency barrier (amendment 3): only
  // the tx that actually flips the row gets count===1, so emit-on-changed can't double-fire.
  const res = await tx.workOrder.updateMany({ where: { id: workOrderId, status: wo.status }, data });
  return { changed: res.count === 1, next, ...base };
}
