import type { AssistantTool } from "../registry";
import { buildCalcInputSchema, runCalcTool } from "./calc-shared";

// Blending & cost (Section 8). PURE read tool.
const IDS = ["blend-two", "wine-cost"];

export const calcBlendingTool: AssistantTool = {
  name: "calc_blending",
  description:
    "Calculate blending and cost figures. Operations: 'blend-two' (two-component blend — volume-weighted attribute like alcohol/TA, plus a chemically-correct pH blend in H⁺ space; the blend pH is an ESTIMATE because wine is buffered — say the true pH needs a bench trial) and 'wine-cost' (total cost per gallon + cases from six per-gallon cost buckets, 2.38 gal/case). Results are advisory.",
  kind: "read",
  inputSchema: buildCalcInputSchema(IDS),
  async run(_ctx, input) {
    return runCalcTool(IDS, input);
  },
};
