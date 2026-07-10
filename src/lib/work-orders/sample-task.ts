import type { Prisma, WorkOrderTask } from "@prisma/client";
import { runInTenantTx } from "@/lib/tenant/tx";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { assertTaskTransition } from "@/lib/work-orders/status";
import { bumpWorkOrderRollupTx } from "@/lib/work-orders/lifecycle";
import type { CompleteTaskInput, CompleteTaskResult } from "@/lib/work-orders/execute";
import { createSampleTx, resolveSampleLotId } from "@/lib/chemistry/samples";

// Phase 9.3 Unit 7: complete a SAMPLE_PULL work-order task by pulling a REAL sample through the existing
// sample core. Idempotency is end-to-end: the WO attempt commandId is threaded into the Sample's
// clientRequestId, and the sample create + attempt + status flip all commit in ONE transaction — so a
// retry after a partial commit can never orphan a sample or double-pull.

function asStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Complete a SAMPLE_PULL observation task -> a real Sample row. Called from completeObservationTaskCore. */
export async function completeSamplePullTaskCore(
  actor: LedgerActor,
  input: CompleteTaskInput & { task: WorkOrderTask },
): Promise<CompleteTaskResult> {
  const { task } = input;
  assertTaskTransition(task.status, "DONE");

  const planned = (task.plannedPayload ?? {}) as Record<string, unknown>;
  const merged = { ...planned, ...(input.actualPayload ?? {}) };
  const vesselId = task.destVesselId ?? task.sourceVesselId ?? asStr(merged.vesselId) ?? undefined;
  const lotHint = task.lotId ?? asStr(merged.lotId) ?? undefined;
  // When a vessel is known, resolve THROUGH resolveSampleLotId so a client-supplied lotId is validated to
  // be resident in that vessel (residency + tenant scope) — never trust the hint verbatim. Mirrors the
  // original pullSampleCore and the harvest-weigh-in server guard. Only a lot with no vessel uses the hint.
  const lotId = vesselId ? await resolveSampleLotId({ vesselId, lotId: lotHint }) : (lotHint ?? (await resolveSampleLotId({ vesselId, lotId: lotHint })));

  const sampleInput = {
    lotId,
    vesselId,
    sendNow: merged.sendNow === true || asStr(merged.status) === "SENT",
    ...(asStr(merged.lab) ? { lab: asStr(merged.lab)! } : {}),
    ...(asStr(merged.source) ? { source: asStr(merged.source)! } : {}),
    note: input.completionNote?.trim() || asStr(merged.note) || undefined,
    clientRequestId: input.commandId, // end-to-end idempotency (Sample.clientRequestId @unique)
  };

  const result = await runInTenantTx(async (tx) => {
    const sample = await createSampleTx(tx, actor, { lotId, input: sampleInput });

    const seq = (await tx.workOrderTaskAttempt.count({ where: { taskId: task.id } })) + 1;
    const attempt = await tx.workOrderTaskAttempt.create({
      data: {
        taskId: task.id,
        seq,
        commandId: input.commandId,
        status: "APPROVED", // observations skip the approval gate
        actualPayload: { ...merged, sampleId: sample.sampleId, lotId } as Prisma.InputJsonValue,
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

    const claimed = await tx.workOrderTask.updateMany({
      where: { id: task.id, status: task.status, currentAttemptId: task.currentAttemptId },
      data: { status: "DONE", currentAttemptId: attempt.id, completionNote: input.completionNote?.trim() || null },
    });
    if (claimed.count === 0) {
      throw new ActionError("That task was already completed by someone else. Refresh and try again.", "CONFLICT");
    }
    await bumpWorkOrderRollupTx(tx, task.workOrderId);
    await writeAudit(tx, { ...actor, action: "CREATE", entityType: "WorkOrderTask", entityId: task.id, summary: `Pulled sample ${sample.sampleId}` });
    return { attemptId: attempt.id };
  });

  return { taskId: task.id, attemptId: result.attemptId, operationId: null, status: "DONE", duplicate: false, message: "Sample pulled." };
}
