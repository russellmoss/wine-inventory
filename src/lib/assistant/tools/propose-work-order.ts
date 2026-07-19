import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal, signResume } from "../confirm";
import { entityPath } from "../routes";
import { materialDisplayName } from "@/lib/cellar/materials";
import { listMaterials } from "@/lib/cellar/materials";
import { findScopedBlocks, type ScopedBlock } from "../scope";
import type { AppUser } from "@/lib/access";
import { categoryOf, isDoseableCategory, materialScopeForTask, type MaterialCategory } from "@/lib/cellar/material-taxonomy";
import { createWorkOrderFromBuildsAction, issueWorkOrderAction } from "@/lib/work-orders/actions";
import { unwrap } from "@/lib/action-result";
import type { TaskBuild } from "@/lib/work-orders/template-vocabulary";
import { findEquipmentByName, listEquipment, equipmentKindLabel, type EquipmentRow } from "@/lib/equipment/equipment";
import { listOrgMembers, type OrgMemberRow } from "@/lib/work-orders/data";
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

const PACKAGING_SCOPE = materialScopeForTask({ opType: "BOTTLE" }) ?? [];

/** Plan 055a: pin a chosen PACKAGING material onto one entry of a BOTTLE task's `packaging` array by
 * rewriting that entry to `#id` (mirrors inputForPinnedMaterial for additions). */
function inputForPinnedPackaging(draft: NlWorkOrderDraft, index: number, itemIdx: number, materialId: string): Record<string, unknown> {
  const tasks = draft.intents.map((intent, i): NlWorkOrderIntent => {
    if (i !== index || intent.kind !== "BOTTLE" || !intent.packaging) return intent;
    return { ...intent, packaging: intent.packaging.map((p, k) => (k === itemIdx ? `#${materialId}` : p)) };
  });
  return {
    schemaVersion: NL_WORK_ORDER_SCHEMA_VERSION,
    sourceText: draft.sourceText,
    title: draft.title,
    ...(draft.assigneeEmail ? { assigneeEmail: draft.assigneeEmail } : {}),
    ...(draft.dueDate ? { dueDate: draft.dueDate } : {}),
    tasks,
  };
}

function choiceOption(draft: NlWorkOrderDraft, m: CellarMaterialDTO, resumeInput: Record<string, unknown>) {
  return {
    label: materialDisplayName(m),
    sublabel: [m.kind, m.stockUnit ? `${m.onHand ?? 0} ${m.stockUnit} on hand` : null, `ref ${m.id.replace(/-/g, "").slice(0, 6)}`]
      .filter(Boolean)
      .join(" - "),
    resume: signResume("propose_work_order", resumeInput),
  };
}

async function materialChoiceIfNeeded(draft: NlWorkOrderDraft): Promise<ChoiceRequest | null> {
  const all = await listMaterials();
  for (const [index, intent] of draft.intents.entries()) {
    if (intent.kind === "ADDITION" || intent.kind === "FINING") {
      if (intent.material.trim().startsWith("#")) continue;
      const matches = materialMatches(all, intent.material);
      if (matches.length <= 1) continue;
      const doseable = matches.filter((m) => isDoseableCategory(catOf(m)));
      if (doseable.length <= 1) continue;
      return {
        needsChoice: true,
        prompt: `Which "${intent.material}" do you mean?`,
        options: doseable.slice(0, 25).map((m) => choiceOption(draft, m, inputForPinnedMaterial(draft, index, m.id))),
      };
    }
    // Plan 055a: an ambiguous packaging name on a BOTTLE task → picker (never invent an id).
    if (intent.kind === "BOTTLE" && intent.packaging) {
      for (const [itemIdx, ref] of intent.packaging.entries()) {
        if (ref.trim().startsWith("#")) continue;
        const inScope = materialMatches(all, ref).filter((m) => PACKAGING_SCOPE.includes(catOf(m)));
        if (inScope.length <= 1) continue;
        return {
          needsChoice: true,
          prompt: `Which "${ref}" do you mean?`,
          options: inScope.slice(0, 25).map((m) => choiceOption(draft, m, inputForPinnedPackaging(draft, index, itemIdx, m.id))),
        };
      }
    }
  }
  return null;
}

function inputForPinnedBlock(draft: NlWorkOrderDraft, index: number, block: ScopedBlock): Record<string, unknown> {
  const tasks = draft.intents.map((intent, i): NlWorkOrderIntent => {
    if (i !== index || intent.kind !== "HARVEST_WEIGH_IN") return intent;
    return { ...intent, block: block.label, blockId: block.id };
  });
  return {
    schemaVersion: NL_WORK_ORDER_SCHEMA_VERSION,
    sourceText: draft.sourceText,
    title: draft.title,
    ...(draft.assigneeEmail ? { assigneeEmail: draft.assigneeEmail } : {}),
    ...(draft.dueDate ? { dueDate: draft.dueDate } : {}),
    tasks,
  };
}

/**
 * Resolve the vineyard block named on each HARVEST_WEIGH_IN task to a real VineyardBlock id, so it flows to
 * WorkOrderTask.blockId and prefills the weigh-in execute screen. Runs at the tool layer because the block
 * resolver (findScopedBlocks) needs the AppUser for vineyard-access scoping, which the tenant-context NL
 * core does not have. Mirrors materialChoiceIfNeeded: a unique match is pinned onto the intent in place; an
 * ambiguous name returns a clickable picker (resume re-runs the tool with the chosen block pinned); no match
 * degrades to the existing hint (the block still shows in the summary and is confirmed on the floor).
 */
async function resolveWeighInBlocks(user: AppUser, draft: NlWorkOrderDraft): Promise<ChoiceRequest | null> {
  for (const [index, intent] of draft.intents.entries()) {
    if (intent.kind !== "HARVEST_WEIGH_IN") continue;
    if (!intent.block || intent.block.trim().startsWith("#") || intent.blockId) continue;
    const blocks = await findScopedBlocks(user, { block: intent.block });
    if (blocks.length === 0) continue; // graceful degrade: keep the free-text hint
    if (blocks.length === 1) {
      intent.blockId = blocks[0].id;
      intent.block = blocks[0].label;
      continue;
    }
    return {
      needsChoice: true,
      prompt: `Which block do you mean for "${intent.block}"?`,
      options: blocks.slice(0, 25).map((b) => ({
        label: b.label,
        sublabel: [b.varietyName, b.vineyardName].filter(Boolean).join(" · ") || undefined,
        resume: signResume("propose_work_order", inputForPinnedBlock(draft, index, b)),
      })),
    };
  }
  return null;
}

/** Plan 055 U3: pin a chosen EquipmentAsset onto an EQUIPMENT_SERVICE task (both the display name and the
 * resolved id) for a choice-token resume — mirrors inputForPinnedBlock. */
function inputForPinnedEquipment(draft: NlWorkOrderDraft, index: number, eq: EquipmentRow): Record<string, unknown> {
  const tasks = draft.intents.map((intent, i): NlWorkOrderIntent => {
    if (i !== index || intent.kind !== "EQUIPMENT_SERVICE") return intent;
    return { ...intent, equipment: eq.name, equipmentId: eq.id };
  });
  return {
    schemaVersion: NL_WORK_ORDER_SCHEMA_VERSION,
    sourceText: draft.sourceText,
    title: draft.title,
    ...(draft.assigneeEmail ? { assigneeEmail: draft.assigneeEmail } : {}),
    ...(draft.dueDate ? { dueDate: draft.dueDate } : {}),
    tasks,
  };
}

/**
 * Plan 055 U3: resolve the EquipmentAsset named on each EQUIPMENT_SERVICE task to a real id, so it attaches
 * to the task (via the TaskBuild's equipmentIds) and can have its status transitioned on completion. Runs at
 * the tool layer (findEquipmentByName needs the tenant + the choice token needs signResume). Mirrors
 * materialChoiceIfNeeded: a unique match is pinned onto the intent in place; several → a clickable picker; a
 * name that resolves to nothing throws (an equipment-service task with no equipment has nothing to service).
 */
async function resolveEquipmentForTasks(tenantId: string, draft: NlWorkOrderDraft): Promise<ChoiceRequest | null> {
  for (const [index, intent] of draft.intents.entries()) {
    if (intent.kind !== "EQUIPMENT_SERVICE" || intent.equipmentId) continue;
    const ref = intent.equipment?.trim();
    if (!ref) continue; // canonicalizer already required equipment or equipmentId
    const matches = await findEquipmentByName(tenantId, ref);
    if (matches.length === 0) {
      throw new Error(`No active equipment matches "${ref}". Add it to the equipment registry first, or check the name.`);
    }
    if (matches.length === 1) {
      intent.equipmentId = matches[0].id;
      intent.equipment = matches[0].name;
      continue;
    }
    return {
      needsChoice: true,
      prompt: `Which equipment do you mean for "${ref}"?`,
      options: matches.slice(0, 25).map((e) => ({
        label: e.name,
        sublabel: [equipmentKindLabel(e.kind), e.status ? equipmentKindLabel(e.status) : null].filter(Boolean).join(" · ") || undefined,
        resume: signResume("propose_work_order", inputForPinnedEquipment(draft, index, e)),
      })),
    };
  }
  return null;
}

/** Plan 055 U7: pin a chosen org member onto a task's per-task assignee (name + resolved User id) for a
 * choice-token resume. assignee/assigneeId are NlTaskMeta fields present on every intent kind. */
function inputForPinnedAssignee(draft: NlWorkOrderDraft, index: number, member: OrgMemberRow): Record<string, unknown> {
  const tasks = draft.intents.map((intent, i): NlWorkOrderIntent => (i !== index ? intent : { ...intent, assignee: member.name, assigneeId: member.userId }));
  return {
    schemaVersion: NL_WORK_ORDER_SCHEMA_VERSION,
    sourceText: draft.sourceText,
    title: draft.title,
    ...(draft.assigneeEmail ? { assigneeEmail: draft.assigneeEmail } : {}),
    ...(draft.dueDate ? { dueDate: draft.dueDate } : {}),
    tasks,
  };
}

/** Match org members by name (exact-normalized first, then a two-directional substring). */
function matchMembersByName(members: OrgMemberRow[], ref: string): OrgMemberRow[] {
  const n = norm(ref);
  if (!n) return [];
  const exact = members.filter((m) => norm(m.name) === n);
  if (exact.length) return exact;
  return members.filter((m) => {
    const h = norm(m.name);
    return h && (h.includes(n) || n.includes(h));
  });
}

/**
 * Plan 055 U7: resolve a per-task assignee (name/email) to a User id, so it lands on the task's assigneeId.
 * An exact email match wins; else a fuzzy name match. A unique hit is pinned in place; several → a picker
 * (same signed-choice pattern as materials/equipment); NO match degrades gracefully (the per-task assignee
 * is dropped — the task inherits the order-level assignee — rather than blocking the whole work order).
 */
async function resolveAssigneesForTasks(tenantId: string, draft: NlWorkOrderDraft): Promise<ChoiceRequest | null> {
  let members: OrgMemberRow[] | null = null;
  for (const [index, intent] of draft.intents.entries()) {
    const ref = intent.assignee?.trim();
    if (!ref || intent.assigneeId) continue;
    if (!members) members = await listOrgMembers(tenantId);
    const byEmail = members.filter((m) => m.email && m.email.toLowerCase() === ref.toLowerCase());
    const matches = byEmail.length ? byEmail : matchMembersByName(members, ref);
    if (matches.length === 0) continue; // graceful degrade — inherit the order-level assignee
    if (matches.length === 1) {
      intent.assigneeId = matches[0].userId;
      intent.assignee = matches[0].name;
      continue;
    }
    return {
      needsChoice: true,
      prompt: `Which person do you mean for "${ref}"?`,
      options: matches.slice(0, 25).map((m) => ({
        label: m.name,
        sublabel: m.email || undefined,
        resume: signResume("propose_work_order", inputForPinnedAssignee(draft, index, m)),
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

/**
 * Plan 081 U5 — the preview line for a DRAFT card.
 *
 * The readiness engine has always computed exactly what is missing (`unresolved`) and what is
 * physically refused (`warnings` with severity "blocking"). Until now this tool flattened all of it
 * into a prose sentence and returned the string — and a string is not a card. Now the same data rides
 * a Draft proposal, so it renders, and the preview only has to say WHY the card is not confirmable.
 */
function draftPreviewText(details: ReturnType<typeof proposalDetails>): string {
  const blockers = details.warnings.filter((w) => w.severity === "blocking");
  const n = details.tasks.length;
  const head = `Draft work order "${details.title}"${n ? ` with ${n} task${n === 1 ? "" : "s"}` : ""} — not ready to issue.`;
  if (blockers.length > 0) {
    return `${head} ${blockers.length} blocker${blockers.length === 1 ? "" : "s"} must be resolved first: ${blockers.map((b) => b.message).join(" ")}`;
  }
  const missing = details.unresolved.map((u) => u.label);
  return missing.length > 0
    ? `${head} Still needs: ${missing.join(", ")}.`
    : `${head} Some details are still unresolved.`;
}

export const proposeWorkOrderTool: AssistantTool = {
  name: "propose_work_order",
  description:
    "Author a NEW work order from natural language. Use this when the user wants cellar work assigned as a work order from specific instructions like 'Rack T12 to T15, add 30 ppm SO2, set T12 to 14C, clean and sanitize T15, and pull a panel.' The tool only proposes typed work-order tasks and returns a confirmation card; it never logs ledger operations, never completes tasks, and never creates materials. Supported task kinds: RACK and TOPPING (vessel to vessel); ADDITION/FINING (existing doseable material into a vessel); FILTRATION, CAP_MGMT (punchdown/pumpover), TEMP_SETPOINT; vessel maintenance CLEAN/SANITIZE/STEAM/OZONE/GAS/SO2/WET_STORAGE (any supply is overhead, never dosed into wine; pass `vessel` for a single vessel, or `vesselGroup` for a barrel range/group e.g. 'clean and sanitize B1-B4' which becomes ONE consolidated task across the range (completed all-at-once) — never put a range in `vessel`); the transform placeholders CRUSH/PRESS/HARVEST_WEIGH_IN (run-time inputs — picks, fractions, weights, measured volume — are entered on the execute screen, but CRUSH process defaults ARE settable here: destemmed, crusherOn, crushedPct e.g. 50 for '50% crushed'/'50% rollers on', mustTempC — they prefill the execute crush form; whenever the user names the fruit/lot, pass `block` on the HARVEST_WEIGH_IN and CRUSH tasks — on weigh-in it prefills the block, on crush it names the fruit in the title); PANEL and BRIX observations; SAMPLE_PULL (pull/send a real lab sample on completion, optionally with a lab name and sendNow); group racking BARREL_DOWN (one source tank into a barrel group/range via `toGroup`, e.g. 'barrel down T12 into B101-B110') and RACK_TO_TANK (a barrel group/range back into one tank via `fromGroup`) as ONE reviewable task; BOTTLE (bottle a vessel into a finished SKU with its packaging dry-goods — pass `skuName`, `skuVintage`, an estimated `cases` or `bottles`, and either `packaging` (named dry goods: glass, cork, capsule, labels, case boxes) or `standardPackaging: true` for 'our usual packaging' which copies this SKU's last run; the source vessels, final bottle count, measured ABV and destination are entered on the execute screen); EQUIPMENT_SERVICE (service a press/pump/filter or other EquipmentAsset by name — pass `equipment`, e.g. 'the basket press'; optionally `setStatus` to transition it, e.g. maintenance→available, on completion; the equipment is resolved by name and an ambiguous name shows a picker); and explicit checklist NOTE. `toGroup`/`fromGroup` (group racking) and `vesselGroup` (barrel maintenance) may each be a range ('B101-B110'), a saved group name, or a comma list. Per-task planning: set `assignee` (a name or email; resolved to a real member, ambiguous → picker), `priority` (LOW/NORMAL/HIGH/URGENT), and `groupSeq` on any task — when the user sequences work ('X and then Y', 'do X, followed by Y') put later steps in a higher groupSeq so they run after the earlier group. Floor/facility cleaning (not a vessel or a registered EquipmentAsset) is NOT supported here. Cross-order WO→WO dependencies are set in the visual builder, not here. Do not use rack_wine/add_addition/pull_sample for this when the user says work order or combines multiple planned tasks. CALL THIS TOOL EVEN WHEN THE REQUEST IS INCOMPLETE OR LOOKS WRONG: if a detail is missing (you don't know the assignee's email, a target is unclear) or the operation looks physically questionable, still call it with what you DO have and omit what you don't. The tool returns a DRAFT card that names every unresolved field and every blocker, and that draft cannot be confirmed until they are resolved. Never invent a value to complete the call, and never ask the question in prose instead of calling — a prose question produces no card at all, which is the failure this draft path exists to prevent.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      sourceText: { type: "string", description: "The user's original wording." },
      title: { type: "string", description: "Optional work-order title." },
      assigneeEmail: { type: "string", description: "Optional assignee email. Only pass a real email the user named — NEVER guess or construct one. If the user named a person but you do not know their email, omit this field and call the tool anyway: the card renders as a draft naming the assignee as unresolved, which is correct. An invented email is not." },
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
                "BARREL_DOWN", "RACK_TO_TANK", "BOTTLE", "EQUIPMENT_SERVICE", "NOTE",
              ],
            },
            from: { type: "string", description: "Source vessel for RACK/TOPPING, or source tank for BARREL_DOWN." },
            to: { type: "string", description: "Destination vessel for RACK/TOPPING, or destination tank for RACK_TO_TANK." },
            toGroup: { type: "string", description: "BARREL_DOWN destination barrel group: a range ('B101-B110'), a saved group name, or a comma list." },
            fromGroup: { type: "string", description: "RACK_TO_TANK source barrel group: a range ('B101-B110'), a saved group name, or a comma list." },
            vessel: { type: "string", description: "Single target vessel for an addition, maintenance, filtration, cap work, temperature, or an observation." },
            vesselGroup: { type: "string", description: "Maintenance across MANY barrels (CLEAN/SANITIZE/STEAM/OZONE/GAS/SO2/WET_STORAGE): a range ('B1-B4'), a saved group name, or a comma list. Becomes ONE consolidated maintenance task carrying the range as members (completed all-at-once). Use this instead of `vessel` when the user names a barrel range/group to clean, sanitize, gas, etc." },
            lot: { type: "string" },
            material: { type: "string", description: "Existing material name. Additions must be doseable; maintenance supplies are overhead." },
            amount: { type: "number" },
            unit: { type: "string", enum: [...DOSE_UNITS] },
            solutionPercentKmbs: { type: "number", description: "SO₂ ADDITION ONLY: when the SO₂ is dosed from a KMBS stock solution, the solution strength as the X in 'X% KMBS solution' (e.g. 10 for a 10% KMBS/metabisulfite solution). Lets the execute view compute the litres of solution to pour. Omit for neat-powder additions or non-SO₂ materials." },
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
            destemmed: { type: "boolean", description: "CRUSH process default: whether the fruit is de-stemmed. Prefills the execute crush sub-form." },
            crusherOn: { type: "boolean", description: "CRUSH process default: whether the crusher rollers are engaged. When false the fruit is whole-cluster and crushedPct does not apply." },
            crushedPct: { type: "number", description: "CRUSH process default: 0-100, the percent of fruit passed through the rollers (e.g. 50 for '50% crushed', 50% rollers-on). Only meaningful when crusherOn is not false. Prefills the '% crushed' field; without it the execute form defaults to 100." },
            mustTempC: { type: "number", description: "CRUSH process default: target must temperature in Celsius." },
            sourceVessel: { type: "string", description: "PRESS source vessel, e.g. 'tank 6'. The resolver binds only if it holds exactly one active MUST lot." },
            sourceLot: { type: "string", description: "PRESS source lot. If that lot is split across vessels, the resolver asks which vessel." },
            op: { type: "string", enum: ["PRESS", "SAIGNEE"], description: "PRESS task operation." },
            pressCycle: { type: "string", description: "Optional named press cycle/program for a PRESS task." },
            block: { type: "string", description: "Vineyard block / fruit lot for HARVEST_WEIGH_IN and CRUSH, e.g. 'Russian River Pinot Noir (Block 1)'. Pass this whenever the user names the fruit. On weigh-in it resolves to the real block and prefills the execute screen (an ambiguous name shows a picker); on crush it names the fruit in the task title/instructions so the crew knows which to pull." },
            skuName: { type: "string", description: "BOTTLE: the finished wine's name, e.g. 'Estate Cab'." },
            skuVintage: { type: "number", description: "BOTTLE: the finished wine's vintage year." },
            cases: { type: "number", description: "BOTTLE: estimated cases to bottle (×12 bottles). Sizes the packaging BoM + reservation; the final count is entered on the floor." },
            bottles: { type: "number", description: "BOTTLE: estimated bottle count, if given instead of cases." },
            packaging: { type: "array", items: { type: "string" }, description: "BOTTLE: named packaging dry goods to consume (glass, cork, capsule, front/back labels, case box). Each resolves to a PACKAGING material; ambiguous names show a picker." },
            standardPackaging: { type: "boolean", description: "BOTTLE: use this SKU's usual packaging — copies the packaging bill-of-materials from its most recent bottling run. Use when the user says 'our standard/usual packaging'." },
            equipment: { type: "string", description: "EQUIPMENT_SERVICE: the equipment to service by name, e.g. 'the basket press', 'pump P2'. Resolved to a registered EquipmentAsset; an ambiguous name shows a picker." },
            setStatus: { type: "string", enum: ["available", "in_use", "maintenance", "retired"], description: "EQUIPMENT_SERVICE: optionally set the equipment's status when the service is recorded (on completion), e.g. 'maintenance' or 'available'." },
            assignee: { type: "string", description: "Per-task assignee: a member's name or email. Resolved to a real org member; an ambiguous name shows a picker; no match leaves the task on the order-level assignee." },
            priority: { type: "string", enum: ["LOW", "NORMAL", "HIGH", "URGENT"], description: "Per-task priority. Only set it when the user says so." },
            groupSeq: { type: "number", description: "Per-task sequential group index (0 = first group; tasks with the same index run in parallel). Use for same-work-order ordering: when the user says 'X and then Y' / 'followed by', put the later step in a higher group so it can't complete until the earlier group is done." },
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
    const blockChoice = await resolveWeighInBlocks(ctx.user, draft);
    if (blockChoice) return blockChoice;
    const equipmentChoice = await resolveEquipmentForTasks(tenantId, draft);
    if (equipmentChoice) return equipmentChoice;
    const assigneeChoice = await resolveAssigneesForTasks(tenantId, draft);
    if (assigneeChoice) return assigneeChoice;
    const proposal = await buildNlWorkOrderProposal(draft);
    const details = proposalDetails(proposal);
    if (proposal.status !== "ready") {
      // DRAFT (plan 081 U5). Previously this returned a prose sentence, which the client renders as
      // chat text — so a work order that was one field short produced NO card at all, and the model,
      // knowing that, often skipped the tool and asked in prose instead. `details` already carries
      // `unresolved` (what is missing) and `warnings` (severity blocking / confirmable /
      // completion_check); the client already renders both. NO token is minted, so this cannot commit.
      return { needsConfirmation: true, draft: true as const, preview: draftPreviewText(details), details };
    }
    const token = signProposal("propose_work_order", buildNlWorkOrderCommitArgs(proposal));
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

/**
 * Plan 055 U4 (clean fold): revalidate the signed advisory ids at commit — equipment + per-task assignee can
 * go stale between propose and confirm (archived equipment, a removed member). Both are advisory (never block
 * a create), so a now-invalid id is DROPPED (equipment) / nulled to the order-level assignee, not a hard
 * failure. This never changes the readiness fingerprint (which hashes only {taskType,title,values}), so the
 * builder action's freshness re-check still matches the signed proposal.
 */
async function revalidateSignedIds(tenantId: string, builds: TaskBuild[]): Promise<TaskBuild[]> {
  const needsEquip = builds.some((b) => Array.isArray(b.equipmentIds) && b.equipmentIds.length > 0);
  const needsAssignee = builds.some((b) => !!b.assigneeId);
  if (!needsEquip && !needsAssignee) return builds;
  const [equipment, members] = await Promise.all([
    needsEquip ? listEquipment(tenantId, { activeOnly: true }) : Promise.resolve([] as EquipmentRow[]),
    needsAssignee ? listOrgMembers(tenantId) : Promise.resolve([] as OrgMemberRow[]),
  ]);
  const validEquip = new Set(equipment.map((e) => e.id));
  const validMember = new Set(members.map((m) => m.userId));
  return builds.map((b) => {
    const next: TaskBuild = { ...b };
    if (Array.isArray(next.equipmentIds)) {
      const kept = next.equipmentIds.filter((id) => validEquip.has(id));
      if (kept.length > 0) next.equipmentIds = kept;
      else delete next.equipmentIds;
    }
    if (next.assigneeId && !validMember.has(next.assigneeId)) next.assigneeId = null;
    return next;
  });
}

export const commitProposeWorkOrder: Committer = async (user, rawArgs) => {
  // Hard-reject any non-current schema version (no upconversion). The signed token's 5-min TTL bounds the
  // exposure of an in-flight v1 token; the stale message tells the user to regenerate.
  if (rawArgs.schemaVersion != null && rawArgs.schemaVersion !== NL_WORK_ORDER_SCHEMA_VERSION) {
    throw new Error("This work-order proposal is stale. Regenerate it before confirming.");
  }
  const args = commitArgs(rawArgs);
  if (args.taskBuilds.length === 0) throw new Error("This work-order proposal has no tasks.");
  // Freshness fingerprint + pinned press-source liveness (the builder action re-gates readiness too, but
  // only assertFreshNlWorkOrderProposal checks the pinned press source still holds its MUST lot).
  await assertFreshNlWorkOrderProposal(args);

  // Plan 055 U4 (LOCKED eng decision): commit through the SAME builder action the visual builder uses, so
  // equipment attach (attachTaskEquipmentCore, inside the action) + any WO→WO deps ride ONE deterministic
  // path. equipmentIds/assigneeId ride INSIDE the already-signed taskBuilds (never a new top-level arg), so
  // signed-payload integrity holds. The builder action creates a DRAFT; we then issue it, preserving the
  // existing "draft created, not issued" recovery when issue fails (e.g. a reservation conflict).
  const tenantId = user.activeOrganizationId;
  const taskBuilds = tenantId ? await revalidateSignedIds(tenantId, args.taskBuilds) : args.taskBuilds;
  const taskCount = taskBuilds.length;

  const created = unwrap(await createWorkOrderFromBuildsAction({
    title: args.title,
    assigneeEmail: args.assigneeEmail,
    dueAt: dueAtFromCommitArgs(args),
    taskBuilds,
    readinessFingerprint: args.fingerprint,
  }));

  try {
    const issued = unwrap(await issueWorkOrderAction({ workOrderId: created.workOrderId }));
    const warningSuffix =
      issued.reservationWarnings.length > 0 ? ` Warnings: ${issued.reservationWarnings.join(" ")}` : "";
    return {
      message: `Issued work order #${created.number} "${args.title}" with ${taskCount} task${taskCount === 1 ? "" : "s"}.${warningSuffix}`,
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

