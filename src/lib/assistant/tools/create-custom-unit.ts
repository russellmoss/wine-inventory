import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { convert, canonicalUnitFor, type MeasureDimension } from "@/lib/units/measure";
import { createCustomUnitAction } from "@/lib/units/actions";

// Plan 075: create a user-defined measurement unit ("drum", "tote", "roll") the winery can then pick when
// receiving stock. The user states it naturally ("a drum is 200 kg", "a roll is 500 labels"); we convert that
// to the engine's canonical perCanonical (g / mL / base-count) via the SAME convert() the cost engine uses, so
// the stored factor is money-consistent. Pure wrapper over createCustomUnitCore (via the action) — no domain
// logic here. Returns a preview to confirm. This does NOT create a material — use create_material for that.

type RawInput = {
  name?: string;
  dimension?: string; // mass | volume | count (accepts "weight" as a synonym for mass)
  amount?: number;
  referenceUnit?: string;
};

const DIM_ALIASES: Record<string, MeasureDimension> = {
  mass: "mass", weight: "mass",
  volume: "volume",
  count: "count", each: "count",
};

export const createCustomUnitTool: AssistantTool = {
  name: "create_custom_unit",
  description:
    "Create a NEW user-defined measurement unit the winery can pick when receiving stock — beyond the built-ins " +
    "(g, kg, mg, oz, lb, ton, mL, L, gal, fl oz, unit). Use when the user wants a unit like 'roll', 'drum', " +
    "'tote', 'case', 'pallet' — e.g. 'add a unit called drum that's 200 kg', 'create a unit tote = 1000 liters', " +
    "'make a roll unit, 500 labels per roll'. Provide: name; what it measures (mass/weight, volume, or count); " +
    "how big one is (amount); and for weight/volume the reference unit the amount is in (kg, L, gal…). For a " +
    "count unit the amount is how many base items are in one (e.g. 500 labels per roll; use 1 to just count the " +
    "unit itself). This does NOT create a material/consumable (use create_material) and does NOT receive stock " +
    "(use receive_supply). Names that clash with a built-in unit are refused. Returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "The unit's name, e.g. 'drum', 'tote', 'roll', 'case'." },
      dimension: {
        type: "string",
        enum: ["mass", "volume", "count"],
        description: "What it measures: mass (weight), volume, or count (a discrete package/each).",
      },
      amount: {
        type: "number",
        description:
          "How big one of this unit is. For mass/volume, the size in the reference unit (e.g. 200 for a 200 kg drum). For count, the number of base items in one (e.g. 500 labels per roll; 1 to count the unit itself).",
      },
      referenceUnit: {
        type: "string",
        description:
          "For mass/volume ONLY: the built-in unit the amount is expressed in — kg, g, lb, oz, ton (mass) or L, mL, gal, 'fl oz' (volume). Omit for a count unit.",
      },
    },
    required: ["name", "dimension", "amount"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as RawInput;
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) throw new Error("What should the unit be called?");

    const dimension = DIM_ALIASES[String(input.dimension ?? "").trim().toLowerCase()];
    if (!dimension) throw new Error("Does it measure weight, volume, or count?");

    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("How big is one of this unit? Give a positive number.");

    const refUnit = typeof input.referenceUnit === "string" ? input.referenceUnit.trim() : "";
    let perCanonical: number | null;
    let sizeText: string;
    if (dimension === "count") {
      perCanonical = amount;
      sizeText = amount === 1 ? `each ${name} counted on its own` : `${amount} per ${name}`;
    } else {
      if (!refUnit) throw new Error(`What unit is the ${dimension === "mass" ? "weight" : "volume"} in — e.g. ${dimension === "mass" ? "kg or lb" : "L or gal"}?`);
      perCanonical = convert(amount, refUnit, canonicalUnitFor(dimension));
      if (perCanonical == null || !(perCanonical > 0)) {
        throw new Error(`I don't recognize "${refUnit}" as a ${dimension === "mass" ? "weight" : "volume"} unit. Try kg, g, lb, oz, ton or L, mL, gal.`);
      }
      sizeText = `1 ${name} = ${amount} ${refUnit}`;
    }

    const preview = `Create the unit "${name}" (${dimension}: ${sizeText}). Stored in ${canonicalUnitFor(dimension)}.`;
    const token = signProposal("create_custom_unit", { name, dimension, perCanonical });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitCreateCustomUnit: Committer = async (_user, args) => {
  const name = String(args.name);
  const dimension = String(args.dimension);
  const perCanonical = Number(args.perCanonical);
  const res = await createCustomUnitAction({ name, dimension, perCanonical });
  if (!res.ok) throw new Error(res.error);
  return { message: `Created the unit "${name}". You can now pick it when receiving stock.` };
};
