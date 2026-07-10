import type { OperationType, WorkOrderTaskKind } from "@prisma/client";
import type { CreateTaskInput } from "@/lib/work-orders/lifecycle";
import { FILTER_MEDIA, RACK_TYPES } from "@/lib/cellar/filtration-vocab";
import { TEMP_UNITS, GAS_TYPES, SO2_METHODS } from "@/lib/cellar/vessel-activity-vocab";
import { DOSE_UNIT_LABELS } from "@/lib/cellar/additions-math";
import { CAP_KINDS } from "@/lib/cellar/cap-vocab";

// Typed field vocabulary for work-order templates (Phase 9 Unit 10). Templates are NEVER free-form: a
// template's spec is a list of tasks, each of a known task TYPE with a fixed set of allowed fields.
// Free-form cells would break the cost/compliance mapping (the roadmap-locked ERP pattern). Validation +
// instantiation are pure (unit-tested); templates.ts persists versioned, clone-on-customize templates.

export type FieldType = "vessel" | "lot" | "material" | "block" | "number" | "text" | "rateBasis" | "select";

export type TaskTypeDef = {
  kind: WorkOrderTaskKind;
  opType?: OperationType;
  observationType?: string;
  /** Phase 9.1: canonical maintenance subtype (A3) for kind === "MAINTENANCE" task types. */
  activityType?: string;
  label: string;
  fields: Record<string, FieldType>;
  /** Phase 9.1 (A7): the allowed option list for each `select` field — validated, never free-form. */
  fieldOptions?: Record<string, readonly string[]>;
  /** Optional one-line explainer shown above the fields on the form (e.g. how a dose rate is applied). */
  hint?: string;
};

// Human-readable labels for the (otherwise camelCase) field keys — so the form reads "Rate", "Vessel",
// "Material" instead of "rateValue", "vesselId", "materialId". Any key without an entry falls back to a
// spaced/capitalized version of the key.
export const FIELD_LABELS: Record<string, string> = {
  fromVesselId: "From vessel",
  toVesselId: "To vessel",
  vesselId: "Vessel",
  lotId: "Lot",
  materialId: "Material",
  blockId: "Block",
  weightKg: "Weight (kg)",
  brixAtPick: "Brix",
  phAtPick: "pH",
  taAtPick: "TA (g/L tartaric)",
  rateValue: "Rate",
  rateBasis: "Rate basis",
  drawL: "Draw (L)",
  lossL: "Loss (L)",
  volumeL: "Volume (L)",
  rackType: "Rack type",
  technique: "Technique",
  durationMin: "Duration (min)",
  filterType: "Filter type",
  micron: "Micron (µm)",
  actualOutputL: "Output volume (L)",
  targetValue: "Target",
  targetUnit: "Target unit",
  achievedValue: "Achieved reading",
  gasType: "Gas",
  so2Method: "SO₂ method",
  amount: "Amount",
  note: "Note",
};

/** Human label for a field key (falls back to a spaced, capitalized form of the raw key). */
export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

// The allowed task types + their fields. v1 covers the cellar core loop (rack/addition/fining/top) plus
// two observation types. Phase 20 (vineyard) reuses the same engine by extending this vocabulary.
export const TASK_VOCABULARY: Record<string, TaskTypeDef> = {
  RACK: {
    kind: "OPERATION",
    opType: "RACK",
    label: "Rack / transfer",
    fields: { fromVesselId: "vessel", toVesselId: "vessel", drawL: "number", lossL: "number", rackType: "select", note: "text" },
    fieldOptions: { rackType: RACK_TYPES },
  },
  ADDITION: {
    kind: "OPERATION",
    opType: "ADDITION",
    label: "Addition",
    // One number (Amount) + one Units dropdown. A per-volume unit (g/hL…) is a rate — the total is computed
    // from the vessel volume (barrels assumed full); an absolute unit (g, kg…) IS the total.
    fields: { vesselId: "vessel", lotId: "lot", materialId: "material", amount: "number", doseUnit: "select", note: "text" },
    fieldOptions: { doseUnit: DOSE_UNIT_LABELS },
    hint: "Amount + Units: a per-volume unit (g/hL, g/L…) doses by rate against the vessel's volume; an absolute unit (g, kg…) adds that exact total.",
  },
  FINING: {
    kind: "OPERATION",
    opType: "FINING",
    label: "Fining",
    fields: { vesselId: "vessel", lotId: "lot", materialId: "material", amount: "number", doseUnit: "select", note: "text" },
    fieldOptions: { doseUnit: DOSE_UNIT_LABELS },
    hint: "Amount + Units: a per-volume unit (g/hL, g/L…) doses by rate against the vessel's volume; an absolute unit (g, kg…) adds that exact total.",
  },
  TOPPING: {
    kind: "OPERATION",
    opType: "TOPPING",
    label: "Topping",
    fields: { fromVesselId: "vessel", toVesselId: "vessel", volumeL: "number", note: "text" },
  },
  FILTRATION: {
    kind: "OPERATION",
    opType: "FILTRATION",
    label: "Filtration",
    // filterType → LotTreatment.medium (controlled, dec 1); actualOutputL → loss = pre − actual (A5).
    // No lotId: filtration is whole-vessel — the loss is proportional across ALL resident lots (filterVesselTx),
    // so a per-lot picker would mislead. The vessel's residents are filtered together.
    fields: { vesselId: "vessel", filterType: "select", micron: "number", actualOutputL: "number", note: "text" },
    fieldOptions: { filterType: FILTER_MEDIA },
  },
  CAP_MGMT: {
    kind: "OPERATION",
    opType: "CAP_MGMT",
    label: "Cap management",
    // Volume-NEUTRAL red-ferment cap work: pumpover / punchdown / cold-soak / maceration / pulse-air.
    // `technique` → CapKind (LotTreatment.kind, a validated string — no DB enum); durationMin is optional.
    // Whole-vessel (one LotTreatment per resident lot), so no lotId picker.
    fields: { vesselId: "vessel", technique: "select", durationMin: "number", note: "text" },
    fieldOptions: { technique: CAP_KINDS },
    hint: "Pick a technique (pumpover, punchdown, …) and optionally how long. Records against every lot in the vessel; no volume change.",
  },
  BRIX: {
    kind: "OBSERVATION",
    observationType: "BRIX",
    label: "Brix reading",
    fields: { vesselId: "vessel", lotId: "lot", note: "text" },
  },
  PANEL: {
    kind: "OBSERVATION",
    observationType: "PANEL",
    label: "Chem panel",
    fields: { vesselId: "vessel", lotId: "lot", note: "text" },
  },
  // ── MAINTENANCE lane (Phase 9.1): lotless, vessel-scoped, no ledger op, no approval gate. ──
  TEMP_SETPOINT: {
    kind: "MAINTENANCE",
    activityType: "TEMP_SETPOINT",
    label: "Temperature setpoint",
    // cold-settle / warm-to-start / cool-to-arrest; achievedValue captures the actual temp at completion (dec 4b).
    fields: { vesselId: "vessel", targetValue: "number", targetUnit: "select", achievedValue: "number", note: "text" },
    fieldOptions: { targetUnit: TEMP_UNITS },
  },
  CLEAN: {
    kind: "MAINTENANCE",
    activityType: "CLEAN",
    label: "Tank / barrel cleaning",
    fields: { vesselId: "vessel", materialId: "material", amount: "number", note: "text" },
  },
  SANITIZE: {
    kind: "MAINTENANCE",
    activityType: "SANITIZE",
    label: "Sanitize",
    fields: { vesselId: "vessel", materialId: "material", amount: "number", note: "text" },
  },
  STEAM: {
    kind: "MAINTENANCE",
    activityType: "STEAM",
    label: "Barrel / tank steaming",
    fields: { vesselId: "vessel", note: "text" },
  },
  GAS: {
    kind: "MAINTENANCE",
    activityType: "GAS",
    label: "Gas / blanket",
    // gasType → event.targetUnit; an optional supply (e.g. dry ice) can be depleted as overhead.
    fields: { vesselId: "vessel", gasType: "select", materialId: "material", amount: "number", note: "text" },
    fieldOptions: { gasType: GAS_TYPES },
  },
  // ── Barrel-maintenance kinds (plan 044): first-class MAINTENANCE categories. Lotless, vessel-scoped,
  // any supply consumed drains as OVERHEAD (WORKORDER-3). ──
  OZONE: {
    kind: "MAINTENANCE",
    activityType: "OZONE",
    label: "Ozone treatment",
    // durationMin → event.targetValue (min); no supply consumed by default (ozone is generated on-site).
    fields: { vesselId: "vessel", durationMin: "number", note: "text" },
    hint: "Sanitize a barrel with ozonated water / ozone gas. Record the contact time (min).",
  },
  SO2: {
    kind: "MAINTENANCE",
    activityType: "SO2",
    label: "SO₂ treatment",
    // so2Method → event.targetUnit; strips/discs consumed can be depleted as overhead (materialId + amount).
    fields: { vesselId: "vessel", so2Method: "select", materialId: "material", amount: "number", note: "text" },
    fieldOptions: { so2Method: SO2_METHODS },
    hint: "Burn a sulfur strip/ring in the barrel, or gas it with SO₂. Optionally record strips/discs used (drains as overhead).",
  },
  WET_STORAGE: {
    kind: "MAINTENANCE",
    activityType: "WET_STORAGE",
    label: "Wet-storage solution change",
    // One reagent per block (materialId + amount → overhead). The default template uses two blocks (KMBS + citric).
    fields: { vesselId: "vessel", materialId: "material", amount: "number", note: "text" },
    hint: "Change/replenish the citric+SO₂ storage solution in a wet-stored empty barrel. Record each reagent drawn (overhead).",
  },
  // ── TRANSFORM lane (plan 035): fruit intake + press. These create/split lots, so their run-time
  // inputs (picks for crush; fractions for press) are lists entered on the execute screen via custom
  // sub-forms — NOT template defaults. The vocabulary `fields` below are the "what" a template can bake
  // in; the picks/fractions/vessels/volumes are captured when the work order is run. ──
  CRUSH: {
    kind: "OPERATION",
    opType: "CRUSH",
    label: "De-stem / crush",
    // Template-settable process defaults only. Harvest picks, destination vessel + measured output
    // volume are entered at run time (crush sub-form on the execute screen).
    fields: { destemmed: "select", crusherOn: "select", crushedPct: "number", mustTempC: "number", pressCycle: "text", note: "text" },
    fieldOptions: { destemmed: ["true", "false"], crusherOn: ["true", "false"] },
    hint: "Harvest picks (with kg), destination and measured output volume are entered when the work order is run.",
  },
  PRESS: {
    kind: "OPERATION",
    opType: "PRESS",
    label: "Press / saignée",
    // op = PRESS | SAIGNEE. The parent lot, source vessel and the fraction cuts are entered at run time
    // (press sub-form on the execute screen).
    fields: { op: "select", pressCycle: "text", note: "text" },
    fieldOptions: { op: ["PRESS", "SAIGNEE"] },
    hint: "The must lot, source vessel and the press fractions (cuts) are entered when the work order is run.",
  },
  // ── VINEYARD lane (plan 039): the "weigh the fruit" stage. A block-targeted observation that writes a
  // HarvestPick (weight + optional Brix/pH/TA) to the block's current-vintage harvest record — NO cellar
  // ledger op, straight to DONE. The target BLOCK + the weigh-in readings are entered at run time via the
  // execute sub-form (like a vessel is for cellar ops), NOT template defaults. This is the minimal Phase-20
  // vineyard-block target seam; Phase 20 extends it to the general block-activity model. ──
  HARVEST_WEIGH_IN: {
    kind: "OBSERVATION",
    observationType: "HARVEST_WEIGH_IN",
    label: "Fruit intake / weigh-in",
    fields: { blockId: "block", weightKg: "number", brixAtPick: "number", phAtPick: "number", taAtPick: "number", note: "text" },
    hint: "The vineyard block and the fruit weight (with optional Brix, pH, TA) are entered when the work order is run. It logs a harvest pick — no cellar ledger op.",
  },
  // ── CHECKLIST lane (plan 034): a free-text, checkable line that does NO inventory work. ──
  NOTE: {
    kind: "NOTE",
    label: "Checklist item / note",
    // The block's TITLE carries the checklist text ("Sweep the crush pad"); `note` is optional detail.
    // No vessel/lot/material — a NOTE never touches the ledger, measurement store, or cost roll-up.
    fields: { note: "text" },
    hint: "A checkable to-do on the work order. It records nothing to inventory, the ledger, or cost.",
  },
};

export type TemplateTaskSpec = {
  taskType: string; // a key of TASK_VOCABULARY
  title: string;
  instructions?: string;
  defaults?: Record<string, unknown>; // default field values (subset of the type's allowed fields)
};

export type TemplateSpec = { tasks: TemplateTaskSpec[] };

export type SpecValidation = { ok: boolean; errors: string[] };

/** Validate a template spec against the vocabulary: known task types, known fields only. Pure. */
export function validateTemplateSpec(spec: TemplateSpec): SpecValidation {
  const errors: string[] = [];
  if (!spec || !Array.isArray(spec.tasks) || spec.tasks.length === 0) {
    return { ok: false, errors: ["A template needs at least one task."] };
  }
  spec.tasks.forEach((t, i) => {
    const def = TASK_VOCABULARY[t.taskType];
    if (!def) {
      errors.push(`Task ${i + 1}: unknown task type "${t.taskType}".`);
      return;
    }
    if (!t.title?.trim()) errors.push(`Task ${i + 1}: a title is required.`);
    for (const [key, value] of Object.entries(t.defaults ?? {})) {
      if (!(key in def.fields)) {
        errors.push(`Task ${i + 1} (${t.taskType}): unknown field "${key}".`);
        continue;
      }
      // A7: a `select` field's value is validated against its options — never free-form.
      if (def.fields[key] === "select" && value != null && value !== "") {
        const options = def.fieldOptions?.[key] ?? [];
        if (!(options as readonly unknown[]).includes(value)) {
          errors.push(`Task ${i + 1} (${t.taskType}): "${String(value)}" is not a valid ${key} (allowed: ${options.join(", ")}).`);
        }
      }
    }
  });
  return { ok: errors.length === 0, errors };
}

/** Canonicalize a spec to ONLY the known shape (Codex/council: the client `spec` is untrusted). Keeps
 * `{ taskType, title, instructions?, defaults }` per task and, within `defaults`, ONLY keys that are in
 * the task type's vocabulary — every other key is stripped. Unknown task types are dropped. Pure; call
 * AFTER validateTemplateSpec so the caller has already surfaced errors, then persist ONLY this object. */
export function canonicalizeTemplateSpec(spec: TemplateSpec): TemplateSpec {
  const tasks: TemplateTaskSpec[] = (spec?.tasks ?? [])
    .filter((t) => t && TASK_VOCABULARY[t.taskType])
    .map((t) => {
      const def = TASK_VOCABULARY[t.taskType];
      const cleanDefaults: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(t.defaults ?? {})) {
        if (key in def.fields && value !== undefined) cleanDefaults[key] = value;
      }
      const out: TemplateTaskSpec = { taskType: t.taskType, title: String(t.title ?? "").trim() };
      if (t.instructions != null && String(t.instructions).trim()) out.instructions = String(t.instructions).trim();
      if (Object.keys(cleanDefaults).length > 0) out.defaults = cleanDefaults;
      return out;
    });
  return { tasks };
}

/** Canonical columns (A6) extracted from a task's payload — mirror the JSON for querying + composite FKs. */
function canonicalColumns(taskType: string, payload: Record<string, unknown>) {
  const s = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    // Transform ops (plan 035): CRUSH mirrors its destVesselId; PRESS mirrors sourceVesselId + the
    // parent lot (parentLotId). Null at issue time — the real vessels/lot are captured at run time.
    sourceVesselId: s(payload.fromVesselId) ?? s(payload.sourceVesselId),
    destVesselId: s(payload.toVesselId) ?? s(payload.vesselId) ?? s(payload.destVesselId),
    lotId: s(payload.lotId) ?? s(payload.parentLotId),
    materialId: s(payload.materialId),
    // Plan 039: the HARVEST_WEIGH_IN block target (a vineyard block). Null at issue; the block is chosen
    // at run time on the execute sub-form, then mirrored here for querying + the composite FK.
    blockId: s(payload.blockId),
  };
}

/**
 * Instantiate a template spec into CreateTaskInput[] (pure). `perTaskOverrides[i]` merges over that
 * task's defaults (the manager fills in vessels/lots/rates at issue). Canonical columns are derived from
 * the merged payload so reservations + the dashboard can query without parsing JSON.
 */
/** A single explicit task to build (used by the new-WO form when it fans out multi-vessel selections +
 * appends extra additions — the flat list the form sends instead of index-keyed spec overrides). */
export type TaskBuild = {
  taskType: string;
  title?: string;
  values: Record<string, unknown>;
  // Phase 9.3: a proposal-local stable key (uuid) minted per TaskBuild. Carried into the created
  // WorkOrderTask's plannedPayload so completion-time dependency refs survive reordering/retries/fanout
  // (Unit 5). NOT part of the freshness fingerprint (the signed payload already HMAC-protects it).
  taskKey?: string;
};

/** Instantiate an explicit flat list of task builds into CreateTaskInput[] (validates each taskType +
 * derives canonical columns). Mirrors instantiateTasksFromSpec's per-task logic. */
export function instantiateTaskBuilds(builds: TaskBuild[]): CreateTaskInput[] {
  return builds.map((b, i) => {
    const def = TASK_VOCABULARY[b.taskType];
    if (!def) throw new Error(`Unknown task type "${b.taskType}".`);
    const payload = { ...b.values, ...(b.taskKey ? { taskKey: b.taskKey } : {}) };
    const canon = canonicalColumns(b.taskType, payload);
    return {
      seq: i + 1,
      kind: def.kind,
      title: b.title?.trim() || def.label,
      opType: def.opType ?? null,
      observationType: def.observationType ?? null,
      activityType: def.activityType ?? null,
      instructions: null,
      sourceVesselId: canon.sourceVesselId,
      destVesselId: canon.destVesselId,
      lotId: canon.lotId,
      materialId: canon.materialId,
      blockId: canon.blockId,
      plannedPayload: payload as CreateTaskInput["plannedPayload"],
    };
  });
}

export function instantiateTasksFromSpec(spec: TemplateSpec, perTaskOverrides?: Record<string, unknown>[]): CreateTaskInput[] {
  return spec.tasks.map((t, i) => {
    const def = TASK_VOCABULARY[t.taskType];
    if (!def) throw new Error(`Unknown task type "${t.taskType}".`);
    const payload = { ...(t.defaults ?? {}), ...(perTaskOverrides?.[i] ?? {}) };
    const canon = canonicalColumns(t.taskType, payload);
    return {
      seq: i + 1,
      kind: def.kind,
      title: t.title,
      opType: def.opType ?? null,
      observationType: def.observationType ?? null,
      activityType: def.activityType ?? null,
      instructions: t.instructions ?? null,
      sourceVesselId: canon.sourceVesselId,
      destVesselId: canon.destVesselId,
      lotId: canon.lotId,
      materialId: canon.materialId,
      blockId: canon.blockId,
      plannedPayload: payload as CreateTaskInput["plannedPayload"],
    };
  });
}
