import "server-only";
import { addHarvestPick } from "@/lib/harvest/actions";
import { toKg } from "@/lib/harvest/units";
import { coerceBrix, coercePh, coerceTa, TA_UNIT } from "@/lib/harvest/pick-fields";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { findScopedBlocks } from "../scope";
import { resolveExactlyOne } from "./resolve";

// Plan 039: the "weigh the fruit" stage as a chat action. A crew member logs a harvest weigh-in for a
// block — "weigh in 1200 kg from Block 1, 24 brix, pH 3.4, TA 6.2" — resolving the block by plain language
// (findScopedBlocks + resolveExactlyOne, exactly like log_brix / set_yield_estimate), drafting a preview
// the user confirms (D10 signed nonce). On confirm the committer calls the addHarvestPick server action,
// which re-runs block-access scoping, find-or-creates the vintage's HarvestRecord, and appends the pick.
// NOT adminOnly — a weigh-in is a floor/crew action, scoped by vineyard membership (parity with log_brix).

type LogHarvestPickInput = {
  block?: string;
  vineyard?: string;
  variety?: string;
  weight?: number;
  unit?: string;
  brix?: number;
  ph?: number;
  ta?: number;
  pickDate?: string;
};

/** Normalize a free-text unit to the action's expected "metric" (kg) | "imperial" (lb). */
function normUnit(u?: string): "metric" | "imperial" {
  const s = (u ?? "").toLowerCase();
  if (s === "lb" || s === "lbs" || s === "pound" || s === "pounds" || s === "imperial") return "imperial";
  return "metric"; // kg / default
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export const logHarvestPickTool: AssistantTool = {
  name: "log_harvest_pick",
  description:
    "Log a harvest pick / fruit weigh-in for a vineyard block: the fruit weight plus optional Brix, pH, and TA. Use when the user weighs in fruit off a block ('weigh in 1200 kg from Block 1, 24 brix, pH 3.4, TA 6.2'). This does NOT save immediately — it returns a preview the user must confirm in the UI.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      block: { type: "string", description: "Block label, e.g. 'Block 1'. Use the bare label, not the variety in parentheses." },
      vineyard: { type: "string", description: "Vineyard name, to disambiguate the block (optional for a manager)." },
      variety: { type: "string", description: "Grape variety, to disambiguate when the block isn't named, e.g. 'Grenache'." },
      weight: { type: "number", description: "The fruit weight of this pick, a positive number." },
      unit: { type: "string", description: "Weight unit: 'kg' (default) or 'lb'." },
      brix: { type: "number", description: "Optional Brix (sugar / ripeness) at pick, 0–35 °Bx." },
      ph: { type: "number", description: "Optional field pH, 2.5–4.5." },
      ta: { type: "number", description: "Optional titratable acidity, g/L tartaric (0–20)." },
      pickDate: { type: "string", description: "Date of the pick as YYYY-MM-DD (optional, defaults to today)." },
    },
    required: ["weight"],
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as LogHarvestPickInput;
    if (typeof input.weight !== "number" || !Number.isFinite(input.weight) || input.weight <= 0) {
      throw new Error("Provide a positive fruit weight.");
    }
    const unit = normUnit(input.unit);
    const kg = toKg(input.weight, unit);
    if (kg == null || kg <= 0) throw new Error("Provide a positive fruit weight.");
    // Validate the optional readings up-front (registry ranges) so the preview is trustworthy.
    const brix = coerceBrix(input.brix);
    const ph = coercePh(input.ph);
    const ta = coerceTa(input.ta);

    const blocks = await findScopedBlocks(ctx.user, {
      block: input.block,
      vineyard: input.vineyard,
      variety: input.variety,
    });
    const block = resolveExactlyOne(blocks, {
      describe: (b) => `${b.label}${b.varietyName ? ` (${b.varietyName})` : ""} in ${b.vineyardName}`,
      noneMsg: `No block matches that you can access (block "${input.block ?? "?"}"${input.variety ? `, variety "${input.variety}"` : ""}${input.vineyard ? `, vineyard "${input.vineyard}"` : ""}).`,
      manyMsg: `Several blocks match`,
    });

    const pickDate = input.pickDate ? input.pickDate : todayISO();
    const unitLabel = unit === "metric" ? "kg" : "lb";
    const extras = [
      brix != null ? `${brix} °Bx` : null,
      ph != null ? `pH ${ph}` : null,
      ta != null ? `TA ${ta} ${TA_UNIT}` : null,
    ].filter(Boolean);
    const preview = `Weigh-in: ${input.weight} ${unitLabel} off ${block.label} (${block.vineyardName}) on ${pickDate}${extras.length ? ` — ${extras.join(", ")}` : ""}.`;
    const token = signProposal("log_harvest_pick", {
      blockId: block.id,
      weightKg: kg,
      brix,
      ph,
      ta,
      pickDate,
      label: block.label,
      display: `${input.weight} ${unitLabel}`,
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitLogHarvestPick: Committer = async (_user, args) => {
  const blockId = String(args.blockId);
  const weightKg = Number(args.weightKg);
  const pickDate = args.pickDate ? String(args.pickDate) : undefined;
  const num = (v: unknown) => (v == null ? null : Number(v));
  // weightKg is already canonical kg (converted + validated at propose time) → pass unit "metric".
  await addHarvestPick(blockId, weightKg, "metric", pickDate ?? new Date().toISOString().slice(0, 10), undefined, num(args.brix), num(args.ph), num(args.ta));
  return { message: `Logged a ${String(args.display ?? `${weightKg} kg`)} weigh-in on ${String(args.label ?? "the block")}.` };
};
