import "server-only";
import { randomUUID } from "crypto";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveWorkOrderTask, type ResolvedTask } from "../scope";
import { completeTaskAction } from "@/lib/work-orders/actions";

// Assistant-coverage Wave 1 #3b — complete a work-order task by chat ("mark it done"). Wraps
// completeTaskAction → completeTaskCore (no re-implemented logic, no db_*). Completing an OPERATION task
// auto-logs the real ledger op (pending approval); OBSERVATION logs a reading; NOTE/MAINTENANCE go
// straight to done. Decision (interview 2026-07-05): default to the PLANNED values; the crew states only
// what differed (amount/loss/reading). Crush/press need picks/fractions → deferred to the execute screen
// for now (Slice B extends this tool to transforms).

type CompleteTaskRawInput = {
  wo?: string | number;
  task?: string | number;
  amount?: number; // primary measured actual (mapped to the op's field by type)
  lossL?: number;
  reading?: number; // observation reading value
  note?: string;
  reason?: string; // deviation reason
};

/** Map the crew's stated actuals to the op's actualPayload keys, by task type. Empty = "as planned". */
function buildActualPayload(task: ResolvedTask, input: CompleteTaskRawInput): { payload: Record<string, unknown>; summary: string } {
  const p: Record<string, unknown> = {};
  const parts: string[] = [];
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const amount = num(input.amount);
  const lossL = num(input.lossL);
  const reading = num(input.reading);

  if (task.kind === "OBSERVATION") {
    if (reading != null) {
      const analyte = task.observationType ?? "BRIX";
      p.readings = [{ analyte, value: reading, unit: analyte === "BRIX" ? "Brix" : "" }];
      parts.push(`${analyte} ${reading}`);
    }
  } else if (task.kind === "OPERATION") {
    switch (task.opType) {
      case "ADDITION":
      case "FINING":
        if (amount != null) { p.amount = amount; parts.push(`${amount}`); }
        break;
      case "RACK":
        if (amount != null) { p.drawL = amount; parts.push(`draw ${amount} L`); }
        if (lossL != null) { p.lossL = lossL; parts.push(`loss ${lossL} L`); }
        break;
      case "TOPPING":
        if (amount != null) { p.volumeL = amount; parts.push(`${amount} L`); }
        break;
      case "FILTRATION":
        if (amount != null) { p.actualOutputL = amount; parts.push(`output ${amount} L`); }
        if (lossL != null) { p.lossL = lossL; parts.push(`loss ${lossL} L`); }
        break;
    }
  } else if (task.kind === "MAINTENANCE") {
    if (amount != null) { p.amount = amount; parts.push(`${amount}`); }
  }
  return { payload: p, summary: parts.length ? parts.join(", ") : "as planned" };
}

export const completeTaskTool: AssistantTool = {
  name: "complete_task",
  description:
    "Mark a work-order task as done ('complete the SO₂ addition on WO 142', 'WO 142 task 2 is done'). Completing an OPERATION task auto-logs the real ledger op (rack/addition/etc., pending approval); an OBSERVATION logs a reading. By default it records the PLANNED values — state only what differed (e.g. 'done but only 180 L'). Identify the work order by number and, if it has several open tasks, the task by number or name. De-stem/crush and press tasks aren't completable by chat yet (run them on the execute screen). Does NOT save immediately — returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      wo: { type: "number", description: "Work order number, e.g. 142." },
      task: { type: "string", description: "Which task — its number (seq) or a bit of its title. Optional if the WO has a single open task." },
      amount: { type: "number", description: "The actual measured value if it differed from planned — dose amount, rack draw (L), topping volume (L), or filtration output (L), by task type." },
      lossL: { type: "number", description: "Actual liters lost (rack/filtration), if stated." },
      reading: { type: "number", description: "For an observation task (Brix/panel), the reading value." },
      note: { type: "string", description: "Completion note (what the crew wants to tell the winemaker)." },
      reason: { type: "string", description: "Deviation reason, if the actual differed from planned." },
    },
    required: ["wo"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as CompleteTaskRawInput;
    const task = await resolveWorkOrderTask({ wo: input.wo, task: input.task });
    if (task.opType === "CRUSH" || task.opType === "PRESS") {
      throw new Error(`Task #${task.seq} "${task.title}" is a ${task.opType === "CRUSH" ? "de-stem/crush" : "press"} — those have picks/fractions and are completed on the work order's execute screen, not by chat (yet).`);
    }

    const { payload, summary } = buildActualPayload(task, input);
    const kindLabel = task.kind === "OPERATION" ? (task.opType ?? "operation").toLowerCase() : task.kind.toLowerCase();
    const ledgerClause = task.kind === "OPERATION" ? " This records the real ledger op (pending approval)." : "";
    const preview = `Complete task #${task.seq} "${task.title}" (${kindLabel}) on WO #${task.number} — ${summary}.${ledgerClause}`;

    const commandId = randomUUID();
    const token = signProposal("complete_task", {
      taskId: task.taskId,
      commandId,
      actualPayload: payload,
      ...(input.note ? { note: input.note } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
      label: `#${task.seq} ${task.title}`,
      woNumber: task.number,
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitCompleteTask: Committer = async (_user, args) => {
  const res = await completeTaskAction({
    taskId: String(args.taskId),
    commandId: String(args.commandId),
    actualPayload: (args.actualPayload as Record<string, unknown>) ?? {},
    completionNote: args.note == null ? undefined : String(args.note),
    deviationReason: args.reason == null ? undefined : String(args.reason),
  });
  const status = res.status.replace(/_/g, " ").toLowerCase();
  return { message: `Completed ${String(args.label ?? "the task")} on WO #${String(args.woNumber ?? "")} (${status}).` };
};
