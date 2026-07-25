import "server-only";
import type { AssistantTool } from "../registry";
import { resolveVineyards } from "../scope";
import { prisma } from "@/lib/prisma";

type QueryNdviInput = { vineyard?: string; block?: string };

// VI-P2 — read the latest per-block NDVI (satellite vigour) statistics for a vineyard. Reads the immutable
// BlockSpatialMetric snapshots; the WRITE path (fetch/process a new scene) is process_ndvi. A block below the
// valid-coverage floor reads null with an INSUFFICIENT_VALID_COVERAGE flag — surfaced, never a biased number.
export const queryNdviStatsTool: AssistantTool = {
  name: "query_ndvi_stats",
  description:
    "Get the latest satellite NDVI (vine vigour) statistics per block for a vineyard — the mean/median NDVI, " +
    "the scene's acquisition date, and how much of each block was cloud-free. Call this when the user asks about " +
    "NDVI, vigour, canopy, greenness, or 'how the vineyard looks from satellite'. This READS stored results; to " +
    "fetch and compute a NEW scene for a date, use process_ndvi.",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      vineyard: { type: "string", description: "Vineyard name (partial match). Optional for a manager — defaults to their assigned vineyard." },
      block: { type: "string", description: "Optional block label to narrow to a single block." },
    },
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as QueryNdviInput;
    const vineyards = await resolveVineyards(ctx.user, input.vineyard);
    if (vineyards.length === 0) return { message: "No matching vineyard you can access." };
    if (vineyards.length > 3) return { message: `That matches ${vineyards.length} vineyards: ${vineyards.map((v) => v.name).join(", ")}. Ask about one of them.` };

    const results = [];
    for (const v of vineyards) {
      const rows = await prisma.blockSpatialMetric.findMany({
        where: { vineyardId: v.id, metric: "NDVI" },
        orderBy: [{ blockId: "asc" }, { acquiredAt: "desc" }],
        select: { blockId: true, mean: true, median: true, min: true, max: true, acquiredAt: true, validFraction: true, qualityFlags: true },
      });
      const latest = new Map<string, (typeof rows)[number]>();
      for (const r of rows) if (!latest.has(r.blockId)) latest.set(r.blockId, r);
      const blocks = await prisma.vineyardBlock.findMany({ where: { vineyardId: v.id }, select: { id: true, blockLabel: true } });
      const labelOf = new Map(blocks.map((b) => [b.id, b.blockLabel ?? b.id]));
      const wanted = input.block?.trim().toLowerCase();
      const perBlock = [...latest.values()]
        .map((r) => ({
          block: labelOf.get(r.blockId) ?? r.blockId,
          ndviMean: r.mean === null ? null : Number(r.mean),
          ndviMedian: r.median === null ? null : Number(r.median),
          acquired: r.acquiredAt,
          validPct: Math.round(Number(r.validFraction) * 100),
          flags: Array.isArray(r.qualityFlags) ? r.qualityFlags : [],
        }))
        .filter((b) => !wanted || String(b.block).toLowerCase().includes(wanted));
      results.push({
        vineyard: v.name,
        blocks: perBlock,
        note: perBlock.length === 0 ? "No NDVI has been computed for this vineyard yet — use process_ndvi to fetch a scene." : undefined,
      });
    }
    return { results };
  },
};
