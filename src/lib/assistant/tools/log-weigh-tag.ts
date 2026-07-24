import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { createWeighTagCore, type WeighTagLineInput } from "@/lib/harvest/weigh-tag-core";
import { listOwnersCore } from "@/lib/owner/data";
import { listGrowersCore } from "@/lib/grower/data";

// Plan 093 Unit 12: issue a WEIGH-TAG from chat — the wet-hands intake path ("took in a truck from Smith
// Ranch, three bins of 400 kg for Vega Wines"). Per-truck tag → per-bin lines. D10 propose→confirm; the
// readback is STRUCTURED per bin (bin · net · grower · owner) so a mis-keyed owner is caught before the
// write. A bin with no owner is NOT blocked — it issues "needs assignment" (the scale never blocks).

const FACILITY = /^(estate|facility|the facility|our own|the winery|winery|us)$/i;

type BinInput = { bin?: string; netKg?: number; grower?: string; owner?: string };
type LogWeighTagInput = { truck?: string; weighmaster?: string; grossKg?: number; tareKg?: number; netKg?: number; bins?: BinInput[] };

function matchOne<T extends { id: string; name: string }>(rows: T[], raw: string): T | "none" | "many" {
  const m = rows.filter((r) => r.name.toLowerCase().includes(raw.toLowerCase()));
  return m.length === 0 ? "none" : m.length > 1 ? "many" : m[0];
}

export const logWeighTagTool: AssistantTool = {
  name: "log_weigh_tag",
  description:
    "Issue a WEIGH-TAG for a truckload of fruit arriving at the crush pad. Use when the user takes in fruit by the truck with bins — 'took in a truck from Smith Ranch, 3 bins of 400 kg for Vega Wines', 'weigh-tag: truck 7, bin 1 500 kg estate, bin 2 300 kg for client Ojai'. A weigh-tag is per-truck (gross/tare/net) with a line per bin (net + optional grower + owner). A bin with no owner still issues (marked 'needs assignment'). This does NOT save immediately — it returns a per-bin preview to confirm. For a single block weigh-in (not a truck of bins), use log_harvest_pick instead.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      truck: { type: "string", description: "Truck / hauler identifier." },
      weighmaster: { type: "string", description: "Who weighed it in." },
      grossKg: { type: "number", description: "Gross scale weight in kg (optional)." },
      tareKg: { type: "number", description: "Tare weight in kg (optional)." },
      netKg: { type: "number", description: "Net weight in kg (optional; else derived downstream)." },
      bins: {
        type: "array",
        description: "One entry per bin on the truck. Each: net weight + optional grower/owner names.",
        items: {
          type: "object",
          properties: {
            bin: { type: "string", description: "Bin / group label, e.g. 'Bin 1'." },
            netKg: { type: "number", description: "The bin's net weight in kg." },
            grower: { type: "string", description: "Grower / farm name (optional)." },
            owner: { type: "string", description: "Owner (custom-crush client) name, or 'estate'/'facility' for the winery's own. Omit to leave it needing assignment." },
          },
        },
      },
    },
    required: ["bins"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as LogWeighTagInput;
    const bins = Array.isArray(input.bins) ? input.bins : [];
    if (bins.length === 0) throw new Error("List at least one bin (net weight, and optionally its grower/owner).");

    const owners = await listOwnersCore();
    const growers = await listGrowersCore();

    const lines: WeighTagLineInput[] = [];
    const readbackLines: string[] = [];
    for (let i = 0; i < bins.length; i++) {
      const b = bins[i];
      const binLabel = b.bin?.trim() || `Bin ${i + 1}`;
      let ownerId: string | null = null;
      let estate = false;
      let ownerLabel = "needs assignment";
      const rawOwner = (b.owner ?? "").trim();
      if (rawOwner) {
        if (FACILITY.test(rawOwner)) { estate = true; ownerLabel = "Estate (facility)"; }
        else {
          const m = matchOne(owners, rawOwner);
          if (m === "none") throw new Error(`No owner matches "${rawOwner}" (bin "${binLabel}"). Add the client in setup, or say 'estate'.`);
          if (m === "many") throw new Error(`"${rawOwner}" matches more than one owner — be more specific (bin "${binLabel}").`);
          ownerId = m.id; ownerLabel = m.name;
        }
      }
      let growerId: string | null = null;
      let growerLabel = "unassigned";
      const rawGrower = (b.grower ?? "").trim();
      if (rawGrower) {
        const m = matchOne(growers, rawGrower);
        if (m === "none") throw new Error(`No grower matches "${rawGrower}" (bin "${binLabel}"). Add the grower in setup first.`);
        if (m === "many") throw new Error(`"${rawGrower}" matches more than one grower — be more specific (bin "${binLabel}").`);
        growerId = m.id; growerLabel = m.name;
      }
      lines.push({ binOrGroup: binLabel, netKg: b.netKg ?? null, ownerId, estate, growerId });
      readbackLines.push(`${binLabel} · ${b.netKg != null ? `${b.netKg} kg` : "—"} · grower ${growerLabel} · owner ${ownerLabel}`);
    }

    const needs = lines.filter((l) => !l.ownerId && !l.estate).length;
    const header = `Weigh-tag${input.truck?.trim() ? ` — truck ${input.truck.trim()}` : ""}${input.netKg != null ? `, net ${input.netKg} kg` : ""}`;
    const preview = `${header}\n${readbackLines.join("\n")}${needs ? `\n(${needs} bin${needs === 1 ? "" : "s"} need an owner assigned)` : ""}`;
    const token = signProposal("log_weigh_tag", {
      truck: input.truck?.trim() ?? null,
      weighmaster: input.weighmaster?.trim() ?? null,
      grossKg: input.grossKg ?? null,
      tareKg: input.tareKg ?? null,
      netKg: input.netKg ?? null,
      lines,
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitLogWeighTag: Committer = async (user, args) => {
  const lines = (Array.isArray(args.lines) ? args.lines : []) as WeighTagLineInput[];
  const res = await createWeighTagCore(
    { actorUserId: user.id, actorEmail: user.email },
    {
      truck: args.truck == null ? null : String(args.truck),
      weighmaster: args.weighmaster == null ? null : String(args.weighmaster),
      grossKg: args.grossKg == null ? null : Number(args.grossKg),
      tareKg: args.tareKg == null ? null : Number(args.tareKg),
      netKg: args.netKg == null ? null : Number(args.netKg),
      lines,
    },
  );
  return { message: `Issued weigh-tag #${res.tagNumber} (${res.lineCount} bin${res.lineCount === 1 ? "" : "s"}${res.needsAssignmentCount ? `, ${res.needsAssignmentCount} need assignment` : ""}).` };
};
