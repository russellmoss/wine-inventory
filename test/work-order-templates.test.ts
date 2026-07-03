import { describe, it, expect } from "vitest";
import { validateTemplateSpec, instantiateTasksFromSpec, TASK_VOCABULARY, type TemplateSpec } from "@/lib/work-orders/template-vocabulary";

describe("validateTemplateSpec", () => {
  it("accepts a spec whose fields are all in the vocabulary", () => {
    const spec: TemplateSpec = { tasks: [{ taskType: "RACK", title: "Rack", defaults: { lossL: 0, drawL: 100 } }] };
    expect(validateTemplateSpec(spec).ok).toBe(true);
  });

  it("rejects an unknown task type", () => {
    const v = validateTemplateSpec({ tasks: [{ taskType: "TELEPORT", title: "x" }] });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain("unknown task type");
  });

  it("rejects an unknown field on a known task type (never free-form)", () => {
    const v = validateTemplateSpec({ tasks: [{ taskType: "RACK", title: "Rack", defaults: { wormholeRadius: 3 } }] });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain('unknown field "wormholeRadius"');
  });

  it("requires at least one task and a title per task", () => {
    expect(validateTemplateSpec({ tasks: [] }).ok).toBe(false);
    expect(validateTemplateSpec({ tasks: [{ taskType: "RACK", title: "" }] }).ok).toBe(false);
  });
});

describe("instantiateTasksFromSpec", () => {
  const spec: TemplateSpec = {
    tasks: [
      { taskType: "RACK", title: "Rack A→B", defaults: { lossL: 2 } },
      { taskType: "ADDITION", title: "Add SO2", defaults: { rateBasis: "MG_PER_L" } },
    ],
  };

  it("maps task types to kind/opType/observationType from the vocabulary", () => {
    const tasks = instantiateTasksFromSpec(spec);
    expect(tasks[0]).toMatchObject({ seq: 1, kind: "OPERATION", opType: "RACK", observationType: null });
    expect(tasks[1]).toMatchObject({ seq: 2, kind: "OPERATION", opType: "ADDITION" });
  });

  it("merges per-task overrides over the defaults and derives canonical columns (A6)", () => {
    const tasks = instantiateTasksFromSpec(spec, [
      { fromVesselId: "v-from", toVesselId: "v-to", drawL: 150 },
      { vesselId: "v-tank", lotId: "lot-1", materialId: "mat-1", rateValue: 30 },
    ]);
    expect(tasks[0].sourceVesselId).toBe("v-from");
    expect(tasks[0].destVesselId).toBe("v-to");
    expect(tasks[0].plannedPayload).toMatchObject({ lossL: 2, drawL: 150 });
    expect(tasks[1].destVesselId).toBe("v-tank"); // vesselId → destVesselId
    expect(tasks[1].lotId).toBe("lot-1");
    expect(tasks[1].materialId).toBe("mat-1");
    expect(tasks[1].plannedPayload).toMatchObject({ rateBasis: "MG_PER_L", rateValue: 30 });
  });

  it("does not mutate the source spec when instantiating (version-snap immutability)", () => {
    const before = JSON.stringify(spec);
    instantiateTasksFromSpec(spec, [{ drawL: 999 }]);
    expect(JSON.stringify(spec)).toBe(before);
  });

  it("every vocabulary entry is internally consistent (kind matches op/observation)", () => {
    for (const [key, def] of Object.entries(TASK_VOCABULARY)) {
      if (def.kind === "OPERATION") expect(def.opType, key).toBeTruthy();
      if (def.kind === "OBSERVATION") expect(def.observationType, key).toBeTruthy();
    }
  });
});

describe("select field validation (A7) + filtration (Unit 2)", () => {
  it("accepts a FILTRATION spec with a valid filter medium", () => {
    const v = validateTemplateSpec({ tasks: [{ taskType: "FILTRATION", title: "Filter", defaults: { filterType: "Cross-flow", micron: 0.45 } }] });
    expect(v.ok).toBe(true);
  });

  it("rejects an out-of-vocabulary select value (never free-form)", () => {
    const v = validateTemplateSpec({ tasks: [{ taskType: "FILTRATION", title: "Filter", defaults: { filterType: "Coffee filter" } }] });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain("not a valid filterType");
  });

  it("rejects an out-of-vocabulary rack type but accepts a valid one (dec 4a)", () => {
    expect(validateTemplateSpec({ tasks: [{ taskType: "RACK", title: "Rack", defaults: { rackType: "off gross lees" } }] }).ok).toBe(true);
    const bad = validateTemplateSpec({ tasks: [{ taskType: "RACK", title: "Rack", defaults: { rackType: "sideways" } }] });
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(" ")).toContain("not a valid rackType");
  });

  it("allows an empty/absent select value (the field is optional)", () => {
    expect(validateTemplateSpec({ tasks: [{ taskType: "FILTRATION", title: "Filter", defaults: { filterType: "" } }] }).ok).toBe(true);
    expect(validateTemplateSpec({ tasks: [{ taskType: "FILTRATION", title: "Filter" }] }).ok).toBe(true);
  });

  it("instantiates a FILTRATION task carrying filterType + derives destVesselId from vesselId", () => {
    const spec: TemplateSpec = { tasks: [{ taskType: "FILTRATION", title: "Filter to bottling tank", defaults: { filterType: "Membrane" } }] };
    const tasks = instantiateTasksFromSpec(spec, [{ vesselId: "v-tank", micron: 0.45, actualOutputL: 480 }]);
    expect(tasks[0]).toMatchObject({ seq: 1, kind: "OPERATION", opType: "FILTRATION", destVesselId: "v-tank" });
    expect(tasks[0].plannedPayload).toMatchObject({ filterType: "Membrane", micron: 0.45, actualOutputL: 480 });
  });
});
