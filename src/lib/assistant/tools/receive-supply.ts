import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { pickMaterial } from "./material-picker";
import { materialDisplayName } from "@/lib/cellar/materials-shared";
import { receiveSupplyAction } from "@/lib/cost/actions";
import type { ReceiveSupplyInput } from "@/lib/cellar/materials";

// Wave 3 (materials) — record RECEIVING / restocking an existing material (a costed supply lot), wrapping
// receiveSupplyCore. Pure wrapper: the core writes the SupplyLot, stamps the costing-policy version, and
// (with a vendor + terms) emits the A/P bill outbox. Material resolves via the shared deterministic picker
// (id-pinned on ambiguity). Unknown cost is null (D14), never $0. New material = create_material.

type RawInput = { material?: string; qty?: number; unitCost?: number; lotCode?: string; note?: string; vendor?: string; terms?: string };

export const receiveSupplyTool: AssistantTool = {
  name: "receive_supply",
  description:
    "Record RECEIVING / restocking a material — a purchase intake that adds on-hand stock (a supply lot) to an EXISTING catalog material. Use when the user got / received / bought / restocked more of a product: 'received 5 kg of Fermaid-O at $12/kg', 'restock 10 kg tartaric', 'got a case of corks'. Quantity is in the material's stock unit. To create a brand-new material use create_material. Returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      material: { type: "string", description: "The existing material by name, e.g. 'Fermaid-O', 'tartaric', 'corks'." },
      qty: { type: "number", description: "Quantity received, in the material's stock unit." },
      unitCost: { type: "number", description: "Optional cost per stock unit. Omit if unknown (recorded as unknown-cost, never $0)." },
      lotCode: { type: "string", description: "Optional supplier lot / batch code." },
      note: { type: "string", description: "Optional note." },
      vendor: { type: "string", description: "Optional vendor name. A purchase-on-credit under a vendor can post an A/P bill." },
      terms: { type: "string", description: "Optional payment terms, e.g. 'Net 30' (drives the bill due date)." },
    },
    required: ["material", "qty"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as RawInput;
    if (!input.material || typeof input.material !== "string") throw new Error("Which material did you receive?");
    if (typeof input.qty !== "number" || !(input.qty > 0)) throw new Error("How much did you receive? Give a positive quantity.");

    const res = await pickMaterial(input.material, "receive_supply", input, { includeInactive: true });
    if (res.kind === "choice") return res.choice;
    const m = res.row;

    const unitCost = typeof input.unitCost === "number" && input.unitCost >= 0 ? input.unitCost : undefined;
    const u = m.stockUnit ?? "g";
    const costClause = unitCost != null ? ` @ ${unitCost}/${u}` : " (cost unknown)";
    const preview = `Receive ${input.qty} ${u} of ${materialDisplayName(m)}${costClause}${input.lotCode ? ` — lot ${input.lotCode}` : ""}${input.vendor ? ` from ${input.vendor}` : ""}.`;
    const token = signProposal("receive_supply", {
      materialId: m.id,
      qty: input.qty,
      ...(unitCost != null ? { unitCost } : {}),
      ...(input.lotCode?.trim() ? { lotCode: input.lotCode.trim() } : {}),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      ...(input.vendor?.trim() ? { vendor: input.vendor.trim() } : {}),
      ...(input.terms?.trim() ? { terms: input.terms.trim() } : {}),
      materialLabel: materialDisplayName(m),
      unitLabel: u,
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitReceiveSupply: Committer = async (_user, args) => {
  const input: ReceiveSupplyInput = {
    materialId: String(args.materialId),
    qty: Number(args.qty),
    unitCost: args.unitCost == null ? undefined : Number(args.unitCost),
    lotCode: args.lotCode == null ? undefined : String(args.lotCode),
    note: args.note == null ? undefined : String(args.note),
    vendorName: args.vendor == null ? undefined : String(args.vendor),
    terms: args.terms == null ? undefined : String(args.terms),
  };
  await receiveSupplyAction(input);
  return { message: `Received ${Number(args.qty)} ${String(args.unitLabel ?? "")} of ${String(args.materialLabel ?? "the material")}.`.replace(/\s+/g, " ").trim() };
};
