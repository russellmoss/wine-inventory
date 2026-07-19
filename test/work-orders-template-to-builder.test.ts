import { describe, it, expect } from "vitest";
import { templateSpecToSeedTasks } from "@/lib/work-orders/template-to-builder";
import { TASK_VOCABULARY, instantiateTaskBuilds, canonicalizeTemplateSpec, type ResolvedTaskVocabulary, type TemplateSpec } from "@/lib/work-orders/template-vocabulary";

// A minimal stand-in vocabulary: only the fields matter for the seed conversion.
const VOCAB = {
  ADDITION: {
    kind: "OPERATION",
    label: "Addition",
    fields: { vesselId: "vessel", lotId: "lot", materialId: "material", amount: "number", doseUnit: "select", note: "text" },
  },
  RACK: {
    kind: "OPERATION",
    label: "Rack / transfer",
    fields: { sourceVesselId: "vessel", destVesselId: "vessel", lossL: "number", rackType: "select" },
  },
} as unknown as ResolvedTaskVocabulary;

describe("templateSpecToSeedTasks — a template becomes the builder's starting tasks", () => {
  it("carries taskType, title, declared defaults and instructions", () => {
    const seed = templateSpecToSeedTasks(
      { tasks: [{ taskType: "ADDITION", title: "Add material", instructions: "Dose against current volume.", defaults: { doseUnit: "g/hL" } }] },
      VOCAB,
    );
    expect(seed).toEqual([
      { taskType: "ADDITION", title: "Add material", values: { doseUnit: "g/hL" }, instructions: "Dose against current volume." },
    ]);
  });

  it("preserves task order across multiple tasks", () => {
    const seed = templateSpecToSeedTasks(
      { tasks: [{ taskType: "RACK", title: "Rack first" }, { taskType: "ADDITION", title: "Then dose" }] },
      VOCAB,
    );
    expect(seed.map((t) => t.taskType)).toEqual(["RACK", "ADDITION"]);
  });

  it("DROPS a task whose type no longer exists instead of breaking the whole seed", () => {
    const seed = templateSpecToSeedTasks(
      { tasks: [{ taskType: "DELETED_CUSTOM_LOG", title: "Gone" }, { taskType: "ADDITION", title: "Still here" }] },
      VOCAB,
    );
    expect(seed).toHaveLength(1);
    expect(seed[0].taskType).toBe("ADDITION");
  });

  it("KEEPS an undeclared default on a governed built-in — the spec path does, so seeding must too", () => {
    // `rateBasis` is a real run-time payload key on the shipped ADDITION template but is not in
    // `def.fields`. sanitizeTaskPayload keeps it for governed types; dropping it here would silently
    // change the dose basis versus creating straight from the template.
    const seed = templateSpecToSeedTasks(
      { tasks: [{ taskType: "ADDITION", title: "Add", defaults: { doseUnit: "g/hL", rateBasis: "G_HL" } }] },
      VOCAB,
    );
    expect(seed[0].values).toEqual({ doseUnit: "g/hL", rateBasis: "G_HL" });
  });

  it("closes the field set for a user-defined Custom Log", () => {
    const customVocab = {
      MY_LOG: { kind: "NOTE", label: "My log", isUserDefined: true, fields: { note: "text" } },
    } as unknown as ResolvedTaskVocabulary;
    const seed = templateSpecToSeedTasks(
      { tasks: [{ taskType: "MY_LOG", title: "Log it", defaults: { note: "ok", smuggled: "nope" } }] },
      customVocab,
    );
    expect(seed[0].values).toEqual({ note: "ok" });
  });

  it("strips reserved framework keys that must never come from a payload", () => {
    const seed = templateSpecToSeedTasks(
      { tasks: [{ taskType: "ADDITION", title: "Add", defaults: { doseUnit: "g/hL", assigneeId: "u1", taskKey: "k1" } }] },
      VOCAB,
    );
    expect(seed[0].values).toEqual({ doseUnit: "g/hL" });
  });

  it("falls back to the type's label when the spec has no usable title", () => {
    expect(templateSpecToSeedTasks({ tasks: [{ taskType: "ADDITION", title: "   " }] }, VOCAB)[0].title).toBe("Addition");
    expect(templateSpecToSeedTasks({ tasks: [{ taskType: "RACK" }] }, VOCAB)[0].title).toBe("Rack / transfer");
  });

  it("omits instructions rather than emitting an empty string", () => {
    const seed = templateSpecToSeedTasks({ tasks: [{ taskType: "ADDITION", title: "Add", instructions: "  " }] }, VOCAB);
    expect(seed[0].instructions).toBeUndefined();
    expect("instructions" in seed[0]).toBe(false);
  });

  it("tolerates any malformed spec without throwing (it's persisted JSON, typed unknown)", () => {
    for (const spec of [null, undefined, {}, { tasks: null }, { tasks: "nope" }, { tasks: [] }, { tasks: [null, 42, "x", []] }, "string", 7]) {
      expect(templateSpecToSeedTasks(spec, VOCAB)).toEqual([]);
    }
  });

  it("ignores a non-object defaults blob", () => {
    const seed = templateSpecToSeedTasks({ tasks: [{ taskType: "ADDITION", title: "Add", defaults: "not-an-object" }] }, VOCAB);
    expect(seed[0].values).toEqual({});
  });
});

describe("round-trip: template → builder seed → created task", () => {
  // The shipped "Addition (any material)" template, verbatim from system-templates.ts.
  const SPEC: TemplateSpec = {
    tasks: [{
      taskType: "ADDITION",
      title: "Add material",
      instructions: "Pick the material; dose to the target rate against current volume.",
      defaults: { doseUnit: "g/hL" },
    }],
  };

  it("carries instructions all the way onto the CreateTaskInput", () => {
    const seed = templateSpecToSeedTasks(SPEC, TASK_VOCABULARY);
    const [task] = instantiateTaskBuilds(
      seed.map((t) => ({ taskType: t.taskType, title: t.title, values: t.values, instructions: t.instructions })),
      TASK_VOCABULARY,
    );
    // Before this change instantiateTaskBuilds hardcoded `instructions: null`, so seeding a template
    // into the builder silently dropped the crew guidance the template author wrote.
    expect(task.instructions).toBe("Pick the material; dose to the target rate against current volume.");
    expect(task.title).toBe("Add material");
    expect(task.plannedPayload).toMatchObject({ doseUnit: "g/hL" });
  });

  it("a build with no instructions still persists null (unchanged for every other caller)", () => {
    const [task] = instantiateTaskBuilds([{ taskType: "ADDITION", title: "Add", values: {} }], TASK_VOCABULARY);
    expect(task.instructions).toBeNull();
  });

  it("survives the spec canonicalizer the template editor writes through", () => {
    const canon = canonicalizeTemplateSpec(SPEC, TASK_VOCABULARY);
    const seed = templateSpecToSeedTasks(canon, TASK_VOCABULARY);
    expect(seed).toHaveLength(1);
    expect(seed[0].instructions).toBe(SPEC.tasks[0].instructions);
    expect(seed[0].values).toEqual({ doseUnit: "g/hL" });
  });
});
