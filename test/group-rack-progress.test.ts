import { describe, it, expect } from "vitest";
import { deriveGroupRackProgress, groupRackMemberIds, type BatchAttemptLite, type PlannedGroupRack } from "@/lib/work-orders/group-rack-progress";

// Plan 054 (Phase 9.4b) Unit 1: the pure per-member progress projection. Locks the "what's left" logic
// that the execute screen, the batch completion core, and per-batch LIFO reject all read from.

const barrelDown: PlannedGroupRack = {
  direction: "BARREL_DOWN",
  sourceVesselId: "tank1",
  destVesselIds: ["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8", "b9", "b10"],
  memberCodes: ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10"],
};

const batch = (id: string, seq: number, memberVesselIds: string[], status = "PENDING_APPROVAL", operationId = seq * 100): BatchAttemptLite => ({
  id, seq, status, operationId, groupRackBatch: { memberVesselIds, operationId },
});

describe("groupRackMemberIds", () => {
  it("returns destVesselIds for barrel-down and sourceVesselIds for rack-to-tank", () => {
    expect(groupRackMemberIds(barrelDown)).toHaveLength(10);
    expect(groupRackMemberIds({ direction: "RACK_TO_TANK", destVesselId: "t2", sourceVesselIds: ["b1", "b2"] })).toEqual(["b1", "b2"]);
  });
});

describe("deriveGroupRackProgress", () => {
  it("no batches → every member pending", () => {
    const p = deriveGroupRackProgress(barrelDown, []);
    expect(p.pendingVesselIds).toHaveLength(10);
    expect(p.completedVesselIds).toHaveLength(0);
    expect(p.allMembersDone).toBe(false);
    expect(p.latestBatchAttemptId).toBeNull();
    expect(p.batchCount).toBe(0);
  });

  it("one batch of 4 → 4 done, 6 pending, not all done", () => {
    const p = deriveGroupRackProgress(barrelDown, [batch("a1", 1, ["b1", "b2", "b3", "b4"])]);
    expect(p.completedVesselIds).toEqual(["b1", "b2", "b3", "b4"]);
    expect(p.pendingVesselIds).toEqual(["b5", "b6", "b7", "b8", "b9", "b10"]);
    expect(p.allMembersDone).toBe(false);
    expect(p.latestBatchAttemptId).toBe("a1");
    expect(p.members.find((m) => m.vesselId === "b1")).toMatchObject({ done: true, byAttemptId: "a1", byOperationId: 100 });
    expect(p.members.find((m) => m.vesselId === "b5")?.done).toBe(false);
  });

  it("two batches covering all → all done, latest batch is the LIFO target", () => {
    const p = deriveGroupRackProgress(barrelDown, [
      batch("a1", 1, ["b1", "b2", "b3", "b4"]),
      batch("a2", 2, ["b5", "b6", "b7", "b8", "b9", "b10"]),
    ]);
    expect(p.allMembersDone).toBe(true);
    expect(p.pendingVesselIds).toHaveLength(0);
    expect(p.latestBatchAttemptId).toBe("a2");
    expect(p.batchCount).toBe(2);
  });

  it("a REJECTED batch's members return to pending", () => {
    const p = deriveGroupRackProgress(barrelDown, [
      batch("a1", 1, ["b1", "b2", "b3", "b4"]),
      batch("a2", 2, ["b5", "b6"], "REJECTED"),
    ]);
    expect(p.completedVesselIds).toEqual(["b1", "b2", "b3", "b4"]);
    expect(p.pendingVesselIds).toContain("b5");
    expect(p.pendingVesselIds).toContain("b6");
    expect(p.latestBatchAttemptId).toBe("a1"); // a2 is rejected → LIFO target falls back to a1
    expect(p.batchCount).toBe(1);
  });

  it("a member listed by two live batches counts once (first wins)", () => {
    const p = deriveGroupRackProgress(barrelDown, [
      batch("a1", 1, ["b1", "b2"]),
      batch("a2", 2, ["b2", "b3"]),
    ]);
    expect(p.completedVesselIds).toEqual(["b1", "b2", "b3"]);
    expect(p.members.find((m) => m.vesselId === "b2")?.byAttemptId).toBe("a1");
  });

  it("a legacy one-shot attempt (no groupRackBatch) reads as fully done", () => {
    const p = deriveGroupRackProgress(barrelDown, [{ id: "legacy", seq: 1, status: "APPROVED", operationId: 999, groupRackBatch: null }]);
    expect(p.allMembersDone).toBe(true);
    expect(p.members.every((m) => m.done && m.byOperationId === 999)).toBe(true);
    expect(p.latestBatchAttemptId).toBeNull(); // not a batch attempt
  });

  it("ignores completed ids that aren't planned members", () => {
    const p = deriveGroupRackProgress(barrelDown, [batch("a1", 1, ["b1", "ghost"])]);
    expect(p.completedVesselIds).toEqual(["b1"]);
  });

  it("throws when the task has no members", () => {
    expect(() => deriveGroupRackProgress({ direction: "BARREL_DOWN", destVesselIds: [] }, [])).toThrow(/no member/i);
  });
});
