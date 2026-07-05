import "server-only";
import { randomUUID } from "crypto";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveWorkOrderTask, resolveVessel, type ResolvedTask } from "../scope";
import { completeTaskAction } from "@/lib/work-orders/actions";
import { loadCrushFormData } from "@/lib/ferment/crush-data";
import { loadPressFormData } from "@/lib/ferment/press-data";

// Assistant-coverage Wave 1 #3 (Slices A+B) — complete a work-order task by chat. Wraps
// completeTaskAction → completeTaskCore (no re-implemented logic, no db_*).
//
// Non-transform tasks (Slice A): default to the PLANNED values; the crew states only diffs.
// Crush/press tasks (Slice B, interview 2026-07-05): handle the SIMPLE, unambiguous case by chat —
// crush = one covering pick + dest + measured output; press = a short fraction list on a pressable must
// lot. Anything multi-pick / many-fraction / merge-into / underspecified DEEP-LINKS the plan-035 execute
// form for that WO instead of guessing (these write real lineage). Everything routes through the WO
// dispatch (crushLotTx/pressLotTx) inside the one ledger tx.

const round2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

type Fraction = { vessel?: string; volumeL?: number; label?: string };
type CompleteTaskRawInput = {
  wo?: string | number;
  task?: string | number;
  amount?: number;
  lossL?: number;
  reading?: number;
  note?: string;
  reason?: string;
  // crush task only
  block?: string;
  kg?: number;
  destVessel?: string;
  outputL?: number;
  crusherOn?: boolean;
  crushedPct?: number;
  mustTempC?: number;
  // press task only
  lot?: string;
  fractions?: Fraction[];
  op?: "PRESS" | "SAIGNEE";
};

/** Deep-link to the plan-035 execute form for this WO (the complex/underspecified crush/press path). */
function deepLinkForm(task: ResolvedTask, why: string): { navigate: { path: string; label: string; auto: boolean }; message: string } {
  return {
    navigate: { path: `/work-orders/${task.workOrderId}/execute`, label: `Open the execute form for WO #${task.number}`, auto: false },
    message: `${why} Enter it on the work order's execute screen, where the pick/fraction fields live.`,
  };
}

/** Non-transform actuals → the op's actualPayload keys, by task type. Empty = "as planned". */
function buildSimplePayload(task: ResolvedTask, input: CompleteTaskRawInput): { payload: Record<string, unknown>; summary: string } {
  const p: Record<string, unknown> = {};
  const parts: string[] = [];
  const amount = num(input.amount);
  const lossL = num(input.lossL);
  const reading = num(input.reading);
  if (task.kind === "OBSERVATION") {
    if (reading != null) { const a = task.observationType ?? "BRIX"; p.readings = [{ analyte: a, value: reading, unit: a === "BRIX" ? "Brix" : "" }]; parts.push(`${a} ${reading}`); }
  } else if (task.kind === "OPERATION") {
    switch (task.opType) {
      case "ADDITION": case "FINING": if (amount != null) { p.amount = amount; parts.push(`${amount}`); } break;
      case "RACK": if (amount != null) { p.drawL = amount; parts.push(`draw ${amount} L`); } if (lossL != null) { p.lossL = lossL; parts.push(`loss ${lossL} L`); } break;
      case "TOPPING": if (amount != null) { p.volumeL = amount; parts.push(`${amount} L`); } break;
      case "FILTRATION": if (amount != null) { p.actualOutputL = amount; parts.push(`output ${amount} L`); } if (lossL != null) { p.lossL = lossL; parts.push(`loss ${lossL} L`); } break;
    }
  } else if (task.kind === "MAINTENANCE") {
    if (amount != null) { p.amount = amount; parts.push(`${amount}`); }
  }
  return { payload: p, summary: parts.length ? parts.join(", ") : "as planned" };
}

/** Simple crush by chat: one covering pick + dest + measured output. Otherwise deep-link. */
async function buildCrushPayload(task: ResolvedTask, input: CompleteTaskRawInput) {
  const kg = num(input.kg);
  const outputL = num(input.outputL);
  if (!input.block || kg == null || !input.destVessel || outputL == null) {
    return deepLinkForm(task, "A de-stem/crush needs the harvest pick(s) + kg, destination and measured output volume.");
  }
  const { blocks } = await loadCrushFormData();
  const needle = norm(input.block);
  const block = blocks.find((b) => { const h = norm(b.label); return h === needle || h.includes(needle) || needle.includes(h); });
  if (!block) return deepLinkForm(task, `No harvest block matches "${input.block}" with fruit remaining.`);
  const covering = block.picks.filter((p) => p.remainingKg + 1e-6 >= kg);
  if (covering.length === 0) {
    const total = round2(block.picks.reduce((a, p) => a + p.remainingKg, 0));
    return deepLinkForm(task, total >= kg ? `${kg} kg spans multiple picks on ${block.label}.` : `Only ${total} kg remain on ${block.label}.`);
  }
  if (covering.length > 1) {
    throw new Error(`Several picks on ${block.label} could cover ${kg} kg (${covering.map((p) => `${p.pickDate} — ${p.remainingKg} kg`).join("; ")}). Which pick?`);
  }
  const dest = await resolveVessel(input.destVessel);
  if (!dest.isActive) throw new Error(`${dest.type === "BARREL" ? "Barrel" : "Tank"} ${dest.code} is inactive.`);
  const payload: Record<string, unknown> = {
    picks: [{ pickId: covering[0].pickId, consumedKg: kg }],
    destVesselId: dest.id,
    outputVolumeL: outputL,
    vintage: block.vintageYear,
    ...(block.varietyId ? { varietyId: block.varietyId } : {}),
    destemmed: true,
    crusherOn: input.crusherOn ?? true,
    ...(num(input.crushedPct) != null ? { crushedPct: input.crushedPct } : {}),
    ...(num(input.mustTempC) != null ? { mustTempC: input.mustTempC } : {}),
  };
  const yieldLt = kg > 0 ? Math.round((outputL / kg) * 1000 * 100) / 100 : null;
  return { payload, summary: `de-stem ${kg} kg from ${block.label} into ${dest.type === "BARREL" ? "Barrel" : "Tank"} ${dest.code} → ${outputL} L${yieldLt != null ? ` (${yieldLt} L/t)` : ""}` };
}

/** Simple press by chat: a pressable must lot + a short fraction list. Otherwise deep-link. */
async function buildPressPayload(task: ResolvedTask, input: CompleteTaskRawInput) {
  const fractions = Array.isArray(input.fractions) ? input.fractions.filter((f) => f && num(f.volumeL) != null && f.vessel) : [];
  const lotRef = input.lot;
  if (!lotRef && !task.title) { /* fallthrough */ }
  if (fractions.length === 0 || (!lotRef && !input.lot)) {
    return deepLinkForm(task, "A press needs the must lot and its fraction cuts (vessel + volume each).");
  }
  if (fractions.length > 3) return deepLinkForm(task, "That press has several fractions.");

  const { positions } = await loadPressFormData();
  const n = lotRef ? norm(String(lotRef)) : "";
  const pos = positions.find((p) => n && (norm(p.lotCode) === n || norm(p.lotCode).includes(n) || n.includes(norm(p.lotCode))));
  if (!pos) return deepLinkForm(task, `No pressable must lot matches "${lotRef ?? "?"}".`);

  const built: { destVesselId: string; volumeL: number; label: string }[] = [];
  for (let i = 0; i < fractions.length; i++) {
    const f = fractions[i];
    const v = await resolveVessel(f.vessel as string);
    built.push({ destVesselId: v.id, volumeL: round2(num(f.volumeL) as number), label: (f.label ?? (i === 0 ? "free-run" : "press")).toString() });
  }
  const total = round2(built.reduce((a, f) => a + f.volumeL, 0));
  if (total > pos.volumeL + 1e-6) throw new Error(`Fractions (${total} L) exceed what ${pos.lotCode} holds (${pos.volumeL} L).`);
  const lossL = input.lossL != null ? round2(input.lossL) : round2(Math.max(0, pos.volumeL - total));
  const op = input.op === "SAIGNEE" ? "SAIGNEE" : "PRESS";
  const payload: Record<string, unknown> = { parentLotId: pos.lotId, sourceVesselId: pos.vesselId, fractions: built, lossL, op };
  return { payload, summary: `${op === "SAIGNEE" ? "bleed" : "press"} ${pos.lotCode}: ${built.map((f) => `${f.label} ${f.volumeL} L`).join(", ")}${lossL > 0 ? ` + ${lossL} L lees` : ""}` };
}

export const completeTaskTool: AssistantTool = {
  name: "complete_task",
  description:
    "Mark a work-order task as done ('complete the SO₂ addition on WO 142', 'WO 142 task 2 is done'). Completing an OPERATION task auto-logs the real ledger op (pending approval); an OBSERVATION logs a reading. For simple ops, by default it records the PLANNED values — state only what differed. It also completes a de-stem/crush task (give block + kg + destination + measured output) or a press task (give the must lot + the fraction cuts); a complex/underspecified crush or press is handed off to the execute screen. Identify the WO by number and, if several tasks are open, the task by number or name. Does NOT save immediately — returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      wo: { type: "number", description: "Work order number, e.g. 142." },
      task: { type: "string", description: "Which task — its number (seq) or a bit of its title. Optional if the WO has a single open task." },
      amount: { type: "number", description: "Simple op only: the actual value if it differed — dose amount, rack draw (L), topping volume (L), or filtration output (L)." },
      lossL: { type: "number", description: "Liters lost (rack/filtration; or press lees), if stated." },
      reading: { type: "number", description: "Observation task: the reading value (Brix/panel)." },
      note: { type: "string", description: "Completion note." },
      reason: { type: "string", description: "Deviation reason, if the actual differed from planned." },
      block: { type: "string", description: "Crush task only: the harvest block being de-stemmed, e.g. 'Block 3'." },
      kg: { type: "number", description: "Crush task only: kilograms of fruit crushed." },
      destVessel: { type: "string", description: "Crush task only: destination vessel for the must, e.g. 'tank 5'." },
      outputL: { type: "number", description: "Crush task only: measured must volume out (L)." },
      crusherOn: { type: "boolean", description: "Crush task only: crusher rollers engaged (default true)." },
      crushedPct: { type: "number", description: "Crush task only: % of the lot crushed." },
      mustTempC: { type: "number", description: "Crush task only: must temperature °C." },
      lot: { type: "string", description: "Press task only: the must lot code being pressed, e.g. '24-CS-A'." },
      fractions: {
        type: "array",
        description: "Press task only: the fraction cuts. Each { vessel, volumeL, label? }.",
        items: { type: "object", properties: { vessel: { type: "string" }, volumeL: { type: "number" }, label: { type: "string" } } },
      },
      op: { type: "string", enum: ["PRESS", "SAIGNEE"], description: "Press task only: press (default) or saignée." },
    },
    required: ["wo"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as CompleteTaskRawInput;
    const task = await resolveWorkOrderTask({ wo: input.wo, task: input.task });

    let built: { payload: Record<string, unknown>; summary: string } | { navigate: { path: string; label: string; auto: boolean }; message: string };
    if (task.opType === "CRUSH") built = await buildCrushPayload(task, input);
    else if (task.opType === "PRESS") built = await buildPressPayload(task, input);
    else built = buildSimplePayload(task, input);

    // Complex/underspecified transform → hand off to the execute form (a navigation, not a write).
    if ("navigate" in built) return built;

    const kindLabel = task.kind === "OPERATION" ? (task.opType ?? "operation").toLowerCase() : task.kind.toLowerCase();
    const ledgerClause = task.kind === "OPERATION" ? " This records the real ledger op (pending approval)." : "";
    const preview = `Complete task #${task.seq} "${task.title}" (${kindLabel}) on WO #${task.number} — ${built.summary}.${ledgerClause}`;
    const token = signProposal("complete_task", {
      taskId: task.taskId,
      commandId: randomUUID(),
      actualPayload: built.payload,
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
