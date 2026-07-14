import { describe, it, expect } from "vitest";
import {
  validateTemplateSpec as _validateTemplateSpec,
  canonicalizeTemplateSpec as _canonicalizeTemplateSpec,
  instantiateTasksFromSpec as _instantiateTasksFromSpec,
  instantiateTaskBuilds as _instantiateTaskBuilds,
  TASK_VOCABULARY,
  type TemplateSpec,
} from "@/lib/work-orders/template-vocabulary";
import { SYSTEM_TEMPLATES } from "@/lib/work-orders/system-templates";
import { coerceVesselActivityKind, isVesselActivityKind } from "@/lib/cellar/vessel-activity-vocab";
import { isCapKind, CAP_LABELS } from "@/lib/cellar/cap-vocab";
import { materialScopeForTask } from "@/lib/cellar/material-taxonomy";

// A1: production requires an explicit vocabulary (no silent default). These tests exercise the BUILT-IN
// vocabulary, so thin wrappers inject TASK_VOCABULARY and keep the existing call sites unchanged.
const validateTemplateSpec = (spec: TemplateSpec) => _validateTemplateSpec(spec, TASK_VOCABULARY);
const instantiateTasksFromSpec = (spec: TemplateSpec, overrides?: Record<string, unknown>[]) =>
  _instantiateTasksFromSpec(spec, TASK_VOCABULARY, overrides);
const instantiateTaskBuilds = (builds: Parameters<typeof _instantiateTaskBuilds>[0]) =>
  _instantiateTaskBuilds(builds, TASK_VOCABULARY);
const canonicalizeTemplateSpec = (spec: TemplateSpec) => _canonicalizeTemplateSpec(spec, TASK_VOCABULARY);

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

describe("clone tolerates vocabulary drift (#79)", () => {
  // A legacy tenant template stored an ADDITION with rateValue/rateBasis — valid when saved, but plan 036
  // moved ADDITION to amount/doseUnit, so those fields left the vocabulary. Cloning re-persists the stored
  // spec; strict re-validation used to hard-fail ("unknown field \"rateBasis\""). The clone path now
  // canonicalizes trusted specs, which DROPS the drifted keys so the copy conforms to the current vocab.
  const legacyStored: TemplateSpec = {
    tasks: [{ taskType: "ADDITION", title: "Add SO2", defaults: { materialId: "m1", rateValue: 40, rateBasis: "MG_L" } }],
  };

  it("strict validation still rejects the drifted field (client authoring is unchanged)", () => {
    const v = validateTemplateSpec(legacyStored);
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain('unknown field "rateBasis"');
  });

  it("canonicalizing (the clone path) strips the drifted keys, then the spec validates clean", () => {
    const clean = canonicalizeTemplateSpec(legacyStored);
    expect(clean.tasks[0].defaults).toEqual({ materialId: "m1" });
    expect(clean.tasks[0].defaults).not.toHaveProperty("rateBasis");
    expect(clean.tasks[0].defaults).not.toHaveProperty("rateValue");
    expect(validateTemplateSpec(clean).ok).toBe(true);
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

describe("cap management task type (plan 043)", () => {
  it("accepts a CAP_MGMT spec with a valid technique", () => {
    expect(validateTemplateSpec({ tasks: [{ taskType: "CAP_MGMT", title: "Punch down", defaults: { technique: "PUNCHDOWN", durationMin: 5 } }] }).ok).toBe(true);
    expect(validateTemplateSpec({ tasks: [{ taskType: "CAP_MGMT", title: "Pump over", defaults: { technique: "PUMPOVER" } }] }).ok).toBe(true);
  });

  it("rejects an out-of-vocabulary technique (never free-form)", () => {
    const v = validateTemplateSpec({ tasks: [{ taskType: "CAP_MGMT", title: "x", defaults: { technique: "STIR" } }] });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain("not a valid technique");
  });

  it("instantiates a CAP_MGMT task as an OPERATION carrying technique + durationMin, deriving destVesselId from vesselId", () => {
    const [task] = instantiateTaskBuilds([{ taskType: "CAP_MGMT", title: "Punch down T3", values: { vesselId: "v-tank", technique: "PUNCHDOWN", durationMin: 3 } }]);
    expect(task).toMatchObject({ seq: 1, kind: "OPERATION", opType: "CAP_MGMT", destVesselId: "v-tank" });
    expect(task.plannedPayload).toMatchObject({ technique: "PUNCHDOWN", durationMin: 3 });
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

describe("barrel-maintenance blocks (plan 044)", () => {
  it("OZONE/SO2/WET_STORAGE instantiate as MAINTENANCE with their activityType", () => {
    for (const at of ["OZONE", "SO2", "WET_STORAGE"] as const) {
      const [task] = instantiateTasksFromSpec({ tasks: [{ taskType: at, title: at }] }, [{ vesselId: "v1" }]);
      expect(task).toMatchObject({ kind: "MAINTENANCE", activityType: at, destVesselId: "v1" });
    }
  });

  it("SO2 validates its method select (never free-form) and carries it on the payload", () => {
    expect(validateTemplateSpec({ tasks: [{ taskType: "SO2", title: "SO2", defaults: { so2Method: "Burned sulfur strip" } }] }).ok).toBe(true);
    const bad = validateTemplateSpec({ tasks: [{ taskType: "SO2", title: "x", defaults: { so2Method: "Firecracker" } }] });
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(" ")).toContain("not a valid so2Method");
    const [task] = instantiateTasksFromSpec({ tasks: [{ taskType: "SO2", title: "SO2" }] }, [{ vesselId: "v1", so2Method: "SO₂ gas (cylinder)", materialId: "m-strips", amount: 2 }]);
    expect(task).toMatchObject({ kind: "MAINTENANCE", activityType: "SO2", materialId: "m-strips" });
    expect(task.plannedPayload).toMatchObject({ so2Method: "SO₂ gas (cylinder)", amount: 2 });
  });

  it("OZONE carries durationMin; WET_STORAGE carries material + amount for overhead depletion", () => {
    const [oz] = instantiateTasksFromSpec({ tasks: [{ taskType: "OZONE", title: "Ozone" }] }, [{ vesselId: "v1", durationMin: 20 }]);
    expect(oz.plannedPayload).toMatchObject({ durationMin: 20 });
    const [ws] = instantiateTasksFromSpec({ tasks: [{ taskType: "WET_STORAGE", title: "KMBS" }] }, [{ vesselId: "v1", materialId: "m-kmbs", amount: 50 }]);
    expect(ws).toMatchObject({ kind: "MAINTENANCE", activityType: "WET_STORAGE", materialId: "m-kmbs" });
    expect(ws.plannedPayload).toMatchObject({ amount: 50 });
  });

  it("rejects an unknown field on a barrel block (still never free-form)", () => {
    const v = validateTemplateSpec({ tasks: [{ taskType: "OZONE", title: "x", defaults: { gasType: "Argon" } }] });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain('unknown field "gasType"');
  });

  it("BATONNAGE is a valid CAP_MGMT technique (rides the per-lot treatment op)", () => {
    expect(validateTemplateSpec({ tasks: [{ taskType: "CAP_MGMT", title: "Stir", defaults: { technique: "BATONNAGE" } }] }).ok).toBe(true);
    const [task] = instantiateTaskBuilds([{ taskType: "CAP_MGMT", title: "Stir lees", values: { vesselId: "v-bbl", technique: "BATONNAGE" } }]);
    expect(task).toMatchObject({ kind: "OPERATION", opType: "CAP_MGMT", destVesselId: "v-bbl" });
    expect(task.plannedPayload).toMatchObject({ technique: "BATONNAGE" });
  });
});

describe("barrel-maintenance vocab + material scope (plan 044)", () => {
  it("coerceVesselActivityKind accepts the new first-class kinds (not collapsed to OTHER)", () => {
    for (const k of ["OZONE", "SO2", "WET_STORAGE"] as const) {
      expect(isVesselActivityKind(k)).toBe(true);
      expect(coerceVesselActivityKind(k)).toBe(k);
    }
    expect(coerceVesselActivityKind("NONSENSE")).toBe("OTHER");
  });

  it("BATONNAGE is a valid CapKind with a label", () => {
    expect(isCapKind("BATONNAGE")).toBe(true);
    expect(CAP_LABELS.BATONNAGE).toBeTruthy();
  });

  it("scopes the SO2/WET_STORAGE material picker; ozone consumes nothing", () => {
    expect(materialScopeForTask({ activityType: "SO2" })).toEqual(["ADDITIVE", "CLEANING_SANITIZING", "OTHER"]);
    expect(materialScopeForTask({ activityType: "WET_STORAGE" })).toEqual(["ADDITIVE", "CLEANING_SANITIZING", "OTHER"]);
    expect(materialScopeForTask({ activityType: "OZONE" })).toBeUndefined();
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

describe("NOTE / checklist block (plan 034)", () => {
  it("accepts a NOTE task with no fields and with an optional note default", () => {
    expect(validateTemplateSpec({ tasks: [{ taskType: "NOTE", title: "Sweep the crush pad" }] }).ok).toBe(true);
    expect(validateTemplateSpec({ tasks: [{ taskType: "NOTE", title: "Check glycol", defaults: { note: "look for leaks" } }] }).ok).toBe(true);
  });

  it("rejects an unknown field on a NOTE (still never free-form)", () => {
    const v = validateTemplateSpec({ tasks: [{ taskType: "NOTE", title: "x", defaults: { vesselId: "v1" } }] });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain('unknown field "vesselId"');
  });

  it("instantiates NOTE as kind NOTE with null op/observation/activity + null canonical columns", () => {
    const [task] = instantiateTasksFromSpec({ tasks: [{ taskType: "NOTE", title: "Rinse hoses" }] });
    expect(task).toMatchObject({ seq: 1, kind: "NOTE", opType: null, observationType: null, activityType: null });
    expect(task.sourceVesselId).toBeNull();
    expect(task.destVesselId).toBeNull();
    expect(task.lotId).toBeNull();
    expect(task.materialId).toBeNull();
  });

  it("instantiateTaskBuilds maps NOTE to kind NOTE (falls back to the vocabulary label)", () => {
    const [task] = instantiateTaskBuilds([{ taskType: "NOTE", values: {} }]);
    expect(task).toMatchObject({ kind: "NOTE", title: "Checklist item / note" });
  });

  it("validates + instantiates a builder-shaped mixed spec (rack + addition + checklist) on one sheet", () => {
    const spec: TemplateSpec = {
      tasks: [
        { taskType: "RACK", title: "Rack off the lees" },
        { taskType: "ADDITION", title: "Add SO2", defaults: { doseUnit: "g/hL" } },
        { taskType: "NOTE", title: "Log the tasting note in the binder" },
      ],
    };
    expect(validateTemplateSpec(spec).ok).toBe(true);
    const tasks = instantiateTasksFromSpec(spec);
    expect(tasks.map((t) => t.kind)).toEqual(["OPERATION", "OPERATION", "NOTE"]);
  });
});

describe("transform blocks — CRUSH + PRESS (plan 035)", () => {
  it("accepts a CRUSH block with its process defaults; rejects a run-time-only field as a default", () => {
    expect(validateTemplateSpec({ tasks: [{ taskType: "CRUSH", title: "Crush block 12", defaults: { destemmed: "true", crusherOn: "true", crushedPct: 80 } }] }).ok).toBe(true);
    // picks/destVesselId/outputVolumeL are run-time only — not template defaults.
    const v = validateTemplateSpec({ tasks: [{ taskType: "CRUSH", title: "x", defaults: { destVesselId: "v1" } }] });
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toContain('unknown field "destVesselId"');
  });

  it("accepts a PRESS block; validates the op select (PRESS|SAIGNEE)", () => {
    expect(validateTemplateSpec({ tasks: [{ taskType: "PRESS", title: "Press lot X", defaults: { op: "SAIGNEE" } }] }).ok).toBe(true);
    const bad = validateTemplateSpec({ tasks: [{ taskType: "PRESS", title: "x", defaults: { op: "SQUEEZE" } }] });
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(" ")).toContain("not a valid op");
  });

  it("instantiates CRUSH/PRESS as OPERATION tasks with the right opType, carrying run-time payload", () => {
    const [crush] = instantiateTaskBuilds([{ taskType: "CRUSH", title: "Crush", values: { destVesselId: "v-tank", outputVolumeL: 480, destemmed: "true" } }]);
    expect(crush).toMatchObject({ kind: "OPERATION", opType: "CRUSH", destVesselId: "v-tank" });
    expect(crush.plannedPayload).toMatchObject({ outputVolumeL: 480, destemmed: "true" });
    const [press] = instantiateTaskBuilds([{ taskType: "PRESS", title: "Press", values: { parentLotId: "lot-1", sourceVesselId: "v-src", op: "PRESS" } }]);
    expect(press).toMatchObject({ kind: "OPERATION", opType: "PRESS", lotId: "lot-1", sourceVesselId: "v-src" });
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
    for (const need of ["ADDITION", "FINING", "FILTRATION", "CAP_MGMT", "TEMP_SETPOINT", "CLEAN", "SANITIZE", "STEAM", "GAS"]) {
      expect(types, `missing a system template for ${need}`).toContain(need);
    }
  });

  it("has unique template codes", () => {
    const codes = SYSTEM_TEMPLATES.map((t) => t.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("ships a délestage (rack & return) template as two RACK legs (plan 043)", () => {
    const del = SYSTEM_TEMPLATES.find((t) => t.code === "SYS-DELESTAGE");
    expect(del, "SYS-DELESTAGE missing").toBeTruthy();
    expect(del!.spec.tasks.map((t) => t.taskType)).toEqual(["RACK", "RACK"]);
    expect(del!.spec.tasks.every((t) => t.defaults?.rackType === "délestage")).toBe(true);
    // Instantiating with origin+holding on the two legs yields out (origin→holding) then back (holding→origin).
    const tasks = instantiateTasksFromSpec(del!.spec, [
      { fromVesselId: "v-origin", toVesselId: "v-holding" },
      { fromVesselId: "v-holding", toVesselId: "v-origin" },
    ]);
    expect(tasks[0]).toMatchObject({ opType: "RACK", sourceVesselId: "v-origin", destVesselId: "v-holding" });
    expect(tasks[1]).toMatchObject({ opType: "RACK", sourceVesselId: "v-holding", destVesselId: "v-origin" });
  });

  it("ships the six barrel-maintenance templates (plan 044)", () => {
    const byCode = new Map(SYSTEM_TEMPLATES.map((t) => [t.code, t]));
    for (const code of ["SYS-BARREL-WASH", "SYS-OZONE", "SYS-SO2-BARREL", "SYS-BARREL-STORAGE", "SYS-BARREL-PREP", "SYS-BATONNAGE"]) {
      expect(byCode.has(code), `missing ${code}`).toBe(true);
    }
    // wet-storage change is a two-reagent (KMBS + citric) two-block template
    expect(byCode.get("SYS-BARREL-STORAGE")!.spec.tasks.map((t) => t.taskType)).toEqual(["WET_STORAGE", "WET_STORAGE"]);
    // barrel prep is wash → steam → SO₂ in order
    expect(byCode.get("SYS-BARREL-PREP")!.spec.tasks.map((t) => t.taskType)).toEqual(["CLEAN", "STEAM", "SO2"]);
    // bâtonnage rides CAP_MGMT with the BATONNAGE technique default
    expect(byCode.get("SYS-BATONNAGE")!.spec.tasks[0]).toMatchObject({ taskType: "CAP_MGMT", defaults: { technique: "BATONNAGE" } });
  });
});
