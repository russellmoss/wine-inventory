import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveRecentOperation } from "../scope";
import { reverseOperationAction } from "@/lib/ledger/actions";

// Assistant-coverage Wave 2 — universal undo. Reverses a ledger operation (addition, crush, press, blend,
// bottling, …) by writing a compensating correction (plan-024). Wraps reverseOperationAction →
// reverseOperationCore, which FAILS CLOSED: a non-reversible type, an already-corrected op, or a
// downstream op on the same wine is refused with a clear reason. Safety model: resolve a single candidate
// (explicit id, or the most recent not-yet-corrected op on a vessel/lot), show its summary in a STRONG
// confirm, and let the core reject anything unsafe. Nothing resolvable → deep-link the lot/vessel timeline.

type UndoRawInput = { operationId?: number; vessel?: string; lot?: string; note?: string };

export const undoOperationTool: AssistantTool = {
  name: "undo_operation",
  description:
    "Undo (reverse) a ledger operation — an addition, crush, press, blend, bottling, etc. — by writing a correcting op (append-only, plan-024). Give the operation number, OR a vessel/lot to undo its most recent operation ('undo the last addition on tank 5', 'reverse operation 1234'). The system refuses if the op was already reversed or has later operations depending on it. Does NOT act immediately — returns a preview to confirm, showing exactly which op will be reversed.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      operationId: { type: "number", description: "The operation number to reverse, if known." },
      vessel: { type: "string", description: "Undo the most recent operation on this vessel, e.g. 'tank 5'." },
      lot: { type: "string", description: "Undo the most recent operation on this lot, e.g. '24-CS-A'." },
      note: { type: "string", description: "Reason for the reversal (optional)." },
    },
    required: [],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as UndoRawInput;
    const opId = typeof input.operationId === "number" ? input.operationId : undefined;
    const found = await resolveRecentOperation({ operationId: opId, vessel: input.vessel, lot: input.lot });
    if (!found) {
      const where = input.lot ? `lot ${input.lot}` : input.vessel ? input.vessel : "there";
      return {
        navigate: { path: "/lots", label: "Open the timeline to undo", auto: false },
        message: `I couldn't find a reversible operation on ${where}. Open its timeline and undo the specific step there.`,
      };
    }
    const preview = `Reverse operation ${found.summary} — this writes a correcting op that undoes it (it's refused if a later step depends on it).`;
    const token = signProposal("undo_operation", {
      operationId: found.operationId,
      lotId: found.lotId,
      ...(input.note ? { note: input.note } : {}),
      summary: found.summary,
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitUndoOperation: Committer = async (_user, args) => {
  await reverseOperationAction({ operationId: Number(args.operationId), lotId: String(args.lotId ?? ""), note: args.note == null ? undefined : String(args.note) });
  return { message: `Reversed operation ${String(args.summary ?? `#${args.operationId}`)}.` };
};
