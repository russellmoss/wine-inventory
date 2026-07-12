import type { TaskTypeDef, FieldType } from "@/lib/work-orders/template-vocabulary";

// Plan 053 C11: client-safe vocabulary + validation for user-defined "Custom Logs" (record-only NOTE task
// types). NO server imports, so the admin editor + the builder can use it. A custom log has a closed set of
// fields; each field has a type, optional select options, an optional required flag, an optional dimension
// (for numbers, so a weight/volume carries its unit), and a stage-visibility set (planning/execution/review).

export const CUSTOM_LOG_FIELD_TYPES = ["text", "number", "select", "date", "boolean"] as const;
export const CUSTOM_LOG_DIMENSIONS = ["volume", "mass", "temp", "count", "unitless"] as const;
export const CUSTOM_LOG_STAGES = ["planning", "execution", "review"] as const;
export type CustomLogFieldType = (typeof CUSTOM_LOG_FIELD_TYPES)[number];
export type CustomLogStage = (typeof CUSTOM_LOG_STAGES)[number];

export type CustomLogFieldSpec = {
  key: string;
  label: string;
  type: CustomLogFieldType;
  options?: string[]; // for type "select"
  required?: boolean;
  dimension?: string; // for type "number" (volume/mass/temp/count/unitless)
  stage: CustomLogStage[]; // where the field shows; default = all three
};

const KEY_RE = /^[a-z][a-zA-Z0-9]*$/; // a safe payload key (no spaces/dots)

/** Validate a raw custom-log field list. Pure. Returns collected errors (empty = ok). */
export function validateCustomLogFields(fields: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(fields) || fields.length === 0) return { ok: false, errors: ["A custom log needs at least one field."] };
  const seen = new Set<string>();
  fields.forEach((f, i) => {
    const raw = (f ?? {}) as Record<string, unknown>;
    const key = typeof raw.key === "string" ? raw.key.trim() : "";
    if (!key) errors.push(`Field ${i + 1}: a key is required.`);
    else if (!KEY_RE.test(key)) errors.push(`Field ${i + 1}: key "${key}" must be a camelCase identifier (letters/numbers, no spaces).`);
    else if (seen.has(key)) errors.push(`Field ${i + 1}: duplicate key "${key}".`);
    else seen.add(key);
    if (!(typeof raw.label === "string" && raw.label.trim())) errors.push(`Field ${i + 1}: a label is required.`);
    if (!(CUSTOM_LOG_FIELD_TYPES as readonly string[]).includes(raw.type as string)) errors.push(`Field ${i + 1}: invalid type "${String(raw.type)}".`);
    if (raw.type === "select") {
      const opts = Array.isArray(raw.options) ? raw.options.filter((o) => typeof o === "string" && o.trim()) : [];
      if (opts.length === 0) errors.push(`Field ${i + 1}: a select field needs at least one option.`);
    }
    if (raw.type === "number" && raw.dimension != null && raw.dimension !== "" && !(CUSTOM_LOG_DIMENSIONS as readonly string[]).includes(raw.dimension as string)) {
      errors.push(`Field ${i + 1}: invalid dimension "${String(raw.dimension)}".`);
    }
    if (raw.stage != null) {
      const stages = Array.isArray(raw.stage) ? raw.stage : [];
      for (const s of stages) if (!(CUSTOM_LOG_STAGES as readonly string[]).includes(s as string)) errors.push(`Field ${i + 1}: invalid stage "${String(s)}".`);
    }
  });
  return { ok: errors.length === 0, errors };
}

/** Coerce a validated raw field list to the canonical CustomLogFieldSpec[] (default stage = all three). */
export function normalizeCustomLogFields(fields: unknown): CustomLogFieldSpec[] {
  if (!Array.isArray(fields)) return [];
  return fields.map((f) => {
    const raw = (f ?? {}) as Record<string, unknown>;
    const type = raw.type as CustomLogFieldType;
    const stageIn = Array.isArray(raw.stage) ? (raw.stage as string[]).filter((s) => (CUSTOM_LOG_STAGES as readonly string[]).includes(s)) : [];
    const spec: CustomLogFieldSpec = {
      key: String(raw.key).trim(),
      label: String(raw.label).trim(),
      type,
      stage: stageIn.length ? (stageIn as CustomLogStage[]) : [...CUSTOM_LOG_STAGES],
    };
    if (type === "select") spec.options = (raw.options as string[]).map((o) => String(o).trim()).filter(Boolean);
    if (raw.required === true) spec.required = true;
    if (type === "number" && typeof raw.dimension === "string" && raw.dimension) spec.dimension = raw.dimension;
    return spec;
  });
}

/** Map a custom field's type to the builder's FieldType (for renderField / canonical handling). */
export function customFieldTypeToFieldType(type: CustomLogFieldType): FieldType {
  // "date"/"boolean" are added to FieldType in template-vocabulary; text/number/select map directly.
  return type as FieldType;
}

/** PURE: build a TaskTypeDef for a user-defined Custom Log from its stored row shape. Always NOTE-kind and
 * record-only (isUserDefined); carries the rich `customFields` for stage-aware rendering + a plain `fields`
 * map so the shared validate/canonicalize/instantiate engine still sees the keys. */
export function customLogToTaskDef(row: { label: string; fieldsJson: unknown }): TaskTypeDef {
  const custom = normalizeCustomLogFields(row.fieldsJson);
  const fields: Record<string, FieldType> = {};
  const fieldOptions: Record<string, readonly string[]> = {};
  for (const f of custom) {
    fields[f.key] = customFieldTypeToFieldType(f.type);
    if (f.type === "select" && f.options) fieldOptions[f.key] = f.options;
  }
  return { kind: "NOTE", label: row.label, isUserDefined: true, fields, fieldOptions, customFields: custom };
}
