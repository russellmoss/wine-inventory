import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AssistantTool } from "../registry";
import { resolveVineyards } from "../scope";

type QueryYieldInput = { vineyard?: string; variety?: string; vintageYear?: number };

export const queryYieldTool: AssistantTool = {
  name: "query_yield",
  description:
    "Look up harvest yields — pre-harvest estimates and actual harvested weight — for vineyard blocks. Call this when the user asks about yields, harvested weight, tonnage, or estimates for a block, variety, vineyard, or vintage year. All weights are in kilograms.",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      vineyard: { type: "string", description: "Vineyard name (partial match)." },
      variety: { type: "string", description: "Grape variety (partial match), e.g. 'Cabernet'." },
      vintageYear: { type: "integer", description: "Vintage year, e.g. 2024." },
    },
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as QueryYieldInput;
    const vineyards = await resolveVineyards(ctx.user, input.vineyard);
    if (vineyards.length === 0) {
      return { message: "No matching vineyard you can access." };
    }

    const where: Prisma.HarvestRecordWhereInput = {
      vineyardId: { in: vineyards.map((v) => v.id) },
    };
    if (typeof input.vintageYear === "number") where.vintageYear = input.vintageYear;
    if (input.variety) where.block = { variety: { name: { contains: input.variety, mode: "insensitive" } } };

    const records = await prisma.harvestRecord.findMany({
      where,
      take: 100,
      orderBy: [{ vintageYear: "desc" }],
      select: {
        vintageYear: true,
        yieldEstimateKg: true,
        block: {
          select: {
            blockLabel: true,
            vineyard: { select: { name: true } },
            variety: { select: { name: true } },
          },
        },
        picks: { select: { weightKg: true } },
      },
    });
    if (records.length === 0) {
      return { message: "No harvest records match that query." };
    }

    return {
      results: records.map((r) => {
        const harvestedKg = r.picks.reduce((sum, p) => sum + p.weightKg.toNumber(), 0);
        return {
          vineyard: r.block.vineyard.name,
          block: r.block.blockLabel ?? "(unlabeled)",
          variety: r.block.variety?.name ?? null,
          vintageYear: r.vintageYear,
          estimateKg: r.yieldEstimateKg ? r.yieldEstimateKg.toNumber() : null,
          harvestedKg: harvestedKg > 0 ? Number(harvestedKg.toFixed(1)) : null,
        };
      }),
    };
  },
};
