import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveVesselContents } from "../scope";
import { round2 } from "@/lib/bottling/draw";
import { blendLotsAction } from "@/lib/blend/actions";
import type { BlendLotsInput } from "@/lib/blend/blend-core";

// Assistant-coverage Wave 2 — blend lots by chat. Wraps blendLotsAction → blendLotsCore (no db_*, no
// re-implemented lineage math). Decisions (interview 2026-07-05): SIMPLE by chat (a few single-lot
// sources → one destination), complex (many components / split destinations / blend sources) DEEP-LINKS
// the /blend builder. Destination empty → a NEW blend lot (needs a 2–4 letter tag); destination holds a
// lot → GROW that lot. The confirm card states which, since blends write lineage across parents.

const MAX_COMPONENTS = 4;
type BlendComponent = { vessel?: string; drawL?: number };
type BlendRawInput = { components?: BlendComponent[]; toVessel?: string; tag?: string; note?: string };

function deepLink(why: string): { navigate: { path: string; label: string; auto: boolean }; message: string } {
  return { navigate: { path: "/blend", label: "Open the blend builder", auto: false }, message: `${why} Use the blend builder, where you can pick each source lot + destination.` };
}

export const blendLotsTool: AssistantTool = {
  name: "blend_lots",
  description:
    "Blend wine from several source vessels into a destination ('blend 300 L of the Cab from tank 1 and 300 L of the Merlot from tank 2 into tank 3, tag RES'). Each source must be a single-lot vessel. If the destination is empty it makes a NEW blend lot (give a 2–4 letter tag); if it already holds a lot, it blends INTO that lot. Complex blends (blended sources, many components, splitting across vessels) are handed to the /blend builder. Does NOT save immediately — returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      components: {
        type: "array",
        description: "The source draws. Each { vessel, drawL } — the source vessel and liters to pull.",
        items: { type: "object", properties: { vessel: { type: "string" }, drawL: { type: "number" } } },
      },
      toVessel: { type: "string", description: "Destination vessel, e.g. 'tank 3'." },
      tag: { type: "string", description: "2–4 letter blend tag for a NEW blend lot (e.g. 'RES'). Needed only when the destination is empty." },
      note: { type: "string", description: "Optional note." },
    },
    required: ["components", "toVessel"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as BlendRawInput;
    const raw = Array.isArray(input.components) ? input.components.filter((c) => c && c.vessel && typeof c.drawL === "number" && c.drawL > 0) : [];
    if (raw.length === 0) throw new Error("Give the sources to blend — each a vessel + liters.");
    if (raw.length > MAX_COMPONENTS) return deepLink(`That's ${raw.length} sources.`);
    if (!input.toVessel) throw new Error("Where's the blend going? Give a destination vessel.");

    // Resolve each source: each vessel contributes its one wine (LEDGER-12); an EMPTY source has
    // nothing to give, so that draw goes to the builder rather than being silently dropped.
    const components: { vesselId: string; lotId: string; drawL: number }[] = [];
    const srcLabels: string[] = [];
    for (const c of raw) {
      const sv = await resolveVesselContents(c.vessel as string);
      if (sv.kind !== "single") return deepLink(`${sv.vesselLabel} is empty.`);
      components.push({ vesselId: sv.vesselId, lotId: sv.lot.id, drawL: round2(c.drawL as number) });
      srcLabels.push(`${round2(c.drawL as number)} L of ${sv.lot.code}`);
    }

    // Destination decides NEW vs GROW.
    const dest = await resolveVesselContents(input.toVessel);
    const net = round2(components.reduce((a, c) => a + c.drawL, 0));

    let mode: "NEW_LOT" | "GROW_EXISTING";
    let destClause: string;
    let token: string | undefined;
    if (dest.kind === "empty") {
      mode = "NEW_LOT";
      const tag = (input.tag ?? "").trim();
      if (!/^[A-Za-z]{2,4}$/.test(tag)) throw new Error(`This makes a NEW blend lot in ${dest.vesselLabel} — give a 2–4 letter tag for it (e.g. "RES").`);
      token = tag.toUpperCase();
      destClause = `a new ${token} lot in ${dest.vesselLabel}`;
    } else {
      mode = "GROW_EXISTING";
      destClause = `into lot ${dest.lot.code} (${dest.vesselLabel})`;
    }

    const preview = `Blend ${srcLabels.join(" + ")} → ${destClause} — ${net} L net.`;
    const tok = signProposal("blend_lots", {
      mode,
      components,
      toVesselId: dest.vesselId,
      ...(token ? { token } : {}),
      ...(input.note ? { note: input.note } : {}),
      destClause,
      net,
    });
    return { needsConfirmation: true, preview, token: tok };
  },
};

export const commitBlendLots: Committer = async (_user, args) => {
  const input: BlendLotsInput = {
    mode: args.mode === "GROW_EXISTING" ? "GROW_EXISTING" : "NEW_LOT",
    components: (args.components as { vesselId: string; lotId: string; drawL: number }[]).map((c) => ({ vesselId: c.vesselId, lotId: c.lotId, drawL: Number(c.drawL) })),
    toVesselId: String(args.toVesselId),
    ...(args.token ? { token: String(args.token) } : {}),
    note: args.note == null ? undefined : String(args.note),
  };
  const res = await blendLotsAction(input);
  return { message: res.message };
};
