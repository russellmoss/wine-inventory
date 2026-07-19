import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { unwrap } from "@/lib/action-result";
import { pickMaterial } from "./material-picker";
import { pickLocation } from "./location-picker";
import { materialDisplayName } from "@/lib/cellar/materials-shared";
import { adjustConsumableAction } from "@/lib/cellar/actions";

// Plan 080 U12 — correct a consumable's on-hand AT a location by a signed delta (wraps adjustConsumableCore).
// This is a CORRECTION (cycle count, spillage, found stock), not a purchase (receive_consumable) and not a
// dose (add_addition). A negative that exceeds what's actually there is BLOCKED with the specific shortfall —
// a deliberate adjustment never drives a location negative; only consumption reconciles negative.

type RawInput = { material?: string; delta?: number; location?: string; reason?: string };

export const adjustConsumableTool: AssistantTool = {
  name: "adjust_consumable",
  description:
    "Correct the on-hand quantity of a CONSUMABLE (additive, nutrient, packaging, part…) at a location by a signed amount: 'we're 2 kg short of bentonite in the Lab' (-2), 'found 5 more kg of DAP in the Red Cellar' (+5), 'cycle count says 12 kg tartaric not 15' (-3). Use for corrections, spillage, breakage or found stock — NOT for a purchase (receive_consumable) and NOT for dosing a vessel (add_addition). A reason is required. Returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      material: { type: "string", description: "The consumable by name, e.g. 'bentonite', 'DAP', 'corks'." },
      delta: { type: "number", description: "Signed change in the material's stock unit: negative to remove, positive to add." },
      location: { type: "string", description: "Which location's stock is being corrected, e.g. 'Lab'." },
      reason: { type: "string", description: "Why — e.g. 'cycle count', 'spillage', 'found stock'." },
    },
    required: ["material", "delta", "location", "reason"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as RawInput;
    if (!input.material || typeof input.material !== "string") throw new Error("Which material are you correcting?");
    if (typeof input.delta !== "number" || !Number.isFinite(input.delta) || input.delta === 0) {
      throw new Error("By how much? Give a non-zero amount (negative to remove, positive to add).");
    }
    const reason = input.reason?.trim();
    if (!reason) throw new Error("Why is the quantity changing? Give a short reason.");

    const res = await pickMaterial(input.material, "adjust_consumable", input, { includeInactive: true });
    if (res.kind === "choice") return res.choice;
    const m = res.row;
    const loc = await pickLocation(input.location);

    const u = m.stockUnit ?? "g";
    const sign = input.delta > 0 ? "+" : "";
    const preview = `Adjust ${materialDisplayName(m)} at ${loc.name} by ${sign}${input.delta} ${u} (${reason}).`;
    const token = signProposal("adjust_consumable", {
      materialId: m.id,
      locationId: loc.id,
      delta: input.delta,
      reason,
      materialLabel: materialDisplayName(m),
      locationLabel: loc.name,
      unitLabel: u,
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitAdjustConsumable: Committer = async (_user, args) => {
  // unwrap: a blocked adjustment ("only 3 g there, can't remove 10") must reach the user verbatim.
  unwrap(
    await adjustConsumableAction({
      materialId: String(args.materialId),
      locationId: String(args.locationId),
      delta: Number(args.delta),
      reason: String(args.reason),
    }),
  );
  const delta = Number(args.delta);
  return {
    message: `Adjusted ${String(args.materialLabel ?? "the material")} at ${String(args.locationLabel ?? "the location")} by ${delta > 0 ? "+" : ""}${delta} ${String(args.unitLabel ?? "")}.`
      .replace(/\s+/g, " ")
      .trim(),
  };
};
