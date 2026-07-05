import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveWorkOrderTask } from "../scope";
import { approveTaskAction, rejectTaskAction } from "@/lib/work-orders/actions";

// Assistant-coverage Wave 1 #3c — the manager review verb: approve (finalize) or reject (reverse) a
// completed work-order task. adminOnly (canApprove is enforced in the action too). Wraps
// approveTaskAction / rejectTaskAction (no db_*). REJECT reverses the task's ledger op (plan-024) — the
// confirm card says so plainly. Targets the WO's PENDING_APPROVAL task(s).

type ReviewRawInput = { wo?: string | number; task?: string | number; decision?: "approve" | "reject"; reason?: string };

export const reviewTaskTool: AssistantTool = {
  name: "review_task",
  description:
    "Approve or reject a completed work-order task that's awaiting review. 'Approve WO 142' finalizes it; 'reject task 2 on WO 142' REVERSES its ledger op (a plan-024 correction) so the crew can redo it. Admin only. Identify the WO by number and, if several tasks await approval, the task by number or name. Does NOT act immediately — returns a preview to confirm.",
  kind: "write",
  adminOnly: true,
  inputSchema: {
    type: "object",
    properties: {
      wo: { type: "number", description: "Work order number, e.g. 142." },
      task: { type: "string", description: "Which task awaiting approval — its number (seq) or a bit of its title. Optional if only one awaits review." },
      decision: { type: "string", enum: ["approve", "reject"], description: "approve = finalize; reject = reverse the ledger op so it can be redone." },
      reason: { type: "string", description: "Reason for rejecting (recommended on a reject)." },
    },
    required: ["wo", "decision"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as ReviewRawInput;
    const decision = input.decision === "reject" ? "reject" : input.decision === "approve" ? "approve" : null;
    if (!decision) throw new Error("Say whether to approve or reject.");
    const task = await resolveWorkOrderTask({ wo: input.wo, task: input.task, states: ["PENDING_APPROVAL"] });

    const preview =
      decision === "approve"
        ? `Approve (finalize) task #${task.seq} "${task.title}" on WO #${task.number}.`
        : `Reject task #${task.seq} "${task.title}" on WO #${task.number} — this REVERSES its ledger operation (a correction) so it can be redone${input.reason ? `. Reason: ${input.reason}` : ""}.`;
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
    await rejectTaskAction({ taskId, reason: args.reason == null ? undefined : String(args.reason) });
    return { message: `Rejected ${label} on WO #${woNumber} — its ledger operation was reversed.` };
  }
  await approveTaskAction({ taskId });
  return { message: `Approved ${label} on WO #${woNumber}.` };
};
