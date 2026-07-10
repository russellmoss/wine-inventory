import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal, signResume } from "../confirm";
import { entityPath } from "../routes";
import { materialDisplayName } from "@/lib/cellar/materials";
import { listMaterials } from "@/lib/cellar/materials";
import { categoryOf, isDoseableCategory, type MaterialCategory } from "@/lib/cellar/material-taxonomy";
import { createWorkOrderAction, issueWorkOrderAction } from "@/lib/work-orders/actions";
import { instantiateTaskBuilds, type TaskBuild } from "@/lib/work-orders/template-vocabulary";
import {
  buildNlWorkOrderCommitArgs,
  buildNlWorkOrderProposal,
  assertFreshNlWorkOrderProposal,
  dueAtFromCommitArgs,
} from "@/lib/work-orders/nl-resolve";
import {
  canonicalizeNlWorkOrderDraft,
  proposalDetails,
  NL_WORK_ORDER_SCHEMA_VERSION,
  type NlWorkOrderDraft,
  type NlWorkOrderIntent,
  type NlWorkOrderCommitArgs,
} from "@/lib/work-orders/nl-proposal";
import type { CellarMaterialDTO } from "@/lib/cellar/materials-shared";
import type { ChoiceRequest } from "../assistant-events";

const DOSE_UNITS = ["g/hL", "mg/L", "ppm", "g/L", "mL/L", "g", "kg", "mL", "L", "oz", "lb", "fl oz", "gal"] as const;

type RawInput = {
  sourceText?: unknown;
  title?: unknown;
  assigneeEmail?: unknown;
  dueDate?: unknown;
  tasks?: unknown;
  intents?: unknown;
};

function catOf(m: CellarMaterialDTO): MaterialCategory {
  return (m.category ?? categoryOf(m.kind)) as MaterialCategory;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function materialMatches(all: CellarMaterialDTO[], ref: string): CellarMaterialDTO[] {
  const raw = ref.trim();
  if (raw.startsWith("#")) return [];
  const needle = norm(raw);
  const names = (m: CellarMaterialDTO) =>
    [materialDisplayName(m), m.name, m.genericName, m.brandName, m.brand].filter(Boolean).map((x) => norm(String(x)));
  const exact = all.filter((m) => names(m).includes(needle));
  const fuzzy = all.filter((m) => names(m).some((h) => h && (h.includes(needle) || needle.includes(h))));
  return exact.length > 0 ? exact : fuzzy;
}

function inputForPinnedMaterial(draft: NlWorkOrderDraft, index: number, materialId: string): Record<string, unknown> {
  const tasks = draft.intents.map((intent, i): NlWorkOrderIntent => {
    if (i !== index || (intent.kind !== "ADDITION" && intent.kind !== "FINING")) return intent;
    return { ...intent, material: `#${materialId}` };
  });
  return {
    // Version the resume token payload (Unit 3): a picker token minted under an older schema must not
    // resolve against the current resolver. run() rejects a non-current version below.
    schemaVersion: NL_WORK_ORDER_SCHEMA_VERSION,
    sourceText: draft.sourceText,
    title: draft.title,
    ...(draft.assigneeEmail ? { assigneeEmail: draft.assigneeEmail } : {}),
    ...(draft.dueDate ? { dueDate: draft.dueDate } : {}),
    tasks,
  };
}

async function materialChoiceIfNeeded(draft: NlWorkOrderDraft): Promise<ChoiceRequest | null> {
  const all = await listMaterials();
  for (const [index, intent] of draft.intents.entries()) {
    if (intent.kind !== "ADDITION" && intent.kind !== "FINING") continue;
    if (intent.material.trim().startsWith("#")) continue;
    const matches = materialMatches(all, intent.material);
    if (matches.length <= 1) continue;
    const doseable = matches.filter((m) => isDoseableCategory(catOf(m)));
    if (doseable.length <= 1) continue;
    return {
      needsChoice: true,
      prompt: `Which "${intent.material}" do you mean?`,
      options: doseable.slice(0, 25).map((m) => ({
        label: materialDisplayName(m),
        sublabel: [m.kind, m.stockUnit ? `${m.onHand ?? 0} ${m.stockUnit} on hand` : null, `ref ${m.id.replace(/-/g, "").slice(0, 6)}`]
          .filter(Boolean)
          .join(" - "),
        resume: signResume("propose_work_order", inputForPinnedMaterial(draft, index, m.id)),
      })),
    };
  }
  return null;
}

function previewText(proposal: ReturnType<typeof proposalDetails>): string {
  const taskText = proposal.tasks.map((task) => `#${task.seq} ${task.summary}`).join("; ");
  const warningCount = proposal.warnings.length;
  const unknown = proposal.cost.hasUnknownCost ? " Unknown supply cost is flagged." : "";
  return `Create and issue "${proposal.title}" with ${proposal.tasks.length} task${proposal.tasks.length === 1 ? "" : "s"}: ${taskText}.${warningCount ? ` ${warningCount} warning${warningCount === 1 ? "" : "s"} attached.` : ""}${unknown}`;
}

export const proposeWorkOrderTool: AssistantTool = {
  name: "propose_work_order",
  description:
    "Author a NEW work order from natural language. Use this when the user wants cellar work assigned as a work order from specific instructions like 'Rack T12 to T15, add 30 ppm SO2, set T12 to 14C, clean and sanitize T15, and pull a panel.' The tool only proposes typed work-order tasks and returns a confirmation card; it never logs ledger operations, never completes tasks, and never creates materials. Supported task kinds: RACK and TOPPING (vessel to vessel); ADDITION/FINING (existing doseable material into a vessel); FILTRATION, CAP_MGMT (punchdown/pumpover), TEMP_SETPOINT; vessel maintenance CLEAN/SANITIZE/STEAM/OZONE/GAS/SO2/WET_STORAGE (any supply is overhead, never dosed into wine); the transform placeholders CRUSH/PRESS/HARVEST_WEIGH_IN (their real inputs — picks, fractions, weights, destination — are entered on the execute screen); PANEL and BRIX observations; SAMPLE_PULL (pull/send a real lab sample on completion, optionally with a lab name and sendNow); group racking BARREL_DOWN (one source tank into a barrel group/range via `toGroup`, e.g. 'barrel down T12 into B101-B110') and RACK_TO_TANK (a barrel group/range back into one tank via `fromGroup`) as ONE reviewable task; and explicit checklist NOTE. `toGroup`/`fromGroup` may be a range ('B101-B110'), a saved group name, or a comma list. Non-vessel equipment/floor cleaning and bottling are NOT supported here. Do not use rack_wine/add_addition/pull_sample for this when the user says work order or combines multiple planned tasks.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      sourceText: { type: "string", description: "The user's original wording." },
      title: { type: "string", description: "Optional work-order title." },
      assigneeEmail: { type: "string", description: "Optional assignee email. Only pass a real email the user named." },
      dueDate: { type: "string", description: "Optional due date as YYYY-MM-DD. Resolve relative dates deterministically before passing." },
      tasks: {
        type: "array",
        maxItems: 25,
        items: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: [
                "RACK", "TOPPING", "ADDITION", "FINING", "FILTRATION", "CAP_MGMT", "TEMP_SETPOINT",
                "CLEAN", "SANITIZE", "STEAM", "OZONE", "GAS", "SO2", "WET_STORAGE",
                "CRUSH", "PRESS", "HARVEST_WEIGH_IN", "PANEL", "BRIX", "SAMPLE_PULL",
                "BARREL_DOWN", "RACK_TO_TANK", "NOTE",
              ],
            },
            from: { type: "string", description: "Source vessel for RACK/TOPPING, or source tank for BARREL_DOWN." },
            to: { type: "string", description: "Destination vessel for RACK/TOPPING, or destination tank for RACK_TO_TANK." },
            toGroup: { type: "string", description: "BARREL_DOWN destination barrel group: a range ('B101-B110'), a saved group name, or a comma list." },
            fromGroup: { type: "string", description: "RACK_TO_TANK source barrel group: a range ('B101-B110'), a saved group name, or a comma list." },
            vessel: { type: "string", description: "Target vessel for additions, maintenance, filtration, cap work, temperature, or an observation." },
            lot: { type: "string" },
            material: { type: "string", description: "Existing material name. Additions must be doseable; maintenance supplies are overhead." },
            amount: { type: "number" },
            unit: { type: "string", enum: [...DOSE_UNITS] },
            volumeL: { type: "number", description: "Top-up volume for TOPPING." },
            drawL: { type: "number" },
            lossL: { type: "number" },
            rackType: { type: "string" },
            filterType: { type: "string", description: "Filter medium for FILTRATION." },
            micron: { type: "number" },
            technique: { type: "string", description: "Cap-management technique (pumpover, punchdown, …)." },
            durationMin: { type: "number" },
            targetValue: { type: "number", description: "Target temperature for TEMP_SETPOINT (may be negative)." },
            targetUnit: { type: "string", description: "Temperature unit for TEMP_SETPOINT." },
            gasType: { type: "string", description: "Gas for a GAS task." },
            so2Method: { type: "string", description: "Method for an SO2 task." },
            destVessel: { type: "string", description: "Optional crush destination vessel." },
            op: { type: "string", enum: ["PRESS", "SAIGNEE"], description: "PRESS task operation." },
            block: { type: "string", description: "Optional vineyard block hint for HARVEST_WEIGH_IN (confirmed on the floor)." },
            lab: { type: "string", description: "Lab name for a SAMPLE_PULL task." },
            sendNow: { type: "boolean", description: "For SAMPLE_PULL: mark the sample sent to the lab at pull time." },
            panelName: { type: "string" },
            title: { type: "string" },
            note: { type: "string" },
          },
          required: ["kind"],
        },
      },
    },
    required: ["sourceText"],
  },
  async run(ctx, rawInput) {
    const tenantId = ctx.user.activeOrganizationId;
    if (!tenantId) throw new Error("No active winery in context.");
    const raw = (rawInput ?? {}) as RawInput & { schemaVersion?: unknown };
    // Hard-reject a resume/choice token minted under an older schema version — no silent upconversion.
    if (raw.schemaVersion != null && raw.schemaVersion !== NL_WORK_ORDER_SCHEMA_VERSION) {
      return "This work-order proposal is stale. Regenerate it before confirming.";
    }
    const draft = canonicalizeNlWorkOrderDraft(raw);
    const choice = await materialChoiceIfNeeded(draft);
    if (choice) return choice;
    const proposal = await buildNlWorkOrderProposal(draft);
    if (proposal.status !== "ready") {
      const reasons = [...proposal.unresolved.map((u) => u.reason), ...proposal.warnings.filter((w) => w.severity === "blocking").map((w) => w.message)];
      return `I could not make this work order ready to confirm: ${reasons.join(" ") || "the proposal is incomplete."}`;
    }
    const token = signProposal("propose_work_order", buildNlWorkOrderCommitArgs(proposal));
    const details = proposalDetails(proposal);
    return { needsConfirmation: true, preview: previewText(details), token, details };
  },
};

function commitArgs(raw: Record<string, unknown>): NlWorkOrderCommitArgs {
  const taskBuilds = Array.isArray(raw.taskBuilds) ? (raw.taskBuilds as TaskBuild[]) : [];
  return {
    schemaVersion: 2,
    sourceText: String(raw.sourceText ?? ""),
    title: String(raw.title ?? "Natural-language work order"),
    assigneeEmail: raw.assigneeEmail == null ? null : String(raw.assigneeEmail),
    dueDate: raw.dueDate == null ? null : String(raw.dueDate),
    taskBuilds,
    fingerprint: String(raw.fingerprint ?? ""),
  };
}

export const commitProposeWorkOrder: Committer = async (_user, rawArgs) => {
  // Hard-reject any non-current schema version (no upconversion). The signed token's 5-min TTL bounds the
  // exposure of an in-flight v1 token; the stale message tells the user to regenerate.
  if (rawArgs.schemaVersion != null && rawArgs.schemaVersion !== NL_WORK_ORDER_SCHEMA_VERSION) {
    throw new Error("This work-order proposal is stale. Regenerate it before confirming.");
  }
  const args = commitArgs(rawArgs);
  if (args.taskBuilds.length === 0) throw new Error("This work-order proposal has no tasks.");
  await assertFreshNlWorkOrderProposal(args);

  const tasks = instantiateTaskBuilds(args.taskBuilds);
  const created = await createWorkOrderAction({
    title: args.title,
    tasks,
    assigneeEmail: args.assigneeEmail,
    dueAt: dueAtFromCommitArgs(args),
  });

  try {
    const issued = await issueWorkOrderAction({ workOrderId: created.workOrderId });
    const warningSuffix =
      issued.reservationWarnings.length > 0 ? ` Warnings: ${issued.reservationWarnings.join(" ")}` : "";
    return {
      message: `Issued work order #${created.number} "${args.title}" with ${tasks.length} task${tasks.length === 1 ? "" : "s"}.${warningSuffix}`,
      navigate: { path: entityPath("workOrder", created.workOrderId), label: `#${created.number} ${args.title}` },
    };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "Issue failed.";
    return {
      message: `Draft created, not issued: work order #${created.number} "${args.title}". ${reason}`,
      navigate: { path: entityPath("workOrder", created.workOrderId), label: `Draft WO #${created.number}` },
    };
  }
};

