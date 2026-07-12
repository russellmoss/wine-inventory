import { describe, it, expect } from "vitest";
import { wouldCreateCycle, unsatisfiedPredecessors, type DepEdge, type PredecessorWo } from "@/lib/work-orders/wo-dependencies";

// Plan 053 A5: cross-order dependencies. Edge {workOrderId: A, dependsOnWorkOrderId: B} = "A depends on B".
// These lock the two decisions that matter: no cycles can form, and a dependent order is blocked until
// every predecessor is worker-complete (all tasks worker-completed; a CANCELLED predecessor is cleared).

describe("wouldCreateCycle", () => {
  it("rejects a self-edge", () => {
    expect(wouldCreateCycle([], "A", "A")).toBe(true);
  });

  it("allows an independent edge", () => {
    expect(wouldCreateCycle([], "A", "B")).toBe(false);
  });

  it("rejects a direct back-edge (A→B already exists, adding B→A)", () => {
    const edges: DepEdge[] = [{ workOrderId: "A", dependsOnWorkOrderId: "B" }];
    expect(wouldCreateCycle(edges, "B", "A")).toBe(true);
  });

  it("rejects a transitive cycle (A→B→C, adding C→A)", () => {
    const edges: DepEdge[] = [
      { workOrderId: "A", dependsOnWorkOrderId: "B" },
      { workOrderId: "B", dependsOnWorkOrderId: "C" },
    ];
    expect(wouldCreateCycle(edges, "C", "A")).toBe(true);
    // but a diamond (C→A where A doesn't reach C) is fine
    expect(wouldCreateCycle(edges, "A", "C")).toBe(false); // A already depends on C transitively — not a cycle
  });
});

describe("unsatisfiedPredecessors", () => {
  const wo = (number: number, status: string, taskStatuses: string[]): PredecessorWo => ({ number, status, taskStatuses });

  it("a predecessor with all tasks worker-complete is satisfied", () => {
    expect(unsatisfiedPredecessors([wo(12, "IN_PROGRESS", ["PENDING_APPROVAL", "DONE"])])).toHaveLength(0);
  });

  it("a predecessor with an unfinished task blocks", () => {
    const blocking = unsatisfiedPredecessors([wo(12, "IN_PROGRESS", ["DONE", "PENDING"])]);
    expect(blocking.map((p) => p.number)).toEqual([12]);
  });

  it("a REJECTED task in the predecessor blocks (not yet redone)", () => {
    expect(unsatisfiedPredecessors([wo(12, "IN_PROGRESS", ["REJECTED"])])).toHaveLength(1);
  });

  it("a CANCELLED predecessor is cleared even with unfinished tasks", () => {
    expect(unsatisfiedPredecessors([wo(12, "CANCELLED", ["PENDING"])])).toHaveLength(0);
  });

  it("a predecessor with zero tasks is unsatisfied (nothing done yet)", () => {
    expect(unsatisfiedPredecessors([wo(12, "ISSUED", [])])).toHaveLength(1);
  });

  it("APPROVED tasks count as worker-complete", () => {
    expect(unsatisfiedPredecessors([wo(12, "APPROVED", ["APPROVED", "SKIPPED"])])).toHaveLength(0);
  });
});
