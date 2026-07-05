import type { AssistantTool } from "../registry";
import { buildCalcInputSchema, runCalcTool } from "./calc-shared";

// Fermentation, sugar, chaptalization & dilution (Sections 3 + 4). PURE read tool.
const IDS = [
  "brix-alcohol", "brix-sg", "sg-scales", "sg-temp-correction",
  "yeast-dose", "nutrient-dose", "yan-dose",
  "chaptalization", "water-dilution",
];

export const calcSugarTool: AssistantTool = {
  name: "calc_sugar",
  description:
    "Calculate fermentation, sugar, chaptalization and dilution figures. Operations: 'brix-alcohol' (potential alcohol from Brix × factor), 'brix-sg' (Brix → specific gravity + sugar g/L), 'sg-scales' (SG → Brix/Baumé/Oechsle/sugar), 'sg-temp-correction' (hydrometer temp correction), 'yeast-dose'/'nutrient-dose' (mass at a rate), 'yan-dose' (nitrogen product mass to raise YAN — pick a product), 'chaptalization' (sugar to add to raise Brix), 'water-dilution' (water to add to lower Brix). Results are advisory.",
  kind: "read",
  inputSchema: buildCalcInputSchema(IDS),
  async run(_ctx, input) {
    return runCalcTool(IDS, input);
  },
};
