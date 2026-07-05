import type { AssistantTool } from "../registry";
import { buildCalcInputSchema, runCalcTool } from "./calc-shared";

// SO₂ bench math (Section 2). PURE read tool — dispatches to the winemaking-calc engine.
const IDS = ["so2-addition-plan", "so2-kmbs", "so2-solution", "so2-molecular", "so2-reduction"];

export const calcSo2Tool: AssistantTool = {
  name: "calc_so2",
  description:
    "Calculate SO₂ additions. Operations: 'so2-addition-plan' (the FULL workflow — from a molecular target + pH + the free SO₂ already present, gives the free-SO₂ target, the addition needed, and the dose as BOTH KMBS grams and % stock-solution mL; use this when the user gives a molecular target AND a current free SO₂, e.g. 'get to 0.8 molecular at pH 3.4, I have 20 free now, 1000 gal, 10% solution'); 'so2-kmbs' (grams of KMBS for a known free-SO₂ addition); 'so2-solution' (mL of a % stock for a known addition); 'so2-molecular' (just the free-SO₂ target for a molecular target at a pH — standard molecular target is 0.5–0.8 mg/L); and 'so2-reduction' (peroxide reduction; advisory + dangerous). Results are advisory.",
  kind: "read",
  inputSchema: buildCalcInputSchema(IDS),
  async run(_ctx, input) {
    return runCalcTool(IDS, input);
  },
};
