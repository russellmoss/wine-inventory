import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveOpenSample } from "../scope";
import { markSampleSentAction, cancelSampleAction } from "@/lib/chemistry/actions";

// Wave 3 (lab samples) — send a pulled sample to the lab, or cancel it. One action-discriminated tool
// (like manage_work_order) wrapping markSampleSentCore / cancelSampleCore (guarded transitions). Resolves
// the open sample on the lot/vessel (or an explicit id). Pull = pull_sample; results back = record_sample_results.

type RawInput = { action?: string; sampleId?: string; vessel?: string; lot?: string; lab?: string; expectedAt?: string };

export const manageSampleTool: AssistantTool = {
  name: "manage_sample",
  description:
    "Send a pulled sample to the lab, or cancel a sample. Operations: 'send' (mark it sent, optionally to a named lab with an expected result date) and 'cancel' (void a lost/mislabeled sample). Resolves the open sample on the lot/vessel (or an explicit sample id). To PULL a new sample use pull_sample; to attach returned results use record_sample_results. Returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["send", "cancel"], description: "'send' = mark sent to the lab; 'cancel' = void the sample." },
      lot: { type: "string", description: "Lot the sample is on, e.g. '24-CS-A'." },
      vessel: { type: "string", description: "Vessel the sample is on, e.g. 'tank 5'." },
      sampleId: { type: "string", description: "Explicit sample id, if known." },
      lab: { type: "string", description: "For 'send': the lab name." },
      expectedAt: { type: "string", description: "For 'send': expected result date, YYYY-MM-DD." },
    },
    required: ["action"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as RawInput;
    const action = String(input.action ?? "");
    if (action !== "send" && action !== "cancel") throw new Error("Say whether to 'send' or 'cancel' the sample.");
    const r = await resolveOpenSample({ sampleId: input.sampleId, vessel: input.vessel, lot: input.lot }, "manage_sample", input as Record<string, unknown>);
    if (r.kind === "choice") return r.choice;
    const sample = r.row;

    if (action === "send") {
      const preview = `Send the sample on lot ${sample.lotCode} to the lab${input.lab?.trim() ? ` (${input.lab.trim()})` : ""}${input.expectedAt ? `, results expected ${input.expectedAt}` : ""}.`;
      const token = signProposal("manage_sample", {
        action,
        sampleId: sample.sampleId,
        lotCode: sample.lotCode,
        ...(input.lab?.trim() ? { lab: input.lab.trim() } : {}),
        ...(input.expectedAt ? { expectedAt: input.expectedAt } : {}),
      });
      return { needsConfirmation: true, preview, token };
    }
    const preview = `Cancel the sample on lot ${sample.lotCode}.`;
    const token = signProposal("manage_sample", { action, sampleId: sample.sampleId, lotCode: sample.lotCode });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitManageSample: Committer = async (_user, args) => {
  const action = String(args.action ?? "");
  if (action === "cancel") {
    await cancelSampleAction(String(args.sampleId));
    return { message: `Cancelled the sample on lot ${String(args.lotCode ?? "")}.` };
  }
  await markSampleSentAction({
    sampleId: String(args.sampleId),
    lab: args.lab == null ? undefined : String(args.lab),
    expectedAt: args.expectedAt == null ? undefined : String(args.expectedAt),
  });
  return { message: `Sent the sample on lot ${String(args.lotCode ?? "")} to the lab.` };
};
