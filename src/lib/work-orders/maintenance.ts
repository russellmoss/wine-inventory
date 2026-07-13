import type { Prisma, WorkOrderTask } from "@prisma/client";
import { runInTenantTx } from "@/lib/tenant/tx";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { assertTaskTransition } from "@/lib/work-orders/status";
import { bumpWorkOrderRollupTx } from "@/lib/work-orders/lifecycle";
import { recordVesselActivityTx } from "@/lib/work-orders/vessel-activity";
import { coerceVesselActivityKind } from "@/lib/cellar/vessel-activity-vocab";
import { parseGroupActivityPayload, orderedMemberIds, type GroupActivityPayload } from "@/lib/work-orders/group-activity";
import { EQUIPMENT_STATUSES } from "@/lib/equipment/vocab";
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

  // Plan 053 E16: an EQUIPMENT_SERVICE task services an EquipmentAsset, not a vessel. Record-only overhead
  // (WORKORDER-3): NO VesselActivityEvent, NO ledger op, NO cost. It optionally transitions the status of
  // every EquipmentAsset attached to the task (the advisory equipment link from B10). Branch out here,
  // before coerceVesselActivityKind (which only knows vessel-activity kinds) and the vessel requirement.
  if (task.activityType === "EQUIPMENT_SERVICE") {
    const raw = asStr(merged.setStatus);
    const setStatus = raw && (EQUIPMENT_STATUSES as readonly string[]).includes(raw) ? raw : null;
    const result = await runInTenantTx(async (tx) => {
      const seq = (await tx.workOrderTaskAttempt.count({ where: { taskId: task.id } })) + 1;
      const attempt = await tx.workOrderTaskAttempt.create({
        data: {
          taskId: task.id, seq, commandId: input.commandId, status: "APPROVED",
          actualPayload: merged as Prisma.InputJsonValue, operationId: null,
          completionNote: input.completionNote?.trim() || null, deviationReason: input.deviationReason?.trim() || null,
          completedById: actor.actorUserId, completedByEmail: actor.actorEmail,
          reviewedAt: new Date(), reviewedById: actor.actorUserId, reviewedByEmail: actor.actorEmail,
        },
        select: { id: true },
      });
      let transitioned = 0;
      if (setStatus) {
        const links = await tx.workOrderTaskEquipment.findMany({ where: { taskId: task.id }, select: { equipmentId: true } });
        const equipmentIds = links.map((l) => l.equipmentId);
        if (equipmentIds.length > 0) {
          transitioned = (await tx.equipmentAsset.updateMany({ where: { id: { in: equipmentIds } }, data: { status: setStatus } })).count;
        }
      }
      // Same CAS guard as the vessel-activity lane: a concurrent completion with a different commandId loses.
      const claimed = await tx.workOrderTask.updateMany({
        where: { id: task.id, status: task.status, currentAttemptId: task.currentAttemptId },
        data: { status: "DONE", currentAttemptId: attempt.id, completionNote: input.completionNote?.trim() || null, deviationReason: input.deviationReason?.trim() || null },
      });
      if (claimed.count === 0) throw new ActionError("That task was already completed by someone else. Refresh and try again.", "CONFLICT");
      await bumpWorkOrderRollupTx(tx, task.workOrderId);
      await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "WorkOrderTask", entityId: task.id, summary: `Recorded equipment service${setStatus ? ` (${transitioned} set to ${setStatus})` : ""}` });
      return { attemptId: attempt.id, transitioned };
    }, { isolationLevel: "Serializable" });
    const msg = setStatus
      ? `Equipment service recorded — ${result.transitioned} asset${result.transitioned === 1 ? "" : "s"} set to ${setStatus}.`
      : "Equipment service recorded.";
    return { taskId: task.id, attemptId: result.attemptId, operationId: null, status: "DONE", duplicate: false, message: msg };
  }

  // Plan 061: a consolidated group maintenance task carries N member vessels in plannedPayload.groupActivity.
  // Complete ALL members at once — one record-only VesselActivityEvent per member (WORKORDER-3 per barrel),
  // one shared attempt, task straight to DONE. No ledger op / no approval gate (same as the single lane).
  const group = parseGroupActivityPayload(task.plannedPayload);
  if (group) return completeGroupMaintenanceTaskCore(actor, input, group);

  const kind = coerceVesselActivityKind(task.activityType);
  const vesselId = task.destVesselId ?? task.sourceVesselId ?? asStr(merged.vesselId) ?? null;
  if (!vesselId) throw new ActionError("This maintenance task has no vessel.");

  // GAS carries its gas identity in `gasType` → event.targetUnit; SO2 carries its method (strip/ring/gas) in
  // `so2Method` → targetUnit; OZONE records contact time (min) → targetValue; TEMP_SETPOINT carries °C/°F.
  const targetUnit =
    kind === "GAS"
      ? asStr(merged.gasType) ?? null
      : kind === "SO2"
        ? asStr(merged.so2Method) ?? null
        : kind === "OZONE"
          ? "min"
          : asStr(merged.targetUnit) ?? null;
  const targetValue = kind === "OZONE" ? asNum(merged.durationMin) ?? null : asNum(merged.targetValue) ?? null;
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
      targetValue,
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

/**
 * Plan 061: complete a CONSOLIDATED group maintenance task — one record-only VesselActivityEvent per member
 * in ONE Serializable tx, task straight to DONE (no ledger op, no approval gate). Each member gets a distinct
 * event commandId `${commandId}:${vesselId}` (the base attempt commandId is the task-level idempotency key;
 * VesselActivityEvent.commandId is a global unique, so per-member suffixes never collide). `amount` is the
 * per-vessel dose — N members deplete N × dose, matching the pre-consolidation fan-out total. Members are
 * deduped + sorted (deadlock-free lock order on the shared overhead SupplyLot); a member decommissioned
 * since authoring is skipped with a warning rather than crashing the whole completion (no FK on the JSON ids).
 */
async function completeGroupMaintenanceTaskCore(
  actor: LedgerActor,
  input: CompleteTaskInput & { task: WorkOrderTask },
  group: GroupActivityPayload,
): Promise<CompleteTaskResult> {
  const { task } = input;
  assertTaskTransition(task.status, "DONE");

  const kind = coerceVesselActivityKind(task.activityType);
  const planned = (task.plannedPayload ?? {}) as Record<string, unknown>;
  const merged = { ...planned, ...(input.actualPayload ?? {}) };

  const targetUnit =
    kind === "GAS" ? asStr(merged.gasType) ?? null
      : kind === "SO2" ? asStr(merged.so2Method) ?? null
        : kind === "OZONE" ? "min"
          : asStr(merged.targetUnit) ?? null;
  const targetValue = kind === "OZONE" ? asNum(merged.durationMin) ?? null : asNum(merged.targetValue) ?? null;
  const materialId = task.materialId ?? asStr(merged.materialId) ?? null;
  const amount = asNum(merged.amount) ?? null;
  const note = input.completionNote?.trim() || asStr(merged.note) || null;
  const memberIds = orderedMemberIds(group.memberVesselIds);

  const result = await runInTenantTx(async (tx) => {
    // Validate members up front; a stale (decommissioned/removed) id is skipped, not fatal (no FK on JSON ids).
    const vessels = await tx.vessel.findMany({ where: { id: { in: memberIds } }, select: { id: true, isActive: true } });
    const activeIds = new Set(vessels.filter((v) => v.isActive).map((v) => v.id));
    const liveIds = memberIds.filter((id) => activeIds.has(id));
    const skipped = memberIds.length - liveIds.length;
    if (liveIds.length === 0) throw new ActionError("None of this task's vessels are still active.");

    const seq = (await tx.workOrderTaskAttempt.count({ where: { taskId: task.id } })) + 1;
    const attempt = await tx.workOrderTaskAttempt.create({
      data: {
        taskId: task.id,
        seq,
        commandId: input.commandId, // task-level idempotency (global unique) — the pre-check in completeTaskCore keys on this
        status: "APPROVED", // no approval gate for maintenance
        actualPayload: { ...merged, completedMemberVesselIds: liveIds } as Prisma.InputJsonValue,
        operationId: null,
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

    let totalShortfall = 0;
    for (const vesselId of liveIds) {
      const { depletion } = await recordVesselActivityTx(tx, actor, {
        vesselId,
        kind,
        taskId: task.id,
        attemptId: attempt.id,
        targetValue,
        targetUnit,
        achievedValue: null, // no per-vessel reading captured in all-at-once group completion
        achievedUnit: null,
        materialId,
        amount, // per-vessel dose
        note,
        commandId: `${input.commandId}:${vesselId}`, // distinct per member (VesselActivityEvent.commandId is unique)
      });
      totalShortfall += depletion?.shortfall ?? 0;
    }

    // Same CAS guard as the single-vessel lane: a concurrent completion with a different commandId loses.
    const claimed = await tx.workOrderTask.updateMany({
      where: { id: task.id, status: task.status, currentAttemptId: task.currentAttemptId },
      data: { status: "DONE", currentAttemptId: attempt.id, completionNote: input.completionNote?.trim() || null, deviationReason: input.deviationReason?.trim() || null },
    });
    if (claimed.count === 0) throw new ActionError("That task was already completed by someone else. Refresh and try again.", "CONFLICT");

    await bumpWorkOrderRollupTx(tx, task.workOrderId);
    const skipMsg = skipped > 0 ? ` (${skipped} skipped — inactive)` : "";
    const shortMsg = totalShortfall > 0 ? ` (used more than on record — ${totalShortfall} short of stock)` : "";
    await writeAudit(tx, {
      ...actor,
      action: "STOCK_MOVEMENT",
      entityType: "WorkOrderTask",
      entityId: task.id,
      summary: `Recorded ${kind.toLowerCase().replace(/_/g, " ")} on ${liveIds.length} vessels${skipMsg}${shortMsg}`,
    });
    return { attemptId: attempt.id, shortfall: totalShortfall, count: liveIds.length, skipped };
    // Raised timeout (vs Prisma's 5s default): N members × ~7 round-trips each. The member count is capped
    // at authoring (nl-resolve) so this tx stays well-bounded; the timeout is headroom for a cold pooler.
  }, { isolationLevel: "Serializable", timeout: 120_000 });

  const bits = [
    result.skipped > 0 ? `${result.skipped} vessel${result.skipped === 1 ? "" : "s"} skipped (inactive).` : "",
    result.shortfall > 0 ? `Used ${result.shortfall} more than on record.` : "",
  ].filter(Boolean);
  const warn = bits.length ? ` ${bits.join(" ")}` : "";
  return {
    taskId: task.id,
    attemptId: result.attemptId,
    operationId: null,
    status: "DONE",
    duplicate: false,
    message: `Maintenance recorded on ${result.count} vessel${result.count === 1 ? "" : "s"}.${warn}`,
  };
}
