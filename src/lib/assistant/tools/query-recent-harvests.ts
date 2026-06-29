import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AssistantTool } from "../registry";

type QueryRecentHarvestsInput = {
  vineyard?: string;
  variety?: string;
  limit?: number;
};

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export const queryRecentHarvestsTool: AssistantTool = {
  name: "query_recent_harvests",
  description:
    "List the most recent harvest picks across the vineyards you can access, newest first by pick date. Call this for open-ended, chronological questions like 'what did we harvest last?', 'what was the last thing we picked?', 'recent harvests', or 'when did we last harvest'. Optionally narrow by vineyard or variety. Each result is a single pick pass; weights are kilograms.",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      vineyard: { type: "string", description: "Vineyard name (partial match)." },
      variety: { type: "string", description: "Grape variety (partial match), e.g. 'Merlot'." },
      limit: {
        type: "integer",
        description: `How many recent picks to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`,
      },
    },
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as QueryRecentHarvestsInput;
    const { user } = ctx;

    // Scope: managers are pinned to their vineyard membership set; admins see all.
    if (user.role !== "admin" && user.vineyardIds.length === 0) {
      return { message: "You don't have a vineyard assigned, so there's nothing in scope." };
    }

    const recordWhere: Prisma.HarvestRecordWhereInput = {};
    if (user.role !== "admin") recordWhere.vineyardId = { in: user.vineyardIds };
    if (input.vineyard) {
      recordWhere.vineyard = { name: { contains: input.vineyard, mode: "insensitive" } };
    }
    if (input.variety) {
      recordWhere.block = { variety: { name: { contains: input.variety, mode: "insensitive" } } };
    }

    const limit = Math.min(
      Math.max(typeof input.limit === "number" ? Math.trunc(input.limit) : DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );

    const picks = await prisma.harvestPick.findMany({
      where: { harvestRecord: { is: recordWhere } },
      orderBy: [{ pickDate: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: {
        pickDate: true,
        weightKg: true,
        brixAtPick: true,
        harvestRecord: {
          select: {
            vintageYear: true,
            block: {
              select: {
                blockLabel: true,
                vineyard: { select: { name: true } },
                variety: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (picks.length === 0) {
      return { message: "No harvest picks are recorded for that scope yet." };
    }

    return {
      results: picks.map((p) => ({
        pickDate: p.pickDate.toISOString().slice(0, 10),
        vineyard: p.harvestRecord.block.vineyard.name,
        block: p.harvestRecord.block.blockLabel ?? "(unlabeled)",
        variety: p.harvestRecord.block.variety?.name ?? null,
        vintageYear: p.harvestRecord.vintageYear,
        weightKg: Number(p.weightKg.toNumber().toFixed(1)),
        brixAtPick: p.brixAtPick ? p.brixAtPick.toNumber() : null,
      })),
    };
  },
};
