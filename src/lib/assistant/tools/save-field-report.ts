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
  // Set true only after the user has agreed to create a brand-new report for a
  // date that has none yet (see the ask-before-create flow in run()).
  confirmNewReport?: boolean;
};

type NewInput = { type: "SPRAY" | "FERTILIZER"; name: string };

const TITLE = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const blockName = (label: string) => (/block/i.test(label) ? label : `Block ${label}`);

/** Human-readable summary of the per-block edits the model is making (lead with
 * the actual change, e.g. "Block 3 → Veraison 50%"), keyed by block label or id. */
function summarizeBlockEdits(
  edits: Record<string, Partial<BlockStatus>>,
  blocks: { id: string; label: string }[],
): string[] {
  const idToLabel = new Map(blocks.map((b) => [b.id, b.label]));
  const labelSet = new Map(blocks.map((b) => [b.label.toLowerCase().trim(), b.label]));
  const out: string[] = [];
  for (const [key, partial] of Object.entries(edits ?? {})) {
    const label = idToLabel.get(key) ?? labelSet.get(key.toLowerCase().trim()) ?? key;
    const parts: string[] = [];
    if (partial.phenoStage !== undefined && partial.phenoStage !== null) {
      const pct = partial.phenoStagePct != null ? ` ${partial.phenoStagePct}%` : "";
      parts.push(`${TITLE(partial.phenoStage)}${pct}`);
    }
    if (partial.canopyDensity) parts.push(`canopy ${partial.canopyDensity.toLowerCase()}`);
    if (partial.waterStress) parts.push(`water stress ${partial.waterStress.toLowerCase()}`);
    if (partial.weedPressure) parts.push(`weeds ${partial.weedPressure.toLowerCase()}`);
    if (partial.shootTip) parts.push(`shoot tips ${partial.shootTip.toLowerCase()}`);
    if (partial.leafConditions && partial.leafConditions.length) parts.push(`leaf: ${partial.leafConditions.join(", ").toLowerCase()}`);
    if (partial.diseasePestSpotted) parts.push("disease/pest spotted");
    if (parts.length) out.push(`${blockName(label)} → ${parts.join(", ")}`);
  }
  return out;
}

export const saveFieldReportTool: AssistantTool = {
  name: "save_field_report",
  description:
    "Create or update a field report (manager report) for a vineyard on a date — this is the ONLY place per-block phenology (e.g. veraison %) and block conditions are stored. Call get_field_report_form FIRST to learn the blocks and options. Pass only the parts you're setting; the rest carry forward. Block statuses are keyed by block label or id. If NO report exists for the date yet, this tool will NOT create one silently — it returns a question for you to relay to the user (create a new report for that date, or add the change to the most recent existing report); proceed only after they choose, by re-calling with confirmNewReport:true (new) or reportDate set to the existing report's date (update). This does NOT save immediately — it returns a preview the user must confirm.",
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
      confirmNewReport: { type: "boolean", description: "Set true ONLY after the user agreed to create a brand-new report for a date that has none." },
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

    // Ask before fabricating a report. If there's no report for this date and one
    // or more reports already exist, don't silently create — hand the model a
    // question to relay so the user picks new-vs-update. (First-ever report for
    // the vineyard has nothing to attach to, so we let that create directly.)
    if (!existing && latest && !input.confirmNewReport) {
      const edits = summarizeBlockEdits(input.blockStatuses ?? {}, blocks.map((b) => ({ id: b.id, label: b.blockLabel ?? "(unlabeled)" })));
      const changeText = edits.length ? edits.join("; ") : "these changes";
      return (
        `No field report exists for ${reportDate} at ${vineyard.name}. The most recent report is dated ${latest.weekOf}. ` +
        `Ask the user which they want: (a) create a NEW report dated ${reportDate} for ${changeText}, or ` +
        `(b) add it to the existing ${latest.weekOf} report. ` +
        `Then call save_field_report again — for (a) add confirmNewReport:true; for (b) set reportDate:"${latest.weekOf}". Do not assume; wait for their choice.`
      );
    }

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

    // Lead the preview with the ACTUAL change the user asked for, not the report
    // envelope. e.g. "Set Block 3 → Veraison 50%" rather than "rainfall — mm, 0 sprays".
    const blockEditList = summarizeBlockEdits(
      input.blockStatuses ?? {},
      blocks.map((b) => ({ id: b.id, label: b.blockLabel ?? "(unlabeled)" })),
    );
    const changeBits: string[] = [...blockEditList];
    if (input.weather && (input.weather.rainfallMm != null || input.weather.maxTempC != null || input.weather.minTempC != null)) {
      changeBits.push(`weather (rainfall ${input.weather.rainfallMm ?? "—"} mm)`);
    }
    if (input.sprays?.length) changeBits.push(`${input.sprays.length} spray(s)`);
    if (input.fertilizers?.length) changeBits.push(`${input.fertilizers.length} fertilizer(s)`);
    if (input.generalNotes) changeBits.push("general notes");
    const changeSummary = changeBits.length ? changeBits.join("; ") : "no field changes";

    let preview: string;
    if (existing) {
      preview = `Update the ${reportDate} report for ${vineyard.name}: ${changeSummary}. (Other fields unchanged.)`;
    } else {
      preview =
        `Create a NEW ${reportDate} report for ${vineyard.name} and set: ${changeSummary}. ` +
        `Other blocks carry forward${latest ? ` from the ${latest.weekOf} report` : ""}; rainfall/sprays/fertilizers are left blank unless listed above.`;
    }
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
