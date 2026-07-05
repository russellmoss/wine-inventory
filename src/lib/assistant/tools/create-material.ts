import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { STOCK_UNITS } from "@/lib/cellar/materials-shared";
import { createStockMaterialAction } from "@/lib/cellar/actions";
import type { CreateStockMaterialInput } from "@/lib/cellar/materials";

// Wave 3 (materials) — create a NEW catalog material/expendable, wrapping createStockMaterialCore. A pure
// wrapper: no taxonomy/cost logic here (the core derives family→category, seeds the opening SupplyLot, and
// stamps the costing-policy version). Family is free-text (coerceFamily maps a built-in or keeps a custom
// one); category is DERIVED from it (cost-safety authority). RESTOCKING an existing material is receive_supply.

const FAMILY_HINT = "Yeast, MLF, SO2, Nutrient, Acid, Sugar, Tannin, Fining, Bentonite, Chitosan, Enzyme, Cleaning, Sanitizer, Packaging — or a custom family";

type RawInput = { name?: string; family?: string; stockUnit?: string; openingQty?: number; unitCost?: number; vendor?: string };

export const createMaterialTool: AssistantTool = {
  name: "create_material",
  description:
    "Create a NEW material/expendable in the catalog (an additive, cleaning/sanitizing supply, or packaging). Use when the user wants to ADD a product that isn't in the catalog yet — 'add a new tannin called Grape Tannin VR Supra', 'create a Fermaid-O nutrient'. Optionally seed opening on-hand stock (openingQty + unitCost). This does NOT restock an existing material — use receive_supply for that. Returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Product name / brand, e.g. 'Grape Tannin VR Supra', 'Fermaid-O'." },
      family: { type: "string", description: `Material family: ${FAMILY_HINT}. The family determines whether it's a doseable additive vs a cleaning/packaging item.` },
      stockUnit: { type: "string", enum: [...STOCK_UNITS], description: "Unit stock is tracked in (g, mg, kg, mL, L, unit). Defaults to g." },
      openingQty: { type: "number", description: "Optional opening on-hand quantity in the stock unit (seeds a starting supply lot)." },
      unitCost: { type: "number", description: "Optional cost per stock unit for the opening stock. Omit if unknown (never assume $0)." },
      vendor: { type: "string", description: "Optional supplier/vendor name." },
    },
    required: ["name"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as RawInput;
    const name = String(input.name ?? "").trim();
    if (!name) throw new Error("What's the material called?");
    const stockUnit = input.stockUnit && (STOCK_UNITS as readonly string[]).includes(input.stockUnit) ? input.stockUnit : undefined;
    const openingQty = typeof input.openingQty === "number" && input.openingQty > 0 ? input.openingQty : undefined;
    const unitCost = typeof input.unitCost === "number" && input.unitCost >= 0 ? input.unitCost : undefined;
    const family = input.family?.trim() || undefined;

    const u = stockUnit ?? "g";
    const stockClause = openingQty ? ` — opening stock ${openingQty} ${u}${unitCost != null ? ` @ ${unitCost}/${u}` : " (cost unknown)"}` : "";
    const preview = `Add material "${name}"${family ? ` (${family})` : ""} to the catalog${stockClause}.`;
    const token = signProposal("create_material", {
      name,
      ...(family ? { family } : {}),
      ...(stockUnit ? { stockUnit } : {}),
      ...(openingQty != null ? { openingQty } : {}),
      ...(unitCost != null ? { unitCost } : {}),
      ...(input.vendor?.trim() ? { vendor: input.vendor.trim() } : {}),
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitCreateMaterial: Committer = async (_user, args) => {
  const input: CreateStockMaterialInput = {
    name: String(args.name),
    kind: args.family == null ? undefined : String(args.family),
    stockUnit: args.stockUnit == null ? undefined : String(args.stockUnit),
    openingQty: args.openingQty == null ? undefined : Number(args.openingQty),
    unitCost: args.unitCost == null ? undefined : Number(args.unitCost),
    vendor: args.vendor == null ? undefined : String(args.vendor),
  };
  const dto = await createStockMaterialAction(input);
  return { message: `Added "${dto.name}" to the catalog.` };
};
