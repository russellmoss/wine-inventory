import { describe, it, expect } from "vitest";
import { applyOverlay, assertOverlaySafe, hideableFieldsFor, type OverlayRow } from "@/lib/work-orders/overlays";
import { TASK_VOCABULARY, type TaskTypeDef } from "@/lib/work-orders/template-vocabulary";

// Plan 053 C12: overlays customize built-in task fields for DISPLAY only. The safety property: only
// allowlisted (optional) fields can be hidden; a governed core never loses a field it needs; kind/opType
// are never touched.

const overlay = (baseTaskType: string, patch: Partial<OverlayRow> = {}): OverlayRow => ({
  baseTaskType, hiddenFields: [], relabels: {}, fieldOrder: [], ...patch,
});

describe("assertOverlaySafe", () => {
  it("allows hiding a whitelisted field", () => {
    expect(() => assertOverlaySafe("RACK", ["note", "lossL"])).not.toThrow();
  });
  it("throws when hiding a field a governed core needs", () => {
    expect(() => assertOverlaySafe("ADDITION", ["materialId"])).toThrow(/can't be hidden/i);
    expect(() => assertOverlaySafe("RACK", ["fromVesselId"])).toThrow();
  });
  it("unlisted type has no hideable fields", () => {
    expect(hideableFieldsFor("NONEXISTENT")).toEqual([]);
  });
});

describe("applyOverlay", () => {
  it("hides an allowlisted field but never changes opType/kind", () => {
    const out = applyOverlay(TASK_VOCABULARY.RACK, overlay("RACK", { hiddenFields: ["note"] }));
    expect(out.fields.note).toBeUndefined();
    expect(out.fields.fromVesselId).toBeDefined(); // required stays
    expect(out.opType).toBe("RACK");
    expect(out.kind).toBe("OPERATION");
  });

  it("CLAMPS a non-allowlisted hidden field (defense-in-depth even on a bad row)", () => {
    const out = applyOverlay(TASK_VOCABULARY.ADDITION, overlay("ADDITION", { hiddenFields: ["materialId", "note"] }));
    expect(out.fields.materialId).toBeDefined(); // clamped — not hidden
    expect(out.fields.note).toBeUndefined(); // note is allowlisted → hidden
  });

  it("reorders fields per fieldOrder", () => {
    const out = applyOverlay(TASK_VOCABULARY.RACK, overlay("RACK", { fieldOrder: ["note", "toVesselId"] }));
    const keys = Object.keys(out.fields);
    expect(keys.indexOf("note")).toBeLessThan(keys.indexOf("fromVesselId"));
  });

  it("relabels become fieldLabels", () => {
    const out = applyOverlay(TASK_VOCABULARY.RACK, overlay("RACK", { relabels: { note: "Comments" } }));
    expect(out.fieldLabels?.note).toBe("Comments");
  });

  it("is a no-op for user-defined types", () => {
    const userDef: TaskTypeDef = { kind: "NOTE", label: "Log", isUserDefined: true, fields: { weight: "number" } };
    expect(applyOverlay(userDef, overlay("weird", { hiddenFields: ["weight"] }))).toBe(userDef);
  });
});
