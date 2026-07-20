import "server-only";
import { logBrix } from "@/lib/harvest/actions";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal, signResume } from "../confirm";
import { findScopedBlocks } from "../scope";
import { resolveOneOrChoice } from "./resolve";

const BRIX_MIN = 0;
const BRIX_MAX = 35;

type LogBrixInput = {
  block?: string;
  vineyard?: string;
  variety?: string;
  brixValue?: number;
  recordedAt?: string;
  blockId?: string;
};

export const logBrixTool: AssistantTool = {
  name: "log_brix",
  description:
    "ALWAYS call this when the user reports a Brix reading for a block — even if you are unsure WHICH block they mean. Do not ask in prose first: if the block is ambiguous this returns a clickable picker, and if it resolves to nothing it returns a draft card naming what it still needs. Both are visible to the user; a prose question is not. " +
    "Record a NEW Brix (sugar / RIPENESS) reading for a VINEYARD BLOCK — grapes still on the vine, tracking ripening toward harvest. Use ONLY when the reading is against a block/vineyard. Do NOT use this for sugar on must or wine that is already picked and sitting in a tank/barrel (a mid-ferment tank sugar reading) — that is a cellar-lot reading; use record_measurement with the `brix` field against the vessel/lot instead. This does NOT save immediately — it returns a preview the user must confirm in the UI.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      block: { type: "string", description: "Block label, e.g. 'Block 3'. Use the bare label, not the variety in parentheses. Pass what the user said even if several blocks might match — you get a picker, not an error." },
      blockId: { type: "string", description: "Internal use: a block pinned by id from a picker tap. Never invent one." },
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
      block: input.blockId ? undefined : input.block,
      vineyard: input.vineyard,
      variety: input.variety,
    });
    const candidates = input.blockId ? blocks.filter((b) => b.id === input.blockId) : blocks;

    // NOTHING matched -> a DRAFT card naming what is missing, not a thrown error. Plan 081 shipped this
    // for work orders; the same failure existed here. The model used to ask "which vineyard's Block 3?"
    // in PROSE rather than call the tool, because the tool could only produce a card when the block
    // resolved to exactly one — so the user got no card at all. Measured: 5/10 card emission.
    if (candidates.length === 0) {
      const asked = [input.block && `block "${input.block}"`, input.variety && `variety "${input.variety}"`, input.vineyard && `vineyard "${input.vineyard}"`]
        .filter(Boolean).join(", ");
      return {
        needsConfirmation: true as const,
        draft: true as const,
        preview: `Log ${input.brixValue} °Bx — which block?`,
        details: {
          unresolved: [{
            label: "Block",
            reason: asked
              ? `No block you can access matches ${asked}. Name the block (and its vineyard if the label repeats).`
              : `Name the vineyard block this ${input.brixValue} °Bx reading is for.`,
          }],
        },
      };
    }

    // AMBIGUOUS -> a clickable picker pinned by id, not a text question that dead-loops on duplicate
    // labels ("Block 3" legitimately exists in several vineyards).
    const res = resolveOneOrChoice(candidates, {
      prompt: `Which "${input.block ?? "block"}" do you mean?`,
      describe: (b) => `${b.label}${b.varietyName ? ` (${b.varietyName})` : ""}`,
      detail: (b) => b.vineyardName,
      resume: (b) => signResume("log_brix", { ...input, blockId: b.id }),
      noneMsg: `No block matches that you can access.`,
    });
    if (res.kind === "choice") return res.choice;
    const block = res.row;

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
