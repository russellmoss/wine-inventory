import "server-only";
import { addHarvestPick } from "@/lib/harvest/actions";
import { coerceBrix, coercePh, coerceTa, TA_UNIT } from "@/lib/harvest/pick-fields";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal, signResume } from "../confirm";
import { findScopedBlocks } from "../scope";
import { resolveWeightKg, describeWeight } from "../weight";
import { resolveOneOrChoice } from "./resolve";

// Plan 039: the "weigh the fruit" stage as a chat action. A crew member logs a harvest weigh-in for a
// block — "weigh in 1200 kg from Block 1, 24 brix, pH 3.4, TA 6.2" — resolving the block by plain language
// (findScopedBlocks + resolveExactlyOne, exactly like log_brix / set_yield_estimate), drafting a preview
// the user confirms (D10 signed nonce). On confirm the committer calls the addHarvestPick server action,
// which re-runs block-access scoping, find-or-creates the vintage's HarvestRecord, and appends the pick.
// NOT adminOnly — a weigh-in is a floor/crew action, scoped by vineyard membership (parity with log_brix).

type LogHarvestPickInput = {
  block?: string;
  blockId?: string;
  vineyard?: string;
  variety?: string;
  weight?: number;
  unit?: string;
  brix?: number;
  ph?: number;
  ta?: number;
  pickDate?: string;
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export const logHarvestPickTool: AssistantTool = {
  name: "log_harvest_pick",
  description:
    "ALWAYS call this when the user reports a fruit weigh-in — even if you are unsure WHICH block. Do not list candidates or ask which one in prose first: an ambiguous query returns a CLICKABLE PICKER that pins the exact row by id, and a prose list gives the user nothing to act on — records with identical labels cannot be told apart by name at all. " +
    "Log a harvest pick / fruit weigh-in for a vineyard block: the fruit weight plus optional Brix, pH, and TA. Use when the user weighs in fruit off a block ('weigh in 1200 kg from Block 1, 24 brix, pH 3.4, TA 6.2'). This does NOT save immediately — it returns a preview the user must confirm in the UI.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      block: { type: "string", description: "Block label, e.g. 'Block 1'. Use the bare label, not the variety in parentheses." },
      blockId: { type: "string", description: "Internal use: a block pinned by id from a picker tap. Never invent one." },
      vineyard: { type: "string", description: "Vineyard name, to disambiguate the block (optional for a manager)." },
      variety: { type: "string", description: "Grape variety, to disambiguate when the block isn't named, e.g. 'Grenache'." },
      weight: { type: "number", description: "The fruit weight of this pick, a positive number IN THE UNIT the user actually said — never convert it yourself. Pass the raw number and set `unit`." },
      unit: { type: "string", description: "Weight unit of `weight`, exactly as the user stated it: 'kg' (default), 'lb', 'ton'/'tons' (US short ton), or 'tonne'/'metric ton'/'t'. The tool converts to kg — do NOT pre-convert tons to kg yourself." },
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
    // DETERMINISTIC unit conversion (issue #311): resolve the weight in the unit the user actually said
    // to canonical kg here, instead of trusting the model to do the ton→kg math (it silently got "2 tons"
    // wrong). An unknown unit fails closed rather than defaulting to a wrong number.
    const resolved = resolveWeightKg(input.weight, input.unit);
    if (resolved == null) {
      throw new Error(`Unrecognized weight unit "${input.unit}". Use kg, lb, ton (US short ton), or tonne (metric).`);
    }
    const kg = resolved.kg;
    if (kg <= 0) throw new Error("Provide a positive fruit weight.");
    // Validate the optional readings up-front (registry ranges) so the preview is trustworthy.
    const brix = coerceBrix(input.brix);
    const ph = coercePh(input.ph);
    const ta = coerceTa(input.ta);

    const blocks = await findScopedBlocks(ctx.user, {
      block: input.block,
      vineyard: input.vineyard,
      variety: input.variety,
    });
    // Picker on ambiguity (sweep after #328). Block labels repeat across vineyards — "Block 1" matches
    // seven rows in a real winery — and findScopedBlocks matches on CONTAINS, so the candidate set is
    // wider still. resolveExactlyOne threw a paragraph here; the tap pins the block by id.
    const candidates = input.blockId ? blocks.filter((b) => b.id === input.blockId) : blocks;
    const picked = resolveOneOrChoice(candidates, {
      prompt: `Which block do you mean?`,
      describe: (b) => `${b.label}${b.varietyName ? ` (${b.varietyName})` : ""}`,
      detail: (b) => b.vineyardName,
      resume: (b) => signResume("log_harvest_pick", { ...input, blockId: b.id }),
      noneMsg: `No block matches that you can access (block "${input.block ?? "?"}"${input.variety ? `, variety "${input.variety}"` : ""}${input.vineyard ? `, vineyard "${input.vineyard}"` : ""}).`,
    });
    if (picked.kind === "choice") return picked.choice;
    const block = picked.row;

    const pickDate = input.pickDate ? input.pickDate : todayISO();
    // Surface HOW the weight was interpreted (e.g. "2 short tons (1,814.37 kg)") so the human confirming
    // catches a short-vs-metric or unit slip before it's written — the confirm gate for the conversion.
    const weightDisplay = describeWeight(resolved);
    const extras = [
      brix != null ? `${brix} °Bx` : null,
      ph != null ? `pH ${ph}` : null,
      ta != null ? `TA ${ta} ${TA_UNIT}` : null,
    ].filter(Boolean);
    const preview = `Weigh-in: ${weightDisplay} off ${block.label} (${block.vineyardName}) on ${pickDate}${extras.length ? ` — ${extras.join(", ")}` : ""}.`;
    const token = signProposal("log_harvest_pick", {
      blockId: block.id,
      weightKg: kg,
      brix,
      ph,
      ta,
      pickDate,
      label: block.label,
      display: weightDisplay,
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
