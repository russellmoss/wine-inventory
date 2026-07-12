import "server-only";
import { logBrix } from "@/lib/harvest/actions";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { findScopedBlocks } from "../scope";
import { resolveExactlyOne } from "./resolve";

const BRIX_MIN = 0;
const BRIX_MAX = 35;

type LogBrixInput = {
  block?: string;
  vineyard?: string;
  variety?: string;
  brixValue?: number;
  recordedAt?: string;
};

export const logBrixTool: AssistantTool = {
  name: "log_brix",
  description:
    "Record a NEW Brix (sugar / RIPENESS) reading for a VINEYARD BLOCK — grapes still on the vine, tracking ripening toward harvest. Use ONLY when the reading is against a block/vineyard. Do NOT use this for sugar on must or wine that is already picked and sitting in a tank/barrel (a mid-ferment tank sugar reading) — that is a cellar-lot reading; use record_measurement with the `brix` field against the vessel/lot instead. This does NOT save immediately — it returns a preview the user must confirm in the UI.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      block: { type: "string", description: "Block label, e.g. 'Block 3'. Use the bare label, not the variety in parentheses." },
      vineyard: { type: "string", description: "Vineyard name, to disambiguate the block (optional for a manager)." },
      variety: { type: "string", description: "Grape variety, to disambiguate when the block isn't named, e.g. 'Grenache'." },
      brixValue: { type: "number", description: "The reading in degrees Brix (0–35)." },
      recordedAt: { type: "string", description: "Date of the reading as YYYY-MM-DD (optional, defaults to today)." },
    },
    required: ["brixValue"],
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as LogBrixInput;
    if (typeof input.brixValue !== "number" || !Number.isFinite(input.brixValue)) {
      throw new Error("Provide a numeric Brix value.");
    }
    if (input.brixValue < BRIX_MIN || input.brixValue > BRIX_MAX) {
      throw new Error(`Brix must be between ${BRIX_MIN} and ${BRIX_MAX} °Bx.`);
    }
    const blocks = await findScopedBlocks(ctx.user, {
      block: input.block,
      vineyard: input.vineyard,
      variety: input.variety,
    });
    const block = resolveExactlyOne(blocks, {
      describe: (b) => `${b.label}${b.varietyName ? ` (${b.varietyName})` : ""} in ${b.vineyardName}`,
      noneMsg: `No block matches that you can access (block "${input.block ?? "?"}"${input.variety ? `, variety "${input.variety}"` : ""}${input.vineyard ? `, vineyard "${input.vineyard}"` : ""}).`,
      manyMsg: `Several blocks match`,
    });

    const dateStr = input.recordedAt ? input.recordedAt : null;
    const when = dateStr ? ` on ${dateStr}` : " today";
    const preview = `Log ${input.brixValue} °Bx to ${block.label} (${block.vineyardName})${when}.`;
    const token = signProposal("log_brix", {
      blockId: block.id,
      brixValue: input.brixValue,
      recordedAt: dateStr,
      label: block.label,
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitLogBrix: Committer = async (_user, args) => {
  const blockId = String(args.blockId);
  const brixValue = Number(args.brixValue);
  const recordedAt = args.recordedAt ? String(args.recordedAt) : undefined;
  await logBrix(blockId, brixValue, recordedAt);
  return { message: `Logged ${brixValue} °Bx to ${String(args.label ?? "the block")}.` };
};
