import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runLedgerWrite } from "@/lib/ledger/write";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { rackWineTx } from "@/lib/vessels/rack-core";
import { topVesselTx } from "@/lib/cellar/topping";
import { recordNeutralDoseTx, resolveDoseMaterial, ADDITION_CONFIG, FINING_CONFIG, type AddAdditionInput } from "@/lib/cellar/addition";
import type { RateBasis } from "@/lib/cellar/additions-math";
import { assertTaskTransition } from "@/lib/work-orders/status";
import { bumpWorkOrderRollupTx } from "@/lib/work-orders/lifecycle";
import { releaseReservationsForTaskTx } from "@/lib/work-orders/reservations";
import { completeObservationTaskCore } from "@/lib/work-orders/observations";

// The heart of Phase 9 (Unit 6): completing an OPERATION task writes the REAL ledger op immediately —
// through the existing family cores' tx-forms (rackWineTx / recordNeutralDoseTx / topVesselTx) — and the
// task owns it in PENDING_APPROVAL. The op is ordinary + immutable (WORKORDER-1); "pending approval" is
// task state, not op state. A2: op + attempt + reservation-release + audit all land in ONE
// runLedgerWrite (no split-brain / dangling reservation / offline double-write). A1: the immutable
// commandId lives on the append-only ATTEMPT, so a duplicate submit (offline drain double-tap) is a
// no-op success. OBSERVATION tasks route to the direct-log lane (Unit 8) — no ledger, no approval.

export type CompleteTaskInput = {
  taskId: string;
  commandId: string; // minted once at capture (idempotency on the immutable event, A1)
  actualPayload?: Record<string, unknown>; // the worker's actuals; merged OVER the planned payload
  completionNote?: string;
  deviationReason?: string;
  /** Decision 2: finalize immediately (skip the review queue) — set by the action when an admin
   * completes their own work on an autoFinalize WO (shouldAutoFinalize). OPERATION lane only. */
  autoFinalize?: boolean;
};

export type CompleteTaskResult = {
  taskId: string;
  attemptId: string;
  operationId: number | null;
  status: string;
  duplicate: boolean;
  message: string;
};

type TaskRow = Prisma.WorkOrderTaskGetPayload<{}>;

const asNum = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const asStr = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);

/** Merge planned ⊕ actual — the worker's actuals win. A3: nothing here is frozen at issue; the amount
 * is (re)computed from current vessel volume inside the core at open time. */
function mergedPayload(task: TaskRow, actual?: Record<string, unknown>): Record<string, unknown> {
  const planned = (task.plannedPayload ?? {}) as Record<string, unknown>;
  return { ...planned, ...(actual ?? {}) };
}

/** Dispatch an operation task to the right family core (tx-form) and return the op it wrote. Pre-resolved
 * material (for additions) is passed in since the free-text upsert can't run inside the ledger tx. */
async function dispatchOperationTx(
  tx: Prisma.TransactionClient,
  actor: LedgerActor,
  task: TaskRow,
  payload: Record<string, unknown>,
  resolvedMaterial: { materialId: string; materialName: string } | null,
): Promise<{ operationId: number; message: string }> {
  const note = asStr(payload.note) ?? null;
  switch (task.opType) {
    case "RACK": {
      const r = await rackWineTx(tx, actor, {
        fromVesselId: (asStr(payload.fromVesselId) ?? task.sourceVesselId) as string,
        toVesselId: (asStr(payload.toVesselId) ?? task.destVesselId) as string,
        drawL: asNum(payload.drawL),
        lossL: asNum(payload.lossL),
        note: note ?? undefined,
      });
      return { operationId: r.operationId, message: r.message };
    }
    case "TOPPING": {
      const r = await topVesselTx(tx, actor, {
        fromVesselId: (asStr(payload.fromVesselId) ?? task.sourceVesselId) as string,
        toVesselId: (asStr(payload.toVesselId) ?? task.destVesselId) as string,
        volumeL: asNum(payload.volumeL) ?? 0,
        note: note ?? undefined,
      });
      return { operationId: r.operationId, message: r.message };
    }
    case "ADDITION":
    case "FINING": {
      if (!resolvedMaterial) throw new ActionError("This addition task has no material to add.");
      const cfg = task.opType === "FINING" ? FINING_CONFIG : ADDITION_CONFIG;
      const additionInput: AddAdditionInput = {
        vesselId: (asStr(payload.vesselId) ?? task.destVesselId ?? task.sourceVesselId) as string,
        lotId: asStr(payload.lotId) ?? task.lotId ?? undefined,
        materialId: resolvedMaterial.materialId,
        rateValue: asNum(payload.rateValue) ?? 0,
        rateBasis: payload.rateBasis as RateBasis,
        note: note ?? undefined,
      };
      const r = await recordNeutralDoseTx(tx, actor, additionInput, cfg, resolvedMaterial);
      return { operationId: r.operationId, message: r.message };
    }
    default:
      throw new ActionError(
        `Work orders can't yet auto-log a ${task.opType ?? "?"} operation. v1 supports rack, addition, fining, and topping.`,
        "CONFLICT",
      );
  }
}

/** Complete a task: OPERATION → write the real op + a PENDING_APPROVAL attempt; OBSERVATION → direct log
 * (Unit 8). Idempotent on commandId. */
export async function completeTaskCore(actor: LedgerActor, input: CompleteTaskInput): Promise<CompleteTaskResult> {
  const task = await prisma.workOrderTask.findUnique({ where: { id: input.taskId } });
  if (!task) throw new ActionError("That task no longer exists.");

  // Idempotency (A1): a prior attempt with this commandId means this submit already committed. Return it.
  const prior = await prisma.workOrderTaskAttempt.findUnique({ where: { commandId: input.commandId } });
  if (prior) {
    return {
      taskId: task.id,
      attemptId: prior.id,
      operationId: prior.operationId,
      status: task.status,
      duplicate: true,
      message: "Already recorded.",
    };
  }

  if (task.kind === "OBSERVATION") {
    return completeObservationTaskCore(actor, { task, ...input });
  }

  // OPERATION lane.
  assertTaskTransition(task.status, "PENDING_APPROVAL");
  const payload = mergedPayload(task, input.actualPayload);

  // Resolve the addition material BEFORE the ledger tx (the free-text upsert opens its own tx).
  let resolvedMaterial: { materialId: string; materialName: string } | null = null;
  if (task.opType === "ADDITION" || task.opType === "FINING") {
    const cfg = task.opType === "FINING" ? FINING_CONFIG : ADDITION_CONFIG;
    resolvedMaterial = await resolveDoseMaterial(actor, {
      vesselId: (asStr(payload.vesselId) ?? task.destVesselId ?? task.sourceVesselId) as string,
      materialId: task.materialId ?? asStr(payload.materialId),
      materialName: asStr(payload.materialName),
      materialKind: asStr(payload.materialKind),
      rateValue: asNum(payload.rateValue) ?? 0,
      rateBasis: payload.rateBasis as RateBasis,
    }, cfg);
  }

  const finalize = input.autoFinalize === true;
  try {
    const result = await runLedgerWrite(async (tx) => {
      const { operationId, message } = await dispatchOperationTx(tx, actor, task, payload, resolvedMaterial);

      const now = new Date();
      const seq = (await tx.workOrderTaskAttempt.count({ where: { taskId: task.id } })) + 1;
      const attempt = await tx.workOrderTaskAttempt.create({
        data: {
          taskId: task.id,
          seq,
          commandId: input.commandId,
          status: finalize ? "APPROVED" : "PENDING_APPROVAL",
          actualPayload: payload as Prisma.InputJsonValue,
          operationId,
          completionNote: input.completionNote?.trim() || null,
          deviationReason: input.deviationReason?.trim() || null,
          completedById: actor.actorUserId,
          completedByEmail: actor.actorEmail,
          ...(finalize ? { reviewedAt: now, reviewedById: actor.actorUserId, reviewedByEmail: actor.actorEmail } : {}),
        },
        select: { id: true },
      });

      await tx.workOrderTask.update({
        where: { id: task.id },
        data: {
          status: finalize ? "APPROVED" : "PENDING_APPROVAL",
          currentAttemptId: attempt.id,
          completionNote: input.completionNote?.trim() || null,
          deviationReason: input.deviationReason?.trim() || null,
        },
      });

      // The advisory hold is discharged — the real op committed the actual (reconciliation is
      // planned-vs-actual on the op/attempt). WORKORDER-2: the reservation was never the guarantee.
      await releaseReservationsForTaskTx(tx, { taskId: task.id });
      await bumpWorkOrderRollupTx(tx, task.workOrderId);
      await writeAudit(tx, {
        ...actor,
        action: "STOCK_MOVEMENT",
        entityType: "WorkOrderTask",
        entityId: task.id,
        summary: `Completed WO task (pending review): ${message}`,
      });
      return { attemptId: attempt.id, operationId, message };
    });

    return { taskId: task.id, attemptId: result.attemptId, operationId: result.operationId, status: finalize ? "APPROVED" : "PENDING_APPROVAL", duplicate: false, message: result.message };
  } catch (e) {
    // A concurrent duplicate (same commandId raced past the pre-check) surfaces as a unique violation —
    // treat it as the idempotent success it is (mirrors the ferment panel-core pattern).
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
      const dup = await prisma.workOrderTaskAttempt.findUnique({ where: { commandId: input.commandId } });
      if (dup) {
        return { taskId: task.id, attemptId: dup.id, operationId: dup.operationId, status: "PENDING_APPROVAL", duplicate: true, message: "Already recorded." };
      }
    }
    throw e;
  }
}
