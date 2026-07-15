import "server-only";
import { randomUUID } from "crypto";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveWorkOrderTask } from "../scope";
import { entityPath } from "../routes";
import { prisma } from "@/lib/prisma";
import { expandVesselRange, resolveGroupByName } from "@/lib/vessels/range";
import {
  deriveGroupRackProgress,
  type BatchAttemptLite,
  type GroupRackProgress,
  type PlannedGroupRack,
} from "@/lib/work-orders/group-rack-progress";
import { selectGroupRackMembers, isAllRemainingExpr, type GroupRackMemberLite } from "@/lib/work-orders/group-rack-select";
import { completeGroupRackBatchAction, rejectGroupRackBatchAction } from "@/lib/work-orders/actions";
import { unwrap } from "@/lib/action-result";

// Plan 054 shipped progressive group-rack completion (complete a SUBSET of a barrel-down / rack-to-tank
// task, or LIFO-undo the last batch). Plan 055 U5/U6 gives the assistant that reach: a discriminated
// write tool modeled on manage_work_order. WORKORDER-1: it routes through the SAME cores the execute
// screen uses (completeGroupRackBatchCore / rejectGroupRackBatchCore via their actions) — no parallel path,
// no model-originated ledger write.

type LoadedGroupRack = { planned: PlannedGroupRack; progress: GroupRackProgress; members: GroupRackMemberLite[] };

/** Load a task's group-rack plan + per-member progress. Returns null if it isn't a group barrel-down /
 * rack-to-tank task (a single-vessel rack or any other op family). */
async function loadTaskGroupRack(taskId: string): Promise<LoadedGroupRack | null> {
  const row = await prisma.workOrderTask.findUnique({
    where: { id: taskId },
    select: {
      plannedPayload: true,
      attempts: { select: { id: true, seq: true, status: true, operationId: true, actualPayload: true } },
    },
  });
  if (!row) return null;
  const payload = (row.plannedPayload ?? {}) as Record<string, unknown>;
  const gr = payload.groupRack;
  if (!gr || typeof gr !== "object" || Array.isArray(gr)) return null;
  const planned = gr as PlannedGroupRack;
  const lite: BatchAttemptLite[] = row.attempts.map((a) => {
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
  const progress = deriveGroupRackProgress(planned, lite);
  const members: GroupRackMemberLite[] = progress.members.map((m) => ({ vesselId: m.vesselId, code: m.code }));
  return { planned, progress, members };
}

const codesFor = (ids: string[], members: GroupRackMemberLite[]): string[] => {
  const byId = new Map(members.map((m) => [m.vesselId, m.code]));
  return ids.map((id) => byId.get(id) ?? id);
};

export const groupRackBatchTool: AssistantTool = {
  name: "group_rack_batch",
  description:
    "Progressively complete or undo a GROUP barrel-down / rack-to-tank work-order task (the ones that move one tank into many barrels, or many barrels back to one tank — authored via propose_work_order BARREL_DOWN / RACK_TO_TANK). Use `action:\"complete\"` to record a batch of the task's barrels as done now ('complete the barrel-down for B101-B104 on WO 210', 'finish the rest of WO 210') — name the barrels in `members` as a range ('B101-B104'), a comma/and list ('B101, B103 and B105'), or 'the rest'/'all remaining' (default when omitted). Use `action:\"undo\"` to reverse the LAST recorded batch while the task is still in progress ('undo the last batch on WO 210'). Identify the task by its work order in `wo` (number/id/link) — plus `task` if the WO has several — or by the source/destination `vessel`. This is ONLY for group racks; a normal single task is complete_task, review is review_task. Returns a preview to confirm; it never acts immediately.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["complete", "undo"], description: "complete a batch of members, or undo the last recorded batch." },
      wo: { type: ["number", "string"], description: "The work order: its number (e.g. 210), its id, or a pasted link. Use `vessel` instead if no WO number is given." },
      task: { type: "string", description: "Which task, if the WO has several (a number/title). Optional if one group-rack task is open." },
      vessel: { type: "string", description: "The source tank (barrel-down) or destination tank (rack-to-tank) the task is on — use when no WO number is given." },
      members: { type: "string", description: "complete only: which barrels — a range ('B101-B104'), a comma/and list, a saved group name, or 'the rest' / 'all remaining' (also the default when omitted → every barrel still pending)." },
      reason: { type: "string", description: "undo only: why (optional)." },
    },
    required: ["action"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as { action?: string; wo?: string | number; task?: string | number; vessel?: string; members?: string; reason?: string };
    const action = input.action;
    if (action !== "complete" && action !== "undo") throw new Error("Say whether to complete a batch or undo the last one.");

    const resolved = await resolveWorkOrderTask({ wo: input.wo, task: input.task, vessel: input.vessel });
    const loaded = await loadTaskGroupRack(resolved.taskId);
    if (!loaded) {
      throw new Error(`Task #${resolved.seq} "${resolved.title}" on WO #${resolved.number} isn't a group barrel-down / rack-to-tank. Use complete_task for a normal task.`);
    }
    const { progress, members } = loaded;
    const dirLabel = progress.direction === "RACK_TO_TANK" ? "rack-to-tank" : "barrel-down";

    if (action === "undo") {
      if (progress.batchCount === 0 || !progress.latestBatchAttemptId) {
        return `WO #${resolved.number}'s ${dirLabel} has no recorded batch to undo yet.`;
      }
      const token = signProposal("group_rack_batch", {
        action,
        taskId: resolved.taskId,
        workOrderId: resolved.workOrderId,
        woNumber: resolved.number,
        ...(input.reason ? { reason: input.reason } : {}),
      });
      return {
        needsConfirmation: true,
        preview: `Undo the last recorded batch on WO #${resolved.number}'s ${dirLabel} — its barrels return to pending and their wine goes back to the source.`,
        token,
      };
    }

    // action === "complete"
    if (progress.allMembersDone) {
      return `WO #${resolved.number}'s ${dirLabel} is already fully complete — every barrel is recorded. Nothing left to do.`;
    }

    // Resolve a saved-group name to its member codes first (so "the north barrels" works), then expand
    // against this task's own members. A range / list / "the rest" is handled directly by the expander.
    let expr = input.members?.trim() || "";
    if (expr && !isAllRemainingExpr(expr) && !expandVesselRange(expr) && !/[,]|\band\b/i.test(expr)) {
      const g = await resolveGroupByName(expr).catch(() => ({ kind: "none" as const }));
      if (g.kind === "one") expr = g.members.map((m) => m.code).join(", ");
      else if (g.kind === "many") throw new Error(`Several groups match "${input.members}": ${g.names.join(", ")}. Name one, or give a barrel range/list.`);
    }

    const { selected, droppedDone, unknown } = selectGroupRackMembers(expr, members, progress.pendingVesselIds);
    if (unknown.length > 0) {
      const pendingCodes = codesFor(progress.pendingVesselIds, members).join(", ");
      throw new Error(`These aren't barrels on this task: ${unknown.join(", ")}. Pending barrels are: ${pendingCodes || "none"}.`);
    }
    if (selected.length === 0) {
      const pendingCodes = codesFor(progress.pendingVesselIds, members).join(", ");
      const doneNote = droppedDone.length ? ` Those (${droppedDone.join(", ")}) are already recorded.` : "";
      return `Nothing left to complete for the barrels you named on WO #${resolved.number}.${doneNote} Still pending: ${pendingCodes || "none"}.`;
    }

    const commandId = randomUUID();
    const selectedCodes = codesFor(selected, members);
    const token = signProposal("group_rack_batch", {
      action,
      taskId: resolved.taskId,
      workOrderId: resolved.workOrderId,
      memberVesselIds: selected,
      commandId,
      woNumber: resolved.number,
      selectedCodes,
    });
    const dropNote = droppedDone.length ? ` (${droppedDone.join(", ")} already done)` : "";
    return {
      needsConfirmation: true,
      preview: `Complete ${selected.length} ${selected.length === 1 ? "barrel" : "barrels"} (${selectedCodes.join(", ")}) on WO #${resolved.number}'s ${dirLabel}${dropNote}.`,
      token,
    };
  },
};

export const commitGroupRackBatch: Committer = async (_user, args) => {
  const action = String(args.action);
  const taskId = String(args.taskId);
  const woNumber = String(args.woNumber ?? "");

  if (action === "undo") {
    const res = unwrap(await rejectGroupRackBatchAction({ taskId, reason: args.reason == null ? undefined : String(args.reason) }));
    return {
      message: `Undid the last batch on WO #${woNumber} — its wine was returned to the source. The task is now ${String(res.status).replace(/_/g, " ").toLowerCase()}.`,
      navigate: { path: entityPath("workOrder", String(args.workOrderId ?? "")), label: `WO #${woNumber}` },
    };
  }

  // complete — D4 (LOCKED): all-or-nothing. Re-derive pending at confirm; if ANY signed member is no longer
  // pending, reject the WHOLE batch with a clear message + the current pending set (the core enforces this
  // too; this gives a friendlier message and avoids a partial write attempt). The command is idempotent on
  // the signed commandId, so a double-confirm is a safe no-op.
  const memberVesselIds = Array.isArray(args.memberVesselIds) ? (args.memberVesselIds as unknown[]).filter((x): x is string => typeof x === "string" && !!x) : [];
  const commandId = String(args.commandId ?? "");
  if (memberVesselIds.length === 0 || !commandId) throw new Error("This batch proposal is incomplete. Ask again.");

  const loaded = await loadTaskGroupRack(taskId);
  if (loaded) {
    const pending = new Set(loaded.progress.pendingVesselIds);
    const stale = memberVesselIds.filter((id) => !pending.has(id));
    if (stale.length > 0) {
      const byId = new Map(loaded.members.map((m) => [m.vesselId, m.code ?? m.vesselId]));
      const staleCodes = stale.map((id) => byId.get(id) ?? id).join(", ");
      const pendingCodes = loaded.progress.pendingVesselIds.map((id) => byId.get(id) ?? id).join(", ");
      throw new Error(`Some of those barrels were completed by someone else while you confirmed (${staleCodes}), so this batch was not recorded. Ask again to complete the barrels still pending: ${pendingCodes || "none"}.`);
    }
  }

  const res = unwrap(await completeGroupRackBatchAction({ taskId, commandId, memberVesselIds }));
  if (res.duplicate) {
    return { message: `That batch was already recorded on WO #${woNumber}.`, navigate: { path: entityPath("workOrder", taskId), label: `WO #${woNumber}` } };
  }
  const doneNote = res.status === "IN_PROGRESS" ? " More barrels remain." : " That completes the task — it's now awaiting review.";
  const codes = Array.isArray(args.selectedCodes) ? (args.selectedCodes as unknown[]).filter((x): x is string => typeof x === "string").join(", ") : "";
  return {
    message: `Recorded ${memberVesselIds.length} ${memberVesselIds.length === 1 ? "barrel" : "barrels"}${codes ? ` (${codes})` : ""} on WO #${woNumber}.${doneNote}`,
    navigate: { path: entityPath("workOrder", taskId), label: `WO #${woNumber}` },
  };
};
