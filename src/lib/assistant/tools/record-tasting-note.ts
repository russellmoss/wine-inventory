import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveLotTargetOrChoice, resolveVesselContents } from "../scope";
import { recordTastingNoteAction } from "@/lib/chemistry/actions";
import type { RecordTastingNoteInput } from "@/lib/chemistry/tasting";

// Assistant-coverage Wave 1 #2b — record a sensory TASTING NOTE by chat. Wraps recordTastingNoteAction
// → recordTastingNoteCore (no re-implemented logic, no db_*). Each tasting-note ROW attaches to exactly
// one lot (the one-lot invariant, VISION D2).
//
// WHOLE-TANK DEFAULT (parity with record_measurement / Plan 060): you taste the whole TANK, not one lot
// inside it. When the user names a MULTI-LOT vessel (a co-ferment — "one cohesive liquid"), we do NOT
// force a "which lot?" picker; we record the note on the WHOLE tank, fanning it out to every co-resident
// lot (one single-lot row per lot — so the per-ROW one-lot invariant still holds). The confirm card NAMES
// the lots so a wrong default (two genuinely different wines parked in one tank) is caught before the
// write. Naming a specific lot (input.lot, incl. the picker pin "#<id>") stays the single-lot path.
//
// The fan-out is done in the COMMITTER by looping the existing single-lot recordTastingNoteAction once
// per lot — no new chemistry core needed, and every row is a normal single-lot tasting note.

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
    "Record a sensory TASTING NOTE for a wine — appearance / aroma / flavor prose, 1–5 structure scores (tannin, acidity, body, finish), an overall score (0–100 or 0–20), and free notes. Use whenever the user describes how a wine SMELLS or TASTES against a vessel or lot (e.g. 'log a tasting note on T5 that it smells like rotten eggs', 'note that barrel 3 tastes oxidized'). This is the sensory counterpart to record_measurement (numeric chem/lab readings). Give the wine by lot code (e.g. 'lot 24-CS-A') OR by the vessel that holds it (e.g. 'tank 5' / 'T5'). If a vessel holds MORE THAN ONE lot (a blend/co-ferment), naming the vessel records the note on the WHOLE TANK — fanned out to every co-resident lot (the winemaker does NOT have to pick a lot). To attach to just one lot instead, name that lot. Does NOT save immediately — returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      lot: { type: "string", description: "Lot code, e.g. '24-CS-A'." },
      vessel: { type: "string", description: "Vessel holding the wine, e.g. 'tank 5' or 'T5' (a blend records on the whole tank — every co-resident lot)." },
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

    const observedAt = input.observedAt ? String(input.observedAt) : null;
    const when = observedAt ? ` (${observedAt})` : "";
    const bits: string[] = [];
    if (input.aroma?.trim()) bits.push(`aroma: ${input.aroma.trim()}`);
    if (input.flavor?.trim()) bits.push(`flavor: ${input.flavor.trim()}`);
    for (const k of structure) bits.push(`${k} ${input[k]}/5`);
    if (hasScore) bits.push(`score ${input.score}/${input.scoreScale === "TWENTY_POINT" ? 20 : 100}`);
    const detailStr = bits.length ? `: ${bits.join(", ")}` : "";

    const noteFields = {
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
    };

    // Whole-tank default: a bare VESSEL ref (no explicit lot) on a MULTI-LOT tank fans the note out to
    // every co-resident lot — no "which lot?" dead-end. The confirm card NAMES the lots so a wrong
    // default is caught before the write. Naming a lot (input.lot, incl. the picker pin "#<id>") stays
    // the single-lot path below.
    if (input.vessel && !input.lot) {
      const contents = await resolveVesselContents(input.vessel);
      if (contents.kind === "empty") {
        throw new Error(`${contents.vesselLabel} is empty — there's no wine to record a tasting note against.`);
      }
      if (contents.kind === "blend") {
        const codes = contents.lots.map((l) => l.code).join(" + ");
        const preview = `Tasting note on the whole ${contents.vesselLabel}${when}${detailStr} — all ${contents.lots.length} co-fermenting lots (${codes}). To record on just one lot instead, name that lot.`;
        const token = signProposal("record_tasting_note", {
          fanout: true,
          vesselLabel: contents.vesselLabel,
          lotIds: contents.lots.map((l) => l.id),
          lotCodes: contents.lots.map((l) => l.code),
          ...noteFields,
        });
        return { needsConfirmation: true, preview, token };
      }
      // single-lot vessel → falls through to the single-lot resolution below
    }

    const resolved = await resolveLotTargetOrChoice({ lot: input.lot, vessel: input.vessel }, "record_tasting_note", input as Record<string, unknown>);
    if (resolved.kind === "choice") return resolved.choice;
    const { lotId, lotCode } = resolved.row;

    const preview = `Tasting note on lot ${lotCode}${when}${detailStr}.`;
    const token = signProposal("record_tasting_note", { lotId, lotCode, ...noteFields });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitRecordTastingNote: Committer = async (_user, args) => {
  const num = (v: unknown) => (typeof v === "number" ? v : undefined);
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);
  const baseFields = () => ({
    observedAt: args.observedAt ? String(args.observedAt) : undefined,
    appearance: str(args.appearance),
    aroma: str(args.aroma),
    flavor: str(args.flavor),
    tannin: num(args.tannin),
    acidity: num(args.acidity),
    body: num(args.body),
    finish: num(args.finish),
    score: num(args.score),
    scoreScale: args.scoreScale === "TWENTY_POINT" ? ("TWENTY_POINT" as const) : args.score != null ? ("HUNDRED_POINT" as const) : null,
    notes: str(args.notes),
  });

  // Whole-tank fan-out: one note per co-resident lot (each row is a normal single-lot tasting note, so
  // the per-row one-lot invariant is intact). Uses the same single-lot action as the single-lot path.
  if (args.fanout && Array.isArray(args.lotIds)) {
    const lotIds = (args.lotIds as unknown[]).map(String);
    const fields = baseFields();
    for (const lotId of lotIds) {
      const input: RecordTastingNoteInput = { lotId, ...fields };
      await recordTastingNoteAction(input);
    }
    const label = String(args.vesselLabel ?? "tank");
    const n = lotIds.length;
    return { message: `Recorded a tasting note on the whole ${label} — ${n} lot${n === 1 ? "" : "s"}.` };
  }

  const input: RecordTastingNoteInput = { lotId: String(args.lotId), ...baseFields() };
  await recordTastingNoteAction(input);
  return { message: `Recorded a tasting note on lot ${String(args.lotCode ?? "")}.` };
};
