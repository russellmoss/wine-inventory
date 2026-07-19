import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { unwrap } from "@/lib/action-result";
import { pickMaterial } from "./material-picker";
import { pickLocation } from "./location-picker";
import { materialDisplayName } from "@/lib/cellar/materials-shared";
import { receiveConsumableAction } from "@/lib/cellar/actions";

// Plan 080 U12 — receive a consumable INTO A SPECIFIC LOCATION (wraps receiveConsumableCore). This is the
// location-aware sibling of receive_supply: same costed SupplyLot + A/P behaviour, but the stock lands
// somewhere physical instead of defaulting to the system "Winery" location. Unknown cost stays null (D14),
// never $0. Write tool → returns a preview to confirm; the committer does the write.

type RawInput = { material?: string; qty?: number; location?: string; unitCost?: number; lotCode?: string; note?: string; vendor?: string; terms?: string };

export const receiveConsumableTool: AssistantTool = {
  name: "receive_consumable",
  description:
    "Record RECEIVING a consumable (additive, nutrient, packaging, part…) INTO A NAMED LOCATION — a purchase intake that adds on-hand stock at that place: 'received 5 kg of Fermaid-O into the Lab', 'put 10 kg tartaric in the Red Cellar', '2 cases of corks to the Sparkling Warehouse'. Use this whenever the user says WHERE the stock went. If no location is mentioned use receive_supply. Quantity is in the material's stock unit. To create a brand-new material use create_material. Returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      material: { type: "string", description: "The existing material by name, e.g. 'Fermaid-O', 'tartaric', 'corks'." },
      qty: { type: "number", description: "Quantity received, in the material's stock unit." },
      location: { type: "string", description: "Where the stock physically landed, e.g. 'Lab', 'Red Cellar'." },
      unitCost: { type: "number", description: "Optional cost per stock unit. Omit if unknown (recorded as unknown-cost, never $0)." },
      lotCode: { type: "string", description: "Optional supplier lot / batch code." },
      note: { type: "string", description: "Optional note." },
      vendor: { type: "string", description: "Optional vendor name. A purchase-on-credit under a vendor can post an A/P bill." },
      terms: { type: "string", description: "Optional payment terms, e.g. 'Net 30' (drives the bill due date)." },
    },
    required: ["material", "qty", "location"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as RawInput;
    if (!input.material || typeof input.material !== "string") throw new Error("Which material did you receive?");
    if (typeof input.qty !== "number" || !(input.qty > 0)) throw new Error("How much did you receive? Give a positive quantity.");

    const res = await pickMaterial(input.material, "receive_consumable", input, { includeInactive: true });
    if (res.kind === "choice") return res.choice;
    const m = res.row;
    const loc = await pickLocation(input.location);

    const unitCost = typeof input.unitCost === "number" && input.unitCost >= 0 ? input.unitCost : undefined;
    const u = m.stockUnit ?? "g";
    const costClause = unitCost != null ? ` @ ${unitCost}/${u}` : " (cost unknown)";
    const preview = `Receive ${input.qty} ${u} of ${materialDisplayName(m)} into ${loc.name}${costClause}${input.lotCode ? ` — lot ${input.lotCode}` : ""}${input.vendor ? ` from ${input.vendor}` : ""}.`;
    const token = signProposal("receive_consumable", {
      materialId: m.id,
      qty: input.qty,
      locationId: loc.id,
      ...(unitCost != null ? { unitCost } : {}),
      ...(input.lotCode?.trim() ? { lotCode: input.lotCode.trim() } : {}),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      ...(input.vendor?.trim() ? { vendor: input.vendor.trim() } : {}),
      ...(input.terms?.trim() ? { terms: input.terms.trim() } : {}),
      materialLabel: materialDisplayName(m),
      locationLabel: loc.name,
      unitLabel: u,
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitReceiveConsumable: Committer = async (_user, args) => {
  // safeAction settles instead of throwing — unwrap so a blocked receipt (inactive location, bad vendor)
  // reaches the user as its real reason instead of Next's redacted production error.
  unwrap(
    await receiveConsumableAction({
      materialId: String(args.materialId),
      qty: Number(args.qty),
      locationId: String(args.locationId),
      unitCost: args.unitCost == null ? undefined : Number(args.unitCost),
      lotCode: args.lotCode == null ? undefined : String(args.lotCode),
      note: args.note == null ? undefined : String(args.note),
      vendorName: args.vendor == null ? undefined : String(args.vendor),
      terms: args.terms == null ? undefined : String(args.terms),
    }),
  );
  return {
    message: `Received ${Number(args.qty)} ${String(args.unitLabel ?? "")} of ${String(args.materialLabel ?? "the material")} into ${String(args.locationLabel ?? "the location")}.`
      .replace(/\s+/g, " ")
      .trim(),
  };
};
