import "server-only";
import { getBlockPicks, deleteHarvestPick } from "@/lib/harvest/actions";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal, signResume } from "../confirm";
import { findScopedBlocks } from "../scope";
import { resolveOneOrChoice } from "./resolve";

// Assistant coverage for ticket #188: the inverse of log_harvest_pick. Deletes a STANDALONE harvest pick
// (one logged directly on a block, not created by a work-order weigh-in — those are backed out via
// review_task, which reopens the task). Mirrors delete_brix: narrow to a single pick by block + weight
// and/or date, confirm-gate, commit through the real deleteHarvestPick action (which re-checks scope and
// refuses a pick already crushed into a lot).

type DeleteHarvestPickInput = {
  block?: string;
  blockId?: string;
  vineyard?: string;
  variety?: string;
  weightKg?: number;
  pickDate?: string; // YYYY-MM-DD
};

export const deleteHarvestPickTool: AssistantTool = {
  name: "delete_harvest_pick",
  description:
    "ALWAYS call this when the user wants a harvest pick removed — even if you are unsure WHICH block or WHICH pick. Do not list candidates or ask which one in prose first: an ambiguous query returns a CLICKABLE PICKER that pins the exact row by id, and a prose list gives the user nothing to act on — records with identical labels cannot be told apart by name at all. Calling this NEVER deletes anything; it returns a preview to confirm. " +
    "Delete (void) a mistaken harvest pick logged on a block. Use when the user wants to remove, undo, revert, or delete a harvest pick / weigh-in they recorded directly on a block. Narrow to a single pick with the block plus its weight (kg) and/or pick date. Refuses if the fruit has already been crushed into a lot. To back out a pick created by a work-order fruit weigh-in task, use review_task instead. This does NOT delete immediately — it returns a preview the user must confirm in the UI.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      block: { type: "string", description: "Block label, e.g. 'Block 2'." },
      blockId: { type: "string", description: "Internal use: a block pinned by id from a picker tap. Never invent one." },
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
    // Picker on ambiguity (sweep after #328). Block labels repeat across vineyards — "Block 1" matches
    // seven rows in a real winery — and findScopedBlocks matches on CONTAINS, so the candidate set is
    // wider still. resolveExactlyOne threw a paragraph here; the tap pins the block by id.
    const blockCandidates = input.blockId ? blocks.filter((b) => b.id === input.blockId) : blocks;
    const picked = resolveOneOrChoice(blockCandidates, {
      prompt: `Which block do you mean?`,
      describe: (b) => `${b.label}${b.varietyName ? ` (${b.varietyName})` : ""}`,
      detail: (b) => b.vineyardName,
      resume: (b) => signResume("delete_harvest_pick", { ...input, blockId: b.id }),
      noneMsg: `No block matches that you can access (block "${input.block ?? "?"}"${input.variety ? `, variety "${input.variety}"` : ""}).`,
    });
    if (picked.kind === "choice") return picked.choice;
    const block = picked.row;

    const picks = await getBlockPicks(block.id);
    let candidates = picks;
    if (typeof input.weightKg === "number") {
      candidates = candidates.filter((p) => Math.abs(p.weightKg - input.weightKg!) < 0.01);
    }
    if (input.pickDate) {
      candidates = candidates.filter((p) => p.pickDate === input.pickDate);
    }

    // Second ambiguity point: a block can have several picks sharing a weight or a date. Same treatment.
    const pickedPick = resolveOneOrChoice(candidates, {
      prompt: `Which pick on ${block.label} do you want to delete?`,
      describe: (p) => `${p.weightKg} kg picked ${p.pickDate}`,
      resume: (p) => signResume("delete_harvest_pick", { ...input, blockId: block.id, weightKg: p.weightKg, pickDate: p.pickDate }),
      noneMsg: `No matching harvest pick on ${block.label} (${block.vineyardName}). Nothing to delete.`,
    });
    if (pickedPick.kind === "choice") return pickedPick.choice;
    const pick = pickedPick.row;

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
