import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { entityPath } from "../routes";
import { resolveVessel, type ResolvedVessel } from "../scope";
import { CAP_KINDS, isCapKind, type CapKind } from "@/lib/cellar/treatments";
import { instantiateTaskBuilds } from "@/lib/work-orders/template-vocabulary";
import { createWorkOrderAction, issueWorkOrderAction } from "@/lib/work-orders/actions";

// Plan 043: the assistant can ISSUE a cap-management work order by chat ("punch down tanks 3, 4, 5 this
// afternoon"). Draft→confirm (D10): run() resolves the vessels + technique and returns a signed proposal;
// the committer creates + issues the WO via the existing (auth + tenant + audit) actions. NOT admin-only —
// issuing WOs is open in the UI (createWorkOrderAction/issueWorkOrderAction use action(), not adminAction);
// approval of the resulting tasks stays admin-gated (canApprove). The completion still writes the real op.

const CAP_LABELS: Record<CapKind, string> = {
  PUMPOVER: "pump-over",
  PUNCHDOWN: "punch-down",
  COLD_SOAK: "cold soak",
  MACERATION: "maceration",
  PULSE_AIR: "pulse-air",
  BATONNAGE: "bâtonnage",
};

function label(v: Pick<ResolvedVessel, "type" | "code">): string {
  return v.type === "BARREL" ? `Barrel ${v.code}` : `Tank ${v.code}`;
}

type IssueInput = { technique?: unknown; vessels?: unknown; durationMin?: unknown; note?: unknown; title?: unknown; assigneeEmail?: unknown };

export const issueCapManagementWoTool: AssistantTool = {
  name: "issue_cap_management_wo",
  description:
    "Issue a cap-management WORK ORDER for a red ferment across one or more tanks — pumpover, punchdown, cold-soak, maceration, or pulse-air. Use when the user wants to ASSIGN cap work to the crew ('punch down tanks 3, 4, 5 this afternoon', 'issue pumpovers for the ferments'). This creates a work order the cellar hand completes on the floor — it does NOT itself log the operation. To record a single cap op you just did, that's a different flow. Refer to tanks in plain language like 'tank 3'. Pass the assignee's email if the user names who should do the work. This does NOT save immediately — it returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      technique: { type: "string", enum: [...CAP_KINDS], description: "The cap-management technique." },
      vessels: {
        type: "array",
        items: { type: "string" },
        description: "The tanks to work, in plain language, e.g. ['tank 3', 'tank 4', 'tank 5']. One task is created per tank.",
      },
      durationMin: { type: "number", description: "Optional duration in minutes (applies to every tank)." },
      note: { type: "string", description: "Optional note for the crew." },
      title: { type: "string", description: "Optional work-order title (defaults to a sensible one)." },
      assigneeEmail: { type: "string", description: "Email of the crew member this work order is assigned to (optional)." },
    },
    required: ["technique", "vessels"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as IssueInput;
    const technique = typeof input.technique === "string" ? input.technique.toUpperCase() : "";
    if (!isCapKind(technique)) {
      throw new Error(`Pick a cap-management technique (${CAP_KINDS.join(", ")}).`);
    }
    if (!Array.isArray(input.vessels) || input.vessels.length === 0) {
      throw new Error("Which tanks? e.g. 'tank 3, tank 4, tank 5'.");
    }
    const refs = input.vessels.filter((v): v is string => typeof v === "string" && v.trim() !== "");
    if (refs.length === 0) throw new Error("Which tanks? e.g. 'tank 3, tank 4, tank 5'.");

    // Resolve + dedupe by vessel id (a repeated tank shouldn't become two tasks).
    const resolved: ResolvedVessel[] = [];
    const seen = new Set<string>();
    for (const ref of refs) {
      const v = await resolveVessel(ref);
      if (!v.isActive) throw new Error(`${label(v)} is inactive.`);
      if (!seen.has(v.id)) {
        seen.add(v.id);
        resolved.push(v);
      }
    }

    const durationMin =
      typeof input.durationMin === "number" && Number.isFinite(input.durationMin) && input.durationMin > 0
        ? Math.round(input.durationMin)
        : null;
    const note = typeof input.note === "string" && input.note.trim() ? input.note.trim() : null;
    const assigneeEmail =
      typeof input.assigneeEmail === "string" && input.assigneeEmail.trim() ? input.assigneeEmail.trim() : null;
    const title =
      typeof input.title === "string" && input.title.trim()
        ? input.title.trim()
        : `${CAP_LABELS[technique].replace(/^\w/, (c) => c.toUpperCase())} — ${resolved.length} ${resolved.length === 1 ? "tank" : "tanks"}`;

    const vesselList = resolved.map((v) => label(v)).join(", ");
    const durClause = durationMin ? ` (${durationMin} min)` : "";
    const asgClause = assigneeEmail ? `, assigned to ${assigneeEmail}` : "";
    const preview = `Issue a cap-management work order: ${CAP_LABELS[technique]} on ${vesselList}${durClause}${asgClause}. One task per tank; the crew records each on the floor.`;

    const token = signProposal("issue_cap_management_wo", {
      technique,
      durationMin,
      note,
      title,
      ...(assigneeEmail ? { assigneeEmail } : {}),
      vessels: resolved.map((v) => ({ id: v.id, label: label(v) })),
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitIssueCapManagementWo: Committer = async (_user, args) => {
  const technique = String(args.technique) as CapKind;
  const durationMin = args.durationMin == null ? undefined : Number(args.durationMin);
  const note = args.note == null ? undefined : String(args.note);
  const title = String(args.title);
  const assigneeEmail = args.assigneeEmail == null ? null : String(args.assigneeEmail);
  const vessels = (Array.isArray(args.vessels) ? args.vessels : []) as { id: string; label: string }[];
  if (vessels.length === 0) throw new Error("This work order has no tanks.");

  const builds = vessels.map((v) => ({
    taskType: "CAP_MGMT",
    title: `Work the cap — ${v.label}`,
    values: {
      vesselId: v.id,
      technique,
      ...(durationMin != null ? { durationMin } : {}),
      ...(note ? { note } : {}),
    },
  }));
  const tasks = instantiateTaskBuilds(builds);

  const created = await createWorkOrderAction({ title, tasks, assigneeEmail });
  await issueWorkOrderAction({ workOrderId: created.workOrderId });

  const asgSuffix = assigneeEmail ? `, assigned to ${assigneeEmail}` : "";
  return {
    message: `Issued work order #${created.number} "${title}" with ${vessels.length} ${vessels.length === 1 ? "task" : "tasks"}${asgSuffix}.`,
    navigate: { path: entityPath("workOrder", created.workOrderId), label: `#${created.number} ${title}` },
  };
};
