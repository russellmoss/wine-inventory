import "server-only";
import { getBlockBrixHistory, deleteBrixLog } from "@/lib/harvest/actions";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { findScopedBlocks } from "../scope";
import { resolveExactlyOne } from "./resolve";

type DeleteBrixInput = {
  block?: string;
  vineyard?: string;
  variety?: string;
  brixValue?: number;
  recordedAt?: string; // YYYY-MM-DD
};

export const deleteBrixTool: AssistantTool = {
  name: "delete_brix",
  description:
    "Delete (revert) a mistaken Brix reading on a block. Use when the user wants to remove, undo, revert, or delete a Brix reading they logged. Narrow to a single reading with the block plus the value and/or date. This does NOT delete immediately — it returns a preview the user must confirm in the UI.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      block: { type: "string", description: "Block label, e.g. 'Block 2'." },
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
    const block = resolveExactlyOne(blocks, {
      describe: (b) => `${b.label}${b.varietyName ? ` (${b.varietyName})` : ""} in ${b.vineyardName}`,
      noneMsg: `No block matches that you can access (block "${input.block ?? "?"}"${input.variety ? `, variety "${input.variety}"` : ""}).`,
      manyMsg: `Several blocks match`,
    });

    const history = await getBlockBrixHistory(block.id);
    let candidates = history;
    if (typeof input.brixValue === "number") {
      candidates = candidates.filter((h) => Math.abs(h.brixValue - input.brixValue!) < 0.05);
    }
    if (input.recordedAt) {
      candidates = candidates.filter((h) => h.recordedAt.slice(0, 10) === input.recordedAt);
    }

    const reading = resolveExactlyOne(candidates, {
      describe: (h) => `${h.brixValue} °Bx on ${h.recordedAt.slice(0, 10)}`,
      noneMsg: `No matching Brix reading on ${block.label} (${block.vineyardName}). Nothing to delete.`,
      manyMsg: `Several readings on ${block.label} match`,
    });

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
