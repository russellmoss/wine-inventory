import { describe, expect, it } from "vitest";
import { TASK_VOCABULARY, instantiateTaskBuilds, type TaskBuild } from "@/lib/work-orders/template-vocabulary";
import {
  workOrderTasksToBuilds,
  resolveTaskType,
  buildReverseTaskTypeIndex,
  renderModeFor,
  isTaskEditable,
  type StoredTaskLite,
} from "@/lib/work-orders/task-to-build";

const vocab = TASK_VOCABULARY;
const index = buildReverseTaskTypeIndex(vocab);

// Instantiate a build the way the create path does, then present it as a stored PENDING task row.
function toStored(build: TaskBuild, over: Partial<StoredTaskLite> = {}): StoredTaskLite {
  const [row] = instantiateTaskBuilds([build], vocab);
  return {
    id: over.id ?? "t1",
    seq: over.seq ?? row.seq ?? 1,
    groupSeq: over.groupSeq ?? row.groupSeq ?? 0,
    kind: over.kind ?? row.kind,
    status: over.status ?? "PENDING",
    title: over.title ?? row.title,
    opType: over.opType ?? row.opType ?? null,
    observationType: over.observationType ?? row.observationType ?? null,
    activityType: over.activityType ?? row.activityType ?? null,
    assigneeId: over.assigneeId ?? null,
    plannedPayload: over.plannedPayload ?? row.plannedPayload,
  };
}

describe("task-to-build reverse mapping (Plan 071)", () => {
  it("round-trips the common types back to their taskType + values", () => {
    const cases: TaskBuild[] = [
      { taskType: "RACK", values: { fromVesselId: "v1", toVesselId: "v2", drawL: 40 } },
      { taskType: "ADDITION", values: { vesselId: "v1", lotId: "l1", materialId: "m1", amount: 5, doseUnit: "g/hL" } },
      { taskType: "FINING", values: { vesselId: "v1", lotId: "l1", materialId: "m1", amount: 2, doseUnit: "g/hL" } },
      { taskType: "TOPPING", values: { fromVesselId: "v1", toVesselId: "v2", volumeL: 10 } },
      { taskType: "CAP_MGMT", values: { vesselId: "v1", technique: "PUNCHDOWN" } },
      { taskType: "CLEAN", values: { vesselId: "v1" } },
      { taskType: "BRIX", values: { vesselId: "v1", lotId: "l1" } },
      { taskType: "NOTE", values: { note: "check the airlock" } },
    ];
    for (const b of cases) {
      const stored = toStored(b);
      expect(resolveTaskType(stored, vocab, index)).toBe(b.taskType);
      const { groups } = workOrderTasksToBuilds([stored], vocab, new Map());
      const out = groups[0][0];
      expect(out.taskType).toBe(b.taskType);
      expect(out.values).toEqual(b.values);
      expect(out.locked).toBe(false);
      expect(out.existingTaskId).toBe(stored.id);
    }
  });

  it("disambiguates RACK vs GROUP_RACK on the groupRack payload", () => {
    const rack = toStored({ taskType: "RACK", values: { fromVesselId: "v1", toVesselId: "v2", drawL: 5 } });
    expect(resolveTaskType(rack, vocab, index)).toBe("RACK");
    // A GROUP_RACK row: same kind/opType, but a groupRack block in the payload.
    const groupRackRow: StoredTaskLite = {
      ...rack,
      id: "gr1",
      plannedPayload: { note: "barrel down", groupRack: { direction: "BARREL_DOWN", members: ["b1", "b2"] } },
    };
    expect(resolveTaskType(groupRackRow, vocab, index)).toBe("GROUP_RACK");
    expect(renderModeFor("GROUP_RACK", groupRackRow.plannedPayload)).toBe("group-form");
  });

  it("locks an executed (non-PENDING) task with a reason", () => {
    const stored = toStored({ taskType: "ADDITION", values: { vesselId: "v1", materialId: "m1", amount: 5, doseUnit: "g" } }, { status: "APPROVED" });
    expect(isTaskEditable(stored)).toBe(false);
    const { groups, anyLocked } = workOrderTasksToBuilds([stored], vocab, new Map());
    expect(anyLocked).toBe(true);
    expect(groups[0][0].locked).toBe(true);
    expect(groups[0][0].lockReason).toMatch(/reverse/i);
  });

  it("preserves assignee, equipment, and multi-group ordering", () => {
    const g0 = toStored({ taskType: "RACK", values: { fromVesselId: "v1", toVesselId: "v2", drawL: 5 } }, { id: "a", groupSeq: 0, seq: 1, assigneeId: "u1" });
    const g1 = toStored({ taskType: "CLEAN", values: { vesselId: "v3" } }, { id: "b", groupSeq: 1, seq: 2 });
    const equip = new Map([["a", ["eq1", "eq2"]]]);
    const { groups } = workOrderTasksToBuilds([g1, g0], vocab, equip); // pass out of order
    expect(groups).toHaveLength(2);
    expect(groups[0][0].existingTaskId).toBe("a");
    expect(groups[0][0].assigneeId).toBe("u1");
    expect(groups[0][0].equipmentIds).toEqual(["eq1", "eq2"]);
    expect(groups[1][0].existingTaskId).toBe("b");
  });
});
