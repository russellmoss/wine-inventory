import "server-only";
import type { AssistantTool } from "../registry";
import { listCustomUnitsCore } from "@/lib/units/custom-unit-core";
import { canonicalUnitFor } from "@/lib/units/measure";

// Plan 075: list the winery's user-defined units. The READ counterpart to create_custom_unit — answers
// "what custom units do we have", "is there a 'drum' unit", "what units can I receive stock in". Built-ins
// (g/kg/mg/oz/lb/ton/mL/L/gal/fl oz/unit) are always available and are NOT listed here.

export const queryCustomUnitsTool: AssistantTool = {
  name: "query_custom_units",
  description:
    "List the winery's user-defined measurement units (the ones created with create_custom_unit, e.g. 'drum', " +
    "'tote', 'roll'). Use for 'what custom units do we have', 'do we already have a drum unit', 'what units can " +
    "I receive stock in besides the standard ones'. Built-in units (g, kg, mg, oz, lb, ton, mL, L, gal, fl oz, " +
    "unit) are always available and are NOT included here. Read-only — to add one use create_custom_unit.",
  kind: "read",
  inputSchema: { type: "object", properties: {} },
  async run() {
    const rows = await listCustomUnitsCore();
    const units = rows.map((u) => ({
      name: u.name,
      dimension: u.dimension,
      perCanonical: u.perCanonical,
      canonicalUnit: canonicalUnitFor(u.dimension),
    }));
    return {
      count: units.length,
      units,
      note:
        "perCanonical is how many canonical base units (g for mass, mL for volume, base-count for count) one of this unit equals. Built-in units are not listed — they're always available.",
    };
  },
};
