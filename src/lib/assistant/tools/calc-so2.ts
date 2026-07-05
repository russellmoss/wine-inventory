import type { AssistantTool } from "../registry";
import { buildCalcInputSchema, runCalcTool } from "./calc-shared";

// SO₂ bench math (Section 2). PURE read tool — dispatches to the winemaking-calc engine.
const IDS = ["so2-kmbs", "so2-solution", "so2-molecular", "so2-reduction"];

export const calcSo2Tool: AssistantTool = {
  name: "calc_so2",
  description:
    "Calculate SO₂ additions. Operations: 'so2-kmbs' (grams of potassium metabisulfite for a target free-SO₂ addition), 'so2-solution' (mL of a % sulfurous stock solution), 'so2-molecular' (free SO₂ in ppm to reach a target MOLECULAR SO₂ at the wine's pH — standard molecular target is 0.5–0.8 mg/L), and 'so2-reduction' (peroxide reduction; advisory + dangerous). Use this for questions like 'how much SO₂ to hit 0.8 molecular at pH 3.4' or 'grams of KMBS for +50 ppm in 1000 gal'. Results are advisory.",
  kind: "read",
  inputSchema: buildCalcInputSchema(IDS),
  async run(_ctx, input) {
    return runCalcTool(IDS, input);
  },
};
