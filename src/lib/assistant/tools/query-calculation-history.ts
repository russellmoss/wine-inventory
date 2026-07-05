import "server-only";
import type { AssistantTool } from "../registry";
import { queryCalculationHistory } from "@/lib/winemaking-calc/log";

type QueryCalcHistoryInput = {
  calculatorId?: string;
  limit?: number;
};

export const queryCalculationHistoryTool: AssistantTool = {
  name: "query_calculation_history",
  description:
    "Look up recent winemaking-calculator runs (the calculation audit log) for traceability — e.g. 'show my last blend calc' or 'what SO₂ additions has the calculator suggested this week?'. Each row has the calculator, its inputs and output, the source (page or assistant), and when it ran. You see your own calculations; admins see the whole winery's. Optionally filter by calculatorId (e.g. 'so2-kmbs', 'blend-two') and set a limit (default 20, max 50).",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      calculatorId: { type: "string", description: "Filter to one calculator by its id, e.g. 'so2-kmbs', 'chaptalization', 'blend-two'." },
      limit: { type: "integer", description: "Max rows to return (default 20, max 50)." },
    },
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as QueryCalcHistoryInput;
    const rows = await queryCalculationHistory(ctx.user, { calculatorId: input.calculatorId, limit: input.limit });
    if (rows.length === 0) {
      return { message: "No calculations have been logged yet." };
    }
    return { results: rows };
  },
};
