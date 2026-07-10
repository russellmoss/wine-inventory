import type { TaskBuild } from "@/lib/work-orders/template-vocabulary";

// Phase 9.3 Unit 3: bumped 1 -> 2 when the assistant path moved onto the shared readiness engine. The
// committer hard-rejects any non-current version (no silent upconversion); the 5-min token TTL bounds the
// exposure of an in-flight v1 token. Choice/resume token payloads are versioned too.
export const NL_WORK_ORDER_SCHEMA_VERSION = 2;
export const NL_WORK_ORDER_MAX_TASKS = 25;

// Phase 9.3 Unit 4: maintenance kinds that share the {vessel, optional overhead supply} shape.
export type NlMaintenanceKind = "CLEAN" | "SANITIZE" | "STEAM" | "OZONE" | "GAS" | "SO2" | "WET_STORAGE";

export type NlWorkOrderIntent =
  | { kind: "RACK"; from: string; to: string; drawL?: number; lossL?: number; rackType?: string; note?: string }
  | { kind: "TOPPING"; from: string; to: string; volumeL?: number; note?: string }
  | { kind: "ADDITION" | "FINING"; vessel: string; material: string; amount: number; unit: string; note?: string }
  | { kind: "FILTRATION"; vessel: string; filterType?: string; micron?: number; note?: string }
  | { kind: "CAP_MGMT"; vessel: string; technique?: string; durationMin?: number; note?: string }
  | { kind: "TEMP_SETPOINT"; vessel: string; targetValue?: number; targetUnit?: string; note?: string }
  | { kind: NlMaintenanceKind; vessel: string; material?: string; amount?: number; gasType?: string; so2Method?: string; durationMin?: number; note?: string }
  | { kind: "CRUSH"; destVessel?: string; note?: string }
  | { kind: "PRESS"; sourceVessel?: string; sourceLot?: string; destVessel?: string; op?: "PRESS" | "SAIGNEE" | string; pressCycle?: string; note?: string }
  | { kind: "HARVEST_WEIGH_IN"; block?: string; note?: string }
  | { kind: "PANEL"; vessel?: string; lot?: string; panelName?: string; note?: string }
  | { kind: "BRIX"; vessel?: string; lot?: string; note?: string }
  | { kind: "SAMPLE_PULL"; vessel?: string; lot?: string; lab?: string; sendNow?: boolean; note?: string }
  // Phase 9.4a: group rack as ONE task. BARREL_DOWN = one source tank → many barrels; RACK_TO_TANK =
  // many barrels → one tank. `toGroup`/`fromGroup` is a range ("B101-B110"), a saved-group name, or a
  // comma/and list — expanded to a resolved, sorted member set in nl-resolve.
  | { kind: "BARREL_DOWN"; from: string; toGroup: string; drawL?: number; lossL?: number; note?: string }
  | { kind: "RACK_TO_TANK"; fromGroup: string; to: string; lossL?: number; note?: string }
  | { kind: "NOTE"; title: string; note?: string };

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
  "CRUSH", "PRESS", "HARVEST_WEIGH_IN", "PANEL", "BRIX", "SAMPLE_PULL", "NOTE",
]);
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
      intents.push({
        kind: up,
        vessel,
        material,
        amount,
        unit: normalizeDoseUnit(unit),
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
      const vessel = cleanString(raw.vessel) ?? lastRackDestination;
      if (!vessel) throw new Error(`A ${up.toLowerCase()} task needs a vessel.`);
      intents.push({
        kind: up as NlMaintenanceKind,
        vessel,
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
      intents.push({
        kind: "CRUSH",
        ...(cleanString(raw.destVessel) ?? cleanString(raw.toVessel) ?? cleanString(raw.vessel) ? { destVessel: (cleanString(raw.destVessel) ?? cleanString(raw.toVessel) ?? cleanString(raw.vessel))! } : {}),
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
      intents.push({ kind: "HARVEST_WEIGH_IN", ...(cleanString(raw.block) ? { block: cleanString(raw.block)! } : {}), ...(cleanString(raw.note) ? { note: cleanString(raw.note)! } : {}) });
      continue;
    }
    // NOTE (the only remaining SUPPORTED kind).
    const title = cleanString(raw.title);
    if (!title) throw new Error("A note task needs a title.");
    intents.push({ kind: "NOTE", title, ...(cleanString(raw.note) ? { note: cleanString(raw.note)! } : {}) });
  }
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

  const additionRe = /\b(?:add|dose)\s+([0-9]+(?:\.[0-9]+)?)\s*(ppm|mg\/L|g\/hL|g\/L|mL\/L|g|kg|mL|L|oz|lb|fl oz|gal)\s+([a-z0-9 .#-]+?)(?:\s+(?:to|into|in|on)\s+([a-z0-9# -]+?))?(?:,|;|\band\b|$)/gi;
  for (const match of text.matchAll(additionRe)) {
    const amount = Number(match[1]);
    const unit = normalizeDoseUnit(match[2]);
    const material = match[3].replace(/\b(?:and|then|pull|rack)\b.*$/i, "").trim();
    const vessel = match[4]?.trim() || currentVessel;
    if (material && vessel && Number.isFinite(amount)) {
      intents.push({ kind: "ADDITION", vessel, material, amount, unit });
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
