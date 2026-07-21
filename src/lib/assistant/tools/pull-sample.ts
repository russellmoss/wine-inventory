import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveLotTargetOrChoice } from "../scope";
import { pullSampleAction } from "@/lib/chemistry/actions";
import type { PullSampleInput } from "@/lib/chemistry/samples";

// Wave 3 (lab samples) — pull a sample off a lot, optionally sent to a lab in the same step. Wraps
// pullSampleCore (guarded lifecycle, NOT a ledger op). Per-lot like the chem tools: a blend vessel asks
// its one lot (resolveLotTarget). Results coming back → record_sample_results; send/cancel → manage_sample.

type RawInput = { vessel?: string; lot?: string; source?: string; lab?: string; sendNow?: boolean; expectedAt?: string; note?: string };

export const pullSampleTool: AssistantTool = {
  name: "pull_sample",
  description:
    "Pull a LAB SAMPLE off a lot (optionally mark it sent to a lab in the same step). Use when the user pulls/draws/takes a sample for analysis: 'pull a sample from tank 5', 'pull a sample of lot 24-CS-A and send it to ETS'. Give the lot by code, or the vessel that holds it. To record results that came BACK use record_sample_results; to send/cancel an existing sample use manage_sample. Returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      lot: { type: "string", description: "Lot code, e.g. '24-CS-A'." },
      vessel: { type: "string", description: "Vessel holding the lot, e.g. 'tank 5'." },
      lab: { type: "string", description: "Lab it's sent to, e.g. 'ETS'. Naming a lab implies it was sent." },
      sendNow: { type: "boolean", description: "Mark it sent to the lab now (skip a separate send step). Defaults true when a lab is named." },
      source: { type: "string", description: "Optional free-text of where/how the sample was drawn." },
      expectedAt: { type: "string", description: "Expected result date, YYYY-MM-DD (optional)." },
      note: { type: "string", description: "Optional note." },
    },
    required: [],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as RawInput;
    const resolved = await resolveLotTargetOrChoice({ lot: input.lot, vessel: input.vessel }, "pull_sample", input as Record<string, unknown>);
    if (resolved.kind === "choice") return resolved.choice;
    const { lotId, lotCode } = resolved.row;
    const sendNow = input.sendNow === true || (input.sendNow == null && !!input.lab?.trim());
    const labClause = input.lab?.trim() ? ` and send to ${input.lab.trim()}` : sendNow ? " (sent)" : "";
    const preview = `Pull a sample from lot ${lotCode}${input.source?.trim() ? ` (${input.source.trim()})` : ""}${labClause}${input.expectedAt ? `, results expected ${input.expectedAt}` : ""}.`;
    const token = signProposal("pull_sample", {
      lotId,
      lotCode,
      ...(input.source?.trim() ? { source: input.source.trim() } : {}),
      ...(input.lab?.trim() ? { lab: input.lab.trim() } : {}),
      sendNow,
      ...(input.expectedAt ? { expectedAt: input.expectedAt } : {}),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitPullSample: Committer = async (_user, args) => {
  const input: PullSampleInput = {
    lotId: String(args.lotId),
    source: args.source == null ? undefined : String(args.source),
    lab: args.lab == null ? undefined : String(args.lab),
    sendNow: args.sendNow === true,
    expectedAt: args.expectedAt == null ? undefined : String(args.expectedAt),
    note: args.note == null ? undefined : String(args.note),
  };
  const res = await pullSampleAction(input);
  return { message: `Pulled a sample from lot ${String(args.lotCode ?? "")}${res.status === "SENT" ? " and marked it sent" : ""}.` };
};
