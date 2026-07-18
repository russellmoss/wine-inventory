import "server-only";
import { getBlockPicks, deleteHarvestPick } from "@/lib/harvest/actions";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { findScopedBlocks } from "../scope";
import { resolveExactlyOne } from "./resolve";

// Assistant coverage for ticket #188: the inverse of log_harvest_pick. Deletes a STANDALONE harvest pick
// (one logged directly on a block, not created by a work-order weigh-in — those are backed out via
// review_task, which reopens the task). Mirrors delete_brix: narrow to a single pick by block + weight
// and/or date, confirm-gate, commit through the real deleteHarvestPick action (which re-checks scope and
// refuses a pick already crushed into a lot).

type DeleteHarvestPickInput = {
  block?: string;
  vineyard?: string;
  variety?: string;
  weightKg?: number;
  pickDate?: string; // YYYY-MM-DD
};

export const deleteHarvestPickTool: AssistantTool = {
  name: "delete_harvest_pick",
  description:
    "Delete (void) a mistaken harvest pick logged on a block. Use when the user wants to remove, undo, revert, or delete a harvest pick / weigh-in they recorded directly on a block. Narrow to a single pick with the block plus its weight (kg) and/or pick date. Refuses if the fruit has already been crushed into a lot. To back out a pick created by a work-order fruit weigh-in task, use review_task instead. This does NOT delete immediately — it returns a preview the user must confirm in the UI.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      block: { type: "string", description: "Block label, e.g. 'Block 2'." },
      vineyard: { type: "string", description: "Vineyard name (optional for a manager)." },
      variety: { type: "string", description: "Grape variety, to disambiguate the block, e.g. 'Grenache'." },
      weightKg: { type: "number", description: "The pick weight in kilograms, to pinpoint the pick." },
      pickDate: { type: "string", description: "Date the fruit was picked (YYYY-MM-DD), to pinpoint the pick." },
    },
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as DeleteHarvestPickInput;
    const blocks = await findScopedBlocks(ctx.user, {
      block: input.block,
      vineyard: input.vineyard,
      variety: input.variety,
    });
    const block = resolveExactlyOne(blocks, {
      describe: (b) => `${b.label}${b.varietyName ? ` (${b.varietyName})` : ""} in ${b.vineyardName}`,
      noneMsg: `No block matches that you can access (block "${input.block ?? "?"}"${input.variety ? `, variety "${input.variety}"` : ""}).`,
      manyMsg: `Several blocks match`,
    });

    const picks = await getBlockPicks(block.id);
    let candidates = picks;
    if (typeof input.weightKg === "number") {
      candidates = candidates.filter((p) => Math.abs(p.weightKg - input.weightKg!) < 0.01);
    }
    if (input.pickDate) {
      candidates = candidates.filter((p) => p.pickDate === input.pickDate);
    }

    const pick = resolveExactlyOne(candidates, {
      describe: (p) => `${p.weightKg} kg picked ${p.pickDate}`,
      noneMsg: `No matching harvest pick on ${block.label} (${block.vineyardName}). Nothing to delete.`,
      manyMsg: `Several picks on ${block.label} match`,
    });

    const preview = `Delete the ${pick.weightKg} kg harvest pick on ${block.label} (${block.vineyardName}), picked ${pick.pickDate}.`;
    const token = signProposal("delete_harvest_pick", {
      pickId: pick.id,
      label: block.label,
      weightKg: pick.weightKg,
      pickDate: pick.pickDate,
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitDeleteHarvestPick: Committer = async (_user, args) => {
  const pickId = String(args.pickId);
  await deleteHarvestPick(pickId);
  return {
    message: `Deleted the ${Number(args.weightKg)} kg harvest pick on ${String(args.label ?? "the block")} (${String(args.pickDate ?? "")}).`,
  };
};
