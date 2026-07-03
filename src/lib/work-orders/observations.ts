import type { Prisma, WorkOrderTask } from "@prisma/client";
import { runInTenantTx } from "@/lib/tenant/tx";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { insertPanelTx, type ReadingInput } from "@/lib/chemistry/measurements";
import { assertTaskTransition } from "@/lib/work-orders/status";
import { bumpWorkOrderRollupTx } from "@/lib/work-orders/lifecycle";
import type { CompleteTaskInput, CompleteTaskResult } from "@/lib/work-orders/execute";

// The observation lane (Phase 9 Unit 8): OBSERVATION tasks write DIRECTLY to the measurement store
// (AnalysisPanel/readings — soft-deletable, non-ledger) and go straight to DONE. No approval gate, no
// reservation — an observation doesn't move liters or cost, so a gate would add friction for zero
// compliance value. Still records an append-only attempt (commandId idempotency + provenance), with a
// null operationId and an auto-APPROVED status so the review queue skips it.

/** Complete an OBSERVATION task. Called from completeTaskCore after the commandId idempotency check. */
export async function completeObservationTaskCore(
  actor: LedgerActor,
  input: CompleteTaskInput & { task: WorkOrderTask },
): Promise<CompleteTaskResult> {
  const { task } = input;
  if (task.kind !== "OBSERVATION") throw new ActionError("Not an observation task.");
  assertTaskTransition(task.status, "DONE");

  const planned = (task.plannedPayload ?? {}) as Record<string, unknown>;
  const merged = { ...planned, ...(input.actualPayload ?? {}) };
  const rawReadings = Array.isArray(merged.readings) ? (merged.readings as unknown[]) : [];
  const readings: ReadingInput[] = rawReadings
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({ analyte: String(r.analyte), value: Number(r.value), unit: String(r.unit ?? "") }))
    .filter((r) => r.analyte && Number.isFinite(r.value));

  const lotId = task.lotId ?? (typeof merged.lotId === "string" ? merged.lotId : null);
  const vesselId = task.destVesselId ?? task.sourceVesselId ?? (typeof merged.vesselId === "string" ? merged.vesselId : null);
  if (readings.length > 0 && !lotId) {
    throw new ActionError("This observation records readings but has no lot to attach them to.");
  }

  const result = await runInTenantTx(async (tx) => {
    let panelId: string | null = null;
    if (readings.length > 0 && lotId) {
      const panel = await insertPanelTx(tx, actor, {
        lotId,
        vesselId,
        observedAt: new Date(),
        readings,
        note: input.completionNote?.trim() || null,
        clientRequestId: input.commandId, // idempotency on the soft-deletable panel
      });
      panelId = panel.panelId;
    }

    const seq = (await tx.workOrderTaskAttempt.count({ where: { taskId: task.id } })) + 1;
    const attempt = await tx.workOrderTaskAttempt.create({
      data: {
        taskId: task.id,
        seq,
        commandId: input.commandId,
        status: "APPROVED", // no approval gate for observations
        actualPayload: merged as Prisma.InputJsonValue,
        operationId: null, // not a ledger op
        completionNote: input.completionNote?.trim() || null,
        completedById: actor.actorUserId,
        completedByEmail: actor.actorEmail,
        reviewedAt: new Date(),
        reviewedById: actor.actorUserId,
        reviewedByEmail: actor.actorEmail,
      },
      select: { id: true },
    });

    // Compare-and-swap (same guard as the operation lane): a concurrent observation completion with a
    // different commandId would otherwise write a second panel. count===0 → throw → tx rolls back.
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
      action: "CREATE",
      entityType: "WorkOrderTask",
      entityId: task.id,
      summary: `Logged observation${panelId ? ` (${readings.length} reading${readings.length === 1 ? "" : "s"})` : ""}`,
    });
    return { attemptId: attempt.id };
  });

  return { taskId: task.id, attemptId: result.attemptId, operationId: null, status: "DONE", duplicate: false, message: "Observation recorded." };
}
