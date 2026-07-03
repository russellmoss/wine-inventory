import type { OperationType, WorkOrderTaskKind } from "@prisma/client";
import type { CreateTaskInput } from "@/lib/work-orders/lifecycle";

// Typed field vocabulary for work-order templates (Phase 9 Unit 10). Templates are NEVER free-form: a
// template's spec is a list of tasks, each of a known task TYPE with a fixed set of allowed fields.
// Free-form cells would break the cost/compliance mapping (the roadmap-locked ERP pattern). Validation +
// instantiation are pure (unit-tested); templates.ts persists versioned, clone-on-customize templates.

export type FieldType = "vessel" | "lot" | "material" | "number" | "text" | "rateBasis";

export type TaskTypeDef = {
  kind: WorkOrderTaskKind;
  opType?: OperationType;
  observationType?: string;
  label: string;
  fields: Record<string, FieldType>;
};

// The allowed task types + their fields. v1 covers the cellar core loop (rack/addition/fining/top) plus
// two observation types. Phase 20 (vineyard) reuses the same engine by extending this vocabulary.
export const TASK_VOCABULARY: Record<string, TaskTypeDef> = {
  RACK: {
    kind: "OPERATION",
    opType: "RACK",
    label: "Rack / transfer",
    fields: { fromVesselId: "vessel", toVesselId: "vessel", drawL: "number", lossL: "number", note: "text" },
  },
  ADDITION: {
    kind: "OPERATION",
    opType: "ADDITION",
    label: "Addition",
    fields: { vesselId: "vessel", lotId: "lot", materialId: "material", rateValue: "number", rateBasis: "rateBasis", plannedAmount: "number", plannedUnit: "text", note: "text" },
  },
  FINING: {
    kind: "OPERATION",
    opType: "FINING",
    label: "Fining",
    fields: { vesselId: "vessel", lotId: "lot", materialId: "material", rateValue: "number", rateBasis: "rateBasis", plannedAmount: "number", plannedUnit: "text", note: "text" },
  },
  TOPPING: {
    kind: "OPERATION",
    opType: "TOPPING",
    label: "Topping",
    fields: { fromVesselId: "vessel", toVesselId: "vessel", volumeL: "number", note: "text" },
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
    for (const key of Object.keys(t.defaults ?? {})) {
      if (!(key in def.fields)) errors.push(`Task ${i + 1} (${t.taskType}): unknown field "${key}".`);
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
      instructions: t.instructions ?? null,
      sourceVesselId: canon.sourceVesselId,
      destVesselId: canon.destVesselId,
      lotId: canon.lotId,
      materialId: canon.materialId,
      plannedPayload: payload as CreateTaskInput["plannedPayload"],
    };
  });
}
