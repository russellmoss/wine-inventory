import type { AssistantTool } from "../registry";
import { buildCalcInputSchema, runCalcTool } from "./calc-shared";

// Acid, deacidification, oak, fining & copper (Sections 5 + 6). PURE read tool.
const IDS = [
  "acid-addition", "deacidification",
  "fining", "oak", "copper-anhydrous", "copper-solution",
];

export const calcAdditionsTool: AssistantTool = {
  name: "calc_additions",
  description:
    "Calculate cellar-addition doses. Operations: 'acid-addition' (mass of acid at a rate), 'deacidification' (CaCO₃/KHCO₃/K-bicarb mass for a TA drop — advisory, verify by bench trial), 'fining' (fining agent mass), 'oak' (oak mass), 'copper-anhydrous' (copper sulfate mass for a target elemental Cu) and 'copper-solution' (copper sulfate stock volume). Copper is regulated — TTB caps residual Cu at 0.5 mg/L; warn the user if the result exceeds it. Results are advisory.",
  kind: "read",
  inputSchema: buildCalcInputSchema(IDS),
  async run(_ctx, input) {
    return runCalcTool(IDS, input);
  },
};
