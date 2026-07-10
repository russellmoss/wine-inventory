import { describe, expect, it } from "vitest";
import { TASK_VOCABULARY } from "@/lib/work-orders/template-vocabulary";
import {
  computeWorkOrderReadiness,
  TASK_COVERAGE,
  READINESS_SCHEMA_VERSION,
  type ReadinessLoadedState,
  type ReadinessVesselState,
  type ReadinessMaterialState,
  type WorkOrderReadinessInput,
} from "@/lib/work-orders/proposal-readiness";
import type { TaskBuild } from "@/lib/work-orders/template-vocabulary";

// Unit 1 (Phase 9.3): the shared readiness engine is unit-tested PURELY — inject `ReadinessLoadedState`
// (no DB) and assert cost/supply/capacity/compliance/readiness. Mirrors the "vitest is node-env, test pure
// logic only" constraint for the DB-touching path.

function vessel(over: Partial<ReadinessVesselState> & Pick<ReadinessVesselState, "id" | "code">): ReadinessVesselState {
  return {
    type: "TANK",
    label: `Tank ${over.code}`,
    capacityL: 1000,
    volumeL: 0,
    isActive: true,
    updatedAt: "2026-07-09T00:00:00.000Z",
    lots: [],
    capacityReserved: 0,
    ...over,
  };
}

function material(over: Partial<ReadinessMaterialState> & Pick<ReadinessMaterialState, "id" | "displayName">): ReadinessMaterialState {
  return {
    category: "ADDITIVE",
    kind: "SO2",
    isActive: true,
    isStockTracked: true,
    stockUnit: "g",
    onHand: 1000,
    reserved: 0,
    costPerStockUnit: 0.5,
    costReason: null,
    ...over,
  };
}

function makeState(over: Partial<ReadinessLoadedState> = {}): ReadinessLoadedState {
  return {
    vesselsById: new Map(),
    materialsById: new Map(),
    lotsById: new Map(),
    lotVolumeReservedById: new Map(),
    currency: "USD",
    stateReadAt: "2026-07-09T12:00:00.000Z",
    fingerprint: "fp-test",
    ...over,
  };
}

function input(taskBuilds: TaskBuild[], over: Partial<WorkOrderReadinessInput> = {}): WorkOrderReadinessInput {
  return { source: "manual", title: "Test WO", assigneeEmail: null, dueDate: null, taskBuilds, ...over };
}

describe("TASK_COVERAGE contract", () => {
  it("classifies every TASK_VOCABULARY task type with a non-empty reason", () => {
    for (const taskType of Object.keys(TASK_VOCABULARY)) {
      const entry = TASK_COVERAGE[taskType];
      expect(entry, `missing coverage for ${taskType}`).toBeDefined();
      expect(["supported", "runtime", "unsupported", "future_phase"]).toContain(entry.state);
      expect(entry.reason.trim().length, `empty reason for ${taskType}`).toBeGreaterThan(0);
    }
  });

  it("has no coverage entries for task types outside the vocabulary", () => {
    for (const taskType of Object.keys(TASK_COVERAGE)) {
      expect(TASK_VOCABULARY[taskType], `stray coverage for ${taskType}`).toBeDefined();
    }
  });

  it("marks crush/press/harvest as runtime with declared runtime fields", () => {
    for (const t of ["CRUSH", "PRESS", "HARVEST_WEIGH_IN"]) {
      expect(TASK_COVERAGE[t].state).toBe("runtime");
      expect((TASK_COVERAGE[t].runtimeFields ?? []).length).toBeGreaterThan(0);
    }
  });
});

describe("computeWorkOrderReadiness — RACK", () => {
  it("warns on destination overfill and blends, and emits fill diff rows", () => {
    const state = makeState({
      vesselsById: new Map([
        ["v-from", vessel({ id: "v-from", code: "T1", volumeL: 900, lots: [
          { id: "l-a", code: "LOT-A", status: "AGING", volumeL: 450, updatedAt: "x", taxAbvOverride: null },
          { id: "l-b", code: "LOT-B", status: "AGING", volumeL: 450, updatedAt: "x", taxAbvOverride: null },
        ] })],
        ["v-to", vessel({ id: "v-to", code: "T2", capacityL: 500, volumeL: 100 })],
      ]),
    });
    const p = computeWorkOrderReadiness(input([{ taskType: "RACK", values: { fromVesselId: "v-from", toVesselId: "v-to" } }]), state);
    expect(p.status).toBe("ready"); // advisory warnings only
    const codes = p.warnings.map((w) => w.code);
    expect(codes).toContain("destination_headroom_short"); // 900 into 400 headroom
    expect(codes).toContain("rack_blend_review");
    expect(p.diff.rows.filter((r) => r.kind === "vessel")).toHaveLength(2);
  });

  it("blocks on an inactive vessel", () => {
    const state = makeState({
      vesselsById: new Map([
        ["v-from", vessel({ id: "v-from", code: "T1", volumeL: 100, isActive: false })],
        ["v-to", vessel({ id: "v-to", code: "T2" })],
      ]),
    });
    const p = computeWorkOrderReadiness(input([{ taskType: "RACK", values: { fromVesselId: "v-from", toVesselId: "v-to" } }]), state);
    expect(p.status).toBe("blocked");
    expect(p.warnings.some((w) => w.code === "inactive_vessel")).toBe(true);
  });

  it("blocks when a referenced vessel no longer exists", () => {
    const state = makeState({ vesselsById: new Map([["v-to", vessel({ id: "v-to", code: "T2" })]]) });
    const p = computeWorkOrderReadiness(input([{ taskType: "RACK", values: { fromVesselId: "gone", toVesselId: "v-to" } }]), state);
    expect(p.status).toBe("blocked");
    expect(p.warnings.some((w) => w.code === "missing_vessel")).toBe(true);
  });
});

describe("computeWorkOrderReadiness — ADDITION / FINING", () => {
  const vesselState = () => makeState({
    vesselsById: new Map([["v1", vessel({ id: "v1", code: "T1", volumeL: 1000, lots: [{ id: "l1", code: "LOT-1", status: "AGING", volumeL: 1000, updatedAt: "x", taxAbvOverride: null }] })]]),
    materialsById: new Map([["m1", material({ id: "m1", displayName: "KMBS" })]]),
  });

  it("computes a known weighted-average cost for a doseable material", () => {
    const p = computeWorkOrderReadiness(input([{ taskType: "ADDITION", values: { vesselId: "v1", materialId: "m1", amount: 30, doseUnit: "g" } }]), vesselState());
    expect(p.status).toBe("ready");
    expect(p.cost.hasUnknownCost).toBe(false);
    const line = p.cost.lines[0];
    expect(line.estimatedCost).toBe(15); // 30 g × $0.5/g
    expect(line.classification).toBe("wine_cogs");
  });

  it("blocks a non-doseable (cleaning) material from being dosed into wine", () => {
    const state = vesselState();
    state.materialsById.set("m1", material({ id: "m1", displayName: "Caustic", category: "CLEANING_SANITIZING", kind: "CLEANING" }));
    const p = computeWorkOrderReadiness(input([{ taskType: "ADDITION", values: { vesselId: "v1", materialId: "m1", amount: 30, doseUnit: "g" } }]), state);
    expect(p.status).toBe("blocked");
    expect(p.warnings.some((w) => w.code === "non_doseable_material")).toBe(true);
  });

  it("keeps unknown cost explicit (never $0) and flags a warning", () => {
    const state = vesselState();
    state.materialsById.set("m1", material({ id: "m1", displayName: "KMBS", costPerStockUnit: null, costReason: "No open supply lots.", onHand: 0 }));
    const p = computeWorkOrderReadiness(input([{ taskType: "ADDITION", values: { vesselId: "v1", materialId: "m1", amount: 30, doseUnit: "g" } }]), state);
    expect(p.cost.hasUnknownCost).toBe(true);
    expect(p.cost.totalKnownCost).toBeNull();
    expect(p.cost.lines[0].estimatedCost).toBeNull();
    expect(p.warnings.some((w) => w.code === "unknown_cost")).toBe(true);
  });
});

describe("computeWorkOrderReadiness — observations & maintenance", () => {
  it("asks which lot when a panel targets a blended vessel (needs_input, not thrown)", () => {
    const state = makeState({
      vesselsById: new Map([["v1", vessel({ id: "v1", code: "T1", volumeL: 800, lots: [
        { id: "l1", code: "LOT-1", status: "AGING", volumeL: 400, updatedAt: "x", taxAbvOverride: null },
        { id: "l2", code: "LOT-2", status: "AGING", volumeL: 400, updatedAt: "x", taxAbvOverride: null },
      ] })]]),
    });
    const p = computeWorkOrderReadiness(input([{ taskType: "PANEL", values: { vesselId: "v1" } }]), state);
    expect(p.status).toBe("needs_input");
    expect(p.unresolved).toHaveLength(1);
  });

  it("classifies cleaning supply as overhead, never wine COGS", () => {
    const state = makeState({
      vesselsById: new Map([["v1", vessel({ id: "v1", code: "T1" })]]),
      materialsById: new Map([["m1", material({ id: "m1", displayName: "Proxycarb", category: "CLEANING_SANITIZING", kind: "CLEANING", costPerStockUnit: 0.1 })]]),
    });
    const p = computeWorkOrderReadiness(input([{ taskType: "CLEAN", values: { vesselId: "v1", materialId: "m1", amount: 50 } }]), state);
    expect(p.status).toBe("ready");
    expect(p.cost.lines[0].classification).toBe("overhead");
    expect(p.cost.lines[0].estimatedCost).toBe(5); // 50 × $0.1
  });
});

describe("computeWorkOrderReadiness — runtime-required task families", () => {
  it("treats crush/press/harvest as ready with runtime inputs (execute screen owns real data)", () => {
    const p = computeWorkOrderReadiness(
      input([
        { taskType: "CRUSH", values: {} },
        { taskType: "PRESS", values: { op: "PRESS" } },
        { taskType: "HARVEST_WEIGH_IN", values: {} },
      ]),
      makeState(),
    );
    expect(p.status).toBe("ready");
    expect(p.runtimeInputs.some((r) => r.taskType === "CRUSH")).toBe(true);
    expect(p.runtimeInputs.some((r) => r.taskType === "PRESS")).toBe(true);
    expect(p.runtimeInputs.some((r) => r.taskType === "HARVEST_WEIGH_IN")).toBe(true);
  });

  it("blocks an invalid select value (PRESS op)", () => {
    const p = computeWorkOrderReadiness(input([{ taskType: "PRESS", values: { op: "NONSENSE" } }]), makeState());
    expect(p.status).toBe("blocked");
    expect(p.warnings.some((w) => w.code === "invalid_select")).toBe(true);
  });
});

describe("computeWorkOrderReadiness — envelope", () => {
  it("passes source metadata, coverage rows, and schema version through", () => {
    const p = computeWorkOrderReadiness(input([{ taskType: "NOTE", title: "Sweep the pad", values: {} }], { source: "assistant", title: "Chores" }), makeState());
    expect(p.schemaVersion).toBe(READINESS_SCHEMA_VERSION);
    expect(p.source).toBe("assistant");
    expect(p.title).toBe("Chores");
    expect(p.status).toBe("ready");
    expect(p.coverage).toEqual([{ taskSeq: 1, taskType: "NOTE", state: "supported", reason: TASK_COVERAGE.NOTE.reason }]);
    expect(p.cost.lines).toHaveLength(0);
    expect(p.warnings).toHaveLength(0);
  });

  it("flags an unknown task type as blocked with unsupported coverage", () => {
    const p = computeWorkOrderReadiness(input([{ taskType: "TELEPORT", values: {} }]), makeState());
    expect(p.status).toBe("blocked");
    expect(p.coverage[0].state).toBe("unsupported");
    expect(p.warnings.some((w) => w.code === "unknown_task_type")).toBe(true);
  });

  // Unit 2 guarantee: the readiness math is source-independent. The manual builder and the embedded vessel
  // modal (and the assistant) MUST get the same warnings/cost/diff for the same TaskBuild[].
  it("produces identical warnings/cost/diff regardless of source", () => {
    const state = makeState({
      vesselsById: new Map([["v1", vessel({ id: "v1", code: "T1", volumeL: 1000, lots: [{ id: "l1", code: "LOT-1", status: "AGING", volumeL: 1000, updatedAt: "x", taxAbvOverride: null }] })]]),
      materialsById: new Map([["m1", material({ id: "m1", displayName: "KMBS" })]]),
    });
    const builds: TaskBuild[] = [{ taskType: "ADDITION", values: { vesselId: "v1", materialId: "m1", amount: 30, doseUnit: "g" } }];
    const manual = computeWorkOrderReadiness(input(builds, { source: "manual" }), state);
    const modal = computeWorkOrderReadiness(input(builds, { source: "vessel_modal" }), state);
    expect(modal.source).toBe("vessel_modal");
    expect(manual.warnings).toEqual(modal.warnings);
    expect(manual.cost).toEqual(modal.cost);
    expect(manual.diff).toEqual(modal.diff);
    expect(manual.unresolved).toEqual(modal.unresolved);
    expect(manual.status).toBe(modal.status);
  });
});
