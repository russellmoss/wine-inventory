import type { AssistantTool } from "../registry";
import { buildCalcInputSchema, runCalcTool } from "./calc-shared";

// Unit conversions (Section 1). PURE read tool.
const IDS = ["convert-volume", "convert-mass", "convert-pressure", "convert-area", "convert-distance", "convert-temperature"];

export const calcConvertTool: AssistantTool = {
  name: "calc_convert",
  description:
    "Convert units. Operations: 'convert-volume', 'convert-mass', 'convert-pressure', 'convert-area', 'convert-distance' (each takes a value + a 'from' unit and returns every unit in that dimension) and 'convert-temperature' (°C ↔ °F). Use for questions like 'how many liters in 250 US gallons' or 'convert 68°F to C'.",
  kind: "read",
  inputSchema: buildCalcInputSchema(IDS),
  async run(_ctx, input) {
    return runCalcTool(IDS, input);
  },
};
