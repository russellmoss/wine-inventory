import type { Prisma, WorkOrderTask } from "@prisma/client";
import { runInTenantTx } from "@/lib/tenant/tx";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { assertTaskTransition } from "@/lib/work-orders/status";
import { bumpWorkOrderRollupTx } from "@/lib/work-orders/lifecycle";
import type { CompleteTaskInput, CompleteTaskResult } from "@/lib/work-orders/execute";
import { writeHarvestPickTx } from "@/lib/harvest/pick-core";
import { coerceBrix, coercePh, coerceTa } from "@/lib/harvest/pick-fields";
import { parseISODateUTC } from "@/lib/fieldnotes/week";

// Plan 039: the work-order "fruit intake / weigh-in" completion lane. A HARVEST_WEIGH_IN task is an
// OBSERVATION whose target is a VINEYARD BLOCK (not a lot) — completing it writes a HarvestPick to that
// block's current-vintage record via the same pick-write core the harvest module + assistant use, NOT the
// cellar AnalysisPanel. No ledger op, no approval gate: straight to DONE (observation lane), with an
// append-only attempt for provenance + commandId idempotency (mirror completeObservationTaskCore's
// attempt/claim/rollup). Reversible per the existing observation/undo model.

const asNum = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
};

/** Complete a HARVEST_WEIGH_IN observation: write a HarvestPick for the target block. */
export async function completeHarvestWeighInTaskCore(
  actor: LedgerActor,
  input: CompleteTaskInput & { task: WorkOrderTask },
): Promise<CompleteTaskResult> {
  const { task } = input;
  assertTaskTransition(task.status, "DONE");

  const planned = (task.plannedPayload ?? {}) as Record<string, unknown>;
  const merged = { ...planned, ...(input.actualPayload ?? {}) };

  const blockId = task.blockId ?? (typeof merged.blockId === "string" ? merged.blockId : null);
  if (!blockId) throw new ActionError("This weigh-in has no vineyard block to record against.");

  const weightKg = asNum(merged.weightKg);
  if (!(weightKg != null && weightKg > 0)) throw new ActionError("Enter the fruit weight (kg) for the weigh-in.");

  // Field readings share the harvest coercion (registry ranges); absent → null.
  const brix = coerceBrix(merged.brixAtPick);
  const ph = coercePh(merged.phAtPick);
  const ta = coerceTa(merged.taAtPick);

  const pickDate =
    (typeof merged.pickDate === "string" && parseISODateUTC(merged.pickDate)) || new Date();
  const vintageYear = pickDate.getUTCFullYear();

  const result = await runInTenantTx(async (tx) => {
    // RLS pins this to the WO's tenant; a cross-tenant block simply isn't found.
    const block = await tx.vineyardBlock.findUnique({ where: { id: blockId }, select: { vineyardId: true } });
    if (!block) throw new ActionError("That vineyard block no longer exists.");

    await writeHarvestPickTx(tx, actor, {
      blockId,
      vineyardId: block.vineyardId,
      vintageYear,
      pickDate,
      weightKg,
      brixAtPick: brix,
      phAtPick: ph,
      taAtPick: ta,
      note: input.completionNote,
    });

    const seq = (await tx.workOrderTaskAttempt.count({ where: { taskId: task.id } })) + 1;
    const attempt = await tx.workOrderTaskAttempt.create({
      data: {
        taskId: task.id,
        seq,
        commandId: input.commandId,
        status: "APPROVED", // observation lane: no approval gate
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

    // Compare-and-swap: a concurrent completion with a different commandId would otherwise write a second
    // pick. count===0 → throw → tx rolls back (same guard as completeObservationTaskCore).
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
      summary: `Recorded a fruit weigh-in (${weightKg} kg)`,
    });
    return { attemptId: attempt.id };
  });

  return { taskId: task.id, attemptId: result.attemptId, operationId: null, status: "DONE", duplicate: false, message: "Weigh-in recorded." };
}
