import type { Prisma, WorkOrderTask } from "@prisma/client";
import { runInTenantTx } from "@/lib/tenant/tx";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { assertTaskTransition } from "@/lib/work-orders/status";
import { bumpWorkOrderRollupTx } from "@/lib/work-orders/lifecycle";
import { recordVesselActivityTx } from "@/lib/work-orders/vessel-activity";
import { coerceVesselActivityKind } from "@/lib/cellar/vessel-activity-vocab";
import type { CompleteTaskInput, CompleteTaskResult } from "@/lib/work-orders/execute";

// The maintenance lane (Phase 9.1 Unit 3, A4): MAINTENANCE tasks (temp setpoints + cleaning/sanitizing/
// steaming/gas) write a lotless VesselActivityEvent (+ overhead supply depletion) and go STRAIGHT TO DONE —
// no ledger op, no approval gate (mirrors the observation lane). Still records an append-only attempt
// (commandId idempotency + provenance, operationId null) and CAS-claims the task so a concurrent completion
// can't double-write. A stock shortfall is surfaced as a soft warning in the result (D4) — never blocks (E1).

const asNum = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const asStr = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);

/** Complete a MAINTENANCE task. Called from completeTaskCore after the commandId idempotency check. */
export async function completeMaintenanceTaskCore(
  actor: LedgerActor,
  input: CompleteTaskInput & { task: WorkOrderTask },
): Promise<CompleteTaskResult> {
  const { task } = input;
  if (task.kind !== "MAINTENANCE") throw new ActionError("Not a maintenance task.");
  assertTaskTransition(task.status, "DONE");

  const planned = (task.plannedPayload ?? {}) as Record<string, unknown>;
  const merged = { ...planned, ...(input.actualPayload ?? {}) };
  const kind = coerceVesselActivityKind(task.activityType);
  const vesselId = task.destVesselId ?? task.sourceVesselId ?? asStr(merged.vesselId) ?? null;
  if (!vesselId) throw new ActionError("This maintenance task has no vessel.");

  // GAS carries its gas identity in `gasType` → event.targetUnit; TEMP_SETPOINT carries °C/°F in targetUnit.
  const targetUnit = kind === "GAS" ? asStr(merged.gasType) ?? null : asStr(merged.targetUnit) ?? null;
  const materialId = task.materialId ?? asStr(merged.materialId) ?? null;
  const amount = asNum(merged.amount) ?? null;

  // SERIALIZABLE (matching the wine ledger path): the overhead depletion does read-then-decrement on
  // SupplyLot, so two concurrent maintenance completions drawing the SAME lot must serialize or one could
  // drive qtyRemaining negative — which WORKORDER-3 / E1 forbid. A rare serialization conflict surfaces as
  // a retryable error (the crew taps again), never corrupt stock.
  const result = await runInTenantTx(async (tx) => {
    const seq = (await tx.workOrderTaskAttempt.count({ where: { taskId: task.id } })) + 1;
    const attempt = await tx.workOrderTaskAttempt.create({
      data: {
        taskId: task.id,
        seq,
        commandId: input.commandId,
        status: "APPROVED", // no approval gate for maintenance
        actualPayload: merged as Prisma.InputJsonValue,
        operationId: null, // not a ledger op
        completionNote: input.completionNote?.trim() || null,
        deviationReason: input.deviationReason?.trim() || null,
        completedById: actor.actorUserId,
        completedByEmail: actor.actorEmail,
        reviewedAt: new Date(),
        reviewedById: actor.actorUserId,
        reviewedByEmail: actor.actorEmail,
      },
      select: { id: true },
    });

    const { depletion } = await recordVesselActivityTx(tx, actor, {
      vesselId,
      kind,
      taskId: task.id,
      attemptId: attempt.id,
      targetValue: asNum(merged.targetValue) ?? null,
      targetUnit,
      achievedValue: asNum(merged.achievedValue) ?? null, // dec 4b
      achievedUnit: kind === "TEMP_SETPOINT" ? targetUnit : null,
      materialId,
      amount,
      note: input.completionNote?.trim() || asStr(merged.note) || null,
      commandId: input.commandId,
    });

    // Compare-and-swap (same guard as the observation/operation lanes): a concurrent completion with a
    // different commandId would otherwise write a second event/depletion. count===0 → throw → tx rolls back.
    const claimed = await tx.workOrderTask.updateMany({
      where: { id: task.id, status: task.status, currentAttemptId: task.currentAttemptId },
      data: { status: "DONE", currentAttemptId: attempt.id, completionNote: input.completionNote?.trim() || null, deviationReason: input.deviationReason?.trim() || null },
    });
    if (claimed.count === 0) {
      throw new ActionError("That task was already completed by someone else. Refresh and try again.", "CONFLICT");
    }

    await bumpWorkOrderRollupTx(tx, task.workOrderId);
    // D4: surface a stock shortfall as a soft warning (draw-to-zero already happened; nothing blocked).
    const shortfall = depletion?.shortfall ?? 0;
    const shortMsg = shortfall > 0 ? ` (used more than on record — ${shortfall} short of stock)` : "";
    await writeAudit(tx, {
      ...actor,
      action: "STOCK_MOVEMENT",
      entityType: "WorkOrderTask",
      entityId: task.id,
      summary: `Recorded ${kind.toLowerCase().replace(/_/g, " ")} on vessel${shortMsg}`,
    });
    return { attemptId: attempt.id, shortfall };
  }, { isolationLevel: "Serializable" });

  const warn = result.shortfall > 0 ? ` Warning: used ${result.shortfall} more than on record.` : "";
  return { taskId: task.id, attemptId: result.attemptId, operationId: null, status: "DONE", duplicate: false, message: `Maintenance recorded.${warn}` };
}
