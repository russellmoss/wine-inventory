import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveLotTarget } from "../scope";
import { transitionStateAction } from "@/lib/ferment/actions";
import type { TransitionInput } from "@/lib/ferment/transition-core";

// Assistant-coverage Wave 2 — record a lot's fermentation state transition (AF/MLF) by chat. Wraps
// transitionStateAction → transitionStateCore (no db_*; the core validates the state machine). Per-lot
// (blend vessel → asks which lot). AF: NONE→ACTIVE→DRY; MLF: NONE→ACTIVE→COMPLETE.

const TO_LABEL: Record<string, string> = { NONE: "not started", ACTIVE: "active", DRY: "dry", COMPLETE: "complete" };

type TransitionRawInput = { lot?: string; vessel?: string; stage?: "AF" | "MLF"; to?: string; note?: string };

export const transitionLotStateTool: AssistantTool = {
  name: "transition_lot_state",
  description:
    "Record a lot's fermentation state change: alcoholic ferment (AF) or malolactic (MLF). E.g. 'T5 is dry' (AF→DRY), 'start MLF on lot 24-CS-A' (MLF→ACTIVE), 'MLF is done on the Cab' (MLF→COMPLETE), 'primary kicked off in tank 3' (AF→ACTIVE). Give the lot by code or the vessel (a blend asks which lot). Does NOT save immediately — returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      lot: { type: "string", description: "Lot code, e.g. '24-CS-A'." },
      vessel: { type: "string", description: "Vessel holding the lot (resolved to its lot; a blend asks which)." },
      stage: { type: "string", enum: ["AF", "MLF"], description: "AF = alcoholic ferment, MLF = malolactic." },
      to: { type: "string", enum: ["NONE", "ACTIVE", "DRY", "COMPLETE"], description: "Target state. AF uses ACTIVE (started) or DRY (finished); MLF uses ACTIVE (started) or COMPLETE (finished)." },
      note: { type: "string", description: "Optional note." },
    },
    required: ["stage", "to"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as TransitionRawInput;
    const stage = input.stage === "MLF" ? "MLF" : input.stage === "AF" ? "AF" : null;
    if (!stage) throw new Error("Which ferment — AF (alcoholic) or MLF (malolactic)?");
    const to = String(input.to ?? "").toUpperCase();
    if (!["NONE", "ACTIVE", "DRY", "COMPLETE"].includes(to)) throw new Error("Set the target state (ACTIVE, DRY, or COMPLETE).");
    if (stage === "AF" && to === "COMPLETE") throw new Error("AF finishes at DRY, not COMPLETE. Use MLF for COMPLETE.");
    if (stage === "MLF" && to === "DRY") throw new Error("MLF finishes at COMPLETE, not DRY.");
    const { lotId, lotCode } = await resolveLotTarget({ lot: input.lot, vessel: input.vessel });

    const preview = `Mark ${stage} ${TO_LABEL[to]} on lot ${lotCode}.`;
    const token = signProposal("transition_lot_state", {
      lotId,
      lotCode,
      kind: stage,
      to,
      ...(input.note ? { note: input.note } : {}),
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitTransitionLotState: Committer = async (_user, args) => {
  const input: TransitionInput = {
    lotId: String(args.lotId),
    kind: String(args.kind) as TransitionInput["kind"],
    to: String(args.to),
    note: args.note == null ? undefined : String(args.note),
  };
  await transitionStateAction(input);
  return { message: `Marked ${String(args.kind)} ${TO_LABEL[String(args.to)] ?? String(args.to)} on lot ${String(args.lotCode ?? "")}.` };
};
