import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveVessel } from "../scope";
import { filterVesselAction } from "@/lib/cellar/actions";
import type { FiltrationInput } from "@/lib/cellar/treatments";

// Assistant-coverage Wave 2 — filter a vessel (whole-vessel; loss spreads proportionally across resident
// lots). Wraps filterVesselAction (no db_*). Records the filter medium + micron; the loss = pre − measured
// output when an output is given (media loss varies wildly, so it's never a hardcoded rate).

const vlabel = (v: { type: string; code: string }) => (v.type === "BARREL" ? `Barrel ${v.code}` : `Tank ${v.code}`);

type FilterRawInput = { vessel?: string; medium?: string; micron?: number; outputL?: number; lossL?: number; note?: string };

export const filterVesselTool: AssistantTool = {
  name: "filter_vessel",
  description:
    "Filter a vessel's wine ('cross-flow filter tank 5', 'pad filter the Chardonnay barrel at 0.45 micron'). Whole-vessel — the small volume loss spreads across all resident lots. Give the vessel and the filter medium; optionally the micron rating and the measured output volume (loss = before − output). Does NOT save immediately — returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      vessel: { type: "string", description: "Vessel to filter, e.g. 'tank 5'." },
      medium: { type: "string", description: "Filter medium, e.g. 'cross-flow', 'pad', 'lenticular', 'DE'." },
      micron: { type: "number", description: "Micron rating, e.g. 0.45 (optional)." },
      outputL: { type: "number", description: "Measured output volume after filtering (L). Loss = before − this (optional)." },
      lossL: { type: "number", description: "Liters lost, if you'd rather state the loss directly (optional; output takes precedence)." },
      note: { type: "string", description: "Optional note." },
    },
    required: ["vessel"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as FilterRawInput;
    if (!input.vessel) throw new Error("Which vessel are you filtering?");
    const v = await resolveVessel(input.vessel);
    if (!v.isActive) throw new Error(`${vlabel(v)} is inactive.`);
    const micron = typeof input.micron === "number" ? input.micron : null;
    const outputL = typeof input.outputL === "number" ? input.outputL : null;
    const lossL = typeof input.lossL === "number" ? input.lossL : 0;

    const bits = [input.medium, micron != null ? `${micron} µm` : null].filter(Boolean).join(", ");
    const lossClause = outputL != null ? ` → ${outputL} L out` : lossL > 0 ? ` (${lossL} L loss)` : "";
    const preview = `Filter ${vlabel(v)}${bits ? ` (${bits})` : ""}${lossClause}.`;
    const token = signProposal("filter_vessel", {
      vesselId: v.id,
      ...(input.medium ? { medium: input.medium } : {}),
      ...(micron != null ? { micron } : {}),
      ...(outputL != null ? { actualOutputL: outputL } : {}),
      lossL,
      ...(input.note ? { note: input.note } : {}),
      label: vlabel(v),
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitFilterVessel: Committer = async (_user, args) => {
  const input: FiltrationInput = {
    vesselId: String(args.vesselId),
    lossL: Number(args.lossL ?? 0),
    actualOutputL: args.actualOutputL == null ? null : Number(args.actualOutputL),
    medium: args.medium == null ? undefined : String(args.medium),
    micron: args.micron == null ? null : Number(args.micron),
    note: args.note == null ? undefined : String(args.note),
  };
  const res = await filterVesselAction(input);
  return { message: res.message };
};
