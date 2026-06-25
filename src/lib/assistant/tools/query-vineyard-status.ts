import "server-only";
import type { AssistantTool } from "../registry";
import { resolveVineyards } from "../scope";
import { getVineyardHarvestDashboard } from "@/lib/harvest/actions";

type QueryStatusInput = { vineyard?: string };

export const queryVineyardStatusTool: AssistantTool = {
  name: "query_vineyard_status",
  description:
    "Get a current status snapshot for a vineyard: each block with its latest Brix reading, this season's yield estimate, and harvested-to-date. Call this when the user asks how a vineyard is doing, wants an overview, or asks for the 'status of <vineyard>'.",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      vineyard: {
        type: "string",
        description: "Vineyard name (partial match). Optional for a manager — defaults to their assigned vineyard.",
      },
    },
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as QueryStatusInput;
    const vineyards = await resolveVineyards(ctx.user, input.vineyard);
    if (vineyards.length === 0) {
      return { message: "No matching vineyard you can access." };
    }
    if (vineyards.length > 3) {
      return {
        message: `That matches ${vineyards.length} vineyards: ${vineyards.map((v) => v.name).join(", ")}. Ask about one of them.`,
      };
    }

    const results = [];
    for (const v of vineyards) {
      // Reuses the scoped dashboard read (re-checks access internally).
      const d = await getVineyardHarvestDashboard(v.id);
      results.push({
        vineyard: v.name,
        season: d.vintageYear,
        blocks: d.blocks.map((b) => ({
          block: b.label,
          variety: b.varietyName,
          latestBrix: b.latestBrix ? b.latestBrix.brixValue : null,
          latestBrixAt: b.latestBrix ? b.latestBrix.recordedAt : null,
          estimateKg: b.yieldEstimateKg,
          harvestedKg: b.picks.length
            ? Number(b.picks.reduce((sum, p) => sum + p.weightKg, 0).toFixed(1))
            : null,
        })),
      });
    }
    return { results };
  },
};
