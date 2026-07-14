import type { TaskBuild } from "@/lib/work-orders/template-vocabulary";
import { EQUIPMENT_STATUSES } from "@/lib/equipment/vocab";

// Phase 9.3 Unit 3: bumped 1 -> 2 when the assistant path moved onto the shared readiness engine. The
// committer hard-rejects any non-current version (no silent upconversion); the 5-min token TTL bounds the
// exposure of an in-flight v1 token. Choice/resume token payloads are versioned too.
export const NL_WORK_ORDER_SCHEMA_VERSION = 2;
export const NL_WORK_ORDER_MAX_TASKS = 25;

// Phase 9.3 Unit 4: maintenance kinds that share the {vessel, optional overhead supply} shape.
export type NlMaintenanceKind = "CLEAN" | "SANITIZE" | "STEAM" | "OZONE" | "GAS" | "SO2" | "WET_STORAGE";

// Plan 055 U7/U8/D3: cross-cutting per-task planning fields the assistant can set on ANY task kind —
// per-task assignee (name/email → resolved User id at the tool layer), priority, and a same-WO sequential
// group index. Intersected onto every intent below (a union ∩ TaskMeta distributes the optional fields to
// each member) so the resolver can read them uniformly without a field on all ~18 variants. `assignee` is
// the human ref (name/email); `assigneeId` is the User id pinned by the tool layer (never model-supplied).
export type NlTaskMeta = { assignee?: string; assigneeId?: string; priority?: string; groupSeq?: number };

export type NlWorkOrderIntent = (
  | { kind: "RACK"; from: string; to: string; drawL?: number; lossL?: number; rackType?: string; note?: string }
  | { kind: "TOPPING"; from: string; to: string; volumeL?: number; note?: string }
  | { kind: "ADDITION" | "FINING"; vessel: string; material: string; amount: number; unit: string; solutionPercentKmbs?: number; note?: string }
  | { kind: "FILTRATION"; vessel: string; filterType?: string; micron?: number; note?: string }
  | { kind: "CAP_MGMT"; vessel: string; technique?: string; durationMin?: number; note?: string }
  | { kind: "TEMP_SETPOINT"; vessel: string; targetValue?: number; targetUnit?: string; note?: string }
  // A maintenance task targets EITHER a single `vessel` OR a `vesselGroup` (a range "B1-B4", a saved-group
  // name, or a comma/and list) that fans out to one maintenance task per barrel in nl-resolve — symmetry
  // with BARREL_DOWN/RACK_TO_TANK. Exactly one is set by canonicalizeRawIntents (group wins if both given).
  | { kind: NlMaintenanceKind; vessel?: string; vesselGroup?: string; material?: string; amount?: number; gasType?: string; so2Method?: string; durationMin?: number; note?: string }
  // CRUSH process defaults (destemmed / crusher rollers on-off / % crushed / must temp / press cycle) are
  // template-settable "what" the assistant can bake in; the run-time inputs (picks, destination, measured
  // volume) are still entered on the execute screen. These prefill the crush sub-form via plannedPayload,
  // so e.g. "50% crushed" lands in the % crushed field instead of defaulting to 100.
  // `block` is a free-text lot/vineyard-block label the assistant can name so the crew knows which fruit to
  // pull; CRUSH has no formal block binding (it binds the harvest pick at run time), so this only stamps the
  // task title/instructions.
  | { kind: "CRUSH"; destVessel?: string; block?: string; destemmed?: boolean; crusherOn?: boolean; crushedPct?: number; mustTempC?: number; pressCycle?: string; note?: string }
  | { kind: "PRESS"; sourceVessel?: string; sourceLot?: string; destVessel?: string; op?: "PRESS" | "SAIGNEE" | string; pressCycle?: string; note?: string }
  // Plan 056/055a: author a bottling task WITH its packaging dry-goods BoM. Like CRUSH/PRESS the run-time
  // inputs (source vessels, final bottle count, measured ABV, destination) are floor-entered at execute;
  // authoring captures the SKU + an estimated case/bottle count (sizes the packaging + reservation) + the
  // packaging. `packaging` = named dry goods to resolve individually; `standardPackaging` = "our usual"
  // (copy this SKU's most-recent run's BoM). `vessel` is a display hint for the summary only.
  | { kind: "BOTTLE"; vessel?: string; skuName?: string; skuVintage?: number; cases?: number; bottles?: number; packaging?: string[]; standardPackaging?: boolean; note?: string }
  // `block` is the human label (for the summary); `blockId` is a resolved VineyardBlock id pinned by the
  // tool layer (which has the user for vineyard-access scoping). When blockId is present it flows to
  // WorkOrderTask.blockId and prefills the weigh-in execute screen.
  | { kind: "HARVEST_WEIGH_IN"; block?: string; blockId?: string; note?: string }
  | { kind: "PANEL"; vessel?: string; lot?: string; panelName?: string; note?: string }
  | { kind: "BRIX"; vessel?: string; lot?: string; note?: string }
  | { kind: "SAMPLE_PULL"; vessel?: string; lot?: string; lab?: string; sendNow?: boolean; note?: string }
  // Phase 9.4a: group rack as ONE task. BARREL_DOWN = one source tank → many barrels; RACK_TO_TANK =
  // many barrels → one tank. `toGroup`/`fromGroup` is a range ("B101-B110"), a saved-group name, or a
  // comma/and list — expanded to a resolved, sorted member set in nl-resolve.
  | { kind: "BARREL_DOWN"; from: string; toGroup: string; drawL?: number; lossL?: number; note?: string }
  | { kind: "RACK_TO_TANK"; fromGroup: string; to: string; lossL?: number; note?: string }
  // Plan 055 U3: service an EquipmentAsset (press/pump/filter…). `equipment` is the human ref; `equipmentId`
  // is pinned by the tool layer (findScopedEquipment resolves it; ambiguous → choice token). `setStatus`
  // optionally transitions the attached equipment on COMPLETION (validated against EQUIPMENT_STATUSES).
  | { kind: "EQUIPMENT_SERVICE"; equipment?: string; equipmentId?: string; setStatus?: string; note?: string }
  | { kind: "NOTE"; title: string; note?: string }
) & NlTaskMeta;

// Kinds whose only run-time target/inputs are captured on the execute screen (no propose-time resolution).
export const NL_RUNTIME_KINDS = new Set<NlWorkOrderIntent["kind"]>(["CRUSH", "PRESS", "HARVEST_WEIGH_IN"]);
export const NL_MAINTENANCE_KINDS = new Set<string>(["CLEAN", "SANITIZE", "STEAM", "OZONE", "GAS", "SO2", "WET_STORAGE"]);

export type NlWorkOrderDraft = {
  schemaVersion: 2;
  sourceText: string;
  title: string;
  assigneeEmail: string | null;
  dueDate: string | null;
  intents: NlWorkOrderIntent[];
};

export type ProposalStatus = "ready" | "needs_input" | "blocked";
export type ProposalSeverity = "blocking" | "confirmable" | "completion_check";

export type ProposedTask = {
  seq: number;
  kind: NlWorkOrderIntent["kind"];
  title: string;
  summary: string;
  entities: { role: string; label: string; id?: string }[];
  // Phase 9.4a: a group-rack task's resolved member set, for the ONE-parent-row-expandable-to-members
  // review card. Present only on BARREL_DOWN / RACK_TO_TANK; never fans out into N tasks.
  members?: { id: string; label: string; detail?: string }[];
};

export type UnresolvedItem = {
  key: string;
  label: string;
  reason: string;
  choices?: { label: string; detail?: string; token?: string }[];
};

export type ProposalWarning = {
  severity: ProposalSeverity;
  code: string;
  message: string;
};

export type ProposalCostLine = {
  taskSeq: number;
  materialLabel: string;
  qty: number | null;
  unit: string | null;
  estimatedCost: number | null;
  method: "weighted_average" | "unknown" | "untracked";
  reason?: string;
  // Phase 9.3: cleaning/sanitizing/gas/wet-storage supply drains as OVERHEAD, never wine COGS
  // (WORKORDER-3). Additions/fining capitalize into wine. Defaults to "wine_cogs" when omitted.
  classification?: "wine_cogs" | "overhead";
};

export type ProposalCostSummary = {
  totalKnownCost: number | null;
  hasUnknownCost: boolean;
  currency: string | null;
  lines: ProposalCostLine[];
};

export type ProposalDiffRow = {
  kind: "vessel" | "material" | "lot";
  label: string;
  before: string;
  after: string;
};

export type ProposalDiff = { rows: ProposalDiffRow[] };

export type WorkOrderProposalDetails = {
  schemaVersion: 2;
  sourceText: string;
  title: string;
  assigneeEmail: string | null;
  dueDate: string | null;
  status: ProposalStatus;
  stateReadAt: string;
  tasks: ProposedTask[];
  unresolved: UnresolvedItem[];
  warnings: ProposalWarning[];
  cost: ProposalCostSummary;
  diff: ProposalDiff;
};

export type WorkOrderProposal = WorkOrderProposalDetails & {
  taskBuilds: TaskBuild[];
  fingerprint: string;
};

export type NlWorkOrderCommitArgs = {
  schemaVersion: 2;
  sourceText: string;
  title: string;
  assigneeEmail: string | null;
  dueDate: string | null;
  taskBuilds: TaskBuild[];
  fingerprint: string;
};

type RawIntent = Record<string, unknown>;

const SUPPORTED = new Set([
  "RACK", "TOPPING", "ADDITION", "FINING", "FILTRATION", "CAP_MGMT", "TEMP_SETPOINT",
  "CLEAN", "SANITIZE", "STEAM", "OZONE", "GAS", "SO2", "WET_STORAGE",
  "CRUSH", "PRESS", "HARVEST_WEIGH_IN", "PANEL", "BRIX", "SAMPLE_PULL", "BOTTLE", "EQUIPMENT_SERVICE", "NOTE",
]);

/** Plan 055 U3: match a free-text equipment status ("in use", "Maintenance") to a canonical
 * EQUIPMENT_STATUS, case/space/underscore-insensitive. Returns null when it isn't a known status so the
 * canonicalizer can reject it (never silently drops a status the operator meant to set). */
function matchEquipmentStatus(raw: string): string | null {
  const n = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (EQUIPMENT_STATUSES as readonly string[]).find((s) => s === n) ?? null;
}

/** Plan 055 U7/U8/D3: pull the cross-cutting per-task planning fields off a raw task. Values are carried
 * onto the intent and applied to the TaskBuild in nl-resolve; the actual assignee id resolution + ambiguity
 * picker happen at the tool layer (which has the tenant + signResume). Priority is validated in the resolver
 * (normalizeWorkOrderPriority); here we just carry the trimmed string. groupSeq is a non-negative integer. */
function parseTaskMeta(raw: RawIntent): NlTaskMeta {
  const assignee = cleanString(raw.assignee) ?? cleanString(raw.assigneeName) ?? cleanString(raw.assigneeEmail);
  const assigneeId = cleanString(raw.assigneeId);
  const priority = cleanString(raw.priority);
  const gs = finiteNumber(raw.groupSeq);
  const groupSeq = gs != null && gs >= 0 ? Math.round(gs) : undefined;
  return {
    ...(assignee ? { assignee } : {}),
    ...(assigneeId ? { assigneeId } : {}),
    ...(priority ? { priority } : {}),
    ...(groupSeq != null ? { groupSeq } : {}),
  };
}

/** Parse a possibly-mixed packaging arg: an array of dry-goods names, or a "standard"/"usual" sentinel
 * string. Returns { standard } when the caller signalled the SKU's usual packaging, else the named list. */
function parsePackagingArg(raw: RawIntent): { names: string[]; standard: boolean } {
  const standard = booleanFlag(raw.standardPackaging) === true;
  const p = raw.packaging;
  if (typeof p === "string") {
    const s = p.trim().toLowerCase();
    if (s === "standard" || s === "usual" || s === "default" || s === "our standard" || s === "our usual") return { names: [], standard: true };
    return { names: s ? [p.trim()] : [], standard };
  }
  const names = Array.isArray(p) ? p.map((x) => cleanString(x)).filter((x): x is string => !!x) : [];
  return { names, standard };
}
const DOSE_UNITS = new Set(["g/hL", "mg/L", "ppm", "g/L", "mL/L", "g", "kg", "mL", "L", "oz", "lb", "fl oz", "gal"]);

// Phase 9.4a: group barrel-down / rack-barrels-to-tank is now a first-class SUPPORTED task — ONE
// reviewable WorkOrderTask → ONE balanced RACK LotOperation with many lines (NOT N ops). The 9.3
// premise that "a group RACK is N member ops" was wrong: it's one op with N destination/source lines,
// so the one-op-per-attempt + single-operationId reject model is preserved (see group-rack-core.ts).
/** Map a raw intent kind (+ its fields) to a group-rack direction, or null if it isn't a group rack. */
function groupRackDirection(up: string | undefined, raw: RawIntent): "BARREL_DOWN" | "RACK_TO_TANK" | null {
  if (!up) return null;
  if (up === "BARREL_DOWN" || up === "BARRELDOWN") return "BARREL_DOWN";
  if (up === "RACK_TO_TANK" || up === "RACK_BARRELS_TO_TANK" || up === "RACK_BARREL_TO_TANK" || up === "RACK_BARRELS") return "RACK_TO_TANK";
  if (up === "GROUP_RACK") {
    if (cleanString(raw.fromGroup) || cleanString(raw.sources)) return "RACK_TO_TANK";
    return "BARREL_DOWN"; // default: a group destination
  }
  return null;
}

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Any finite number (temperatures can be negative, e.g. a -2 °C cold-settle setpoint). */
function finiteNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** A 0–100 percentage (the crush % of fruit that passes the rollers). Returns null for out-of-range / NaN. */
function percentNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

/** Parse a tri-state boolean-ish flag (true/false/"true"/"false"/"on"/"off"/"yes"/"no"); null when absent. */
function booleanFlag(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "on" || v === "yes") return true;
    if (v === "false" || v === "off" || v === "no") return false;
  }
  return null;
}

export function normalizeDoseUnit(unit: string): string {
  const trimmed = unit.trim();
  return /^ppm$/i.test(trimmed) ? "mg/L" : trimmed;
}

function titleFromIntents(intents: NlWorkOrderIntent[]): string {
  if (intents.length === 0) return "Natural-language work order";
  const labels = intents.map((i) => (i.kind === "PANEL" ? "panel" : i.kind.toLowerCase()));
  const unique = [...new Set(labels)];
  return `Work order: ${unique.join(" + ")}`;
}

export function canonicalizeNlWorkOrderDraft(raw: unknown): NlWorkOrderDraft {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sourceText = cleanString(obj.sourceText) ?? cleanString(obj.utterance) ?? "";
  const rawTasks = Array.isArray(obj.tasks) ? obj.tasks : Array.isArray(obj.intents) ? obj.intents : null;
  const intents = rawTasks ? canonicalizeRawIntents(rawTasks as RawIntent[]) : parseWorkOrderUtteranceForEval(sourceText);
  if (intents.length > NL_WORK_ORDER_MAX_TASKS) {
    throw new Error(`That is too much for one work order (${intents.length} tasks). Split it into ${NL_WORK_ORDER_MAX_TASKS} tasks or fewer.`);
  }
  const title = cleanString(obj.title) ?? titleFromIntents(intents);
  const assigneeEmail = cleanString(obj.assigneeEmail);
  const dueDate = cleanString(obj.dueDate);
  return { schemaVersion: 2, sourceText, title, assigneeEmail, dueDate, intents };
}

export function canonicalizeRawIntents(tasks: RawIntent[]): NlWorkOrderIntent[] {
  const intents: NlWorkOrderIntent[] = [];
  let lastRackDestination: string | null = null;
  for (const raw of tasks) {
    const kind = cleanString(raw.kind) ?? cleanString(raw.type) ?? cleanString(raw.operation);
    const up = kind?.toUpperCase();
    const groupDir = groupRackDirection(up, raw);
    if (groupDir === "BARREL_DOWN") {
      const from = cleanString(raw.from) ?? cleanString(raw.fromVessel) ?? cleanString(raw.source);
      const toGroup = cleanString(raw.toGroup) ?? cleanString(raw.destinations) ?? cleanString(raw.barrels) ?? cleanString(raw.group) ?? cleanString(raw.to);
      if (!from || !toGroup) throw new Error("A barrel-down needs a source vessel and a barrel group or range (e.g. B101-B110).");
      intents.push({
        kind: "BARREL_DOWN",
        from,
        toGroup,
        ...(positiveNumber(raw.drawL ?? raw.volumeL) != null ? { drawL: positiveNumber(raw.drawL ?? raw.volumeL)! } : {}),
        ...(positiveNumber(raw.lossL) != null ? { lossL: positiveNumber(raw.lossL)! } : {}),
        ...(cleanString(raw.note) ? { note: cleanString(raw.note)! } : {}),
      });
      continue;
    }
    if (groupDir === "RACK_TO_TANK") {
      const fromGroup = cleanString(raw.fromGroup) ?? cleanString(raw.sources) ?? cleanString(raw.barrels) ?? cleanString(raw.group) ?? cleanString(raw.from);
      const to = cleanString(raw.to) ?? cleanString(raw.toVessel);
      if (!fromGroup || !to) throw new Error("Racking barrels to a tank needs a barrel group or range and a destination tank.");
      intents.push({
        kind: "RACK_TO_TANK",
        fromGroup,
        to,
        ...(positiveNumber(raw.lossL) != null ? { lossL: positiveNumber(raw.lossL)! } : {}),
        ...(cleanString(raw.note) ? { note: cleanString(raw.note)! } : {}),
      });
      continue;
    }
    if (!up || !SUPPORTED.has(up)) {
      throw new Error(`Unsupported work-order instruction "${kind ?? "unknown"}".`);
    }
    if (up === "RACK") {
      const from = cleanString(raw.from) ?? cleanString(raw.fromVessel);
      const to = cleanString(raw.to) ?? cleanString(raw.toVessel);
      if (!from || !to) throw new Error("A rack task needs both from and to vessels.");
      const intent: NlWorkOrderIntent = {
        kind: "RACK",
        from,
        to,
        ...(positiveNumber(raw.drawL ?? raw.volumeL) != null ? { drawL: positiveNumber(raw.drawL ?? raw.volumeL)! } : {}),
        ...(positiveNumber(raw.lossL) != null ? { lossL: positiveNumber(raw.lossL)! } : {}),
        ...(cleanString(raw.rackType) ? { rackType: cleanString(raw.rackType)! } : {}),
        ...(cleanString(raw.note) ? { note: cleanString(raw.note)! } : {}),
      };
      intents.push(intent);
      lastRackDestination = to;
      continue;
    }
    if (up === "ADDITION" || up === "FINING") {
      const vessel = cleanString(raw.vessel) ?? cleanString(raw.toVessel) ?? lastRackDestination;
      const material = cleanString(raw.material);
      const amount = positiveNumber(raw.amount);
      const unit = cleanString(raw.unit) ?? cleanString(raw.doseUnit);
      if (!vessel || !material || amount == null || !unit) {
        throw new Error(`${up === "FINING" ? "Fining" : "Addition"} needs a vessel, material, amount, and unit.`);
      }
      if (!DOSE_UNITS.has(unit) && !DOSE_UNITS.has(normalizeDoseUnit(unit))) throw new Error(`Unsupported dose unit "${unit}".`);
      const solutionPercentKmbs = positiveNumber(raw.solutionPercentKmbs);
      intents.push({
        kind: up,
        vessel,
        material,
        amount,
        unit: normalizeDoseUnit(unit),
        ...(solutionPercentKmbs != null ? { solutionPercentKmbs } : {}),
        ...(cleanString(raw.note) ? { note: cleanString(raw.note)! } : {}),
      });
      continue;
    }
    if (up === "PANEL") {
      const vessel = cleanString(raw.vessel) ?? lastRackDestination ?? undefined;
      const lot = cleanString(raw.lot) ?? undefined;
      if (!vessel && !lot) throw new Error("A panel task needs a vessel or lot.");
      intents.push({
        kind: "PANEL",
        ...(vessel ? { vessel } : {}),
        ...(lot ? { lot } : {}),
        ...(cleanString(raw.panelName) ? { panelName: cleanString(raw.panelName)! } : {}),
        ...(cleanString(raw.note) ? { note: cleanString(raw.note)! } : {}),
      });
      continue;
    }
    if (up === "BRIX") {
      const vessel = cleanString(raw.vessel) ?? lastRackDestination ?? undefined;
      const lot = cleanString(raw.lot) ?? undefined;
      if (!vessel && !lot) throw new Error("A Brix reading needs a vessel or lot.");
      intents.push({ kind: "BRIX", ...(vessel ? { vessel } : {}), ...(lot ? { lot } : {}), ...(cleanString(raw.note) ? { note: cleanString(raw.note)! } : {}) });
      continue;
    }
    if (up === "SAMPLE_PULL") {
      const vessel = cleanString(raw.vessel) ?? lastRackDestination ?? undefined;
      const lot = cleanString(raw.lot) ?? undefined;
      if (!vessel && !lot) throw new Error("A sample task needs a vessel or lot.");
      intents.push({
        kind: "SAMPLE_PULL",
        ...(vessel ? { vessel } : {}),
        ...(lot ? { lot } : {}),
        ...(cleanString(raw.lab) ? { lab: cleanString(raw.lab)! } : {}),
        ...(raw.sendNow === true ? { sendNow: true } : {}),
        ...(cleanString(raw.note) ? { note: cleanString(raw.note)! } : {}),
      });
      continue;
    }
    if (up === "TOPPING") {
      const from = cleanString(raw.from) ?? cleanString(raw.fromVessel);
      const to = cleanString(raw.to) ?? cleanString(raw.toVessel);
      if (!from || !to) throw new Error("A topping task needs both a source and a destination vessel.");
      intents.push({
        kind: "TOPPING",
        from,
        to,
        ...(positiveNumber(raw.volumeL) != null ? { volumeL: positiveNumber(raw.volumeL)! } : {}),
        ...(cleanString(raw.note) ? { note: cleanString(raw.note)! } : {}),
      });
      continue;
    }
    if (up === "FILTRATION") {
      const vessel = cleanString(raw.vessel) ?? lastRackDestination;
      if (!vessel) throw new Error("A filtration task needs a vessel.");
      intents.push({
        kind: "FILTRATION",
        vessel,
        ...(cleanString(raw.filterType) ? { filterType: cleanString(raw.filterType)! } : {}),
        ...(positiveNumber(raw.micron) != null ? { micron: positiveNumber(raw.micron)! } : {}),
        ...(cleanString(raw.note) ? { note: cleanString(raw.note)! } : {}),
      });
      continue;
    }
    if (up === "CAP_MGMT") {
      const vessel = cleanString(raw.vessel) ?? lastRackDestination;
      if (!vessel) throw new Error("A cap-management task needs a vessel.");
      intents.push({
        kind: "CAP_MGMT",
        vessel,
        ...(cleanString(raw.technique) ? { technique: cleanString(raw.technique)! } : {}),
        ...(positiveNumber(raw.durationMin) != null ? { durationMin: positiveNumber(raw.durationMin)! } : {}),
        ...(cleanString(raw.note) ? { note: cleanString(raw.note)! } : {}),
      });
      continue;
    }
    if (up === "TEMP_SETPOINT") {
      const vessel = cleanString(raw.vessel) ?? lastRackDestination;
      if (!vessel) throw new Error("A temperature setpoint needs a vessel.");
      intents.push({
        kind: "TEMP_SETPOINT",
        vessel,
        ...(finiteNumber(raw.targetValue) != null ? { targetValue: finiteNumber(raw.targetValue)! } : {}),
        ...(cleanString(raw.targetUnit) ? { targetUnit: cleanString(raw.targetUnit)! } : {}),
        ...(cleanString(raw.note) ? { note: cleanString(raw.note)! } : {}),
      });
      continue;
    }
    if (NL_MAINTENANCE_KINDS.has(up)) {
      // Group/range aliases mirror the barrel-down read; a group fans out to one task per barrel in
      // nl-resolve. A single vessel keeps the lastRackDestination fallback (only when no group is given).
      const vesselGroup = cleanString(raw.vesselGroup) ?? cleanString(raw.group) ?? cleanString(raw.barrels) ?? cleanString(raw.vessels);
      const vessel = cleanString(raw.vessel) ?? (vesselGroup ? null : lastRackDestination);
      if (!vessel && !vesselGroup) throw new Error(`A ${up.toLowerCase()} task needs a vessel, or a barrel group/range (e.g. B1-B4).`);
      intents.push({
        kind: up as NlMaintenanceKind,
        ...(vesselGroup ? { vesselGroup } : { vessel: vessel! }),
        ...(cleanString(raw.material) ? { material: cleanString(raw.material)! } : {}),
        ...(positiveNumber(raw.amount) != null ? { amount: positiveNumber(raw.amount)! } : {}),
        ...(cleanString(raw.gasType) ? { gasType: cleanString(raw.gasType)! } : {}),
        ...(cleanString(raw.so2Method) ? { so2Method: cleanString(raw.so2Method)! } : {}),
        ...(positiveNumber(raw.durationMin) != null ? { durationMin: positiveNumber(raw.durationMin)! } : {}),
        ...(cleanString(raw.note) ? { note: cleanString(raw.note)! } : {}),
      });
      continue;
    }
    if (up === "CRUSH") {
      // Process defaults (destemmed / crusher rollers / % crushed / must temp / press cycle) are optional
      // template "what" the assistant can bake in; they prefill the run-time crush sub-form. `crushedPct`
      // only makes sense when the rollers are ON, so drop it when crusherOn is explicitly false.
      const crusherOn = booleanFlag(raw.crusherOn);
      const crushedPct = percentNumber(raw.crushedPct);
      const destemmed = booleanFlag(raw.destemmed);
      const mustTempC = finiteNumber(raw.mustTempC ?? raw.mustTemp);
      intents.push({
        kind: "CRUSH",
        ...(cleanString(raw.destVessel) ?? cleanString(raw.toVessel) ?? cleanString(raw.vessel) ? { destVessel: (cleanString(raw.destVessel) ?? cleanString(raw.toVessel) ?? cleanString(raw.vessel))! } : {}),
        ...(cleanString(raw.block) ? { block: cleanString(raw.block)! } : {}),
        ...(destemmed != null ? { destemmed } : {}),
        ...(crusherOn != null ? { crusherOn } : {}),
        ...(crushedPct != null && crusherOn !== false ? { crushedPct } : {}),
        ...(mustTempC != null ? { mustTempC } : {}),
        ...(cleanString(raw.pressCycle) ? { pressCycle: cleanString(raw.pressCycle)! } : {}),
        ...(cleanString(raw.note) ? { note: cleanString(raw.note)! } : {}),
      });
      continue;
    }
    if (up === "PRESS") {
      const op = cleanString(raw.op);
      intents.push({
        kind: "PRESS",
        ...(cleanString(raw.sourceVessel) ?? cleanString(raw.fromVessel) ?? cleanString(raw.vessel) ? { sourceVessel: (cleanString(raw.sourceVessel) ?? cleanString(raw.fromVessel) ?? cleanString(raw.vessel))! } : {}),
        ...(cleanString(raw.sourceLot) ?? cleanString(raw.lot) ? { sourceLot: (cleanString(raw.sourceLot) ?? cleanString(raw.lot))! } : {}),
        ...(cleanString(raw.destVessel) ?? cleanString(raw.toVessel) ? { destVessel: (cleanString(raw.destVessel) ?? cleanString(raw.toVessel))! } : {}),
        ...(op ? { op } : {}),
        ...(cleanString(raw.pressCycle) ? { pressCycle: cleanString(raw.pressCycle)! } : {}),
        ...(cleanString(raw.note) ? { note: cleanString(raw.note)! } : {}),
      });
      continue;
    }
    if (up === "HARVEST_WEIGH_IN") {
      intents.push({
        kind: "HARVEST_WEIGH_IN",
        ...(cleanString(raw.block) ? { block: cleanString(raw.block)! } : {}),
        // blockId is pinned by the tool layer (propose-work-order.ts) after vineyard-access-scoped
        // resolution; it is never something the model supplies.
        ...(cleanString(raw.blockId) ? { blockId: cleanString(raw.blockId)! } : {}),
        ...(cleanString(raw.note) ? { note: cleanString(raw.note)! } : {}),
      });
      continue;
    }
    if (up === "BOTTLE") {
      // Authoring only — all optional. skuName/vintage prefill the run-time bottling sub-form; cases/bottles
      // size the packaging BoM + reservation; packaging names / standard flag drive the BoM resolution.
      const { names, standard } = parsePackagingArg(raw);
      const skuVintage = finiteNumber(raw.skuVintage ?? raw.vintage);
      const cases = positiveNumber(raw.cases);
      const bottles = positiveNumber(raw.bottles ?? raw.bottlesProduced);
      intents.push({
        kind: "BOTTLE",
        ...(cleanString(raw.vessel) ?? cleanString(raw.from) ?? cleanString(raw.sourceVessel) ? { vessel: (cleanString(raw.vessel) ?? cleanString(raw.from) ?? cleanString(raw.sourceVessel))! } : {}),
        ...(cleanString(raw.skuName) ?? cleanString(raw.wine) ?? cleanString(raw.sku) ? { skuName: (cleanString(raw.skuName) ?? cleanString(raw.wine) ?? cleanString(raw.sku))! } : {}),
        ...(skuVintage != null ? { skuVintage } : {}),
        ...(cases != null ? { cases } : {}),
        ...(bottles != null ? { bottles } : {}),
        ...(names.length ? { packaging: names } : {}),
        ...(standard ? { standardPackaging: true } : {}),
        ...(cleanString(raw.note) ? { note: cleanString(raw.note)! } : {}),
      });
      continue;
    }
    if (up === "EQUIPMENT_SERVICE") {
      // Author-only: the equipment is resolved to an id at the tool layer (findScopedEquipment); an ambiguous
      // name returns a choice picker. `equipmentId` is pinned there (or by a choice resume) and is never
      // supplied by the model directly. setStatus is validated against the controlled EQUIPMENT_STATUSES.
      const equipment = cleanString(raw.equipment) ?? cleanString(raw.equipmentName) ?? cleanString(raw.asset);
      const equipmentId = cleanString(raw.equipmentId);
      if (!equipment && !equipmentId) {
        throw new Error("An equipment-service task needs the equipment to service (e.g. \"the basket press\").");
      }
      const setStatusRaw = cleanString(raw.setStatus) ?? cleanString(raw.status);
      let setStatus: string | undefined;
      if (setStatusRaw) {
        const matched = matchEquipmentStatus(setStatusRaw);
        if (!matched) throw new Error(`"${setStatusRaw}" is not a valid equipment status (allowed: ${EQUIPMENT_STATUSES.join(", ")}).`);
        setStatus = matched;
      }
      intents.push({
        kind: "EQUIPMENT_SERVICE",
        ...(equipment ? { equipment } : {}),
        ...(equipmentId ? { equipmentId } : {}),
        ...(setStatus ? { setStatus } : {}),
        ...(cleanString(raw.note) ? { note: cleanString(raw.note)! } : {}),
      });
      continue;
    }
    // NOTE (the only remaining SUPPORTED kind).
    const title = cleanString(raw.title);
    if (!title) throw new Error("A note task needs a title.");
    intents.push({ kind: "NOTE", title, ...(cleanString(raw.note) ? { note: cleanString(raw.note)! } : {}) });
  }
  // Plan 055 U7/U8/D3: apply the cross-cutting per-task planning fields. Each raw task maps 1:1 (in order)
  // to the intent pushed for it, so a positional merge is exact. Only present fields are set (merge, never
  // wipe) so a resume that re-emits the same tasks preserves assignee AND priority AND groupSeq.
  intents.forEach((intent, i) => Object.assign(intent, parseTaskMeta(tasks[i])));
  return intents;
}

export function parseWorkOrderUtteranceForEval(sourceText: string): NlWorkOrderIntent[] {
  const text = sourceText.trim();
  const intents: NlWorkOrderIntent[] = [];
  let currentVessel: string | null = null;

  // Phase 9.4a: group phrases ("barrel down …", "rack barrels …") are handled below as one group-rack
  // intent — don't let the generic single-vessel rack matcher swallow them first.
  const isGroupRackPhrase = /\bbarrel[\s-]*down\b/i.test(text) || /\brack\s+barrels?\b/i.test(text);
  const rack = isGroupRackPhrase ? null : text.match(/\brack\s+([a-z0-9# -]+?)\s+(?:to|into)\s+([a-z0-9# -]+?)(?:,|;|\band\b|$)/i);
  if (rack) {
    const from = rack[1].trim();
    const to = rack[2].trim();
    intents.push({ kind: "RACK", from, to });
    currentVessel = to;
  }

  // "as a 10% KMBS solution" / "10% metabisulfite solution" → the stock solution strength to dose from.
  // Capture it, then strip the clause so it doesn't sit between the material and "to <vessel>" and
  // break the addition match below.
  const solutionClauseRe = /\b(?:as\s+(?:a\s+)?)?([0-9]+(?:\.[0-9]+)?)\s*%\s*(?:kmbs|k?ms\b|metabisulf[ai]te|sulfite)\s*(?:solution|stock)?/i;
  const solutionMatch = text.match(solutionClauseRe);
  const solutionPercentKmbs = solutionMatch ? Number(solutionMatch[1]) : undefined;
  const additionText = text.replace(solutionClauseRe, " ");
  const additionRe = /\b(?:add|dose)\s+([0-9]+(?:\.[0-9]+)?)\s*(ppm|mg\/L|g\/hL|g\/L|mL\/L|g|kg|mL|L|oz|lb|fl oz|gal)\s+([a-z0-9 .#-]+?)(?:\s+(?:to|into|in|on)\s+([a-z0-9# -]+?))?(?:,|;|\band\b|$)/gi;
  for (const match of additionText.matchAll(additionRe)) {
    const amount = Number(match[1]);
    const unit = normalizeDoseUnit(match[2]);
    const material = match[3].replace(/\b(?:and|then|pull|rack)\b.*$/i, "").trim();
    const vessel = match[4]?.trim() || currentVessel;
    if (material && vessel && Number.isFinite(amount)) {
      intents.push({ kind: "ADDITION", vessel, material, amount, unit, ...(solutionPercentKmbs != null && Number.isFinite(solutionPercentKmbs) ? { solutionPercentKmbs } : {}) });
    }
  }

  const panel = text.match(/\b(?:pull|draw|take)\s+(?:a\s+)?(?:juice\s+|chem\s+|lab\s+)?panel(?:\s+(?:on|from)\s+([a-z0-9# -]+))?/i);
  if (panel) {
    const vessel = panel[1]?.trim() || currentVessel || undefined;
    if (vessel) intents.push({ kind: "PANEL", vessel, panelName: /juice/i.test(panel[0]) ? "juice panel" : "chem panel" });
  }

  if (/\bblend\b/i.test(text)) {
    throw new Error("Blend authoring is not in scope for natural-language work orders yet.");
  }
  // Phase 9.4a: barrel-down / rack-barrels-to-tank parse to a single group-rack intent.
  const barrelDown = text.match(/\bbarrel[\s-]*down\s+(.+?)\s+(?:in ?to|to)\s+(.+?)(?:[,;.]|$)/i);
  if (barrelDown) {
    intents.push({ kind: "BARREL_DOWN", from: barrelDown[1].trim(), toGroup: barrelDown[2].trim() });
  }
  const rackBarrels = text.match(/\brack\s+barrels?\s+(.+?)\s+(?:back\s+)?(?:in ?to|to)\s+(.+?)(?:[,;.]|$)/i);
  if (rackBarrels) {
    intents.push({ kind: "RACK_TO_TANK", fromGroup: rackBarrels[1].trim(), to: rackBarrels[2].trim() });
  }

  // Plan 055a: "bottle T6 into 500 cases of the 2024 Estate Cab [with our standard packaging]".
  const bottle = text.match(/\bbottle\s+([a-z0-9# -]+?)\s+into\s+(?:([0-9]+)\s*cases?\s+of\s+)?(?:the\s+)?(?:([0-9]{4})\s+)?(.+?)(?:\s+with\s+(.+?))?(?:[,;.]|$)/i);
  if (bottle) {
    const cases = bottle[2] ? Number(bottle[2]) : undefined;
    const skuVintage = bottle[3] ? Number(bottle[3]) : undefined;
    const skuName = bottle[4]?.replace(/\bwith\b.*$/i, "").trim() || undefined;
    const pkgPhrase = bottle[5]?.trim().toLowerCase() ?? "";
    const standardPackaging = /\b(standard|usual|our)\b/.test(pkgPhrase) || undefined;
    intents.push({
      kind: "BOTTLE",
      vessel: bottle[1].trim(),
      ...(skuName ? { skuName } : {}),
      ...(skuVintage ? { skuVintage } : {}),
      ...(cases ? { cases } : {}),
      ...(standardPackaging ? { standardPackaging: true } : {}),
    });
  }

  const press = text.match(/\bpress\s+([a-z0-9# -]+?)(?:\s+(?:to|into)\s+([a-z0-9# -]+?))?(?:,|;|\band\b|$)/i);
  if (press) {
    intents.push({
      kind: "PRESS",
      sourceVessel: press[1].trim(),
      ...(press[2]?.trim() ? { destVessel: press[2].trim() } : {}),
      op: "PRESS",
    });
  }

  return intents;
}

export function proposalDetails(proposal: WorkOrderProposal): WorkOrderProposalDetails {
  const details: WorkOrderProposalDetails = {
    schemaVersion: proposal.schemaVersion,
    sourceText: proposal.sourceText,
    title: proposal.title,
    assigneeEmail: proposal.assigneeEmail,
    dueDate: proposal.dueDate,
    status: proposal.status,
    stateReadAt: proposal.stateReadAt,
    tasks: proposal.tasks,
    unresolved: proposal.unresolved,
    warnings: proposal.warnings,
    cost: proposal.cost,
    diff: proposal.diff,
  };
  return details;
}
