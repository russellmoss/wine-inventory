import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveLotTarget } from "../scope";
import { isSparklingEnabled } from "@/lib/settings/data";
import { disgorgeAndFinishAction } from "@/lib/sparkling/actions";

// Wave 3 (sparkling) — DISGORGE en-tirage bottles (eject the lees plug). Simple disgorge-only by chat
// (wraps disgorgeAndFinishAction with disgorgeOnly). The full DISGORGE → DOSAGE (liqueur d'expédition /
// target RS) → FINISH-to-a-SKU flow needs liqueur + SKU + destination, so finish:true DEEP-LINKS the En
// Tirage worklist instead of guessing. Gated behind sparklingEnabled; reverses via undo.

const SPARKLING_OFF = "The sparkling program is off — enable it in Settings to record sparkling operations.";
type RawInput = { lot?: string; bottles?: number; perBottleLossMl?: number; breakageCount?: number; finish?: boolean; note?: string };

export const sparklingDisgorgeTool: AssistantTool = {
  name: "sparkling_disgorge",
  description:
    "Disgorge en-tirage sparkling bottles (eject the frozen lees plug). Use for 'disgorge 200 bottles of lot 24-BdB'. Records a DISGORGE-ONLY op by chat. DOSAGE (liqueur d'expédition / target RS) and FINISHING to a labeled SKU is a multi-step flow needing liqueur + SKU + destination — for that, set finish:true and I'll open the En Tirage screen. The sparkling program must be enabled. Returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      lot: { type: "string", description: "En-tirage lot code, e.g. '24-BdB'." },
      bottles: { type: "integer", description: "Number of bottles disgorged (a tranche; equal to remaining = full, less = a partial split)." },
      perBottleLossMl: { type: "number", description: "Optional per-bottle loss in mL; default 25." },
      breakageCount: { type: "integer", description: "Optional bottles broken during disgorgement." },
      finish: { type: "boolean", description: "Set true if the user ALSO wants to dose + finish to a finished wine (liqueur/RS + SKU + destination) — opens the En Tirage screen for that multi-step flow." },
      note: { type: "string", description: "Optional note." },
    },
    required: ["lot", "bottles"],
  },
  async run(_ctx, rawInput) {
    if (!(await isSparklingEnabled())) throw new Error(SPARKLING_OFF);
    const input = (rawInput ?? {}) as RawInput;
    if (input.finish) {
      return {
        navigate: { path: "/cellar/en-tirage", label: "the En Tirage worklist (disgorge, dose & finish)", auto: false },
        message: "Dosing + finishing to a labeled SKU is a multi-step flow (liqueur/target RS, SKU name, destination) — open the En Tirage screen to disgorge, dose, and finish there.",
      };
    }
    if (!input.lot || typeof input.lot !== "string") throw new Error("Which en-tirage lot?");
    if (!Number.isInteger(input.bottles) || (input.bottles ?? 0) < 1) throw new Error("How many bottles are you disgorging? Give a whole number.");
    const { lotId, lotCode } = await resolveLotTarget({ lot: input.lot });
    const loss = input.perBottleLossMl != null ? ` (${input.perBottleLossMl} mL/bottle loss)` : "";
    const brk = input.breakageCount ? `, ${input.breakageCount} broken` : "";
    const preview = `Disgorge ${input.bottles} bottle(s) of lot ${lotCode}${loss}${brk}. (Disgorge only — dose & finish on the En Tirage screen.)`;
    const token = signProposal("sparkling_disgorge", {
      lotId,
      lotCode,
      bottles: input.bottles,
      ...(input.perBottleLossMl != null ? { perBottleLossMl: input.perBottleLossMl } : {}),
      ...(input.breakageCount != null ? { breakageCount: input.breakageCount } : {}),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitSparklingDisgorge: Committer = async (_user, args) => {
  await disgorgeAndFinishAction({
    lotId: String(args.lotId),
    bottlesDisgorged: Number(args.bottles),
    perBottleLossMl: args.perBottleLossMl == null ? undefined : Number(args.perBottleLossMl),
    breakageCount: args.breakageCount == null ? undefined : Number(args.breakageCount),
    disgorgeOnly: true,
  });
  return { message: `Disgorged ${Number(args.bottles)} bottle(s) of lot ${String(args.lotCode ?? "")}.` };
};
