import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveLotTarget } from "../scope";
import { isSparklingEnabled } from "@/lib/settings/data";
import { riddlingAction } from "@/lib/sparkling/actions";
import type { RiddlingInput, RiddlingMethod } from "@/lib/sparkling/riddling-core";

// Wave 3 (sparkling) — log RIDDLING (remuage) on an en-tirage lot: settling the lees to the neck before
// disgorgement. Wraps riddlingAction → riddlingCore (a neutral CAP_MGMT-family op + a method treatment,
// stage → RIDDLING). Gated behind sparklingEnabled.

const SPARKLING_OFF = "The sparkling program is off — enable it in Settings to record sparkling operations.";
type RawInput = { lot?: string; method?: string; durationMin?: number; note?: string };

export const logRiddlingTool: AssistantTool = {
  name: "log_riddling",
  description:
    "Log RIDDLING (remuage) on an en-tirage sparkling lot — working the lees down to the neck before disgorgement. Use for 'riddled lot 24-BdB on the gyropalette', 'log 30 min riddling on lot 24-BdB'. The lot must be en tirage. The sparkling program must be enabled. Returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      lot: { type: "string", description: "En-tirage lot code, e.g. '24-BdB'." },
      method: { type: "string", enum: ["pupitre", "gyropalette"], description: "Riddling method. Default pupitre (hand riddling rack); gyropalette = automated." },
      durationMin: { type: "number", description: "Optional cumulative riddling time in minutes." },
      note: { type: "string", description: "Optional note." },
    },
    required: ["lot"],
  },
  async run(_ctx, rawInput) {
    if (!(await isSparklingEnabled())) throw new Error(SPARKLING_OFF);
    const input = (rawInput ?? {}) as RawInput;
    if (!input.lot || typeof input.lot !== "string") throw new Error("Which en-tirage lot?");
    const { lotId, lotCode } = await resolveLotTarget({ lot: input.lot });
    const method = (input.method === "gyropalette" ? "gyropalette" : "pupitre") as RiddlingMethod;
    const preview = `Log riddling on lot ${lotCode} (${method}${input.durationMin ? `, ${input.durationMin} min` : ""}).`;
    const token = signProposal("log_riddling", {
      lotId,
      lotCode,
      method,
      ...(input.durationMin != null ? { durationMin: input.durationMin } : {}),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitLogRiddling: Committer = async (_user, args) => {
  const input: RiddlingInput = {
    lotId: String(args.lotId),
    method: String(args.method) as RiddlingMethod,
    durationMin: args.durationMin == null ? undefined : Number(args.durationMin),
    note: args.note == null ? undefined : String(args.note),
  };
  await riddlingAction(input);
  return { message: `Logged riddling on lot ${String(args.lotCode ?? "")}.` };
};
