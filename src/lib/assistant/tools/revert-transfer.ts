import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveVessel } from "../scope";
import { round2 } from "@/lib/bottling/draw";
import { findRevertableTransfer, revertTransfer } from "@/lib/vessels/transfer";

type RevertInput = { vessel?: string };

type SnapshotEntry = { varietyName?: string | null; vintage?: number; volumeL?: number };

function label(type: string | undefined, code: string): string {
  if (type === "BARREL") return `Barrel ${code}`;
  if (type === "TANK") return `Tank ${code}`;
  return code;
}

export const revertTransferTool: AssistantTool = {
  name: "revert_transfer",
  description:
    "Revert (undo) a wine rack/transfer between vessels — moves the wine back from the destination to the source. Use when the user says to revert/undo/reverse a rack or transfer ('revert that', 'undo the last rack', 'undo the last rack of barrel 16'). Defaults to the most recent rack; pass a vessel to target the most recent rack involving it. This does NOT save immediately — it returns a preview the user must confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      vessel: {
        type: "string",
        description: "Optional: narrow to the most recent rack involving this vessel, e.g. 'barrel 16'.",
      },
    },
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as RevertInput;

    let vesselId: string | undefined;
    let scopeLabel = "";
    if (input.vessel) {
      const v = await resolveVessel(input.vessel);
      vesselId = v.id;
      scopeLabel = ` for ${label(v.type, v.code)}`;
    }

    const t = await findRevertableTransfer({ vesselId });
    if (!t) {
      throw new Error(`I don't see a rack to revert${scopeLabel}.`);
    }

    const entries = (t.components as unknown as SnapshotEntry[]) ?? [];
    const moveBack = round2(entries.reduce((a, e) => a + Number(e.volumeL ?? 0), 0));
    const breakdown = entries
      .map((e) => `${e.varietyName ?? "wine"}${e.vintage ? ` ${e.vintage}` : ""}`)
      .join(", ");

    // The rack moved from t.from -> t.to; reverting moves t.to -> t.from.
    const origFrom = label(t.fromVessel?.type, t.fromVesselCode);
    const origTo = label(t.toVessel?.type, t.toVesselCode);
    const when = t.rackedAt.toISOString().slice(0, 10);

    const preview =
      `Revert the rack from ${when} (${origFrom} → ${origTo}` +
      (breakdown ? `, ${breakdown}` : "") +
      `): move ${moveBack} L back from ${origTo} to ${origFrom}.`;

    const token = signProposal("revert_transfer", {
      transferId: t.id,
      origFrom,
      origTo,
      moveBack,
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitRevertTransfer: Committer = async (_user, args) => {
  const res = await revertTransfer({ transferId: String(args.transferId) });
  return { message: res.message };
};
