import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { unwrap } from "@/lib/action-result";
import { pickLocation } from "./location-picker";
import { createCostedEquipmentAction } from "@/lib/equipment/actions";
import { EQUIPMENT_KINDS } from "@/lib/equipment/vocab";

// Plan 080 U12 — add an individually-tracked EQUIPMENT ASSET, optionally costed (wraps
// createEquipmentAssetCore). Capitalized equipment is a FIXED ASSET, never a dosable material
// (WORKORDER-7): quantity-tracked PARTS (clamps, gaskets, fittings bought by the box) are consumables and
// belong to create_material / receive_consumable instead. The description below carries that split so the
// model routes correctly. Admin-gated, matching the equipment registry's existing CRUD.

type RawInput = { name?: string; kind?: string; location?: string; purchaseCost?: number; vendor?: string; purchaseDate?: string; notes?: string };

export const addEquipmentTool: AssistantTool = {
  name: "add_equipment",
  description:
    "Add a piece of EQUIPMENT to the registry as an individually-tracked asset, optionally with what it cost: 'add a new must pump, $4200 from Acme', 'register the bladder press in the Red Cellar', 'we bought a plate filter for 1800'. Use this for a DISTINCT machine you track as one thing (press, pump, filter, tank accessory). Do NOT use it for quantity-tracked spare parts bought by the box (clamps, gaskets, fittings) — those are consumables: use create_material / receive_consumable. Returns a preview to confirm.",
  kind: "write",
  adminOnly: true,
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "What to call it, e.g. 'Must pump #2', 'Bladder press'." },
      kind: { type: "string", enum: [...EQUIPMENT_KINDS], description: "Equipment family." },
      location: { type: "string", description: "Optional: where it lives, e.g. 'Red Cellar'." },
      purchaseCost: { type: "number", description: "Optional acquisition cost in the winery's base currency. Omit if unknown (recorded as unknown, never $0)." },
      vendor: { type: "string", description: "Optional vendor it was bought from." },
      purchaseDate: { type: "string", description: "Optional purchase date, ISO (YYYY-MM-DD)." },
      notes: { type: "string", description: "Optional notes." },
    },
    required: ["name", "kind"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as RawInput;
    const name = input.name?.trim();
    if (!name) throw new Error("What should the equipment be called?");
    if (!input.kind || !(EQUIPMENT_KINDS as readonly string[]).includes(input.kind)) {
      throw new Error(`What kind of equipment is it? One of: ${EQUIPMENT_KINDS.join(", ")}.`);
    }
    // Location is optional for equipment (an asset can be unassigned) — only resolve when the user named one.
    const loc = input.location?.trim() ? await pickLocation(input.location) : null;

    const cost = typeof input.purchaseCost === "number" && input.purchaseCost >= 0 ? input.purchaseCost : undefined;
    let purchaseDate: string | undefined;
    if (input.purchaseDate?.trim()) {
      const d = new Date(input.purchaseDate);
      if (Number.isNaN(d.getTime())) throw new Error(`"${input.purchaseDate}" isn't a date I can read — use YYYY-MM-DD.`);
      purchaseDate = d.toISOString();
    }

    const costClause = cost != null ? ` @ ${cost}` : " (cost not recorded)";
    const preview = `Add equipment "${name}" (${input.kind})${loc ? ` at ${loc.name}` : ""}${costClause}${input.vendor ? ` from ${input.vendor}` : ""}.`;
    const token = signProposal("add_equipment", {
      name,
      kind: input.kind,
      ...(loc ? { locationId: loc.id, locationLabel: loc.name } : {}),
      ...(cost != null ? { purchaseCost: cost } : {}),
      ...(input.vendor?.trim() ? { vendor: input.vendor.trim() } : {}),
      ...(purchaseDate ? { purchaseDate } : {}),
      ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitAddEquipment: Committer = async (_user, args) => {
  // unwrap: a duplicate asset name or an unknown vendor is a block the user must see verbatim.
  unwrap(
    await createCostedEquipmentAction({
      name: String(args.name),
      kind: String(args.kind),
      locationId: args.locationId == null ? undefined : String(args.locationId),
      notes: args.notes == null ? undefined : String(args.notes),
      purchaseCostBase: args.purchaseCost == null ? undefined : Number(args.purchaseCost),
      vendorName: args.vendor == null ? undefined : String(args.vendor),
      purchaseDate: args.purchaseDate == null ? undefined : new Date(String(args.purchaseDate)),
    }),
  );
  return { message: `Added equipment "${String(args.name)}"${args.locationLabel ? ` at ${String(args.locationLabel)}` : ""}.` };
};
