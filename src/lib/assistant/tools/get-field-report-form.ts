import "server-only";
import { prisma } from "@/lib/prisma";
import { getRecentFieldNotes } from "@/lib/fieldnotes/actions";
import { listFieldInputs } from "@/lib/fieldnotes/input-actions";
import { buildPrepopulationDefaults } from "@/lib/fieldnotes/prepopulate";
import { todayISODateUTC, isValidReportDate } from "@/lib/fieldnotes/week";
import type { AssistantTool } from "../registry";
import { resolveVineyards } from "../scope";

type FormInput = { vineyard?: string; reportDate?: string };

export const getFieldReportFormTool: AssistantTool = {
  name: "get_field_report_form",
  description:
    "Get everything needed to fill out or edit a weekly field report for a vineyard on a date: the blocks (with labels), the available sprays/fertilizers, and the current values (existing report if one exists for that date, otherwise sensible carried-forward defaults). Call this BEFORE save_field_report so you know the blocks and options. Defaults to today if no date given.",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      vineyard: { type: "string", description: "Vineyard name (optional for a manager)." },
      reportDate: { type: "string", description: "Report date YYYY-MM-DD (optional, defaults to today; can't be in the future)." },
    },
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as FormInput;
    const vineyards = await resolveVineyards(ctx.user, input.vineyard);
    if (vineyards.length === 0) return { message: "No matching vineyard you can access." };
    if (vineyards.length > 1) {
      return { message: `That matches ${vineyards.length} vineyards: ${vineyards.map((v) => v.name).join(", ")}. Pick one.` };
    }
    const vineyard = vineyards[0];

    const reportDate = input.reportDate || todayISODateUTC();
    if (!isValidReportDate(reportDate)) {
      return { message: `"${reportDate}" isn't a valid report date (must be a real date, not in the future).` };
    }

    const [notes, blocks, inputs] = await Promise.all([
      getRecentFieldNotes(vineyard.id, 8),
      prisma.vineyardBlock.findMany({ where: { vineyardId: vineyard.id }, orderBy: { sortOrder: "asc" }, select: { id: true, blockLabel: true } }),
      listFieldInputs(),
    ]);

    const existing = notes.find((n) => n.weekOf === reportDate) ?? null;
    const latest = notes[0] ?? null;
    const blockIds = blocks.map((b) => b.id);

    const current = existing
      ? {
          weather: existing.weatherData,
          sprays: existing.spraysApplied,
          fertilizers: existing.fertilizersApplied,
          blockStatuses: existing.blockLevelStatuses,
          generalNotes: existing.generalNotes,
        }
      : (() => {
          const seed = buildPrepopulationDefaults(latest?.blockLevelStatuses ?? null, blockIds);
          return {
            weather: seed.weatherData,
            sprays: seed.spraysApplied,
            fertilizers: seed.fertilizersApplied,
            blockStatuses: seed.blockLevelStatuses,
            generalNotes: seed.generalNotes,
          };
        })();

    return {
      vineyard: vineyard.name,
      reportDate,
      mode: existing ? "update" : "create",
      blocks: blocks.map((b) => ({ id: b.id, label: b.blockLabel ?? "(unlabeled)" })),
      availableSprays: inputs.sprays.map((s) => s.name),
      availableFertilizers: inputs.fertilizers.map((f) => f.name),
      current,
    };
  },
};
