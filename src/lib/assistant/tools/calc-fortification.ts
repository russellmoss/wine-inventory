import type { AssistantTool } from "../registry";
import { buildCalcInputSchema, runCalcTool } from "./calc-shared";

// Fortification (Section 7). PURE read tool.
const IDS = ["fortification-pearson", "sweet-spot"];

export const calcFortificationTool: AssistantTool = {
  name: "calc_fortification",
  description:
    "Calculate fortification figures. Operations: 'fortification-pearson' (volume of high-proof spirit to raise wine from its current alcohol to a target, via Pearson's square — spirit must be stronger than the target and the wine weaker) and 'sweet-spot' (a bench-trial ladder of the two component volumes across a range of alcohol levels). Results are advisory.",
  kind: "read",
  inputSchema: buildCalcInputSchema(IDS),
  async run(_ctx, input) {
    return runCalcTool(IDS, input);
  },
};
