import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveLotTargetOrChoice } from "../scope";
import { recordTastingNoteAction } from "@/lib/chemistry/actions";
import type { RecordTastingNoteInput } from "@/lib/chemistry/tasting";

// Assistant-coverage Wave 1 #2b — record a sensory TASTING NOTE against a LOT by chat. Wraps
// recordTastingNoteAction → recordTastingNoteCore (no re-implemented logic, no db_*). Each tasting-note
// ROW attaches to exactly one lot, and naming a vessel names its wine (LEDGER-12), so there is nothing
// to pick. Structure scores are 1–5; overall score is 0–100 or 0–20 by scale. Values accepted as typed,
// shown to confirm.
//
// The DEFERRED item that sat here is closed by plan 088. It read: "you taste the whole TANK, not one lot
// inside it, so a co-ferment should fan out the way record_measurement already does" — this tool showed a
// picker where record_measurement fanned out, two different answers to the same tank. Both were symptoms
// of modelling a tank as several lots. The tank is one wine; you taste it, and it is one note.

const STRUCTURE = ["tannin", "acidity", "body", "finish"] as const;

type RecordTastingRawInput = {
  lot?: string;
  vessel?: string;
  appearance?: string;
  aroma?: string;
  flavor?: string;
  tannin?: number;
  acidity?: number;
  body?: number;
  finish?: number;
  score?: number;
  scoreScale?: "HUNDRED_POINT" | "TWENTY_POINT";
  notes?: string;
  observedAt?: string;
};

export const recordTastingNoteTool: AssistantTool = {
  name: "record_tasting_note",
  description:
    "Record a sensory TASTING NOTE for a wine — appearance / aroma / flavor prose, 1–5 structure scores (tannin, acidity, body, finish), an overall score (0–100 or 0–20), and free notes. Use whenever the user describes how a wine SMELLS or TASTES against a vessel or lot (e.g. 'log a tasting note on T5 that it smells like rotten eggs', 'note that barrel 3 tastes oxidized'). This is the sensory counterpart to record_measurement (which is for numeric chem/lab readings). Give the wine by lot code (e.g. 'lot 24-CS-A') OR by the vessel that holds it (e.g. 'tank 5' / 'T5') — a vessel holds one wine, so naming it is enough. Does NOT save immediately — returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      lot: { type: "string", description: "Lot code, e.g. '24-CS-A'." },
      vessel: { type: "string", description: "Vessel holding the wine, e.g. 'tank 5' or 'T5' (resolved to its lot; a blend returns a lot picker)." },
      appearance: { type: "string", description: "Appearance / color notes." },
      aroma: { type: "string", description: "Aroma / nose notes." },
      flavor: { type: "string", description: "Palate / flavor notes." },
      tannin: { type: "integer", description: "Tannin structure, 1–5." },
      acidity: { type: "integer", description: "Acidity structure, 1–5." },
      body: { type: "integer", description: "Body structure, 1–5." },
      finish: { type: "integer", description: "Finish structure, 1–5." },
      score: { type: "number", description: "Overall score (0–100, or 0–20 if scoreScale is TWENTY_POINT)." },
      scoreScale: { type: "string", enum: ["HUNDRED_POINT", "TWENTY_POINT"], description: "Score scale (default 100-point)." },
      notes: { type: "string", description: "Any other tasting notes." },
      observedAt: { type: "string", description: "Date tasted, YYYY-MM-DD (optional, defaults to today)." },
    },
    required: [],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as RecordTastingRawInput;
    const prose = [input.appearance, input.aroma, input.flavor, input.notes].filter((s) => typeof s === "string" && s.trim());
    const structure = STRUCTURE.filter((k) => typeof input[k] === "number");
    const hasScore = typeof input.score === "number";
    if (prose.length === 0 && structure.length === 0 && !hasScore) {
      throw new Error("Add at least one tasting detail — aroma, flavor, a 1–5 structure score, an overall score, or notes.");
    }
    const resolved = await resolveLotTargetOrChoice({ lot: input.lot, vessel: input.vessel }, "record_tasting_note", input as Record<string, unknown>);
    if (resolved.kind === "choice") return resolved.choice;
    const { lotId, lotCode } = resolved.row;

    const bits: string[] = [];
    if (input.aroma?.trim()) bits.push(`aroma: ${input.aroma.trim()}`);
    if (input.flavor?.trim()) bits.push(`flavor: ${input.flavor.trim()}`);
    for (const k of structure) bits.push(`${k} ${input[k]}/5`);
    if (hasScore) bits.push(`score ${input.score}/${input.scoreScale === "TWENTY_POINT" ? 20 : 100}`);
    const observedAt = input.observedAt ? String(input.observedAt) : null;
    const when = observedAt ? ` (${observedAt})` : "";
    const preview = `Tasting note on lot ${lotCode}${when}${bits.length ? `: ${bits.join(", ")}` : ""}.`;

    const token = signProposal("record_tasting_note", {
      lotId,
      lotCode,
      ...(input.appearance ? { appearance: input.appearance } : {}),
      ...(input.aroma ? { aroma: input.aroma } : {}),
      ...(input.flavor ? { flavor: input.flavor } : {}),
      ...(typeof input.tannin === "number" ? { tannin: input.tannin } : {}),
      ...(typeof input.acidity === "number" ? { acidity: input.acidity } : {}),
      ...(typeof input.body === "number" ? { body: input.body } : {}),
      ...(typeof input.finish === "number" ? { finish: input.finish } : {}),
      ...(hasScore ? { score: input.score, scoreScale: input.scoreScale ?? "HUNDRED_POINT" } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
      ...(observedAt ? { observedAt } : {}),
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitRecordTastingNote: Committer = async (_user, args) => {
  const num = (v: unknown) => (typeof v === "number" ? v : undefined);
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);
  const input: RecordTastingNoteInput = {
    lotId: String(args.lotId),
    observedAt: args.observedAt ? String(args.observedAt) : undefined,
    appearance: str(args.appearance),
    aroma: str(args.aroma),
    flavor: str(args.flavor),
    tannin: num(args.tannin),
    acidity: num(args.acidity),
    body: num(args.body),
    finish: num(args.finish),
    score: num(args.score),
    scoreScale: args.scoreScale === "TWENTY_POINT" ? "TWENTY_POINT" : args.score != null ? "HUNDRED_POINT" : null,
    notes: str(args.notes),
  };
  await recordTastingNoteAction(input);
  return { message: `Recorded a tasting note on lot ${String(args.lotCode ?? "")}.` };
};
