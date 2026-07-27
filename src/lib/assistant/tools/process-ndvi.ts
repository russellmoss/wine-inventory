import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveVineyards } from "../scope";
import { enqueueNdviJobAction } from "@/lib/spatial/actions";

// VI-P2 — process (fetch + compute) a NEW satellite NDVI scene for a vineyard "around a date". WRITE +
// confirmation: it queues a job; the cron sweep selects the clearest Sentinel-2 scene, computes masked NDVI
// once over the estate, and persists per-block statistics (fetching is slow/quota-metered, so it runs off the
// chat turn). To READ already-computed vigour, use query_ndvi_stats.
type RawInput = { vineyard?: string; date?: string };

const s = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** Coerce a date hint to an ISO instant; default to now. Invalid → now (the sweep widens the window anyway). */
function toAroundIso(date?: string): string {
  if (!date) return new Date().toISOString();
  const t = Date.parse(date);
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString();
}

export const processNdviTool: AssistantTool = {
  name: "process_ndvi",
  description:
    "Fetch and compute a NEW satellite NDVI (vine vigour) look for a vineyard around a date — e.g. 'run NDVI for " +
    "Estate Vineyard around June 15' or 'get the latest satellite vigour for the home block'. It queues a job that " +
    "picks the clearest cloud-free Sentinel-2 scene and computes per-block NDVI. This is a WRITE (it spends satellite " +
    "quota) and asks you to confirm. To just READ existing NDVI numbers, use query_ndvi_stats.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      vineyard: { type: "string", description: "Vineyard name (partial match)." },
      date: { type: "string", description: "The target date to look 'around' (ISO 'YYYY-MM-DD'). Optional — defaults to today; the search widens ±7→14→30 days to find a clear scene." },
    },
  },
  async run(ctx, rawInput) {
    const input = (rawInput ?? {}) as RawInput;
    const vineyards = await resolveVineyards(ctx.user, s(input.vineyard));
    if (vineyards.length === 0) return { message: "No matching vineyard you can access." };
    if (vineyards.length > 1) return { message: `That matches ${vineyards.length} vineyards: ${vineyards.map((v) => v.name).join(", ")}. Which one?` };
    const v = vineyards[0];
    const aroundIso = toAroundIso(s(input.date));
    const day = aroundIso.slice(0, 10);
    const preview = `Queue a satellite NDVI look for "${v.name}" around ${day}. I'll pick the clearest Sentinel-2 scene and compute per-block vigour (this uses satellite quota).`;
    const token = signProposal("process_ndvi", { vineyardId: v.id, vineyardName: v.name, aroundIso, day });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitProcessNdvi: Committer = async (_user, args) => {
  const vineyardId = String(args.vineyardId);
  const aroundIso = String(args.aroundIso);
  const res = await enqueueNdviJobAction({ vineyardId, aroundIso }); // throws on failure (the action propagates)
  const name = args.vineyardName ? String(args.vineyardName) : "the vineyard";
  const day = args.day ? String(args.day) : aroundIso.slice(0, 10);
  const note = res.deduped ? " (already queued for that day)" : "";
  return { message: `Queued a satellite NDVI look for "${name}" around ${day}${note}. It'll process on the next satellite sweep; ask for its NDVI stats after.`, navigate: { path: "/vineyards", label: "View vineyards" } };
};
