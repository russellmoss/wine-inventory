import { describe, expect, it } from "vitest";
import {
  validateDependencyGraph,
  dependencyCascadeOnDrop,
  simulatePlanState,
  latestSuccessfulAttempt,
  isPredecessorComplete,
  assertDependenciesSatisfied,
  resolveProducedOutput,
  type TaskDependency,
  type PredecessorState,
} from "@/lib/work-orders/nl-dependencies";
import type { TaskBuild } from "@/lib/work-orders/template-vocabulary";

// Phase 9.3 Unit 5: the dependency graph is pure and unit-tested (DAG/validation/cascade/simulate) plus
// the completion-time gate + output resolution over injected attempt data.

const crush: TaskBuild = { taskType: "CRUSH", taskKey: "k-crush", values: { destVesselId: "v-t12" } };
const addition: TaskBuild = { taskType: "ADDITION", taskKey: "k-add", values: { vesselId: "v-t12", materialId: "m-enz" } };

describe("validateDependencyGraph", () => {
  it("accepts a valid single-edge DAG", () => {
    const graph: TaskDependency[] = [{ taskKey: "k-add", needs: [{ kind: "task_output", taskKey: "k-crush", output: "destLot" }] }];
    expect(validateDependencyGraph([crush, addition], graph)).toEqual({ ok: true, errors: [] });
  });

  it("treats an empty/absent graph as valid", () => {
    expect(validateDependencyGraph([crush, addition], undefined).ok).toBe(true);
    expect(validateDependencyGraph([crush, addition], []).ok).toBe(true);
  });

  it("rejects a reference to a task not in the proposal", () => {
    const graph: TaskDependency[] = [{ taskKey: "k-add", needs: [{ kind: "task_output", taskKey: "k-ghost", output: "destLot" }] }];
    const res = validateDependencyGraph([crush, addition], graph);
    expect(res.ok).toBe(false);
    expect(res.errors.join(" ")).toMatch(/unknown task "k-ghost"/);
  });

  it("rejects a self-dependency", () => {
    const graph: TaskDependency[] = [{ taskKey: "k-add", needs: [{ kind: "task_output", taskKey: "k-add", output: "destLot" }] }];
    expect(validateDependencyGraph([crush, addition], graph).errors.join(" ")).toMatch(/cannot depend on itself/);
  });

  it("rejects a cycle", () => {
    const a: TaskBuild = { taskType: "RACK", taskKey: "a", values: {} };
    const b: TaskBuild = { taskType: "RACK", taskKey: "b", values: {} };
    const graph: TaskDependency[] = [
      { taskKey: "a", needs: [{ kind: "task_output", taskKey: "b", output: "destVessel" }] },
      { taskKey: "b", needs: [{ kind: "task_output", taskKey: "a", output: "destVessel" }] },
    ];
    expect(validateDependencyGraph([a, b], graph).errors.join(" ")).toMatch(/cycle/);
  });

  it("rejects an unknown output name (ambiguous ref is a proposal-time error)", () => {
    const graph: TaskDependency[] = [{ taskKey: "k-add", needs: [{ kind: "task_output", taskKey: "k-crush", output: "somethingElse" }] }];
    expect(validateDependencyGraph([crush, addition], graph).errors.join(" ")).toMatch(/unknown output/);
  });

  it("requires every task to carry a stable key", () => {
    const noKey: TaskBuild = { taskType: "ADDITION", values: {} };
    const graph: TaskDependency[] = [{ taskKey: "k-add", needs: [{ kind: "task_output", taskKey: "k-crush", output: "destLot" }] }];
    expect(validateDependencyGraph([crush, noKey], graph).errors.join(" ")).toMatch(/no stable task key/);
  });
});

describe("dependencyCascadeOnDrop", () => {
  it("reports a kept task orphaned by dropping its predecessor", () => {
    const graph: TaskDependency[] = [{ taskKey: "k-add", needs: [{ kind: "task_output", taskKey: "k-crush", output: "destLot" }] }];
    expect(dependencyCascadeOnDrop(graph, new Set(["k-crush"]))).toEqual({ orphanedKeys: ["k-add"] });
  });

  it("does not report a task that is itself dropped", () => {
    const graph: TaskDependency[] = [{ taskKey: "k-add", needs: [{ kind: "task_output", taskKey: "k-crush", output: "destLot" }] }];
    expect(dependencyCascadeOnDrop(graph, new Set(["k-crush", "k-add"]))).toEqual({ orphanedKeys: [] });
  });
});

describe("simulatePlanState (display-only)", () => {
  it("accumulates planned volume deltas from rack + topping", () => {
    const builds: TaskBuild[] = [
      { taskType: "RACK", taskKey: "r", values: { fromVesselId: "A", toVesselId: "B", drawL: 100, lossL: 5 } },
      { taskType: "TOPPING", taskKey: "t", values: { fromVesselId: "B", toVesselId: "C", volumeL: 10 } },
    ];
    const state = simulatePlanState(builds);
    expect(state.get("A")).toBe(-100);
    expect(state.get("B")).toBe(95 - 10); // +95 from rack, -10 topped out
    expect(state.get("C")).toBe(10);
  });
});

function pred(over: Partial<PredecessorState> = {}): PredecessorState {
  return { taskKey: "k-crush", title: "De-stem / crush", destVesselId: "v-t12", sourceVesselId: "v-src", lotId: "l-must", isOperation: true, attempts: [], ...over };
}

describe("completion-time gating + output resolution", () => {
  it("blocks when the predecessor was skipped (no attempts) — out-of-order guard", () => {
    const p = pred({ attempts: [] });
    expect(isPredecessorComplete(p)).toBe(false);
    expect(() => assertDependenciesSatisfied([{ kind: "task_output", taskKey: "k-crush", output: "destLot" }], new Map([["k-crush", p]]))).toThrow(/must be completed before/);
  });

  it("blocks when the only attempt was rejected", () => {
    const p = pred({ attempts: [{ seq: 1, status: "REJECTED", operationId: 900 }] });
    expect(isPredecessorComplete(p)).toBe(false);
  });

  it("resolves to the latest successful attempt after a retry", () => {
    const p = pred({ attempts: [
      { seq: 1, status: "REJECTED", operationId: 900 },
      { seq: 2, status: "APPROVED", operationId: 901 },
    ] });
    expect(latestSuccessfulAttempt(p)?.operationId).toBe(901);
    expect(isPredecessorComplete(p)).toBe(true);
  });

  it("treats a runtime-placeholder OPERATION with no ledger op as incomplete", () => {
    const p = pred({ attempts: [{ seq: 1, status: "PENDING_APPROVAL", operationId: null }] });
    expect(isPredecessorComplete(p)).toBe(false);
  });

  it("names the requested output (multi-output producer)", () => {
    const p = pred({ destVesselId: "v-t12", lotId: "l-must", attempts: [{ seq: 1, status: "APPROVED", operationId: 902 }] });
    expect(resolveProducedOutput({ kind: "task_output", taskKey: "k-crush", output: "destLot" }, p)).toMatchObject({ vesselId: "v-t12", lotId: "l-must" });
    expect(resolveProducedOutput({ kind: "task_output", taskKey: "k-crush", output: "operationId" }, p)).toMatchObject({ operationId: 902 });
  });

  it("refuses to resolve output before the predecessor is complete", () => {
    expect(() => resolveProducedOutput({ kind: "task_output", taskKey: "k-crush", output: "destLot" }, pred())).toThrow(/has not produced its output yet/);
  });

  it("allows an OBSERVATION predecessor to complete without a ledger op", () => {
    const p = pred({ isOperation: false, attempts: [{ seq: 1, status: "APPROVED", operationId: null }] });
    expect(isPredecessorComplete(p)).toBe(true);
  });
});
