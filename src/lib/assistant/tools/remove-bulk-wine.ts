import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveVessel, type ResolvedVessel } from "../scope";
import { REMOVAL_DISPOSITIONS, REMOVAL_DISPOSITION_LABELS, isRemovalDisposition } from "@/lib/compliance/removal-reasons";
import type { RemovalDisposition } from "@/lib/compliance/types";
import { removeTaxpaidTyped } from "@/lib/compliance/removal-actions";

// Wave 3 (compliance removals) — record a BULK removal (the reversible tax-determination event, §A). Wraps
// removeTaxpaidCore: draws volumeL out of a vessel (bulk wine → external), proportionally across its lots,
// tagged with the disposition for the report fold. ADMIN-only (a tax event) + confirm-nonce. Reversible via
// the universal undo (a CORRECTION carrying the removal's observedAt → an Amended report if the period filed).
// v1 = bulk only; bottled finished-goods removals are remove_bottled_wine.

const label = (v: { type: string; code: string }) => (v.type === "BARREL" ? `Barrel ${v.code}` : `Tank ${v.code}`);
const totalL = (v: ResolvedVessel) => v.components.reduce((a, c) => a + Number(c.volumeL), 0);

type RawInput = { vessel?: string; volumeL?: number; disposition?: string; date?: string; note?: string };

export const removeBulkWineTool: AssistantTool = {
  name: "remove_bulk_wine",
  description:
    "Record a BULK wine removal from a tank/barrel — the tax-determination event (TTB §A): wine leaves bond with a disposition (taxpaid, export, family use, tasting, testing, distilling material, vinegar, etc.). Use when the user removes bulk volume from a vessel for one of those reasons: 'remove 800 L taxpaid from tank 5', 'pull 20 L for tasting from tank 3'. This is NOT a rack (wine-to-wine) and NOT bottled-goods removal (that's remove_bottled_wine). Admin only. Returns a preview to confirm.",
  kind: "write",
  adminOnly: true,
  inputSchema: {
    type: "object",
    properties: {
      vessel: { type: "string", description: "Vessel to remove from, e.g. 'tank 5' or 'barrel 12'." },
      volumeL: { type: "number", description: "Volume removed, in litres." },
      disposition: { type: "string", enum: [...REMOVAL_DISPOSITIONS], description: "Why it left bond. Defaults to TAXPAID. TASTING/TESTING = used on-site; EXPORT/FAMILY_USE/etc. per TTB §A lines." },
      date: { type: "string", description: "Date of removal, YYYY-MM-DD (optional, defaults to today)." },
      note: { type: "string", description: "Optional note." },
    },
    required: ["vessel", "volumeL"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as RawInput;
    if (!input.vessel || typeof input.vessel !== "string") throw new Error("Which vessel are you removing from?");
    if (typeof input.volumeL !== "number" || !(input.volumeL > 0)) throw new Error("How many litres are you removing? Give a positive volume.");
    const disposition = (input.disposition && isRemovalDisposition(input.disposition) ? input.disposition : "TAXPAID") as RemovalDisposition;

    const v = await resolveVessel(input.vessel);
    if (!v.isActive) throw new Error(`${label(v)} is inactive.`);
    const onHand = totalL(v);
    if (onHand <= 0) throw new Error(`${label(v)} is empty — nothing to remove.`);
    if (input.volumeL > onHand + 0.001) throw new Error(`${label(v)} holds only ${onHand} L — can't remove ${input.volumeL} L.`);

    const when = input.date ? ` on ${input.date}` : "";
    const preview = `${REMOVAL_DISPOSITION_LABELS[disposition]}: remove ${input.volumeL} L from ${label(v)}${when}. (Tax-determination event — reversible via undo.)`;
    const token = signProposal("remove_bulk_wine", {
      vesselId: v.id,
      volumeL: input.volumeL,
      disposition,
      ...(input.date ? { date: input.date } : {}),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      vesselLabel: label(v),
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitRemoveBulkWine: Committer = async (_user, args) => {
  const res = await removeTaxpaidTyped({
    vesselId: String(args.vesselId),
    volumeL: Number(args.volumeL),
    disposition: String(args.disposition) as RemovalDisposition,
    observedAt: args.date ? new Date(String(args.date)) : undefined,
    note: args.note == null ? undefined : String(args.note),
  });
  return { message: res.message };
};
