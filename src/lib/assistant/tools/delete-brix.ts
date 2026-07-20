import "server-only";
import { getBlockBrixHistory, deleteBrixLog } from "@/lib/harvest/actions";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal, signResume } from "../confirm";
import { findScopedBlocks } from "../scope";
import { resolveOneOrChoice } from "./resolve";

type DeleteBrixInput = {
  block?: string;
  blockId?: string;
  vineyard?: string;
  variety?: string;
  brixValue?: number;
  recordedAt?: string; // YYYY-MM-DD
};

export const deleteBrixTool: AssistantTool = {
  name: "delete_brix",
  description:
    "ALWAYS call this when the user wants a Brix reading removed — even if you are unsure WHICH block or WHICH reading. Do not list candidates or ask which one in prose first: an ambiguous query returns a CLICKABLE PICKER that pins the exact row by id, and a prose list gives the user nothing to act on — records with identical labels cannot be told apart by name at all. Calling this NEVER deletes anything; it returns a preview to confirm. " +
    "Delete (revert) a mistaken Brix reading on a block. Use when the user wants to remove, undo, revert, or delete a Brix reading they logged. Narrow to a single reading with the block plus the value and/or date. This does NOT delete immediately — it returns a preview the user must confirm in the UI.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      block: { type: "string", description: "Block label, e.g. 'Block 2'." },
      blockId: { type: "string", description: "Internal use: a block pinned by id from a picker tap. Never invent one." },
      vineyard: { type: "string", description: "Vineyard name (optional for a manager)." },
      variety: { type: "string", description: "Grape variety, to disambiguate the block, e.g. 'Grenache'." },
      brixValue: { type: "number", description: "The Brix value of the reading to delete, to pinpoint it." },
      recordedAt: { type: "string", description: "Date the reading was recorded (YYYY-MM-DD), to pinpoint it." },
    },
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as DeleteBrixInput;
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
      resume: (b) => signResume("delete_brix", { ...input, blockId: b.id }),
      noneMsg: `No block matches that you can access (block "${input.block ?? "?"}"${input.variety ? `, variety "${input.variety}"` : ""}).`,
    });
    if (picked.kind === "choice") return picked.choice;
    const block = picked.row;

    const history = await getBlockBrixHistory(block.id);
    let candidates = history;
    if (typeof input.brixValue === "number") {
      candidates = candidates.filter((h) => Math.abs(h.brixValue - input.brixValue!) < 0.05);
    }
    if (input.recordedAt) {
      candidates = candidates.filter((h) => h.recordedAt.slice(0, 10) === input.recordedAt);
    }

    // Second ambiguity point: several readings on one block can share a value or a date. Same treatment.
    const pickedReading = resolveOneOrChoice(candidates, {
      prompt: `Which reading on ${block.label} do you want to delete?`,
      describe: (h) => `${h.brixValue} °Bx on ${h.recordedAt.slice(0, 10)}`,
      resume: (h) => signResume("delete_brix", { ...input, blockId: block.id, brixValue: h.brixValue, recordedAt: h.recordedAt.slice(0, 10) }),
      noneMsg: `No matching Brix reading on ${block.label} (${block.vineyardName}). Nothing to delete.`,
    });
    if (pickedReading.kind === "choice") return pickedReading.choice;
    const reading = pickedReading.row;

    const date = reading.recordedAt.slice(0, 10);
    const preview = `Delete the ${reading.brixValue} °Bx reading on ${block.label} (${block.vineyardName}), recorded ${date}.`;
    const token = signProposal("delete_brix", {
      brixLogId: reading.id,
      label: block.label,
      brixValue: reading.brixValue,
      date,
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitDeleteBrix: Committer = async (_user, args) => {
  const brixLogId = String(args.brixLogId);
  await deleteBrixLog(brixLogId);
  return {
    message: `Deleted the ${Number(args.brixValue)} °Bx reading on ${String(args.label ?? "the block")} (${String(args.date ?? "")}).`,
  };
};
