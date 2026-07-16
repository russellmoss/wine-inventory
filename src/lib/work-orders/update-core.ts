import { runInTenantTx } from "@/lib/tenant/tx";
import { requireTenantId } from "@/lib/tenant/context";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import type { CreateTaskInput } from "@/lib/work-orders/lifecycle";
import { resolveAssigneeIdByEmail } from "@/lib/work-orders/lifecycle";
import {
  syncReservationsForTaskTx,
  releaseReservationsForTaskTx,
} from "@/lib/work-orders/reservations";

// Plan 071: edit a work order in place. Only PENDING tasks may change; executed tasks (any non-PENDING
// status) are LOCKED — their immutable ledger op (WORKORDER-1) is never touched. Locked tasks may be
// repositioned (seq/groupSeq) but nothing else. On an ISSUED WO the changed pending tasks' advisory holds
// are released + recreated per task (never whole-WO, which would double-hold). The WO keeps its status.

/** One row of the desired end-state, in final display order. `locked` slots carry only a reposition;
 * editable slots carry `input` (the instantiated task content). New tasks omit `existingTaskId`. */
export type UpdateTaskSlot = {
  existingTaskId?: string | null;
  locked: boolean;
  seq: number;
  groupSeq: number;
  input?: CreateTaskInput; // required when !locked
};

export type UpdateWorkOrderInput = {
  workOrderId: string;
  title?: string;
  instructions?: string | null;
  assigneeId?: string | null;
  assigneeEmail?: string | null;
  dueAt?: Date | null;
  priority?: string | null;
  locationId?: string | null;
  slots: UpdateTaskSlot[];
};

export type UpdateWorkOrderResult = {
  workOrderId: string;
  number: number;
  status: string;
  reservationWarnings: string[];
  /** Final task id per input slot (same order), so the caller can wire equipment. */
  taskIds: string[];
};

export async function updateWorkOrderCore(actor: LedgerActor, input: UpdateWorkOrderInput): Promise<UpdateWorkOrderResult> {
  return runInTenantTx(async (tx) => {
    const tenantId = requireTenantId();
    const wo = await tx.workOrder.findUnique({ where: { id: input.workOrderId }, select: { id: true, number: true, status: true } });
    if (!wo) throw new ActionError("That work order no longer exists.");
    if (wo.status === "APPROVED" || wo.status === "CANCELLED") {
      throw new ActionError("A finalized or cancelled work order can no longer be edited.", "CONFLICT");
    }

    const existing = await tx.workOrderTask.findMany({ where: { workOrderId: wo.id }, select: { id: true, status: true } });
    const statusById = new Map(existing.map((t) => [t.id, t.status]));
    const editableIds = new Set(existing.filter((t) => t.status === "PENDING").map((t) => t.id));

    // Validate every slot's existingTaskId + locked flag against reality (guards against editing an
    // executed task or acting on stale client state).
    for (const slot of input.slots) {
      if (slot.existingTaskId) {
        const st = statusById.get(slot.existingTaskId);
        if (st === undefined) throw new ActionError("This work order changed since you opened it — reload and try again.", "CONFLICT");
        const isPending = st === "PENDING";
        if (slot.locked && isPending) throw new ActionError("Task state changed — reload and try again.", "CONFLICT");
        if (!slot.locked && !isPending) throw new ActionError("That task has already been recorded and can't be edited — reverse it first.", "CONFLICT");
      }
      if (!slot.locked && !slot.input) throw new ActionError("Internal: editable slot missing task content.");
    }

    // Deletes: editable (PENDING) tasks the edit no longer includes. Guard the delete on status="PENDING"
    // (atomic) so a task a worker completed CONCURRENTLY (between the read above and here) is never deleted —
    // that would cascade-delete its attempt and orphan the immutable op. count 0 → someone raced us.
    const referenced = new Set(input.slots.map((s) => s.existingTaskId).filter((x): x is string => !!x));
    for (const id of editableIds) {
      if (!referenced.has(id)) {
        await releaseReservationsForTaskTx(tx, { taskId: id });
        const del = await tx.workOrderTask.deleteMany({ where: { id, status: "PENDING" } });
        if (del.count === 0) throw new ActionError("A task changed while you were editing — reload and try again.", "CONFLICT");
      }
    }

    // Apply each slot in order. Track final task ids (per slot) + which non-locked tasks need a hold re-sync.
    const taskIds: string[] = [];
    const toResync: { id: string; input: CreateTaskInput }[] = [];
    for (const slot of input.slots) {
      if (slot.locked && slot.existingTaskId) {
        await tx.workOrderTask.update({ where: { id: slot.existingTaskId }, data: { seq: slot.seq, groupSeq: slot.groupSeq } });
        taskIds.push(slot.existingTaskId);
        continue;
      }
      const t = slot.input!;
      const data = {
        seq: slot.seq,
        groupSeq: slot.groupSeq,
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
        priority: t.priority ?? null,
        plannedPayload: t.plannedPayload,
      };
      if (slot.existingTaskId) {
        // Atomic status guard (TOCTOU): only update a task that is STILL pending — never overwrite one a
        // worker executed concurrently (which would corrupt its recorded op).
        const upd = await tx.workOrderTask.updateMany({ where: { id: slot.existingTaskId, status: "PENDING" }, data });
        if (upd.count === 0) throw new ActionError("A task was recorded while you were editing — reload and try again.", "CONFLICT");
        taskIds.push(slot.existingTaskId);
        toResync.push({ id: slot.existingTaskId, input: t });
      } else {
        const created = await tx.workOrderTask.create({ data: { tenantId, workOrderId: wo.id, status: "PENDING", ...data }, select: { id: true } });
        taskIds.push(created.id);
        toResync.push({ id: created.id, input: t });
      }
    }

    // WO-level fields. Lead resolution mirrors create (explicit id wins, else resolve the email to a member).
    const leadId = input.assigneeId ?? (await resolveAssigneeIdByEmail(tx, tenantId, input.assigneeEmail));
    await tx.workOrder.update({
      where: { id: wo.id },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.instructions !== undefined ? { instructions: input.instructions?.trim() || null } : {}),
        assigneeId: leadId,
        ...(input.assigneeEmail !== undefined ? { assigneeEmail: input.assigneeEmail ?? null } : {}),
        ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.locationId !== undefined ? { locationId: input.locationId } : {}),
      },
    });

    // Reservations exist once a WO is issued (DRAFT has none). A WO can be ISSUED, IN_PROGRESS, or
    // PENDING_APPROVAL here (APPROVED/CANCELLED were refused up top) — all of those carry live holds, so
    // re-sync any non-DRAFT WO. Re-sync each changed/new OPERATION task's holds; deleted tasks were released
    // above; locked tasks are untouched.
    const reservationWarnings: string[] = [];
    if (wo.status !== "DRAFT") {
      for (const { id, input: t } of toResync) {
        if (t.kind !== "OPERATION") continue;
        const w = await syncReservationsForTaskTx(
          tx,
          { id, opType: t.opType ?? null, sourceVesselId: t.sourceVesselId ?? null, destVesselId: t.destVesselId ?? null, lotId: t.lotId ?? null, materialId: t.materialId ?? null, dueAt: t.dueAt ?? null, plannedPayload: t.plannedPayload },
          { workOrderId: wo.id },
        );
        reservationWarnings.push(...w);
      }
    }

    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "WorkOrder", entityId: wo.id, summary: `Edited work order #${wo.number}` });
    return { workOrderId: wo.id, number: wo.number, status: wo.status, reservationWarnings, taskIds };
  });
}
