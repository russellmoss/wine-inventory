import { describe, it, expect } from "vitest";
import { planVesselReadingFanout, dedupeByPhysicalReading, physicalReadingKey } from "@/lib/chemistry/fanout-plan";

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

describe("dedupeByPhysicalReading (vessel-scoped views)", () => {
  it("collapses fanned-out panels sharing a group to one, keeps ungrouped panels distinct", () => {
    const panels = [
      { id: "p1", vesselReadingGroupId: "vrg:r1" }, // fan-out group r1, lot A
      { id: "p2", vesselReadingGroupId: "vrg:r1" }, // fan-out group r1, lot B  -> deduped away
      { id: "p3", vesselReadingGroupId: null }, // legacy single-lot panel -> kept
      { id: "p4", vesselReadingGroupId: "vrg:r2" }, // a second physical reading -> kept
    ];
    const out = dedupeByPhysicalReading(panels);
    expect(out.map((p) => p.id)).toEqual(["p1", "p3", "p4"]);
  });

  it("null group ids never collapse together (NULL is distinct, mirrors the DB unique)", () => {
    const panels = [
      { id: "a", vesselReadingGroupId: null },
      { id: "b", vesselReadingGroupId: null },
    ];
    expect(dedupeByPhysicalReading(panels)).toHaveLength(2);
  });

  it("physicalReadingKey is the group id when grouped, else the panel id", () => {
    expect(physicalReadingKey({ id: "x", vesselReadingGroupId: "vrg:r" })).toBe("vrg:r");
    expect(physicalReadingKey({ id: "x", vesselReadingGroupId: null })).toBe("x");
  });
});
