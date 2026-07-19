import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { unwrap } from "@/lib/action-result";
import { pickMaterial } from "./material-picker";
import { pickLocation } from "./location-picker";
import { materialDisplayName } from "@/lib/cellar/materials-shared";
import { transferConsumableAction } from "@/lib/cellar/actions";

// Plan 080 U12 — move a consumable between locations (wraps transferConsumableCore). The core does a FIFO
// LOT-SPLIT so cost, age, expiry and vendor provenance follow the goods; this tool just resolves the
// material + both locations and hands over a preview. A shortfall at the source BLOCKS with the specific
// reason (deliberate move), which the committer unwraps so the user sees it verbatim.

type RawInput = { material?: string; qty?: number; fromLocation?: string; toLocation?: string; reason?: string };

export const transferConsumableTool: AssistantTool = {
  name: "transfer_consumable",
  description:
    "MOVE a consumable (additive, nutrient, packaging, part…) from one location to another: 'move 5 kg of bentonite from the Lab to the Red Cellar', 'transfer 2 cases of corks to the Sparkling Warehouse', 'shift half the DAP to the barrel room'. Quantity is in the material's stock unit. This moves EXISTING stock between places — it does not add new stock (receive_consumable) or correct a count (adjust_consumable). Returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      material: { type: "string", description: "The consumable by name, e.g. 'bentonite', 'corks'." },
      qty: { type: "number", description: "How much to move, in the material's stock unit." },
      fromLocation: { type: "string", description: "Source location, e.g. 'Lab'." },
      toLocation: { type: "string", description: "Destination location, e.g. 'Red Cellar'." },
      reason: { type: "string", description: "Optional note for the movement record." },
    },
    required: ["material", "qty", "fromLocation", "toLocation"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as RawInput;
    if (!input.material || typeof input.material !== "string") throw new Error("Which material are you moving?");
    if (typeof input.qty !== "number" || !(input.qty > 0)) throw new Error("How much are you moving? Give a positive quantity.");

    const res = await pickMaterial(input.material, "transfer_consumable", input, { includeInactive: true });
    if (res.kind === "choice") return res.choice;
    const m = res.row;
    const from = await pickLocation(input.fromLocation, "source location");
    const to = await pickLocation(input.toLocation, "destination location");
    if (from.id === to.id) throw new Error("The source and destination are the same location — pick two different places.");

    const u = m.stockUnit ?? "g";
    const preview = `Move ${input.qty} ${u} of ${materialDisplayName(m)} from ${from.name} to ${to.name}.`;
    const token = signProposal("transfer_consumable", {
      materialId: m.id,
      fromLocationId: from.id,
      toLocationId: to.id,
      qty: input.qty,
      ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
      materialLabel: materialDisplayName(m),
      fromLabel: from.name,
      toLabel: to.name,
      unitLabel: u,
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitTransferConsumable: Committer = async (_user, args) => {
  // unwrap: "only 3 g there, can't transfer 5" is the whole value of the block — it must not be redacted.
  unwrap(
    await transferConsumableAction({
      materialId: String(args.materialId),
      fromLocationId: String(args.fromLocationId),
      toLocationId: String(args.toLocationId),
      qty: Number(args.qty),
      reason: args.reason == null ? undefined : String(args.reason),
    }),
  );
  return {
    message: `Moved ${Number(args.qty)} ${String(args.unitLabel ?? "")} of ${String(args.materialLabel ?? "the material")} from ${String(args.fromLabel ?? "")} to ${String(args.toLabel ?? "")}.`
      .replace(/\s+/g, " ")
      .trim(),
  };
};
