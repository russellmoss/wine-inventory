import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveWorkOrder, resolveWorkOrderTask } from "../scope";
import { startTaskAction, assignWorkOrderAction, scheduleWorkOrderAction, cancelWorkOrderAction } from "@/lib/work-orders/actions";

// Assistant-coverage Wave 1 #3c — work-order lifecycle in one discriminated tool (keeps the tool count
// down): start a task, or assign / reschedule / cancel a work order. Wraps the existing lifecycle
// actions (no db_*). All confirm-gated.

type ManageRawInput = {
  action?: "start" | "assign" | "schedule" | "cancel";
  wo?: string | number;
  vessel?: string; // start only: resolve the task by the vessel it's on when no WO number is given
  task?: string | number; // start only
  assigneeEmail?: string; // assign only
  dueDate?: string; // schedule only (YYYY-MM-DD)
  reason?: string; // cancel only
};

export const manageWorkOrderTool: AssistantTool = {
  name: "manage_work_order",
  description:
    "Manage a work order's lifecycle: start a task ('start task 2 on WO 142', 'start the punchdown on tank 1'), assign it ('assign WO 142 to sam@…'), reschedule it ('move WO 142 to Friday'), or cancel it ('cancel WO 142'). Identify the work order by its number (142), its id, or a pasted link (…/work-orders/<id>) in `wo`. For START only, when no WO number is given you may instead name the vessel the task is on (`vessel`, e.g. 'tank 1'). Does NOT act immediately — returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["start", "assign", "schedule", "cancel"], description: "What to do." },
      wo: { type: ["number", "string"], description: "The work order: its number (e.g. 142), its id, or a pasted link (…/work-orders/<id>). Required for assign/schedule/cancel; for start you may use `vessel` instead." },
      vessel: { type: "string", description: "start only: the vessel the task is on, e.g. 'tank 1'. Use when no WO number is given; the open task on that vessel is resolved automatically." },
      task: { type: "string", description: "start only: which task (number/title/op word like 'punchdown'). Optional if one is open." },
      assigneeEmail: { type: "string", description: "assign only: the assignee's email." },
      dueDate: { type: "string", description: "schedule only: new due date as YYYY-MM-DD." },
      reason: { type: "string", description: "cancel only: why (optional)." },
    },
    required: ["action"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as ManageRawInput;
    const action = input.action;
    if (!action || !["start", "assign", "schedule", "cancel"].includes(action)) throw new Error("Say what to do: start, assign, schedule, or cancel.");

    if (action === "start") {
      const task = await resolveWorkOrderTask({ wo: input.wo, task: input.task, vessel: input.vessel });
      const token = signProposal("manage_work_order", { action, taskId: task.taskId, label: `#${task.seq} ${task.title}`, woNumber: task.number });
      return { needsConfirmation: true, preview: `Start task #${task.seq} "${task.title}" on WO #${task.number}.`, token };
    }

    const wo = await resolveWorkOrder(input.wo as string | number);
    if (action === "assign") {
      if (!input.assigneeEmail) throw new Error("Who should it be assigned to? Give an email.");
      const token = signProposal("manage_work_order", { action, workOrderId: wo.workOrderId, assigneeEmail: input.assigneeEmail, woNumber: wo.number });
      return { needsConfirmation: true, preview: `Assign WO #${wo.number} to ${input.assigneeEmail}.`, token };
    }
    if (action === "schedule") {
      if (!input.dueDate) throw new Error("What date should it be due? Give YYYY-MM-DD.");
      const token = signProposal("manage_work_order", { action, workOrderId: wo.workOrderId, dueDate: input.dueDate, woNumber: wo.number });
      return { needsConfirmation: true, preview: `Reschedule WO #${wo.number} due ${input.dueDate}.`, token };
    }
    // cancel
    const token = signProposal("manage_work_order", { action, workOrderId: wo.workOrderId, ...(input.reason ? { reason: input.reason } : {}), woNumber: wo.number });
    return { needsConfirmation: true, preview: `Cancel WO #${wo.number}${input.reason ? ` — ${input.reason}` : ""}.`, token };
  },
};

export const commitManageWorkOrder: Committer = async (_user, args) => {
  const action = String(args.action);
  const woNumber = String(args.woNumber ?? "");
  if (action === "start") {
    await startTaskAction({ taskId: String(args.taskId) });
    return { message: `Started ${String(args.label ?? "the task")} on WO #${woNumber}.` };
  }
  if (action === "assign") {
    await assignWorkOrderAction({ workOrderId: String(args.workOrderId), assigneeId: null, assigneeEmail: String(args.assigneeEmail) });
    return { message: `Assigned WO #${woNumber} to ${String(args.assigneeEmail)}.` };
  }
  if (action === "schedule") {
    await scheduleWorkOrderAction({ workOrderId: String(args.workOrderId), dueAt: args.dueDate ? new Date(String(args.dueDate)) : null });
    return { message: `Rescheduled WO #${woNumber} to ${String(args.dueDate)}.` };
  }
  await cancelWorkOrderAction({ workOrderId: String(args.workOrderId), reason: args.reason == null ? undefined : String(args.reason) });
  return { message: `Cancelled WO #${woNumber}.` };
};
