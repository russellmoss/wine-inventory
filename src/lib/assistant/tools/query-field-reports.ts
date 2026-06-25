import "server-only";
import { prisma } from "@/lib/prisma";
import { getRecentFieldNotes } from "@/lib/fieldnotes/actions";
import { parseBriefing } from "@/lib/fieldnotes/prompt";
import type { InputApplication, BlockStatus } from "@/lib/fieldnotes/types";
import type { AssistantTool } from "../registry";
import { resolveVineyards } from "../scope";

type QueryReportsInput = { vineyard?: string; weeks?: number };

function appsWithLabels(apps: InputApplication[], labelOf: (id: string) => string) {
  return apps.map((a) => ({
    name: a.name,
    scope: a.scope === "WHOLE" ? "whole vineyard" : a.blockIds.map(labelOf).join(", "),
  }));
}

function summarizeBlock(s: BlockStatus) {
  return {
    phenoStage: s.phenoStage,
    phenoStagePct: s.phenoStagePct,
    canopyDensity: s.canopyDensity,
    waterStress: s.waterStress,
    weedPressure: s.weedPressure,
    leafConditions: s.leafConditions,
    diseaseOrPest: s.diseasePestSpotted ? (s.diseaseDescription ?? "flagged, no detail") : null,
  };
}

export const queryFieldReportsTool: AssistantTool = {
  name: "query_field_reports",
  description:
    "Read the weekly manager / field reports for a vineyard and answer questions about them: weather, sprays and fertilizers applied, per-block status (phenology, canopy, water/weed stress, leaf conditions, disease/pest), general notes, and the AI briefing. Call this for 'how's <vineyard> doing per the reports', 'what did they spray last week', 'any disease flagged', etc.",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      vineyard: { type: "string", description: "Vineyard name (optional for a manager — defaults to theirs)." },
      weeks: { type: "integer", description: "How many recent weekly reports to include (default 4, max 12)." },
    },
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as QueryReportsInput;
    const vineyards = await resolveVineyards(ctx.user, input.vineyard);
    if (vineyards.length === 0) return { message: "No matching vineyard you can access." };
    if (vineyards.length > 1) {
      return { message: `That matches ${vineyards.length} vineyards: ${vineyards.map((v) => v.name).join(", ")}. Ask about one.` };
    }
    const vineyard = vineyards[0];
    const n = Math.min(Math.max(Number(input.weeks) || 4, 1), 12);

    const [notes, blocks] = await Promise.all([
      getRecentFieldNotes(vineyard.id, n),
      prisma.vineyardBlock.findMany({ where: { vineyardId: vineyard.id }, select: { id: true, blockLabel: true } }),
    ]);
    if (notes.length === 0) {
      return { message: `No weekly reports recorded yet for ${vineyard.name}.` };
    }
    const labels = new Map(blocks.map((b) => [b.id, b.blockLabel ?? "(unlabeled)"]));
    const labelOf = (id: string) => labels.get(id) ?? id;

    return {
      vineyard: vineyard.name,
      reports: notes.map((note) => ({
        weekOf: note.weekOf,
        recordedBy: note.userEmail,
        weather: note.weatherData,
        sprays: appsWithLabels(note.spraysApplied, labelOf),
        fertilizers: appsWithLabels(note.fertilizersApplied, labelOf),
        blocks: Object.entries(note.blockLevelStatuses).map(([blockId, s]) => ({
          block: labelOf(blockId),
          ...summarizeBlock(s),
        })),
        generalNotes: note.generalNotes,
        briefing: note.aiSummaryStatus === "READY" ? parseBriefing(note.aiSummary) : null,
      })),
    };
  },
};
