import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { parseWorkOrderRef, resolveWorkOrderTask, type ResolvedTask } from "../scope";
import { prisma } from "@/lib/prisma";
import { approveTaskAction, rejectTaskAction } from "@/lib/work-orders/actions";

// Assistant-coverage Wave 1 #3c: manager review/revert for completed work-order tasks. Approval still
// targets PENDING_APPROVAL. Reject/back-out can reverse a pending-review or approved ledger operation,
// or delete the exact HarvestPick created by a HARVEST_WEIGH_IN task.

type ReviewRawInput = { wo?: string | number; task?: string | number; decision?: "approve" | "reject"; reason?: string };

export const reviewTaskTool: AssistantTool = {
  name: "review_task",
  description:
    "Approve, reject, or back out a completed work-order task. 'Approve WO 142' finalizes a pending-review task; 'reject task 2 on WO 142' reverses its ledger op so the crew can redo it; 'back out/revert WO 142' can also reverse an already-approved operation task or delete the harvest pick from a fruit weigh-in task. Admin only. Identify the WO by number and, if several tasks match, the task by number or name. Does NOT act immediately - returns a preview to confirm.",
  kind: "write",
  adminOnly: true,
  inputSchema: {
    type: "object",
    properties: {
      wo: { type: "number", description: "Work order number, e.g. 142." },
      task: { type: "string", description: "Which task - its number (seq) or a bit of its title. Optional if only one task is reviewable/reversible." },
      decision: { type: "string", enum: ["approve", "reject"], description: "approve = finalize; reject = reverse/back out the task effect so it can be redone." },
      reason: { type: "string", description: "Reason for rejecting/backing out (recommended on a reject)." },
    },
    required: ["wo", "decision"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as ReviewRawInput;
    const decision = input.decision === "reject" ? "reject" : input.decision === "approve" ? "approve" : null;
    if (!decision) throw new Error("Say whether to approve or reject.");
    const task = await resolveReviewTask(input, decision);
    const preview = previewFor(task, decision, input.reason);
    const token = signProposal("review_task", {
      taskId: task.taskId,
      decision,
      ...(input.reason ? { reason: input.reason } : {}),
      label: `#${task.seq} ${task.title}`,
      woNumber: task.number,
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitReviewTask: Committer = async (_user, args) => {
  const taskId = String(args.taskId);
  const label = String(args.label ?? "the task");
  const woNumber = String(args.woNumber ?? "");
  if (args.decision === "reject") {
    const res = await rejectTaskAction({ taskId, reason: args.reason == null ? undefined : String(args.reason) });
    return { message: `${res.message} (${label} on WO #${woNumber})` };
  }
  await approveTaskAction({ taskId });
  return { message: `Approved ${label} on WO #${woNumber}.` };
};

function isReversibleTask(task: Pick<ResolvedTask, "status" | "observationType">): boolean {
  return task.status === "PENDING_APPROVAL" || task.status === "APPROVED" || (task.status === "DONE" && task.observationType === "HARVEST_WEIGH_IN");
}

function describeTask(task: Pick<ResolvedTask, "seq" | "title" | "status">): string {
  return `#${task.seq} ${task.title} (${task.status.toLowerCase()})`;
}

async function resolveReviewTask(input: ReviewRawInput, decision: "approve" | "reject"): Promise<ResolvedTask> {
  if (decision === "approve") {
    const task = await resolveWorkOrderTask({ wo: input.wo, task: input.task, states: ["PENDING_APPROVAL"] });
    if (task.status !== "PENDING_APPROVAL") throw new Error(`Task #${task.seq} "${task.title}" is ${task.status.toLowerCase()}, not awaiting approval.`);
    return task;
  }

  if (input.task != null && String(input.task).trim() !== "") {
    const task = await resolveWorkOrderTask({ wo: input.wo, task: input.task });
    if (!isReversibleTask(task)) throw new Error(`Task #${task.seq} "${task.title}" has no reversible ledger operation or harvest pick to back out.`);
    return task;
  }

  const parsed = input.wo == null || input.wo === "" ? null : parseWorkOrderRef(input.wo);
  if (!parsed) throw new Error("Which work order? Give its number, id, or link.");
  const wo = await prisma.workOrder.findFirst({
    where: "id" in parsed ? { id: parsed.id } : { number: parsed.number },
    select: {
      id: true,
      number: true,
      tasks: { orderBy: { seq: "asc" }, select: { id: true, seq: true, title: true, opType: true, observationType: true, kind: true, status: true } },
    },
  });
  if (!wo) throw new Error("id" in parsed ? "No work order matches that id/link." : `No work order #${parsed.number} exists.`);
  const reversible = wo.tasks.filter(isReversibleTask);
  if (reversible.length === 1) {
    const task = reversible[0];
    return { workOrderId: wo.id, number: wo.number, taskId: task.id, seq: task.seq, title: task.title, opType: task.opType, observationType: task.observationType, kind: task.kind, status: task.status };
  }
  if (reversible.length === 0) throw new Error(`WO #${wo.number} has no reversible tasks. Tasks: ${wo.tasks.map(describeTask).join("; ")}.`);
  throw new Error(`WO #${wo.number} has several reversible tasks - which one? ${reversible.map(describeTask).join("; ")}.`);
}

function previewFor(task: ResolvedTask, decision: "approve" | "reject", reason?: string): string {
  if (decision === "approve") return `Approve (finalize) task #${task.seq} "${task.title}" on WO #${task.number}.`;
  const suffix = reason ? `. Reason: ${reason}` : "";
  if (task.status === "APPROVED") {
    return `Revert approved task #${task.seq} "${task.title}" on WO #${task.number} - this reverses its ledger operation and reopens the task so it can be redone${suffix}.`;
  }
  if (task.observationType === "HARVEST_WEIGH_IN") {
    return `Back out fruit weigh-in task #${task.seq} "${task.title}" on WO #${task.number} - this deletes the harvest pick it created and reopens the task so it can be redone${suffix}.`;
  }
  return `Reject task #${task.seq} "${task.title}" on WO #${task.number} - this reverses its ledger operation (a correction) so it can be redone${suffix}.`;
}
