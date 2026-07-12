import { describe, it, expect } from "vitest";
import { firstBlockingPriorTask, GROUP_DONE_STATUSES, type GroupGatingTask } from "@/lib/work-orders/group-gating";

// Plan 053 A3: sequential-group gating is positional. A task completes only once every LOWER-group task is
// worker-completed. Rejected/pending predecessors block; a reissue (same row back to PENDING_APPROVAL)
// clears it; same-group tasks are parallel and never block each other.

const t = (title: string, seq: number, groupSeq: number, status: string): GroupGatingTask => ({ title, seq, groupSeq, status });

describe("firstBlockingPriorTask", () => {
  it("first group (0) is never blocked", () => {
    expect(firstBlockingPriorTask(0, [t("Sanitize", 1, 0, "PENDING")])).toBeNull();
  });

  it("blocks when an earlier group's task is not worker-completed", () => {
    const siblings = [t("Sanitize tank", 1, 0, "IN_PROGRESS"), t("Rack into tank", 2, 1, "PENDING")];
    const blocking = firstBlockingPriorTask(1, siblings);
    expect(blocking?.title).toBe("Sanitize tank");
  });

  it("clears once the earlier group is worker-completed (PENDING_APPROVAL counts)", () => {
    const siblings = [t("Sanitize tank", 1, 0, "PENDING_APPROVAL")];
    expect(firstBlockingPriorTask(1, siblings)).toBeNull();
  });

  it("a REJECTED predecessor blocks; reissuing it (PENDING_APPROVAL) clears — no edge bookkeeping", () => {
    expect(firstBlockingPriorTask(1, [t("Rack", 1, 0, "REJECTED")])?.title).toBe("Rack");
    expect(firstBlockingPriorTask(1, [t("Rack", 1, 0, "PENDING_APPROVAL")])).toBeNull();
  });

  it("SKIPPED clears the step", () => {
    expect(firstBlockingPriorTask(1, [t("Optional top-up", 1, 0, "SKIPPED")])).toBeNull();
  });

  it("same-group tasks never block each other (parallel)", () => {
    const siblings = [t("Clean A", 1, 1, "PENDING"), t("Clean B", 2, 1, "PENDING")];
    expect(firstBlockingPriorTask(1, siblings)).toBeNull();
  });

  it("returns the EARLIEST blocking task by seq across multiple prior groups", () => {
    const siblings = [t("Group0 late", 3, 0, "DONE"), t("Group1 early", 1, 1, "PENDING"), t("Group1 mid", 2, 1, "REJECTED")];
    expect(firstBlockingPriorTask(2, siblings)?.title).toBe("Group1 early");
  });

  it("done-set is exactly the worker-completed statuses", () => {
    expect([...GROUP_DONE_STATUSES].sort()).toEqual(["APPROVED", "DONE", "PENDING_APPROVAL", "SKIPPED"]);
  });
});
