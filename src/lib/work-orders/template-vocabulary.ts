import type { OperationType, WorkOrderTaskKind } from "@prisma/client";
import type { CreateTaskInput } from "@/lib/work-orders/lifecycle";
import { FILTER_MEDIA, RACK_TYPES } from "@/lib/cellar/filtration-vocab";
import { TEMP_UNITS, GAS_TYPES } from "@/lib/cellar/vessel-activity-vocab";

// Typed field vocabulary for work-order templates (Phase 9 Unit 10). Templates are NEVER free-form: a
// template's spec is a list of tasks, each of a known task TYPE with a fixed set of allowed fields.
// Free-form cells would break the cost/compliance mapping (the roadmap-locked ERP pattern). Validation +
// instantiation are pure (unit-tested); templates.ts persists versioned, clone-on-customize templates.

export type FieldType = "vessel" | "lot" | "material" | "number" | "text" | "rateBasis" | "select";

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
  rateValue: "Rate",
  rateBasis: "Rate basis",
  drawL: "Draw (L)",
  lossL: "Loss (L)",
  volumeL: "Volume (L)",
  rackType: "Rack type",
  filterType: "Filter type",
  micron: "Micron (µm)",
  actualOutputL: "Output volume (L)",
  targetValue: "Target",
  targetUnit: "Target unit",
  achievedValue: "Achieved reading",
  gasType: "Gas",
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
    // Dosed by RATE (rateValue + rateBasis). The actual amount added is computed from the rate × the
    // vessel's current volume at completion — there is no separate amount to enter (dropped the old,
    // confusing plannedAmount/plannedUnit pair, which only fed an advisory reservation).
    fields: { vesselId: "vessel", lotId: "lot", materialId: "material", rateValue: "number", rateBasis: "rateBasis", note: "text" },
    hint: "Dose by rate — the amount added is computed from the rate × the vessel's current volume when the task is completed.",
  },
  FINING: {
    kind: "OPERATION",
    opType: "FINING",
    label: "Fining",
    fields: { vesselId: "vessel", lotId: "lot", materialId: "material", rateValue: "number", rateBasis: "rateBasis", note: "text" },
    hint: "Dose by rate — the amount added is computed from the rate × the vessel's current volume when the task is completed.",
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

/** Canonical columns (A6) extracted from a task's payload — mirror the JSON for querying + composite FKs. */
function canonicalColumns(taskType: string, payload: Record<string, unknown>) {
  const s = (v: unknown) => (typeof v === "string" && v ? v : null);
  return {
    sourceVesselId: s(payload.fromVesselId),
    destVesselId: s(payload.toVesselId) ?? s(payload.vesselId),
    lotId: s(payload.lotId),
    materialId: s(payload.materialId),
  };
}

/**
 * Instantiate a template spec into CreateTaskInput[] (pure). `perTaskOverrides[i]` merges over that
 * task's defaults (the manager fills in vessels/lots/rates at issue). Canonical columns are derived from
 * the merged payload so reservations + the dashboard can query without parsing JSON.
 */
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
      plannedPayload: payload as CreateTaskInput["plannedPayload"],
    };
  });
}
