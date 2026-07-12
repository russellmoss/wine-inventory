import { describe, it, expect } from "vitest";
import {
  TASK_VOCABULARY,
  validateTemplateSpec,
  canonicalizeTemplateSpec,
  instantiateTaskBuilds,
  type ResolvedTaskVocabulary,
  type TaskTypeDef,
  type TemplateSpec,
} from "@/lib/work-orders/template-vocabulary";
import { assertUserTaskTypeSafe } from "@/lib/work-orders/vocabulary-resolver";

// Plan 053 A1: the four pure functions require an EXPLICIT vocabulary (no silent default). A tenant's
// user-defined "Custom Logs" only survive validate/canonicalize/instantiate when the RESOLVED vocabulary
// (built-ins + user types) is threaded through. Passing the bare built-in const drops them — which is the
// exact silent-fallback footgun the refactor removes at the type level (a missing arg won't compile).

// A record-only Custom Log the way resolveTaskVocabulary would add it in Phase C.
const CUSTOM_WEIGH: TaskTypeDef = {
  kind: "NOTE",
  label: "Barrel weigh",
  isUserDefined: true,
  fields: { weight: "number", note: "text" },
};
const RESOLVED: ResolvedTaskVocabulary = { ...TASK_VOCABULARY, BARREL_WEIGH: CUSTOM_WEIGH };

describe("A1 vocabulary injection", () => {
  const specWithCustom: TemplateSpec = {
    tasks: [{ taskType: "BARREL_WEIGH", title: "Weigh barrel 3", defaults: { weight: 225 } }],
  };

  it("validates a custom task type ONLY when the resolved vocab is passed", () => {
    expect(validateTemplateSpec(specWithCustom, RESOLVED).ok).toBe(true);
    const underBuiltins = validateTemplateSpec(specWithCustom, TASK_VOCABULARY);
    expect(underBuiltins.ok).toBe(false);
    expect(underBuiltins.errors.join(" ")).toMatch(/unknown task type/i);
  });

  it("canonicalize KEEPS a custom task type with the resolved vocab but DROPS it under the bare built-ins", () => {
    expect(canonicalizeTemplateSpec(specWithCustom, RESOLVED).tasks).toHaveLength(1);
    expect(canonicalizeTemplateSpec(specWithCustom, TASK_VOCABULARY).tasks).toHaveLength(0);
  });

  it("canonicalize keeps only declared custom fields (strips unknowns)", () => {
    const messy: TemplateSpec = {
      tasks: [{ taskType: "BARREL_WEIGH", title: "Weigh", defaults: { weight: 225, sneaky: "x" } }],
    };
    const [task] = canonicalizeTemplateSpec(messy, RESOLVED).tasks;
    expect(task.defaults).toEqual({ weight: 225 });
  });

  it("a custom field survives instantiateTaskBuilds into plannedPayload (with the resolved vocab)", () => {
    const [task] = instantiateTaskBuilds(
      [{ taskType: "BARREL_WEIGH", title: "Weigh 3", values: { weight: 225 } }],
      RESOLVED,
    );
    expect(task.kind).toBe("NOTE");
    expect((task.plannedPayload as Record<string, unknown>).weight).toBe(225);
  });

  it("instantiateTaskBuilds throws for a custom type when only the built-ins are passed", () => {
    expect(() =>
      instantiateTaskBuilds([{ taskType: "BARREL_WEIGH", values: { weight: 1 } }], TASK_VOCABULARY),
    ).toThrow(/unknown task type/i);
  });
});

describe("A2 payload class-split (ledger-safety hardening at instantiation)", () => {
  it("strips framework discriminator keys from a GOVERNED task's payload", () => {
    const [task] = instantiateTaskBuilds(
      [{ taskType: "ADDITION", title: "Add", values: { materialId: "m1", amount: 5, doseUnit: "g/hL", opType: "HACK", kind: "NOTE" } }],
      RESOLVED,
    );
    const p = task.plannedPayload as Record<string, unknown>;
    expect(p.opType).toBeUndefined();
    expect(p.kind).toBeUndefined();
    expect(p.materialId).toBe("m1"); // legitimate field survives
    expect(task.opType).toBe("ADDITION"); // the COLUMN still comes from the resolved def, not payload
  });

  it("preserves a governed transform's run-time payload keys (not in def.fields)", () => {
    const [task] = instantiateTaskBuilds(
      [{ taskType: "GROUP_RACK", title: "Barrel down", values: { groupRack: { direction: "DOWN" }, note: "x" } }],
      RESOLVED,
    );
    const p = task.plannedPayload as Record<string, unknown>;
    expect(p.groupRack).toEqual({ direction: "DOWN" });
    expect(p.note).toBe("x");
  });

  it("keeps ONLY declared fields on a record-only Custom Log (closed set)", () => {
    const [task] = instantiateTaskBuilds(
      [{ taskType: "BARREL_WEIGH", title: "Weigh", values: { weight: 225, sneaky: "x", kind: "OPERATION" } }],
      RESOLVED,
    );
    const p = task.plannedPayload as Record<string, unknown>;
    expect(p.weight).toBe(225);
    expect(p.sneaky).toBeUndefined();
    expect(p.kind).toBeUndefined();
  });
});

describe("A4 per-task assignee plumbing", () => {
  it("carries assigneeId to the CreateTaskInput column, not into plannedPayload", () => {
    const [task] = instantiateTaskBuilds(
      [{ taskType: "SANITIZE", title: "Sanitize T3", values: { vesselId: "v1" }, assigneeId: "user-maria" }],
      RESOLVED,
    );
    expect(task.assigneeId).toBe("user-maria");
    expect((task.plannedPayload as Record<string, unknown>).assigneeId).toBeUndefined();
  });

  it("defaults to null when no per-task assignee is given (inherits the order lead)", () => {
    const [task] = instantiateTaskBuilds([{ taskType: "SANITIZE", values: { vesselId: "v1" } }], RESOLVED);
    expect(task.assigneeId).toBeNull();
  });

  it("strips an assigneeId smuggled inside values (reserved payload key)", () => {
    const [task] = instantiateTaskBuilds(
      [{ taskType: "SANITIZE", values: { vesselId: "v1", assigneeId: "spoofed" } }],
      RESOLVED,
    );
    expect((task.plannedPayload as Record<string, unknown>).assigneeId).toBeUndefined();
    expect(task.assigneeId).toBeNull();
  });
});

describe("A1 assertUserTaskTypeSafe (the record-only safety line)", () => {
  it("accepts a NOTE-kind record-only type", () => {
    expect(() => assertUserTaskTypeSafe(CUSTOM_WEIGH)).not.toThrow();
  });

  it("rejects a user type that declares a ledger opType", () => {
    expect(() => assertUserTaskTypeSafe({ kind: "OPERATION", opType: "ADDITION" })).toThrow();
  });

  it("rejects a user type that declares an observation or maintenance type", () => {
    expect(() => assertUserTaskTypeSafe({ kind: "OBSERVATION", observationType: "BRIX" })).toThrow();
    expect(() => assertUserTaskTypeSafe({ kind: "MAINTENANCE", activityType: "CLEAN" })).toThrow();
  });
});
