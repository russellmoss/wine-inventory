import "server-only";
import type { AssistantTool } from "../registry";
import { resolveVineyards } from "../scope";
import { prisma } from "@/lib/prisma";
import { getCurrentSoilSnapshot, summarizeSoilSnapshot } from "@/lib/soil/read";

type SoilSummaryInput = { vineyard?: string; block?: string };

// VI-P4 — read the stored NRCS soil composition per block for a vineyard. Reads the current
// BlockSoilSnapshot (per-map-unit shares + cited properties; no blended block property). The one-click
// PULL that fetches a fresh snapshot from SDA is a GUI action on the block panel, not an assistant write.
export const soilSummaryTool: AssistantTool = {
  name: "query_block_soil",
  description:
    "Get the stored NRCS soil composition for a vineyard's blocks — which soil map units each block sits on, " +
    "their area share, pH, drainage, and how much of the boundary is covered. Call this when the user asks about " +
    "soil, soil type, soil series, drainage, or 'what's the ground like' for a block or vineyard. This READS the " +
    "stored snapshot; pulling a fresh one from NRCS is a one-click action on the block's page.",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      vineyard: { type: "string", description: "Vineyard name (partial match). Optional for a manager — defaults to their assigned vineyard." },
      block: { type: "string", description: "Optional block label to narrow to a single block." },
    },
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as SoilSummaryInput;
    const vineyards = await resolveVineyards(ctx.user, input.vineyard);
    if (vineyards.length === 0) return { message: "No matching vineyard you can access." };
    if (vineyards.length > 3) return { message: `That matches ${vineyards.length} vineyards: ${vineyards.map((v) => v.name).join(", ")}. Ask about one of them.` };

    const wanted = input.block?.trim().toLowerCase();
    const results = [];
    for (const v of vineyards) {
      const blocks = await prisma.vineyardBlock.findMany({
        where: { vineyardId: v.id },
        select: { id: true, blockLabel: true },
        orderBy: { sortOrder: "asc" },
      });
      const perBlock = [];
      for (const b of blocks) {
        const label = b.blockLabel ?? b.id;
        if (wanted && !label.toLowerCase().includes(wanted)) continue;
        const snap = await getCurrentSoilSnapshot(b.id);
        perBlock.push({
          block: label,
          soil: snap ? summarizeSoilSnapshot(snap) : "No soil has been pulled for this block yet — open the block and pull NRCS soil.",
          pulledAt: snap?.pulledAt ?? null,
          stale: snap?.stale ?? false,
        });
      }
      results.push({ vineyard: v.name, blocks: perBlock });
    }
    return { results };
  },
};
