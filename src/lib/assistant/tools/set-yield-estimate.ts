import "server-only";
import { recordYieldEstimate } from "@/lib/harvest/actions";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { findScopedBlocks } from "../scope";
import { resolveExactlyOne } from "./resolve";

type SetYieldInput = {
  block?: string;
  vineyard?: string;
  estimate?: number;
  unit?: string;
  vintageYear?: number;
};

/** Normalize a free-text unit to the action's expected "metric" (kg) | "imperial" (lb). */
function normUnit(u?: string): "metric" | "imperial" {
  const s = (u ?? "").toLowerCase();
  if (s === "lb" || s === "lbs" || s === "pound" || s === "pounds" || s === "imperial") return "imperial";
  return "metric"; // kg / default
}

export const setYieldEstimateTool: AssistantTool = {
  name: "set_yield_estimate",
  description:
    "Set the pre-harvest yield estimate for a vineyard block in a given vintage year. Use when the user wants to add, set, or update a yield estimate. This does NOT save immediately — it returns a preview the user must confirm in the UI.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      block: { type: "string", description: "Block label, e.g. 'Block 2'." },
      vineyard: { type: "string", description: "Vineyard name, to disambiguate the block (optional for a manager)." },
      estimate: { type: "number", description: "The estimated yield, a non-negative number." },
      unit: { type: "string", description: "Weight unit: 'kg' (default) or 'lb'." },
      vintageYear: { type: "integer", description: "Vintage year the estimate applies to, e.g. 2024." },
    },
    required: ["block", "estimate", "vintageYear"],
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as SetYieldInput;
    if (typeof input.estimate !== "number" || !Number.isFinite(input.estimate) || input.estimate < 0) {
      throw new Error("Provide a non-negative numeric estimate.");
    }
    if (typeof input.vintageYear !== "number" || !Number.isInteger(input.vintageYear)) {
      throw new Error("Specify the vintage year (e.g. 2024).");
    }
    const blocks = await findScopedBlocks(ctx.user, { block: input.block, vineyard: input.vineyard });
    const block = resolveExactlyOne(blocks, {
      describe: (b) => `${b.label} (${b.vineyardName})`,
      noneMsg: `No block matches "${input.block ?? ""}" that you can access.`,
      manyMsg: `Several blocks match "${input.block ?? ""}"`,
    });

    const unit = normUnit(input.unit);
    const unitLabel = unit === "metric" ? "kg" : "lb";
    const preview = `Set ${input.estimate} ${unitLabel} yield estimate for ${block.label} (${block.vineyardName}), vintage ${input.vintageYear}.`;
    const token = signProposal("set_yield_estimate", {
      blockId: block.id,
      estimate: input.estimate,
      unit,
      vintageYear: input.vintageYear,
      label: block.label,
      unitLabel,
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitSetYieldEstimate: Committer = async (_user, args) => {
  const blockId = String(args.blockId);
  const estimate = Number(args.estimate);
  const unit = args.unit === "imperial" ? "imperial" : "metric";
  const vintageYear = Number(args.vintageYear);
  await recordYieldEstimate(blockId, estimate, unit, vintageYear);
  return {
    message: `Set ${estimate} ${String(args.unitLabel ?? "kg")} yield estimate for ${String(args.label ?? "the block")} (vintage ${vintageYear}).`,
  };
};
