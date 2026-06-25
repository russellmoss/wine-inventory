import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveVessel, type ResolvedVessel } from "../scope";
import { round2 } from "@/lib/bottling/draw";
import { planTransfer, type SourceComponent } from "@/lib/vessels/transfer-math";
import { transferWine } from "@/lib/vessels/transfer";

type RackInput = {
  fromVessel?: string;
  toVessel?: string;
  volumeL?: number;
  lossL?: number;
  note?: string;
};

function label(v: { type: string; code: string }): string {
  return v.type === "BARREL" ? `Barrel ${v.code}` : `Tank ${v.code}`;
}

function totalL(v: ResolvedVessel): number {
  return round2(v.components.reduce((a, c) => a + Number(c.volumeL), 0));
}

function sourceComponents(v: ResolvedVessel): SourceComponent[] {
  return v.components.map((c) => ({
    id: c.id,
    varietyId: c.varietyId,
    vineyardId: c.vineyardId,
    vintage: c.vintage,
    volumeL: Number(c.volumeL),
  }));
}

export const rackWineTool: AssistantTool = {
  name: "rack_wine",
  description:
    "Rack (transfer) wine from one vessel to another — any direction: barrel to barrel, tank to barrel, barrel to tank, tank to tank. Use when the user says they racked/moved/transferred/pumped wine between vessels. By default the whole source is moved (it ends empty); pass volumeL to move a specific number of liters, and lossL for volume lost to lees. Refer to vessels in plain language like 'barrel 14' or 'tank 1'. This does NOT save immediately — it returns a preview the user must confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      fromVessel: { type: "string", description: "Source vessel, e.g. 'barrel 14' or 'tank 1'." },
      toVessel: { type: "string", description: "Destination vessel, e.g. 'barrel 16'." },
      volumeL: { type: "number", description: "Liters to move. Omit to move the entire source." },
      lossL: { type: "number", description: "Liters lost to lees (optional, default 0)." },
      note: { type: "string", description: "Optional note about the rack." },
    },
    required: ["fromVessel", "toVessel"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as RackInput;
    if (!input.fromVessel || typeof input.fromVessel !== "string") throw new Error("Which vessel are you racking from?");
    if (!input.toVessel || typeof input.toVessel !== "string") throw new Error("Which vessel are you racking into?");

    const from = await resolveVessel(input.fromVessel);
    const to = await resolveVessel(input.toVessel);
    if (from.id === to.id) throw new Error("Source and destination must be different vessels.");
    if (!from.isActive) throw new Error(`${label(from)} is inactive.`);
    if (!to.isActive) throw new Error(`${label(to)} is inactive.`);

    const sourceTotal = totalL(from);
    if (sourceTotal <= 0) throw new Error(`${label(from)} is empty — nothing to rack.`);

    const isFull = input.volumeL == null;
    if (!isFull && (typeof input.volumeL !== "number" || !(input.volumeL > 0))) {
      throw new Error("Volume to move must be a positive number of liters.");
    }
    const drawL = isFull ? sourceTotal : round2(input.volumeL as number);
    if (drawL > sourceTotal + 1e-9) {
      throw new Error(`${label(from)} only holds ${sourceTotal} L; can't move ${drawL} L.`);
    }

    let lossL = 0;
    if (input.lossL != null) {
      if (typeof input.lossL !== "number" || input.lossL < 0) throw new Error("Loss must be zero or a positive number of liters.");
      lossL = round2(input.lossL);
      if (lossL > drawL + 1e-9) throw new Error("Loss can't exceed the volume moved.");
    }

    const plan = planTransfer(sourceComponents(from), drawL, lossL);

    const toCapacity = Number(to.capacityL);
    const toCurrent = totalL(to);
    if (toCurrent + plan.addedL > toCapacity + 1e-9) {
      throw new Error(
        `That would overfill ${label(to)} (holds ${toCurrent} L of ${toCapacity} L; adding ${plan.addedL} L).`,
      );
    }

    const vName = new Map(from.components.map((c) => [c.varietyId, c.variety.name]));
    const yName = new Map(from.components.map((c) => [c.vineyardId, c.vineyard.name]));
    const breakdown = plan.additions
      .map((a) => `${vName.get(a.varietyId) ?? "wine"} ${a.vintage} (${yName.get(a.vineyardId) ?? "?"})`)
      .join(", ");
    const lossClause = lossL > 0 ? `, ${lossL} L lost to lees` : "";
    const fromAfter = round2(sourceTotal - drawL);
    const toAfter = round2(toCurrent + plan.addedL);
    const preview =
      `Rack ${plan.addedL} L from ${label(from)} to ${label(to)}${lossClause}` +
      (breakdown ? ` — ${breakdown}.` : ".") +
      ` ${label(from)} → ${fromAfter} L; ${label(to)} → ${toAfter} / ${toCapacity} L.`;

    const token = signProposal("rack_wine", {
      fromVesselId: from.id,
      toVesselId: to.id,
      ...(isFull ? {} : { drawL }),
      ...(lossL > 0 ? { lossL } : {}),
      ...(input.note ? { note: input.note } : {}),
      fromLabel: label(from),
      toLabel: label(to),
      addedL: plan.addedL,
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitRackWine: Committer = async (_user, args) => {
  const res = await transferWine({
    fromVesselId: String(args.fromVesselId),
    toVesselId: String(args.toVesselId),
    drawL: args.drawL == null ? undefined : Number(args.drawL),
    lossL: args.lossL == null ? undefined : Number(args.lossL),
    note: args.note == null ? undefined : String(args.note),
  });
  return { message: res.message };
};
