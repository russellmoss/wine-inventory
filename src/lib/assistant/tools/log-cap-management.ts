import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { resolveVessel } from "../scope";
import { capManagementAction } from "@/lib/cellar/actions";
import type { CapManagementInput } from "@/lib/cellar/treatments";

// Assistant-coverage Wave 2 — log a cap-management action on a fermenting vessel (punch-down, pump-over,
// cold soak, maceration). Volume-neutral fermentation work record. Wraps capManagementAction (no db_*).

const vlabel = (v: { type: string; code: string }) => (v.type === "BARREL" ? `Barrel ${v.code}` : `Tank ${v.code}`);
const KINDS = ["PUNCHDOWN", "PUMPOVER", "COLD_SOAK", "MACERATION"] as const;
const KIND_LABEL: Record<string, string> = { PUNCHDOWN: "Punch-down", PUMPOVER: "Pump-over", COLD_SOAK: "Cold soak", MACERATION: "Maceration" };

type CapRawInput = { vessel?: string; kind?: string; durationMin?: number; note?: string };

export const logCapManagementTool: AssistantTool = {
  name: "log_cap_management",
  description:
    "Log a cap-management action on a fermenting vessel — punch-down, pump-over, cold soak, or maceration ('punched down T5', 'pumped over the Syrah tank for 20 minutes'). Volume-neutral. Give the vessel and which action; optionally a duration. Does NOT save immediately — returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      vessel: { type: "string", description: "The fermenting vessel, e.g. 'tank 5'." },
      kind: { type: "string", enum: [...KINDS], description: "PUNCHDOWN, PUMPOVER, COLD_SOAK, or MACERATION." },
      durationMin: { type: "number", description: "Duration in minutes (optional)." },
      note: { type: "string", description: "Optional note." },
    },
    required: ["vessel", "kind"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as CapRawInput;
    if (!input.vessel) throw new Error("Which vessel?");
    const kind = typeof input.kind === "string" ? input.kind.toUpperCase() : "";
    if (!(KINDS as readonly string[]).includes(kind)) throw new Error(`Which cap action? One of: ${KINDS.join(", ")}.`);
    const v = await resolveVessel(input.vessel);
    if (!v.isActive) throw new Error(`${vlabel(v)} is inactive.`);
    const dur = typeof input.durationMin === "number" && input.durationMin > 0 ? input.durationMin : null;

    const preview = `${KIND_LABEL[kind]} on ${vlabel(v)}${dur ? ` (${dur} min)` : ""}.`;
    const token = signProposal("log_cap_management", {
      vesselId: v.id,
      kind,
      ...(dur != null ? { durationMin: dur } : {}),
      ...(input.note ? { note: input.note } : {}),
      label: vlabel(v),
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitLogCapManagement: Committer = async (_user, args) => {
  const input: CapManagementInput = {
    vesselId: String(args.vesselId),
    kind: String(args.kind) as CapManagementInput["kind"],
    durationMin: args.durationMin == null ? null : Number(args.durationMin),
    note: args.note == null ? undefined : String(args.note),
  };
  const res = await capManagementAction(input);
  return { message: res.message };
};
