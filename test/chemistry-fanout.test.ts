import { describe, it, expect } from "vitest";
import { planVesselReadingFanout } from "@/lib/chemistry/fanout-plan";

// Plan 060: the pure fan-out planner. DB-free — proves the group id + per-lot idempotency keys are
// deterministic (a retry / offline re-sync must land the SAME keys so the unique index dedups).

describe("planVesselReadingFanout", () => {
  it("fans two resident lots into one group with distinct, deterministic per-lot keys", () => {
    const plan = planVesselReadingFanout(["lotA", "lotB"], "req-123");
    expect(plan.vesselReadingGroupId).toBe("vrg:req-123");
    expect(plan.perLot).toEqual([
      { lotId: "lotA", clientRequestId: "vrg:req-123#lotA" },
      { lotId: "lotB", clientRequestId: "vrg:req-123#lotB" },
    ]);
    // keys are unique per lot (no collision → no accidental idempotent no-op across lots)
    const keys = plan.perLot.map((p) => p.clientRequestId);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("is deterministic — same (residents, base) yields byte-identical plan (idempotency contract)", () => {
    const a = planVesselReadingFanout(["lotA", "lotB"], "req-xyz");
    const b = planVesselReadingFanout(["lotA", "lotB"], "req-xyz");
    expect(a).toEqual(b);
  });

  it("a different base yields a different group (distinct physical readings don't collide)", () => {
    const first = planVesselReadingFanout(["lotA", "lotB"], "req-1");
    const second = planVesselReadingFanout(["lotA", "lotB"], "req-2");
    expect(first.vesselReadingGroupId).not.toBe(second.vesselReadingGroupId);
    expect(first.perLot[0].clientRequestId).not.toBe(second.perLot[0].clientRequestId);
  });

  it("single resident still plans one keyed entry (core delegates, but the planner is total)", () => {
    const plan = planVesselReadingFanout(["only"], "req-1");
    expect(plan.perLot).toHaveLength(1);
    expect(plan.perLot[0]).toEqual({ lotId: "only", clientRequestId: "vrg:req-1#only" });
  });
});
