import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveVessel } from "../scope";
import { round2 } from "@/lib/bottling/draw";
import { topVesselAction } from "@/lib/cellar/actions";
import type { ToppingInput } from "@/lib/cellar/topping";

// Assistant-coverage Wave 2 — top up a vessel's headspace from a source. Wraps topVesselAction (no db_*).

const vlabel = (v: { type: string; code: string }) => (v.type === "BARREL" ? `Barrel ${v.code}` : `Tank ${v.code}`);
const totalL = (v: { components: { volumeL: unknown }[] }) => round2(v.components.reduce((a, c) => a + Number(c.volumeL), 0));

type TopUpRawInput = { fromVessel?: string; toVessel?: string; volumeL?: number; note?: string };

export const topUpTool: AssistantTool = {
  name: "top_up",
  description:
    "Top up a vessel's headspace with wine from a source vessel ('top the 2023 Grenache barrel from keg 4', 'top off tank 3 with 5 L from keg 2'). Wraps the topping op. Give the destination + source vessels and the volume. Does NOT save immediately — returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      toVessel: { type: "string", description: "Vessel being topped up, e.g. 'barrel 14'." },
      fromVessel: { type: "string", description: "Source vessel (the keg/tank the top-up wine comes from), e.g. 'keg 4'." },
      volumeL: { type: "number", description: "Liters to add." },
      note: { type: "string", description: "Optional note." },
    },
    required: ["toVessel", "fromVessel", "volumeL"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as TopUpRawInput;
    if (!input.toVessel || !input.fromVessel) throw new Error("Which vessel are you topping, and from where?");
    if (typeof input.volumeL !== "number" || !(input.volumeL > 0)) throw new Error("How many liters are you topping up?");
    const to = await resolveVessel(input.toVessel);
    const from = await resolveVessel(input.fromVessel);
    if (to.id === from.id) throw new Error("Source and destination must be different vessels.");
    if (!to.isActive) throw new Error(`${vlabel(to)} is inactive.`);
    if (!from.isActive) throw new Error(`${vlabel(from)} is inactive.`);
    const src = totalL(from);
    if (src < input.volumeL - 1e-9) throw new Error(`${vlabel(from)} only holds ${src} L; can't top ${input.volumeL} L from it.`);

    const preview = `Top ${vlabel(to)} with ${input.volumeL} L from ${vlabel(from)}.`;
    const token = signProposal("top_up", {
      toVesselId: to.id,
      fromVesselId: from.id,
      volumeL: round2(input.volumeL),
      ...(input.note ? { note: input.note } : {}),
      toLabel: vlabel(to),
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitTopUp: Committer = async (_user, args) => {
  const input: ToppingInput = {
    toVesselId: String(args.toVesselId),
    fromVesselId: String(args.fromVesselId),
    volumeL: Number(args.volumeL),
    note: args.note == null ? undefined : String(args.note),
  };
  const res = await topVesselAction(input);
  return { message: res.message };
};
