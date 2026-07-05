import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveVesselContents } from "../scope";
import { isSparklingEnabled } from "@/lib/settings/data";
import { tirageAction } from "@/lib/sparkling/actions";
import type { TirageInput, TirageMethod } from "@/lib/sparkling/tirage-core";

// Wave 3 (sparkling) — bottle a base cuvée to TIRAGE (start the 2nd fermentation in bottle). Wraps
// tirageAction → tirageCore (optional liqueur-de-tirage ADDITION + the TIRAGE bottling op + the form
// transition, one atomic write). By chat we handle the common SINGLE-tank base: resolve the source
// vessel → its one resident lot, draw bottleCount × 750 mL. A multi-lot vessel (an assemblage across
// lots) is form-work → deep-links the En Tirage screen. Gated on sparklingEnabled; reversible via undo.

const SPARKLING_OFF = "The sparkling program is off — enable it in Settings to record sparkling operations.";
const NOMINAL_FILL_L = 0.75; // 750 mL nominal fill (the core's default)
type RawInput = { vessel?: string; bottleCount?: number; tirageSugarGpl?: number; targetPressureAtm?: number; method?: string; note?: string };
type Draw = { vesselId: string; drawL: number };

export const sparklingTirageTool: AssistantTool = {
  name: "sparkling_tirage",
  description:
    "Bottle a base cuvée to TIRAGE — start the second fermentation in bottle (méthode traditionnelle or pét-nat). Use when the user tirages/bottles a sparkling base from a tank: 'tirage tank 6 into 500 bottles at 24 g/L sugar'. Give the source tank + bottle count and EITHER the tirage sugar (g/L) OR a target pressure (atm). This is NOT an ordinary bottling run. A tank holding multiple lots (an assemblage) deep-links the En Tirage screen. The sparkling program must be enabled. Returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      vessel: { type: "string", description: "Source tank holding the base cuvée, e.g. 'tank 6'." },
      bottleCount: { type: "integer", description: "How many bottles to fill." },
      tirageSugarGpl: { type: "number", description: "Tirage sugar in g/L (drives the pressure). Give this OR targetPressureAtm." },
      targetPressureAtm: { type: "number", description: "Target bottle pressure in atmospheres (suggests the sugar). Alternative to tirageSugarGpl." },
      method: { type: "string", enum: ["TRADITIONAL", "PETNAT"], description: "Sparkling method. Default TRADITIONAL." },
      note: { type: "string", description: "Optional note." },
    },
    required: ["vessel", "bottleCount"],
  },
  async run(_ctx, rawInput) {
    if (!(await isSparklingEnabled())) throw new Error(SPARKLING_OFF);
    const input = (rawInput ?? {}) as RawInput;
    if (!input.vessel || typeof input.vessel !== "string") throw new Error("Which tank holds the base cuvée to tirage?");
    if (!Number.isInteger(input.bottleCount) || (input.bottleCount ?? 0) < 1) throw new Error("How many bottles? Give a whole number.");

    const contents = await resolveVesselContents(input.vessel);
    if (contents.kind === "empty") throw new Error(`${contents.vesselLabel} is empty — nothing to tirage.`);
    if (contents.kind === "blend") {
      return {
        navigate: { path: "/cellar/en-tirage", label: "the En Tirage screen (multi-lot tirage)", auto: false },
        message: `${contents.vesselLabel} holds multiple lots — tirage of an assemblage across lots is done on the En Tirage screen.`,
      };
    }

    const method = (input.method === "PETNAT" ? "PETNAT" : "TRADITIONAL") as TirageMethod;
    const drawL = Math.round(input.bottleCount! * NOMINAL_FILL_L * 100) / 100;
    const sources: Draw[] = [{ vesselId: contents.vesselId, drawL }];
    const sugarClause =
      input.tirageSugarGpl != null ? ` at ${input.tirageSugarGpl} g/L tirage sugar`
      : input.targetPressureAtm != null ? ` targeting ${input.targetPressureAtm} atm`
      : "";
    const preview = `Tirage lot ${contents.lot.code} from ${contents.vesselLabel} → ${input.bottleCount} bottles (${method === "PETNAT" ? "pét-nat" : "méthode traditionnelle"})${sugarClause}. (~${drawL} L drawn.)`;
    const token = signProposal("sparkling_tirage", {
      lotId: contents.lot.id,
      lotCode: contents.lot.code,
      sources,
      bottleCount: input.bottleCount,
      method,
      ...(input.tirageSugarGpl != null ? { tirageSugarGpl: input.tirageSugarGpl } : {}),
      ...(input.targetPressureAtm != null ? { targetPressureAtm: input.targetPressureAtm } : {}),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitSparklingTirage: Committer = async (_user, args) => {
  const sources = Array.isArray(args.sources) ? (args.sources as Draw[]) : [];
  const input: TirageInput = {
    lotId: String(args.lotId),
    sources: sources.map((s) => ({ vesselId: String(s.vesselId), drawL: Number(s.drawL) })),
    bottleCount: Number(args.bottleCount),
    method: String(args.method) as TirageMethod,
    tirageSugarGpl: args.tirageSugarGpl == null ? undefined : Number(args.tirageSugarGpl),
    targetPressureAtm: args.targetPressureAtm == null ? undefined : Number(args.targetPressureAtm),
    note: args.note == null ? undefined : String(args.note),
  };
  const res = await tirageAction(input);
  return { message: `Tiraged lot ${String(args.lotCode ?? "")} → ${res.bottleCount} bottles.` };
};
