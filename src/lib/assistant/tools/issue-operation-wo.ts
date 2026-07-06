import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { entityPath } from "../routes";
import { resolveVessel, type ResolvedVessel } from "../scope";
import { instantiateTaskBuilds, type TaskBuild } from "@/lib/work-orders/template-vocabulary";
import { createWorkOrderAction, issueWorkOrderAction } from "@/lib/work-orders/actions";
import { listMaterials, materialDisplayName } from "@/lib/cellar/materials";
import { resolveDoseUnit } from "@/lib/cellar/additions-math";
import { resolveAdditiveFrom } from "./additive-resolve";

// Assistant multi-vessel WO tool — issue ONE work order with one OPERATION task per vessel across a
// list of vessels ("top barrels 1-5", "filter tanks 3, 4 and 7", "add 30 g/hL KMBS to barrels 1-8").
// This is the general sibling of issue_cap_management_wo (which is cap-work-only): the template path
// (create_work_order) clones a fixed template and CANNOT fan out across a vessel selection, which is the
// gap this closes. Wraps the same lifecycle actions (createWorkOrderAction → issueWorkOrderAction) — no
// db_*, no re-implemented op logic; the crew records each task's real op on the floor at completion.
//
// Scope: the single-target, whole-vessel operations. TOPPING/FILTRATION need only a target vessel;
// ADDITION/FINING additionally take a material + planned dose (the exact weigh-out is done on the floor,
// so we only need a valid additive id here). Cap management (punchdown/pumpover/…) has its own tool;
// two-vessel racking doesn't fit a one-task-per-vessel fan-out and is intentionally excluded.

const OPERATIONS = ["TOPPING", "FILTRATION", "ADDITION", "FINING"] as const;
type Operation = (typeof OPERATIONS)[number];
const isOperation = (s: string): s is Operation => (OPERATIONS as readonly string[]).includes(s);
const DOSE_OPS = new Set<Operation>(["ADDITION", "FINING"]);

const DOSE_UNITS = ["g/hL", "g/L", "mg/L", "mL/L", "g", "kg", "mL", "L"] as const;
const OP_VERB: Record<Operation, string> = { TOPPING: "top", FILTRATION: "filter", ADDITION: "dose", FINING: "fine" };
const OP_TITLE: Record<Operation, string> = { TOPPING: "Top", FILTRATION: "Filter", ADDITION: "Addition", FINING: "Fining" };

const normUnit = (u: string): string => (/^ppm$/i.test(u.trim()) ? "mg/L" : u.trim());
const label = (v: Pick<ResolvedVessel, "type" | "code">) => (v.type === "BARREL" ? `Barrel ${v.code}` : `Tank ${v.code}`);

type RawInput = {
  operation?: unknown;
  vessels?: unknown;
  material?: unknown;
  amount?: unknown;
  unit?: unknown;
  fromVessel?: unknown;
  volumeL?: unknown;
  note?: unknown;
  title?: unknown;
  assigneeEmail?: unknown;
  dueDate?: unknown;
};

export const issueOperationWoTool: AssistantTool = {
  name: "issue_operation_wo",
  description:
    "Issue ONE work order that fans out across MULTIPLE vessels — one task per vessel — for a whole-vessel cellar operation: topping, filtration, an addition, or a fining. Use when the user wants a single work order covering several tanks/barrels at once ('top barrels 1 through 5', 'filter tanks 3, 4 and 7', 'add 30 g/hL KMBS to barrels 1-8'). Give the operation and the list of vessels in plain language; for an addition or fining also give the material + dose. This is the tool for multi-vessel selection — NOT create_work_order (that clones a fixed template and can't fan out) and NOT issue_cap_management_wo (that's cap work: punchdown/pumpover/cold-soak). Two-vessel racking is not supported here. Optionally set an assignee email, due date, and title. Does NOT save immediately — returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      operation: { type: "string", enum: [...OPERATIONS], description: "The whole-vessel operation to fan out across the vessels." },
      vessels: {
        type: "array",
        items: { type: "string" },
        description: "The vessels to work, in plain language, e.g. ['barrel 1', 'barrel 2', ...] or ['tank 3', 'tank 7']. One task is created per vessel.",
      },
      material: { type: "string", description: "ADDITION/FINING only: the additive by name/brand (e.g. 'KMBS', 'Fermaid-O', 'bentonite'). Required for addition/fining." },
      amount: { type: "number", description: "ADDITION/FINING only: how much (the number). Required for addition/fining." },
      unit: { type: "string", enum: [...DOSE_UNITS], description: "ADDITION/FINING only: dose unit. A per-volume unit (g/hL, g/L, mg/L, mL/L) is a rate against each vessel's volume; an absolute unit (g, kg, mL, L) is that exact total per vessel. 'ppm' = mg/L." },
      fromVessel: { type: "string", description: "TOPPING only: the topping source vessel (e.g. 'the keg'), applied to every task. Optional — the crew can pick it on the floor." },
      volumeL: { type: "number", description: "TOPPING only: planned top-up volume in litres per vessel (optional)." },
      note: { type: "string", description: "Optional note for the crew, applied to every task." },
      title: { type: "string", description: "Optional work-order title (defaults to a sensible one)." },
      assigneeEmail: { type: "string", description: "Email of the crew member this work order is assigned to (optional)." },
      dueDate: { type: "string", description: "Due date as YYYY-MM-DD (resolve relative dates like 'tomorrow' to a date). Optional." },
    },
    required: ["operation", "vessels"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as RawInput;
    const operation = typeof input.operation === "string" ? input.operation.toUpperCase() : "";
    if (!isOperation(operation)) throw new Error(`Pick an operation: ${OPERATIONS.join(", ")}.`);

    if (!Array.isArray(input.vessels) || input.vessels.length === 0) throw new Error("Which vessels? e.g. 'barrels 1 through 5'.");
    const refs = input.vessels.filter((v): v is string => typeof v === "string" && v.trim() !== "");
    if (refs.length === 0) throw new Error("Which vessels? e.g. 'barrels 1 through 5'.");

    // Resolve + dedupe by vessel id (a repeated vessel shouldn't become two tasks).
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

    const note = typeof input.note === "string" && input.note.trim() ? input.note.trim() : null;
    const assigneeEmail = typeof input.assigneeEmail === "string" && input.assigneeEmail.trim() ? input.assigneeEmail.trim() : null;
    const dueDate = typeof input.dueDate === "string" && input.dueDate.trim() ? input.dueDate.trim() : null;

    // Per-operation extras: TOPPING may carry a shared source vessel + planned volume; ADDITION/FINING
    // need a resolved additive (id) + a planned dose. The exact weigh-out happens on the floor.
    let sharedValues: Record<string, unknown> = {};
    let detail = "";

    if (operation === "TOPPING") {
      const volumeL = typeof input.volumeL === "number" && Number.isFinite(input.volumeL) && input.volumeL > 0 ? input.volumeL : null;
      let fromVesselId: string | null = null;
      if (typeof input.fromVessel === "string" && input.fromVessel.trim()) {
        const src = await resolveVessel(input.fromVessel);
        fromVesselId = src.id;
        detail = ` from ${label(src)}`;
      }
      sharedValues = { ...(fromVesselId ? { fromVesselId } : {}), ...(volumeL != null ? { volumeL } : {}) };
      if (volumeL != null) detail += ` (${volumeL} L each)`;
    } else if (DOSE_OPS.has(operation)) {
      const materialRef = typeof input.material === "string" ? input.material.trim() : "";
      if (!materialRef) throw new Error(`A ${operation === "FINING" ? "fining" : "addition"} needs a material — which product?`);
      const amount = typeof input.amount === "number" && Number.isFinite(input.amount) && input.amount > 0 ? input.amount : null;
      if (amount == null) throw new Error("How much per vessel? Give a positive amount.");
      const unit = normUnit(typeof input.unit === "string" ? input.unit : "");
      if (!resolveDoseUnit(unit)) throw new Error(`Unit must be one of: ${DOSE_UNITS.join(", ")} (or ppm).`);

      // Resolve the additive ADDITIVE-scoped. On ambiguity (a partial name, or true name-duplicates like
      // two "Bentonite" entries) hand back a clickable PICKER that pins by id — a re-drive of THIS tool
      // with the same input — instead of a text "which one?" that dead-loops on identical names. The
      // resume base is the original input; the picker overrides its `material` with "#<id>" on tap.
      const all = await listMaterials();
      const res = resolveAdditiveFrom(all, materialRef, input as Record<string, unknown>);
      if (res.kind === "choice") return res.choice;
      const material = res.row;
      sharedValues = { materialId: material.id, amount, doseUnit: unit };
      detail = ` — ${amount} ${unit} ${materialDisplayName(material)}`;
    }

    const verb = OP_VERB[operation];
    const vesselList = resolved.map((v) => label(v)).join(", ");
    const count = resolved.length;
    const title =
      typeof input.title === "string" && input.title.trim()
        ? input.title.trim()
        : `${OP_TITLE[operation]} — ${count} ${count === 1 ? "vessel" : "vessels"}`;

    const asgClause = assigneeEmail ? `, assigned to ${assigneeEmail}` : "";
    const dueClause = dueDate ? `, due ${dueDate}` : "";
    const preview = `Issue a ${OP_TITLE[operation].toLowerCase()} work order: ${verb} ${vesselList}${detail}${asgClause}${dueClause}. One task per vessel (${count}); the crew records each on the floor.`;

    // Sign the fully-resolved task builds so the committer does no re-resolution (ids are pinned here).
    const tasks: TaskBuild[] = resolved.map((v) => ({
      taskType: operation,
      title: `${OP_TITLE[operation]} — ${label(v)}`,
      values: {
        ...(operation === "TOPPING" ? { toVesselId: v.id } : { vesselId: v.id }),
        ...sharedValues,
        ...(note ? { note } : {}),
      },
    }));

    const token = signProposal("issue_operation_wo", {
      title,
      tasks,
      ...(assigneeEmail ? { assigneeEmail } : {}),
      ...(dueDate ? { dueDate } : {}),
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitIssueOperationWo: Committer = async (_user, args) => {
  const title = String(args.title);
  const assigneeEmail = args.assigneeEmail == null ? null : String(args.assigneeEmail);
  const dueAt = args.dueDate ? new Date(String(args.dueDate)) : null;
  const builds = (Array.isArray(args.tasks) ? args.tasks : []) as TaskBuild[];
  if (builds.length === 0) throw new Error("This work order has no tasks.");

  const tasks = instantiateTaskBuilds(builds);
  const created = await createWorkOrderAction({ title, tasks, assigneeEmail, dueAt });
  await issueWorkOrderAction({ workOrderId: created.workOrderId });

  const asgSuffix = assigneeEmail ? `, assigned to ${assigneeEmail}` : "";
  return {
    message: `Issued work order #${created.number} "${title}" with ${builds.length} ${builds.length === 1 ? "task" : "tasks"}${asgSuffix}.`,
    navigate: { path: entityPath("workOrder", created.workOrderId), label: `#${created.number} ${title}` },
  };
};
