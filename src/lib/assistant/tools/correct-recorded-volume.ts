import "server-only";
import { prisma } from "@/lib/prisma";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveVessel } from "../scope";
import { round2 } from "@/lib/bottling/draw";
import { correctRecordedVolumeAction } from "@/lib/cellar/actions";
import { planRecordedVolumeCorrection, normalizeCorrectionReason } from "@/lib/cellar/volume-correction-plan";

// Assistant coverage for the recorded-volume correction (feedback cms8a9nau0005i8045l65vomp).
// This is a wet-hands ask — the person who finds the wrong number is standing at the barrel with a
// thief in their hand — so it gets a tool, not just the GUI affordance. It wraps
// correctRecordedVolumeAction; no db_* write path can reach vessel_lot.
//
// The preview is computed from `vessel_lot` (the authoritative projection), NOT vessel_component,
// so the number the assistant reads back is the number the core will actually correct from.

const vlabel = (v: { type: string; code: string }) => (v.type === "BARREL" ? `Barrel ${v.code}` : `Tank ${v.code}`);

type CorrectVolumeRawInput = { vessel?: string; volumeL?: number; reason?: string };

export const correctRecordedVolumeTool: AssistantTool = {
  name: "correct_recorded_volume",
  description:
    "Correct a vessel's RECORDED volume when the number was entered wrong — a data-entry fix, no wine moves ('barrel B3 says 100 litres but it actually holds 225', 'fix tank 4's volume to 1800 L, I typed it wrong'). Use this ONLY for a mistyped/miscounted record. If wine physically moved, use rack_wine, top_up, or the dump/loss path instead. Requires a reason. Does NOT save immediately — returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      vessel: { type: "string", description: "The vessel whose recorded volume is wrong, e.g. 'barrel B3'." },
      volumeL: { type: "number", description: "The volume the vessel actually holds, in liters." },
      reason: { type: "string", description: "Why the recorded volume was wrong, e.g. 'fill volume mistyped at 100 instead of 225'." },
    },
    required: ["vessel", "volumeL", "reason"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as CorrectVolumeRawInput;
    if (!input.vessel) throw new Error("Which vessel's recorded volume is wrong?");
    if (typeof input.volumeL !== "number" || !(input.volumeL > 0)) {
      throw new Error("How many liters does it actually hold? To empty a vessel, dump it instead.");
    }
    const reason = normalizeCorrectionReason(input.reason);
    if (!reason) throw new Error("Why was the recorded volume wrong? A correction needs a reason for the audit trail.");

    const vessel = await resolveVessel(input.vessel);
    if (!vessel.isActive) throw new Error(`${vlabel(vessel)} is inactive.`);

    const residents = await prisma.vesselLot.findMany({ where: { vesselId: vessel.id }, select: { volumeL: true } });
    const currentL = round2(residents.reduce((a, r) => a + Number(r.volumeL), 0));
    const capacityL = Number(vessel.capacityL);
    const targetL = round2(input.volumeL);

    // Same pure decision the core runs, so the preview can never promise something the commit refuses.
    const plan = planRecordedVolumeCorrection({ currentL, targetL, capacityL });
    if (plan.kind === "BLOCKED_EMPTY") {
      throw new Error(`${vlabel(vessel)} is empty, so there's no wine whose volume could be wrong. Fill it instead.`);
    }
    if (plan.kind === "BLOCKED_OVER_CAPACITY") {
      throw new Error(`${vlabel(vessel)} holds ${plan.capacityL} L; it can't be corrected to ${plan.targetL} L.`);
    }
    if (plan.kind === "NO_OP") {
      // Nothing to confirm: no op would be written, so this is a plain answer, not a proposal.
      return { message: `${vlabel(vessel)} already reads ${plan.currentL} L — nothing to correct.` };
    }

    const direction = plan.deltaL > 0 ? "up" : "down";
    const preview =
      `Correct ${vlabel(vessel)}'s recorded volume from ${plan.fromL} L to ${plan.toL} L ` +
      `(${direction} ${Math.abs(plan.deltaL)} L) — a record fix, no wine moves. Reason: ${reason}`;
    const token = signProposal("correct_recorded_volume", {
      vesselId: vessel.id,
      targetVolumeL: plan.toL,
      reason,
      vesselLabel: vlabel(vessel),
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitCorrectRecordedVolume: Committer = async (_user, args) => {
  const res = await correctRecordedVolumeAction({
    vesselId: String(args.vesselId),
    targetVolumeL: Number(args.targetVolumeL),
    reason: String(args.reason),
  });
  return { message: res.message };
};
