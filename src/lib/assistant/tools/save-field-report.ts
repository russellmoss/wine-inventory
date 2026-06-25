import "server-only";
import { prisma } from "@/lib/prisma";
import { getRecentFieldNotes, createFieldNote } from "@/lib/fieldnotes/actions";
import { listFieldInputs, addFieldInput } from "@/lib/fieldnotes/input-actions";
import { buildPrepopulationDefaults } from "@/lib/fieldnotes/prepopulate";
import { todayISODateUTC, isValidReportDate } from "@/lib/fieldnotes/week";
import { type BlockStatus, type InputApplication, type WeatherData, type CreateFieldNoteInput } from "@/lib/fieldnotes/types";
import { generateBriefing } from "@/lib/fieldnotes/ai";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveVineyards } from "../scope";
import { assembleBlockStatuses, unknownInputNames } from "../report-merge";

type SaveInput = {
  vineyard?: string;
  reportDate?: string;
  weather?: Partial<WeatherData>;
  sprays?: InputApplication[];
  fertilizers?: InputApplication[];
  blockStatuses?: Record<string, Partial<BlockStatus>>;
  generalNotes?: string;
};

type NewInput = { type: "SPRAY" | "FERTILIZER"; name: string };

export const saveFieldReportTool: AssistantTool = {
  name: "save_field_report",
  description:
    "Create or update a weekly field report (manager report) for a vineyard on a date. Call get_field_report_form FIRST to learn the blocks and options. Pass only the parts you're setting; the rest carry forward. Block statuses are keyed by block label or id. This does NOT save immediately — it returns a preview the user must confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      vineyard: { type: "string", description: "Vineyard name (optional for a manager)." },
      reportDate: { type: "string", description: "Report date YYYY-MM-DD (default today)." },
      weather: { type: "object", description: "{ rainfallMm, maxTempC, minTempC } (numbers or null).", additionalProperties: true },
      sprays: { type: "array", description: "Sprays applied: [{ name, scope: 'WHOLE'|'BLOCKS', blockIds: [] }].", items: { type: "object", additionalProperties: true } },
      fertilizers: { type: "array", description: "Fertilizers applied, same shape as sprays.", items: { type: "object", additionalProperties: true } },
      blockStatuses: { type: "object", description: "Per-block status keyed by block label or id.", additionalProperties: true },
      generalNotes: { type: "string", description: "Free-text general notes." },
    },
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as SaveInput;
    const vineyards = await resolveVineyards(ctx.user, input.vineyard);
    if (vineyards.length === 0) throw new Error("No matching vineyard you can access.");
    if (vineyards.length > 1) throw new Error(`That matches several vineyards: ${vineyards.map((v) => v.name).join(", ")}. Pick one.`);
    const vineyard = vineyards[0];

    const reportDate = input.reportDate || todayISODateUTC();
    if (!isValidReportDate(reportDate)) throw new Error(`"${reportDate}" isn't a valid report date (real date, not future).`);

    const [notes, blocks, inputs] = await Promise.all([
      getRecentFieldNotes(vineyard.id, 8),
      prisma.vineyardBlock.findMany({ where: { vineyardId: vineyard.id }, orderBy: { sortOrder: "asc" }, select: { id: true, blockLabel: true } }),
      listFieldInputs(),
    ]);
    const existing = notes.find((n) => n.weekOf === reportDate) ?? null;
    const latest = notes[0] ?? null;
    const blockIds = blocks.map((b) => b.id);

    // Base = existing report (edit) or carried-forward defaults (new). assembleBlockStatuses
    // overlays the model's edits (by id or label) and guarantees coverage of every block.
    const baseStatuses: Record<string, BlockStatus> = existing
      ? existing.blockLevelStatuses
      : buildPrepopulationDefaults(latest?.blockLevelStatuses ?? null, blockIds).blockLevelStatuses;
    const blockLevelStatuses = assembleBlockStatuses(
      baseStatuses,
      input.blockStatuses ?? {},
      blocks.map((b) => ({ id: b.id, label: b.blockLabel ?? "(unlabeled)" })),
    );

    const weatherData: WeatherData = {
      rainfallMm: input.weather?.rainfallMm ?? existing?.weatherData.rainfallMm ?? null,
      maxTempC: input.weather?.maxTempC ?? existing?.weatherData.maxTempC ?? null,
      minTempC: input.weather?.minTempC ?? existing?.weatherData.minTempC ?? null,
    };
    const spraysApplied = input.sprays ?? existing?.spraysApplied ?? [];
    const fertilizersApplied = input.fertilizers ?? existing?.fertilizersApplied ?? [];
    const generalNotes = input.generalNotes ?? existing?.generalNotes ?? null;

    const newInputs: NewInput[] = [
      ...unknownInputNames(spraysApplied, inputs.sprays.map((s) => s.name)).map((name) => ({ type: "SPRAY" as const, name })),
      ...unknownInputNames(fertilizersApplied, inputs.fertilizers.map((f) => f.name)).map((name) => ({ type: "FERTILIZER" as const, name })),
    ];

    const payload: CreateFieldNoteInput = {
      vineyardId: vineyard.id,
      weekOf: reportDate,
      weatherData,
      spraysApplied,
      fertilizersApplied,
      blockLevelStatuses,
      generalNotes,
    };

    const mode = existing ? "Update" : "Create";
    let preview = `${mode} the ${reportDate} report for ${vineyard.name}: rainfall ${weatherData.rainfallMm ?? "—"} mm, ${spraysApplied.length} spray(s), ${fertilizersApplied.length} fertilizer(s), ${blockIds.length} block(s) covered.`;
    if (newInputs.length) preview += ` New inputs to add: ${newInputs.map((n) => n.name).join(", ")}.`;

    const token = signProposal("save_field_report", { payload, newInputs, vineyardName: vineyard.name, reportDate });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitSaveFieldReport: Committer = async (_user, args) => {
  const payload = args.payload as CreateFieldNoteInput;
  const newInputs = (args.newInputs ?? []) as NewInput[];
  const vineyardName = String(args.vineyardName ?? "the vineyard");
  const reportDate = String(args.reportDate ?? payload.weekOf);

  // Create any brand-new sprays/fertilizers first (dedup handled by addFieldInput).
  for (const ni of newInputs) await addFieldInput(ni.type, ni.name);

  const { id } = await createFieldNote(payload);

  // Best-effort: refresh the AI briefing (the action set status PENDING).
  try {
    const summary = await generateBriefing(id);
    await prisma.fieldNote.update({ where: { id }, data: { aiSummary: summary, aiSummaryStatus: "READY", aiSummaryAt: new Date() } });
  } catch {
    /* leave PENDING; the admin can regenerate */
  }

  return { message: `Saved the ${reportDate} report for ${vineyardName}.` };
};
