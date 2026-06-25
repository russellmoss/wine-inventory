import "server-only";

/**
 * Per-field validation for the generic CRUD layer. Pure + synchronous (no DB) so
 * it's unit-testable; FK resolution lives in each entity's buildCreate/update.
 */
export type FieldType = "string" | "int" | "float" | "decimal" | "boolean" | "date" | "enum";

export type FieldSpec = {
  name: string;
  type: FieldType;
  required?: boolean;
  min?: number; // numbers: value bound; strings: length bound
  max?: number;
  enumValues?: string[];
  description?: string;
};

export type ValidatedValues = Record<string, string | number | boolean>;

function coerce(spec: FieldSpec, raw: unknown): string | number | boolean {
  switch (spec.type) {
    case "string": {
      const s = String(raw ?? "").trim();
      if (spec.min != null && s.length < spec.min) throw new Error(`"${spec.name}" must be at least ${spec.min} characters.`);
      if (spec.max != null && s.length > spec.max) throw new Error(`"${spec.name}" is too long (max ${spec.max}).`);
      return s;
    }
    case "int":
    case "float":
    case "decimal": {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`"${spec.name}" must be a number.`);
      if (spec.type === "int" && !Number.isInteger(n)) throw new Error(`"${spec.name}" must be a whole number.`);
      if (spec.min != null && n < spec.min) throw new Error(`"${spec.name}" must be ≥ ${spec.min}.`);
      if (spec.max != null && n > spec.max) throw new Error(`"${spec.name}" must be ≤ ${spec.max}.`);
      return n;
    }
    case "boolean": {
      if (typeof raw === "boolean") return raw;
      const s = String(raw).toLowerCase();
      if (["true", "yes", "1"].includes(s)) return true;
      if (["false", "no", "0"].includes(s)) return false;
      throw new Error(`"${spec.name}" must be true or false.`);
    }
    case "date": {
      const s = String(raw ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`"${spec.name}" must be a date (YYYY-MM-DD).`);
      return s; // kept as ISO date string; entity layer converts to Date
    }
    case "enum": {
      const s = String(raw ?? "").trim();
      if (!spec.enumValues?.includes(s)) throw new Error(`"${spec.name}" must be one of: ${spec.enumValues?.join(", ")}.`);
      return s;
    }
  }
}

/**
 * Validate an input bag against field specs.
 *  - mode "create": required fields must be present; unknown fields rejected.
 *  - mode "update": only provided fields; at least one; unknown rejected.
 */
export function validateFields(
  specs: FieldSpec[],
  input: Record<string, unknown>,
  mode: "create" | "update",
): ValidatedValues {
  const byName = new Map(specs.map((s) => [s.name, s]));
  const provided = Object.keys(input).filter((k) => input[k] !== undefined && input[k] !== null && input[k] !== "");

  for (const key of provided) {
    if (!byName.has(key)) throw new Error(`Unknown field "${key}". Allowed: ${specs.map((s) => s.name).join(", ")}.`);
  }

  const out: ValidatedValues = {};
  if (mode === "create") {
    for (const spec of specs) {
      const has = provided.includes(spec.name);
      if (!has) {
        if (spec.required) throw new Error(`"${spec.name}" is required.`);
        continue;
      }
      out[spec.name] = coerce(spec, input[spec.name]);
    }
  } else {
    if (provided.length === 0) throw new Error("Provide at least one field to change.");
    for (const key of provided) {
      out[key] = coerce(byName.get(key)!, input[key]);
    }
  }
  return out;
}
