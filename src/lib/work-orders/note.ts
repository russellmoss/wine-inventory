import type { Prisma, WorkOrderTask } from "@prisma/client";
import { runInTenantTx } from "@/lib/tenant/tx";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { assertTaskTransition } from "@/lib/work-orders/status";
import { bumpWorkOrderRollupTx } from "@/lib/work-orders/lifecycle";
import type { CompleteTaskInput, CompleteTaskResult } from "@/lib/work-orders/execute";

// The checklist/note lane (plan 034): a NOTE task is a free-text checkable line that does NO inventory
// work. Completing it writes NOTHING to the ledger, the measurement store, the vessel-activity log, or
// the cost roll-up — it only records an append-only attempt (commandId idempotency + provenance) and
// flips the task to DONE, exactly like OBSERVATION minus the measurement write. No approval gate, no
// reservation. An all-NOTE work order therefore auto-completes to APPROVED via rollUpWorkOrderStatus
// once every task is DONE (council: all-checklist WOs must close on all-DONE).

/** Complete a NOTE task. Called from completeTaskCore after the commandId idempotency check. */
export async function completeNoteTaskCore(
  actor: LedgerActor,
  input: CompleteTaskInput & { task: WorkOrderTask },
): Promise<CompleteTaskResult> {
  const { task } = input;
  if (task.kind !== "NOTE") throw new ActionError("Not a checklist task.");
  assertTaskTransition(task.status, "DONE");

  const planned = (task.plannedPayload ?? {}) as Record<string, unknown>;
  const merged = { ...planned, ...(input.actualPayload ?? {}) };

  const result = await runInTenantTx(async (tx) => {
    const seq = (await tx.workOrderTaskAttempt.count({ where: { taskId: task.id } })) + 1;
    const attempt = await tx.workOrderTaskAttempt.create({
      data: {
        taskId: task.id,
        seq,
        commandId: input.commandId,
        status: "APPROVED", // no approval gate for a checklist item
        actualPayload: merged as Prisma.InputJsonValue,
        operationId: null, // a NOTE writes no ledger op — ever
        completionNote: input.completionNote?.trim() || null,
        completedById: actor.actorUserId,
        completedByEmail: actor.actorEmail,
        reviewedAt: new Date(),
        reviewedById: actor.actorUserId,
        reviewedByEmail: actor.actorEmail,
      },
      select: { id: true },
    });

    // Compare-and-swap (same guard as the observation lane): a concurrent completion with a different
    // commandId would otherwise write a second attempt. count===0 → throw → tx rolls back.
    const claimed = await tx.workOrderTask.updateMany({
      where: { id: task.id, status: task.status, currentAttemptId: task.currentAttemptId },
      data: { status: "DONE", currentAttemptId: attempt.id, completionNote: input.completionNote?.trim() || null },
    });
    if (claimed.count === 0) {
      throw new ActionError("That task was already completed by someone else. Refresh and try again.", "CONFLICT");
    }
    await bumpWorkOrderRollupTx(tx, task.workOrderId);
    await writeAudit(tx, {
      ...actor,
      action: "UPDATE",
      entityType: "WorkOrderTask",
      entityId: task.id,
      summary: `Checked off a checklist item`,
    });
    return { attemptId: attempt.id };
  });

  return { taskId: task.id, attemptId: result.attemptId, operationId: null, status: "DONE", duplicate: false, message: "Checklist item done." };
}
