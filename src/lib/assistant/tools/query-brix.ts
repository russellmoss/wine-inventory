import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AssistantTool, ToolContext } from "../registry";

type QueryBrixInput = {
  vineyard?: string;
  block?: string;
  variety?: string;
};

/**
 * Build a scoped VineyardBlock filter. Managers (role !== "admin") are pinned to
 * their assigned vineyard; admins see all. Returns null when a manager has no
 * vineyard assigned (nothing to read). Scoping lives HERE, never trusted to the model.
 */
function buildBlockWhere(
  ctx: ToolContext,
  input: QueryBrixInput,
): Prisma.VineyardBlockWhereInput | null {
  const where: Prisma.VineyardBlockWhereInput = {};
  if (ctx.user.role !== "admin") {
    if (ctx.user.vineyardIds.length === 0) return null;
    where.vineyardId = { in: ctx.user.vineyardIds };
  }
  if (input.vineyard) where.vineyard = { name: { contains: input.vineyard, mode: "insensitive" } };
  if (input.block) where.blockLabel = { contains: input.block, mode: "insensitive" };
  if (input.variety) where.variety = { name: { contains: input.variety, mode: "insensitive" } };
  return where;
}

export const queryBrixTool: AssistantTool = {
  name: "query_brix",
  description:
    "Look up the most recent Brix (sugar / ripeness) reading for vineyard blocks. Call this whenever the user asks about current or latest Brix, ripeness, or sugar levels for a block, a grape variety, or a vineyard. Optionally narrow by vineyard name, block label, or variety (all partial, case-insensitive).",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      vineyard: { type: "string", description: "Vineyard name to filter by (partial match)." },
      block: { type: "string", description: "Block label to filter by, e.g. 'Block 3' or 'A' (partial match)." },
      variety: { type: "string", description: "Grape variety to filter by, e.g. 'Cabernet' (partial match)." },
    },
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as QueryBrixInput;
    const where = buildBlockWhere(ctx, input);
    if (where === null) {
      return { message: "You have no vineyard assigned, so there are no blocks to read." };
    }

    const blocks = await prisma.vineyardBlock.findMany({
      where,
      take: 30,
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        blockLabel: true,
        vineyard: { select: { name: true } },
        variety: { select: { name: true } },
      },
    });
    if (blocks.length === 0) {
      return { message: "No matching blocks found. Try a different block, variety, or vineyard." };
    }

    // Latest Brix per matched block: one query, reduce to first-seen (newest) in JS.
    const ids = blocks.map((b) => b.id);
    const rows = await prisma.brixLog.findMany({
      where: { blockId: { in: ids } },
      orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
      select: { blockId: true, brixValue: true, recordedAt: true },
    });
    const latest = new Map<string, { brixValue: number; recordedAt: string }>();
    for (const r of rows) {
      if (!latest.has(r.blockId)) {
        latest.set(r.blockId, { brixValue: r.brixValue.toNumber(), recordedAt: r.recordedAt.toISOString() });
      }
    }

    return {
      results: blocks.map((b) => ({
        vineyard: b.vineyard.name,
        block: b.blockLabel ?? b.id,
        variety: b.variety?.name ?? null,
        latestBrix: latest.get(b.id) ?? null,
      })),
    };
  },
};
