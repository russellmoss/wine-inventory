import { describe, it, expect } from "vitest";
import {
  validateCustomLogFields,
  normalizeCustomLogFields,
  customLogToTaskDef,
  CUSTOM_LOG_STAGES,
} from "@/lib/work-orders/custom-log-fields";
import { assertUserTaskTypeSafe } from "@/lib/work-orders/vocabulary-resolver";

// Plan 053 C11: Custom Logs are record-only. These lock the field-spec validation + that the built
// TaskTypeDef is always a safe NOTE (never reaches the ledger/measurement store).

describe("validateCustomLogFields", () => {
  it("accepts a well-formed spec", () => {
    const v = validateCustomLogFields([{ key: "weight", label: "Weight", type: "number", dimension: "mass" }]);
    expect(v.ok).toBe(true);
  });
  it("rejects an empty field list", () => {
    expect(validateCustomLogFields([]).ok).toBe(false);
  });
  it("rejects duplicate keys", () => {
    const v = validateCustomLogFields([{ key: "w", label: "A", type: "text" }, { key: "w", label: "B", type: "text" }]);
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/duplicate/i);
  });
  it("rejects a non-identifier key", () => {
    expect(validateCustomLogFields([{ key: "my field", label: "X", type: "text" }]).ok).toBe(false);
  });
  it("rejects a select with no options", () => {
    const v = validateCustomLogFields([{ key: "grade", label: "Grade", type: "select", options: [] }]);
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/option/i);
  });
  it("rejects an invalid type or dimension", () => {
    expect(validateCustomLogFields([{ key: "x", label: "X", type: "blob" }]).ok).toBe(false);
    expect(validateCustomLogFields([{ key: "x", label: "X", type: "number", dimension: "furlongs" }]).ok).toBe(false);
  });
});

describe("normalizeCustomLogFields", () => {
  it("defaults stage to all three when absent", () => {
    const [f] = normalizeCustomLogFields([{ key: "note", label: "Note", type: "text" }]);
    expect(f.stage).toEqual([...CUSTOM_LOG_STAGES]);
  });
  it("keeps select options + number dimension, drops junk", () => {
    const [f] = normalizeCustomLogFields([{ key: "vol", label: "Vol", type: "number", dimension: "volume", bogus: 1 }]);
    expect(f.dimension).toBe("volume");
    expect((f as Record<string, unknown>).bogus).toBeUndefined();
  });
});

describe("customLogToTaskDef", () => {
  it("produces a record-only NOTE def that passes assertUserTaskTypeSafe", () => {
    const def = customLogToTaskDef({ label: "Barrel weigh", fieldsJson: [{ key: "weight", label: "Weight", type: "number", dimension: "mass" }, { key: "grade", label: "Grade", type: "select", options: ["A", "B"] }] });
    expect(def.kind).toBe("NOTE");
    expect(def.isUserDefined).toBe(true);
    expect(def.opType).toBeUndefined();
    expect(Object.keys(def.fields)).toEqual(["weight", "grade"]);
    expect(def.fieldOptions?.grade).toEqual(["A", "B"]);
    expect(def.customFields).toHaveLength(2);
    expect(() => assertUserTaskTypeSafe(def)).not.toThrow();
  });
});
