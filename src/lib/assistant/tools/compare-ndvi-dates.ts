import "server-only";
import type { AssistantTool } from "../registry";
import { resolveVineyards } from "../scope";
import { prisma } from "@/lib/prisma";

type CompareNdviInput = { vineyard?: string; fromDate?: string; toDate?: string };

// VI-P3 — compare per-block NDVI between two satellite dates for a vineyard. Reads the immutable
// BlockSpatialMetric snapshots for two acquisition dates and reports the per-block delta (change in vigour).
// A READ: comparing existing scenes never fetches. If dates are omitted, uses the two most recent distinct
// acquisitions. The domain is locked to both dates upstream (the map's comparison view) — here we return numbers.
export const compareNdviDatesTool: AssistantTool = {
  name: "compare_ndvi_dates",
  description:
    "Compare satellite NDVI (vine vigour) between two dates for a vineyard — the per-block change (delta) in " +
    "mean NDVI from an earlier scene to a later one. Call this when the user asks how vigour/canopy/greenness " +
    "CHANGED over time, 'is the vineyard greening up', 'compare NDVI between two dates', or 'what changed since " +
    "last month'. This READS stored results for two dates; to fetch a NEW scene, use process_ndvi.",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      vineyard: { type: "string", description: "Vineyard name (partial match). Optional for a manager — defaults to their assigned vineyard." },
      fromDate: { type: "string", description: "Earlier date (YYYY-MM-DD). Optional — defaults to the second-most-recent scene." },
      toDate: { type: "string", description: "Later date (YYYY-MM-DD). Optional — defaults to the most recent scene." },
    },
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as CompareNdviInput;
    const vineyards = await resolveVineyards(ctx.user, input.vineyard);
    if (vineyards.length === 0) return { message: "No matching vineyard you can access." };
    if (vineyards.length > 1) return { message: `That matches ${vineyards.length} vineyards: ${vineyards.map((v) => v.name).join(", ")}. Ask about one of them.` };
    const v = vineyards[0];

    const rows = await prisma.blockSpatialMetric.findMany({
      where: { vineyardId: v.id, metric: "NDVI" },
      orderBy: [{ acquiredAt: "desc" }],
      select: { blockId: true, mean: true, acquiredAt: true },
    });
    if (rows.length === 0) return { message: `No NDVI has been computed for ${v.name} yet — use process_ndvi to fetch a scene.` };

    // The distinct acquisition dates (newest first).
    const dayOf = (d: Date) => d.toISOString().slice(0, 10);
    const days = [...new Set(rows.map((r) => dayOf(r.acquiredAt)))];
    const toDay = input.toDate?.slice(0, 10) ?? days[0];
    const fromDay = input.fromDate?.slice(0, 10) ?? days.find((d) => d !== toDay) ?? null;
    if (!fromDay || fromDay === toDay) {
      return { message: `Only one NDVI date is available for ${v.name} (${toDay}). Need two dates to compare.` };
    }

    const blocks = await prisma.vineyardBlock.findMany({ where: { vineyardId: v.id }, select: { id: true, blockLabel: true } });
    const labelOf = new Map(blocks.map((b) => [b.id, b.blockLabel ?? b.id]));
    const meanOn = (day: string) => {
      const m = new Map<string, number | null>();
      for (const r of rows) {
        if (dayOf(r.acquiredAt) !== day) continue;
        if (!m.has(r.blockId)) m.set(r.blockId, r.mean === null ? null : Number(r.mean));
      }
      return m;
    };
    const fromMeans = meanOn(fromDay);
    const toMeans = meanOn(toDay);

    const perBlock = [...new Set([...fromMeans.keys(), ...toMeans.keys()])].map((blockId) => {
      const from = fromMeans.get(blockId) ?? null;
      const to = toMeans.get(blockId) ?? null;
      const delta = from !== null && to !== null ? Number((to - from).toFixed(3)) : null;
      return {
        block: labelOf.get(blockId) ?? blockId,
        fromMean: from,
        toMean: to,
        delta,
        direction: delta === null ? "unknown" : delta > 0.02 ? "greener" : delta < -0.02 ? "browner" : "steady",
      };
    });

    return { vineyard: v.name, fromDate: fromDay, toDate: toDay, blocks: perBlock };
  },
};
