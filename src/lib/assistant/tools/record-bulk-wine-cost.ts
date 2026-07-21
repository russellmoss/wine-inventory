import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveLotTargetOrChoice } from "../scope";
import { receiveBulkWineCostAction } from "@/lib/cost/actions";
import type { ReceiveBulkWineCostInput } from "@/lib/cost/receive";

// Wave 3 (cost) — record the PURCHASE COST of a bulk-wine lot as a mid-DAG MATERIAL cost node (D20), so the
// lot's cost roll-up is right (bought bulk wine, a custom-crush charge, etc.). Wraps receiveBulkWineCoreAction
// → receiveBulkWineCostCore, which requires a bulk WINE lot (not fruit/must/bottled/finished) and attaches
// the CostLine to the given op or the lot's latest op. Cost is KNOWN completeness (operator-supplied).

type RawInput = { lot?: string; vessel?: string; totalCost?: number; note?: string };

export const recordBulkWineCostTool: AssistantTool = {
  name: "record_bulk_wine_cost",
  description:
    "Record the PURCHASE COST of a bulk-wine lot — a mid-process cost node so the lot's cost roll-up is accurate (e.g. bought bulk wine, or a custom-crush charge on a lot). Use when the user states what a bulk WINE lot cost: 'the bulk Cab in tank 4 cost $5,000', 'record $2,400 for lot 24-BULK-1'. Give the lot by code, or the vessel that holds it. The lot must be a bulk wine lot (not fruit/must/bottled). This is NOT a material/supply receipt (that's receive_supply). Returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      lot: { type: "string", description: "Bulk wine lot code, e.g. '24-BULK-1'." },
      vessel: { type: "string", description: "Vessel holding the bulk lot, e.g. 'tank 4'." },
      totalCost: { type: "number", description: "Total purchase cost in the tenant's currency (> 0)." },
      note: { type: "string", description: "Optional note (supplier, invoice, etc.)." },
    },
    required: ["totalCost"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as RawInput;
    if (typeof input.totalCost !== "number" || !(input.totalCost > 0)) throw new Error("What did it cost? Give a positive total.");
    const resolved = await resolveLotTargetOrChoice({ lot: input.lot, vessel: input.vessel }, "record_bulk_wine_cost", input as Record<string, unknown>);
    if (resolved.kind === "choice") return resolved.choice;
    const { lotId, lotCode } = resolved.row;
    const preview = `Record a bulk-wine purchase cost of ${input.totalCost.toLocaleString()} for lot ${lotCode} (mid-process material cost node).`;
    const token = signProposal("record_bulk_wine_cost", {
      lotId,
      lotCode,
      totalCost: input.totalCost,
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitRecordBulkWineCost: Committer = async (_user, args) => {
  const input: ReceiveBulkWineCostInput = {
    lotId: String(args.lotId),
    totalCost: Number(args.totalCost),
    note: args.note == null ? undefined : String(args.note),
  };
  await receiveBulkWineCostAction(input);
  return { message: `Recorded ${Number(args.totalCost).toLocaleString()} bulk-wine cost on lot ${String(args.lotCode ?? "")}.` };
};
