import type { Prisma, WorkOrderTask } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runLedgerWrite } from "@/lib/ledger/write";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import { rackWineTx } from "@/lib/vessels/rack-core";
import { groupRackTx, type GroupRackInput } from "@/lib/vessels/group-rack-core";
import { topVesselTx } from "@/lib/cellar/topping";
import { filterVesselTx, capManagementTx, type CapKind } from "@/lib/cellar/treatments";
import { recordNeutralDoseTx, resolveDoseMaterial, ADDITION_CONFIG, FINING_CONFIG, type AddAdditionInput } from "@/lib/cellar/addition";
import { crushLotTx, type CrushPickInput } from "@/lib/transform/crush-core";
import { pressLotTx, type PressFractionInput } from "@/lib/transform/press-core";
import { runBottlingTx } from "@/lib/bottling/run";
import { assertMandatoryPackaging, MANDATORY_PACKAGING_SELECT } from "@/lib/bottling/mandatory-packaging";
import { deriveGroupRackProgress, type BatchAttemptLite, type GroupRackProgress, type PlannedGroupRack } from "@/lib/work-orders/group-rack-progress";
import { isPressableLotState } from "@/lib/ferment/press-data";
import type { RateBasis } from "@/lib/cellar/additions-math";
import { categoryOf, isDoseableCategory, CATEGORY_LABELS, type MaterialCategory } from "@/lib/cellar/material-taxonomy";
import { assertTaskTransition } from "@/lib/work-orders/status";
import { bumpWorkOrderRollupTx, emitWorkOrderStatusTx } from "@/lib/work-orders/lifecycle";
import { releaseReservationsForTaskTx } from "@/lib/work-orders/reservations";
import { completeObservationTaskCore } from "@/lib/work-orders/observations";
import { completeMaintenanceTaskCore } from "@/lib/work-orders/maintenance";
import { completeNoteTaskCore } from "@/lib/work-orders/note";

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

type TaskRow = WorkOrderTask;

const asNum = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const asStr = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);

/** Phase 9.4a: coerce a RACK task's `groupRack` payload block into a GroupRackInput, or null if the
 * task is an ordinary single-vessel rack. Member lists come from the signed proposal payload; the
 * worker's actuals (per-destination / per-source volumes) arrive merged over the plan. */
function parseGroupRackPayload(payload: Record<string, unknown>): GroupRackInput | null {
  const gr = payload.groupRack;
  if (!gr || typeof gr !== "object" || Array.isArray(gr)) return null;
  const g = gr as Record<string, unknown>;
  const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x) : []);
  const numOrNullArr = (v: unknown): (number | null)[] | undefined =>
    Array.isArray(v) ? v.map((x) => (typeof x === "number" && Number.isFinite(x) ? x : null)) : undefined;
  const lossL = asNum(g.lossL);
  const note = asStr(g.note);
  if (g.direction === "BARREL_DOWN") {
    const sourceVesselId = asStr(g.sourceVesselId);
    const destVesselIds = strArr(g.destVesselIds);
    if (!sourceVesselId || destVesselIds.length === 0) return null;
    return { direction: "BARREL_DOWN", sourceVesselId, destVesselIds, drawL: asNum(g.drawL), perDestVolumeL: numOrNullArr(g.perDestVolumeL), lossL, note };
  }
  if (g.direction === "RACK_TO_TANK") {
    const destVesselId = asStr(g.destVesselId);
    const sourceVesselIds = strArr(g.sourceVesselIds);
    if (!destVesselId || sourceVesselIds.length === 0) return null;
    return { direction: "RACK_TO_TANK", destVesselId, sourceVesselIds, perSourceDrawL: numOrNullArr(g.perSourceDrawL), lossL, note };
  }
  return null;
}

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
  commandId: string, // plan 035: threaded to the transform tx-forms for op-level idempotency
): Promise<{ operationId: number; message: string; shortfall?: number }> {
  const note = asStr(payload.note) ?? null;
  const asBool = (v: unknown): boolean => v === true || v === "true";
  switch (task.opType) {
    case "RACK": {
      // Phase 9.4a: a group barrel-down / rack-to-tank task carries a `groupRack` block → ONE balanced
      // multi-vessel RACK op (not the single-vessel VesselTransfer path). commandId is threaded to the op.
      const groupRack = parseGroupRackPayload(payload);
      if (groupRack) {
        const r = await groupRackTx(tx, actor, groupRack, { commandId, note: note ?? undefined });
        return { operationId: r.operationId, message: r.message };
      }
      // dec 4a: an optional rack descriptor rides the op note (off gross/fine lees, clean-to-clean, délestage).
      const rackType = asStr(payload.rackType);
      const rackNote = [rackType ? `Rack: ${rackType}` : null, note].filter(Boolean).join(" — ") || undefined;
      const r = await rackWineTx(tx, actor, {
        fromVesselId: (asStr(payload.fromVesselId) ?? task.sourceVesselId) as string,
        toVesselId: (asStr(payload.toVesselId) ?? task.destVesselId) as string,
        drawL: asNum(payload.drawL),
        lossL: asNum(payload.lossL),
        note: rackNote,
      });
      return { operationId: r.operationId, message: r.message };
    }
    case "FILTRATION": {
      const r = await filterVesselTx(tx, actor, {
        vesselId: (asStr(payload.vesselId) ?? task.destVesselId ?? task.sourceVesselId) as string,
        lossL: asNum(payload.lossL) ?? 0,
        actualOutputL: asNum(payload.actualOutputL), // A5: loss = pre − actual (computed in the tx)
        medium: asStr(payload.filterType), // dec 1: controlled filter media → LotTreatment.medium
        micron: asNum(payload.micron) ?? null,
        note: note ?? undefined,
      });
      return { operationId: r.operationId, message: `${r.summary}.` };
    }
    case "CAP_MGMT": {
      // Volume-neutral cap work (pumpover / punchdown / cold-soak / maceration / pulse-air). The technique
      // rides `technique` (a CapKind); capManagementTx validates it + guards the vessel. Whole-vessel op.
      const technique = asStr(payload.technique) ?? asStr(payload.kind);
      if (!technique) throw new ActionError("Pick a cap-management technique (pumpover, punchdown, …).");
      const r = await capManagementTx(tx, actor, {
        vesselId: (asStr(payload.vesselId) ?? task.destVesselId ?? task.sourceVesselId) as string,
        kind: technique as CapKind,
        durationMin: asNum(payload.durationMin) ?? null,
        note: note ?? undefined,
      });
      return { operationId: r.operationId, message: `${r.summary}.` };
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
        // Unified Amount + Units. A per-volume unit → rate; an absolute unit → exact total (barrels full).
        amount: asNum(payload.amount),
        doseUnit: asStr(payload.doseUnit),
        rateValue: asNum(payload.rateValue) ?? 0, // legacy fallback (standalone /cellar path)
        rateBasis: payload.rateBasis as RateBasis,
        note: note ?? undefined,
      };
      const r = await recordNeutralDoseTx(tx, actor, additionInput, cfg, resolvedMaterial);
      return { operationId: r.operationId, message: r.message, shortfall: r.shortfall }; // E1: draw-to-zero shortfall
    }
    case "CRUSH": {
      // Run-time inputs entered on the execute screen's crush sub-form (plan 035). Picks + measured
      // output volume are required; NEW mint (vintage) vs ADD into an existing must lot.
      const picks = Array.isArray(payload.picks) ? (payload.picks as CrushPickInput[]).filter((p) => p && p.pickId && Number(p.consumedKg) > 0) : [];
      if (picks.length === 0) throw new ActionError("Select at least one harvest pick to crush.");
      const destVesselId = asStr(payload.destVesselId) ?? task.destVesselId;
      if (!destVesselId) throw new ActionError("Pick a destination vessel for the crush.");
      const outputVolumeL = asNum(payload.outputVolumeL);
      if (!(outputVolumeL != null && outputVolumeL > 0)) throw new ActionError("Enter the measured output volume (L).");
      const addLotId = asStr(payload.addLotId) ?? asStr(payload.lotId) ?? task.lotId ?? undefined;
      const target = addLotId
        ? ({ mode: "ADD", lotId: addLotId } as const)
        : ({ mode: "NEW", vintage: asNum(payload.vintage) ?? new Date().getFullYear(), varietyId: asStr(payload.varietyId) ?? null } as const);
      const r = await crushLotTx(tx, actor, {
        commandId,
        picks: picks.map((p) => ({ pickId: p.pickId, consumedKg: Number(p.consumedKg) })),
        destVesselId,
        outputVolumeL,
        target,
        destemmed: asBool(payload.destemmed),
        crusherOn: asBool(payload.crusherOn),
        crushedPct: asNum(payload.crushedPct),
        mustTempC: asNum(payload.mustTempC) ?? null,
        pressCycle: asStr(payload.pressCycle) ?? null,
        note: note ?? undefined,
      });
      return { operationId: r.operationId, message: r.message };
    }
    case "PRESS": {
      const parentLotId = asStr(payload.parentLotId) ?? task.lotId;
      if (!parentLotId) throw new ActionError("Pick the must lot to press.");
      const sourceVesselId = asStr(payload.sourceVesselId) ?? task.sourceVesselId;
      if (!sourceVesselId) throw new ActionError("Pick the source vessel.");
      // Trust boundary: rebuild each fraction from an explicit allowlist of the plan-contract fields —
      // coerce the volume + estimated flag and DROP any client-supplied child `form` override (not part of
      // the WO contract; only the standalone cores set it). mergeIntoLotId is kept (it's in the contract).
      const fractions: PressFractionInput[] = Array.isArray(payload.fractions)
        ? (payload.fractions as Record<string, unknown>[])
            .filter((f) => f && typeof f.destVesselId === "string" && Number(f.volumeL) > 0)
            .map((f) => ({
              destVesselId: f.destVesselId as string,
              volumeL: Number(f.volumeL),
              label: typeof f.label === "string" ? f.label : "",
              estimated: f.estimated === true || f.estimated === "true",
              mergeIntoLotId: typeof f.mergeIntoLotId === "string" && f.mergeIntoLotId ? f.mergeIntoLotId : null,
            }))
        : [];
      if (fractions.length === 0) throw new ActionError("Add at least one press fraction (a cut with a vessel + volume).");
      const lossL = asNum(payload.lossL);
      if (lossL != null && lossL < 0) throw new ActionError("Lees loss can't be negative."); // fail with a clean 400 at the boundary, not a raw planPress Error inside the tx
      const opSel = asStr(payload.op);
      const current = await tx.vesselLot.findFirst({
        where: { lotId: parentLotId, vesselId: sourceVesselId },
        select: { lot: { select: { code: true, form: true, status: true } }, vessel: { select: { code: true } } },
      });
      if (!current || !isPressableLotState(current.lot)) {
        throw new ActionError("The pinned press source is stale: that vessel no longer holds the active MUST lot. Refresh the work order and choose the current pressable position.", "CONFLICT");
      }
      const r = await pressLotTx(tx, actor, {
        commandId,
        parentLotId,
        sourceVesselId,
        fractions,
        lossL,
        op: opSel === "SAIGNEE" ? "SAIGNEE" : "PRESS",
        pressCycle: asStr(payload.pressCycle) ?? null,
        note: note ?? undefined,
      });
      return { operationId: r.operationId, message: r.message };
    }
    case "BOTTLE": {
      // Plan 053 E15: bottle through the SAME core as the standalone /bottling flow (runBottlingTx), but
      // INSIDE this WO completion tx (runLedgerWrite is SERIALIZABLE + retry). Source vessels, bottle count,
      // measured ABV and destination are entered on the run-time bottling sub-form. The returned BOTTLE op
      // id is stamped on the attempt so a reject reverses it via the universal reverseOperationCore path.
      const vesselIds = Array.isArray(payload.vesselIds)
        ? (payload.vesselIds as unknown[]).filter((v): v is string => typeof v === "string" && !!v)
        : [];
      if (vesselIds.length === 0) throw new ActionError("Pick at least one source vessel to bottle from.");
      const destinationLocationId = asStr(payload.destinationLocationId);
      if (!destinationLocationId) throw new ActionError("Pick a destination location for the bottles.");
      const skuName = asStr(payload.skuName);
      if (!skuName) throw new ActionError("Give the bottled wine a name.");
      const bottlesProduced = asNum(payload.bottlesProduced);
      if (!(bottlesProduced != null && bottlesProduced >= 1)) throw new ActionError("Enter the number of bottles produced (at least 1).");
      const abv = asNum(payload.abv);
      if (!(abv != null && abv > 0)) throw new ActionError("Enter the wine's alcohol by volume (%). ABV is required to classify the wine for TTB reporting.");
      const skuVintage = asNum(payload.skuVintage) ?? new Date().getFullYear();
      // Plan 056: the ACTUAL packaging BoM consumed (materialId + eaches). Non-BOTTLE payloads / older
      // work orders simply omit it → liquid-only COGS (unchanged). Malformed entries are dropped.
      const packaging = Array.isArray(payload.packaging)
        ? (payload.packaging as unknown[])
            .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : null))
            .filter((p): p is Record<string, unknown> => p != null)
            .map((p) => ({ materialId: asStr(p.materialId) ?? "", qty: asNum(p.qty) ?? 0 }))
            .filter((p) => p.materialId && p.qty > 0)
        : undefined;
      // P0: a bottling run must consume a bottle, a closure (e.g. cork) and a label — server backstop for
      // the execute-form guard, covering a WO template that authored an incomplete (or no) packaging BoM.
      await assertMandatoryPackaging(packaging, (mids) =>
        tx.cellarMaterial.findMany({ where: { id: { in: mids } }, select: MANDATORY_PACKAGING_SELECT }),
      );
      const r = await runBottlingTx(tx, {
        vesselIds,
        destinationLocationId,
        skuName,
        skuVintage,
        bottlesProduced,
        abv,
        date: new Date(),
        packaging,
      }, actor);
      return { operationId: r.bottleOpId, message: `Bottled ${bottlesProduced} bottles of "${skuName} ${skuVintage}".` };
    }
    default:
      throw new ActionError(
        `Work orders can't yet auto-log a ${task.opType ?? "?"} operation. Supported: rack, addition, fining, topping, filtration, cap management, de-stem/crush, press/saignée, bottling.`,
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

  // A NEW commandId against an already-completed task is a genuine re-submit, not the offline-drain replay
  // the commandId pre-check above handles — it must not double-write (a re-complete would write a SECOND
  // immutable op: double-drain a rack, double-dose an addition, double-deplete overhead stock). A task in
  // PENDING_APPROVAL is completed-and-awaiting-review — it must be APPROVED or REJECTED, never re-completed
  // (the from===to transition shortcut would otherwise let it through). REJECTED is the only resubmittable
  // completed state (→ PENDING → complete). Terminal + pending-review states are not.
  if (task.status === "DONE" || task.status === "APPROVED" || task.status === "SKIPPED" || task.status === "PENDING_APPROVAL") {
    throw new ActionError("That task is already completed (awaiting review).", "CONFLICT");
  }

  // Non-OPERATION lanes: direct-log, straight to DONE (no ledger op, no approval gate). OBSERVATION writes
  // a measurement; MAINTENANCE writes a vessel-activity event; NOTE (checklist) writes NOTHING. Wrap in the
  // same P2002→idempotent-success handling the OPERATION lane uses, so a same-commandId race that slips past
  // the pre-check returns the committed result instead of a raw unique violation (A1 offline-drain contract).
  if (task.kind === "OBSERVATION" || task.kind === "MAINTENANCE" || task.kind === "NOTE") {
    try {
      if (task.kind === "OBSERVATION") return await completeObservationTaskCore(actor, { task, ...input });
      if (task.kind === "MAINTENANCE") return await completeMaintenanceTaskCore(actor, { task, ...input });
      return await completeNoteTaskCore(actor, { task, ...input });
    } catch (e) {
      if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
        const dup = await prisma.workOrderTaskAttempt.findUnique({ where: { commandId: input.commandId }, include: { task: { select: { status: true } } } });
        if (dup) return { taskId: task.id, attemptId: dup.id, operationId: dup.operationId, status: dup.task.status, duplicate: true, message: "Already recorded." };
      }
      throw e;
    }
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

    // WORKORDER-3 server-side guard: a dose must be an additive, never a cleaning/sanitizing, packaging,
    // equipment, or unclassified supply (those would wrongly capitalize into wine COGS). The picker scopes
    // this in the UI; enforce it here too so a crafted payload / a re-categorized material can't bypass it.
    if (resolvedMaterial) {
      const m = await prisma.cellarMaterial.findUnique({ where: { id: resolvedMaterial.materialId }, select: { kind: true, category: true } });
      // Phase 036: read the STORED category (fallback categoryOf(kind) for legacy rows) so a user-invented
      // family is routed correctly — a custom cleaning/packaging family isn't in the kind→category map.
      // Plan 072: isDoseableCategory is now an allowlist, so EQUIPMENT / UNCLASSIFIED / any unknown category
      // is non-doseable by default — label the rejection with the actual category, not a two-way guess.
      const cat = (m?.category as MaterialCategory | null) ?? categoryOf(m?.kind);
      if (!isDoseableCategory(cat)) {
        const label = CATEGORY_LABELS[cat] ?? cat;
        throw new ActionError(
          `A ${label} material can't be dosed into wine as ${task.opType === "FINING" ? "a fining" : "an addition"} (WORKORDER-3).`,
          "CONFLICT",
        );
      }
    }
  }

  const finalize = input.autoFinalize === true;
  try {
    const result = await runLedgerWrite(async (tx) => {
      const { operationId, message, shortfall } = await dispatchOperationTx(tx, actor, task, payload, resolvedMaterial, input.commandId);
      // E1/D4: a below-stock dose draws to zero (never negative) and surfaces a soft warning — never blocks.
      const warnedMessage = shortfall && shortfall > 0 ? `${message} (used ${shortfall} more than on record)` : message;

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

      // Compare-and-swap on the task (mirrors approve/reject): claim it guarded on the status +
      // currentAttemptId we READ at the top. If another device completed this task concurrently (with a
      // DIFFERENT commandId — so the commandId idempotency check above didn't catch it), count===0 and we
      // throw → the whole runLedgerWrite tx rolls back, discarding the duplicate op + attempt. Without
      // this, two concurrent completions each write a real immutable op (the vessel drained twice; for a
      // volume-neutral ADDITION, SERIALIZABLE wouldn't even conflict) — silent ledger corruption.
      const claimed = await tx.workOrderTask.updateMany({
        where: { id: task.id, status: task.status, currentAttemptId: task.currentAttemptId },
        data: {
          status: finalize ? "APPROVED" : "PENDING_APPROVAL",
          currentAttemptId: attempt.id,
          completionNote: input.completionNote?.trim() || null,
          deviationReason: input.deviationReason?.trim() || null,
        },
      });
      if (claimed.count === 0) {
        throw new ActionError("That task was already completed by someone else. Refresh and try again.", "CONFLICT");
      }

      // The advisory hold is discharged — the real op committed the actual (reconciliation is
      // planned-vs-actual on the op/attempt). WORKORDER-2: the reservation was never the guarantee.
      await releaseReservationsForTaskTx(tx, { taskId: task.id });
      const _woRollup = await bumpWorkOrderRollupTx(tx, task.workOrderId);
      await emitWorkOrderStatusTx(tx, _woRollup, actor, task.workOrderId);
      await writeAudit(tx, {
        ...actor,
        action: "STOCK_MOVEMENT",
        entityType: "WorkOrderTask",
        entityId: task.id,
        summary: `Completed WO task (pending review): ${message}`,
      });
      return { attemptId: attempt.id, operationId, message: warnedMessage };
    });

    return { taskId: task.id, attemptId: result.attemptId, operationId: result.operationId, status: finalize ? "APPROVED" : "PENDING_APPROVAL", duplicate: false, message: result.message };
  } catch (e) {
    // A concurrent duplicate (same commandId raced past the pre-check) surfaces as a unique violation —
    // treat it as the idempotent success it is (mirrors the ferment panel-core pattern).
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
      const dup = await prisma.workOrderTaskAttempt.findUnique({ where: { commandId: input.commandId }, include: { task: { select: { status: true } } } });
      if (dup) {
        // Report the committed task status (an auto-finalized attempt is APPROVED, not PENDING_APPROVAL).
        return { taskId: task.id, attemptId: dup.id, operationId: dup.operationId, status: dup.task.status, duplicate: true, message: "Already recorded." };
      }
    }
    throw e;
  }
}

// ───────────────────── Plan 054 (Phase 9.4b): progressive group-rack completion ─────────────────────

export type GroupRackBatchInput = {
  taskId: string;
  commandId: string;
  memberVesselIds: string[]; // the subset of PENDING members to complete in this batch
  perMemberVolumeL?: (number | null)[]; // optional, aligned to memberVesselIds (barrel-down NET fill / rack-to-tank draw)
  lossL?: number;
  note?: string;
  autoFinalize?: boolean;
};

/** Read the task's attempts as the DB-free lite shape the progress projection consumes. */
async function loadGroupRackProgress(taskId: string, planned: PlannedGroupRack): Promise<GroupRackProgress> {
  const attempts = await prisma.workOrderTaskAttempt.findMany({
    where: { taskId },
    select: { id: true, seq: true, status: true, operationId: true, actualPayload: true },
  });
  const lite: BatchAttemptLite[] = attempts.map((a) => {
    const p = (a.actualPayload ?? {}) as Record<string, unknown>;
    const grb = p.groupRackBatch;
    return {
      id: a.id,
      seq: a.seq,
      status: a.status,
      operationId: a.operationId,
      groupRackBatch: grb && typeof grb === "object" ? (grb as BatchAttemptLite["groupRackBatch"]) : null,
    };
  });
  return deriveGroupRackProgress(planned, lite);
}

function plannedGroupRackOf(task: TaskRow): PlannedGroupRack | null {
  const payload = (task.plannedPayload ?? {}) as Record<string, unknown>;
  const gr = payload.groupRack;
  if (!gr || typeof gr !== "object" || Array.isArray(gr)) return null;
  return gr as PlannedGroupRack;
}

/**
 * Complete a SUBSET of a group-rack task's members ("these 4 barrels now"). Writes ONE balanced RACK op
 * over just the selected members (via groupRackTx, drawn against current state), records a `groupRackBatch`
 * on the attempt, and keeps the task IN_PROGRESS until the last member lands — only then does it enter
 * review (PENDING_APPROVAL / APPROVED when auto-finalize). Idempotent on commandId. The one-shot "complete
 * everything at once" is just this with every pending member selected. Never mutates the one-shot
 * completeTaskCore path (single-vessel racks + other op families keep their terminal-completion guard).
 */
export async function completeGroupRackBatchCore(actor: LedgerActor, input: GroupRackBatchInput): Promise<CompleteTaskResult> {
  const task = await prisma.workOrderTask.findUnique({ where: { id: input.taskId } });
  if (!task) throw new ActionError("That task no longer exists.");

  // Idempotency (A1): a prior attempt with this commandId already committed this batch.
  const prior = await prisma.workOrderTaskAttempt.findUnique({ where: { commandId: input.commandId } });
  if (prior) {
    return { taskId: task.id, attemptId: prior.id, operationId: prior.operationId, status: task.status, duplicate: true, message: "Already recorded." };
  }

  const planned = plannedGroupRackOf(task);
  if (task.kind !== "OPERATION" || task.opType !== "RACK" || !planned) {
    throw new ActionError("That task isn't a group barrel-down / rack-to-tank.", "CONFLICT");
  }
  // Additional batches are accepted only while the task is still workable. A task under review
  // (PENDING_APPROVAL) or settled (DONE/APPROVED/SKIPPED) is not; a REJECTED task must be resubmitted
  // (→ PENDING) first via the normal flow. This never touches completeTaskCore's terminal guard.
  if (task.status !== "PENDING" && task.status !== "IN_PROGRESS") {
    throw new ActionError(`Can't add work to a ${task.status.replace(/_/g, " ").toLowerCase()} task.`, "CONFLICT");
  }

  const before = await loadGroupRackProgress(task.id, planned);
  const pending = new Set(before.pendingVesselIds);
  const selected = [...new Set(input.memberVesselIds.filter((x) => typeof x === "string" && x))];
  if (selected.length === 0) throw new ActionError("Pick at least one vessel to complete.");
  const notPending = selected.filter((id) => !pending.has(id));
  if (notPending.length > 0) {
    throw new ActionError("Some selected vessels are already recorded or aren't part of this task. Refresh and try again.", "CONFLICT");
  }

  const lossL = input.lossL != null && input.lossL > 0 ? input.lossL : 0;
  const explicit = input.perMemberVolumeL;
  const volById = new Map<string, number | null>();
  selected.forEach((id, i) => volById.set(id, explicit?.[i] ?? null));

  // Build a subset GroupRackInput. Barrel-down needs an explicit draw bounded to the selected barrels
  // (omitting drawL would try to move the WHOLE source into the subset). Default each selected barrel to
  // its current headroom; a caller-supplied volume overrides. Rack-to-tank drains each selected source
  // fully unless a per-source volume is given.
  let groupInput: GroupRackInput;
  if (before.direction === "BARREL_DOWN") {
    const sourceVesselId = String(planned.sourceVesselId);
    const fill = await prisma.vessel.findMany({
      where: { id: { in: selected } },
      select: { id: true, capacityL: true, vesselLots: { select: { volumeL: true } } },
    });
    const headroomById = new Map<string, number>();
    for (const v of fill) {
      const current = v.vesselLots.reduce((a, l) => a + Number(l.volumeL), 0);
      headroomById.set(v.id, Math.max(0, Math.round((Number(v.capacityL) - current) * 100) / 100));
    }
    const perDestVolumeL = selected.map((id) => {
      const explicitV = volById.get(id);
      return explicitV != null && explicitV > 0 ? explicitV : (headroomById.get(id) ?? 0);
    });
    const drawL = Math.round((perDestVolumeL.reduce((a, v) => a + v, 0) + lossL) * 100) / 100;
    if (!(drawL > 0)) throw new ActionError("The selected barrels are already full — nothing to fill.", "CONFLICT");
    groupInput = { direction: "BARREL_DOWN", sourceVesselId, destVesselIds: selected, perDestVolumeL, drawL, lossL, note: input.note };
  } else {
    const destVesselId = String(planned.destVesselId);
    const perSourceDrawL = selected.map((id) => volById.get(id) ?? null);
    groupInput = { direction: "RACK_TO_TANK", destVesselId, sourceVesselIds: selected, perSourceDrawL, lossL, note: input.note };
  }

  const finalize = input.autoFinalize === true;
  try {
    const result = await runLedgerWrite(async (tx) => {
      const r = await groupRackTx(tx, actor, groupInput, { commandId: input.commandId, note: input.note });

      const now = new Date();
      const seq = (await tx.workOrderTaskAttempt.count({ where: { taskId: task.id } })) + 1;
      const batchPayload = { ...(task.plannedPayload as Record<string, unknown>), groupRackBatch: { memberVesselIds: selected, operationId: r.operationId }, ...(input.note ? { note: input.note } : {}) };
      const attempt = await tx.workOrderTaskAttempt.create({
        data: {
          taskId: task.id,
          seq,
          commandId: input.commandId,
          status: finalize ? "APPROVED" : "PENDING_APPROVAL",
          actualPayload: batchPayload as Prisma.InputJsonValue,
          operationId: r.operationId,
          completionNote: input.note?.trim() || null,
          completedById: actor.actorUserId,
          completedByEmail: actor.actorEmail,
          ...(finalize ? { reviewedAt: now, reviewedById: actor.actorUserId, reviewedByEmail: actor.actorEmail } : {}),
        },
        select: { id: true },
      });

      // Recompute progress AFTER this batch to decide whether the task is now fully done.
      const doneNow = before.completedVesselIds.length + selected.length >= before.members.length;
      const taskStatus = doneNow ? (finalize ? "APPROVED" : "PENDING_APPROVAL") : "IN_PROGRESS";

      // CAS on the (status, currentAttemptId) we read at the top — a concurrent batch loses and retries.
      const claimed = await tx.workOrderTask.updateMany({
        where: { id: task.id, status: task.status, currentAttemptId: task.currentAttemptId },
        data: { status: taskStatus, currentAttemptId: attempt.id },
      });
      if (claimed.count === 0) {
        throw new ActionError("That task changed while you were completing it. Refresh and try again.", "CONFLICT");
      }

      // Discharge the advisory holds only once the whole task is done (group racks carry no material
      // reservations today, so this is a no-op in practice — kept for parity + future-proofing).
      if (doneNow) await releaseReservationsForTaskTx(tx, { taskId: task.id });
      const _woRollup = await bumpWorkOrderRollupTx(tx, task.workOrderId);
      await emitWorkOrderStatusTx(tx, _woRollup, actor, task.workOrderId);
      await writeAudit(tx, {
        ...actor,
        action: "STOCK_MOVEMENT",
        entityType: "WorkOrderTask",
        entityId: task.id,
        summary: `Group-rack batch (${selected.length} ${selected.length === 1 ? "vessel" : "vessels"}${doneNow ? ", task complete" : ", more remaining"}): ${r.message}`,
      });
      return { attemptId: attempt.id, operationId: r.operationId, taskStatus, message: r.message };
    });
    return { taskId: task.id, attemptId: result.attemptId, operationId: result.operationId, status: result.taskStatus, duplicate: false, message: result.message };
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
      const dup = await prisma.workOrderTaskAttempt.findUnique({ where: { commandId: input.commandId }, include: { task: { select: { status: true } } } });
      if (dup) return { taskId: task.id, attemptId: dup.id, operationId: dup.operationId, status: dup.task.status, duplicate: true, message: "Already recorded." };
    }
    throw e;
  }
}

export type BatchCompleteResult = { completed: number; failed: number; results: (CompleteTaskResult & { ok: boolean; error?: string })[] };

/**
 * Complete N tasks in one call (plan 043): the cellar hand punches down tanks 3, 4, 5 and marks them all
 * done at once. Loops completeTaskCore, each in its OWN runLedgerWrite (completeTaskCore owns its tx and has
 * no tx-form) — so batch = N independent txs with per-item pass/fail, and one tank's failure never rolls
 * back the rest. Mirrors bulkApproveTasksCore (D3). Each item MUST carry its own commandId (idempotency is
 * per-attempt; a shared id would dedupe to a single write). autoFinalize is set per item by the action.
 */
export async function completeTasksBatchCore(actor: LedgerActor, input: { items: CompleteTaskInput[] }): Promise<BatchCompleteResult> {
  const results: (CompleteTaskResult & { ok: boolean; error?: string })[] = [];
  for (const item of input.items) {
    try {
      const r = await completeTaskCore(actor, item);
      results.push({ ...r, ok: true });
    } catch (e) {
      results.push({
        taskId: item.taskId,
        attemptId: "",
        operationId: null,
        status: "FAILED",
        duplicate: false,
        message: "",
        ok: false,
        error: e instanceof Error ? e.message : "Failed to complete.",
      });
    }
  }
  return { completed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
}
