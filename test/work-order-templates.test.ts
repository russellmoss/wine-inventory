import { describe, it, expect } from "vitest";
import { validateTemplateSpec, instantiateTasksFromSpec, instantiateTaskBuilds, TASK_VOCABULARY, type TemplateSpec } from "@/lib/work-orders/template-vocabulary";
import { SYSTEM_TEMPLATES } from "@/lib/work-orders/system-templates";

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

describe("maintenance task types (Unit 3) + instantiation", () => {
  it("instantiates a TEMP_SETPOINT with activityType + carries target fields", () => {
    const tasks = instantiateTasksFromSpec({ tasks: [{ taskType: "TEMP_SETPOINT", title: "Cold settle", defaults: { targetUnit: "°C" } }] }, [{ vesselId: "v1", targetValue: 4, achievedValue: 5 }]);
    expect(tasks[0]).toMatchObject({ kind: "MAINTENANCE", activityType: "TEMP_SETPOINT", destVesselId: "v1" });
    expect(tasks[0].plannedPayload).toMatchObject({ targetUnit: "°C", targetValue: 4, achievedValue: 5 });
  });

  it("rejects an out-of-vocabulary gasType / targetUnit", () => {
    expect(validateTemplateSpec({ tasks: [{ taskType: "GAS", title: "Blanket", defaults: { gasType: "Helium" } }] }).ok).toBe(false);
    expect(validateTemplateSpec({ tasks: [{ taskType: "TEMP_SETPOINT", title: "Cool", defaults: { targetUnit: "Kelvin" } }] }).ok).toBe(false);
    expect(validateTemplateSpec({ tasks: [{ taskType: "GAS", title: "Blanket", defaults: { gasType: "Argon" } }] }).ok).toBe(true);
  });

  it("CLEAN/SANITIZE/STEAM instantiate as MAINTENANCE with their activityType", () => {
    for (const at of ["CLEAN", "SANITIZE", "STEAM"] as const) {
      const [task] = instantiateTasksFromSpec({ tasks: [{ taskType: at, title: at }] }, [{ vesselId: "v1" }]);
      expect(task).toMatchObject({ kind: "MAINTENANCE", activityType: at, destVesselId: "v1" });
    }
  });
});

describe("instantiateTaskBuilds (multi-vessel fan-out target)", () => {
  it("builds one task per build, deriving kind/opType + canonical columns", () => {
    const tasks = instantiateTaskBuilds([
      { taskType: "ADDITION", title: "Add tannin", values: { vesselId: "v-a", materialId: "m1", amount: 40 } },
      { taskType: "ADDITION", title: "Add tannin", values: { vesselId: "v-b", materialId: "m1", amount: 40 } },
    ]);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({ seq: 1, kind: "OPERATION", opType: "ADDITION", destVesselId: "v-a", materialId: "m1" });
    expect(tasks[1]).toMatchObject({ seq: 2, destVesselId: "v-b" });
    expect(tasks[0].plannedPayload).toMatchObject({ amount: 40 });
  });

  it("falls back to the vocabulary label when no title is given, and rejects unknown types", () => {
    expect(instantiateTaskBuilds([{ taskType: "SANITIZE", values: { vesselId: "v1" } }])[0].title).toBe("Sanitize");
    expect(() => instantiateTaskBuilds([{ taskType: "NOPE", values: {} }])).toThrow(/unknown task type/i);
  });
});

describe("shipped system templates", () => {
  it("every system template spec is valid against the vocabulary", () => {
    for (const t of SYSTEM_TEMPLATES) {
      const v = validateTemplateSpec(t.spec);
      expect(v.ok, `${t.code}: ${v.errors.join(" ")}`).toBe(true);
    }
  });

  it("covers the consolidated families (addition, fining, filtration, temp, clean, sanitize, steam, gas)", () => {
    const types = new Set(SYSTEM_TEMPLATES.flatMap((t) => t.spec.tasks.map((k) => k.taskType)));
    for (const need of ["ADDITION", "FINING", "FILTRATION", "TEMP_SETPOINT", "CLEAN", "SANITIZE", "STEAM", "GAS"]) {
      expect(types, `missing a system template for ${need}`).toContain(need);
    }
  });

  it("has unique template codes", () => {
    const codes = SYSTEM_TEMPLATES.map((t) => t.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
