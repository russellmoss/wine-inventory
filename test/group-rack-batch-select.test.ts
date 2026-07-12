import { describe, it, expect } from "vitest";
import { selectGroupRackMembers, isAllRemainingExpr, type GroupRackMemberLite } from "@/lib/work-orders/group-rack-select";

// Plan 055 U6 — the pure member-reference expander behind the group_rack_batch tool.
const members: GroupRackMemberLite[] = [
  { vesselId: "v101", code: "B101" },
  { vesselId: "v102", code: "B102" },
  { vesselId: "v103", code: "B103" },
  { vesselId: "v104", code: "B104" },
];

describe("selectGroupRackMembers", () => {
  it("expands a range, intersected with pending", () => {
    const pending = ["v101", "v102", "v103", "v104"];
    expect(selectGroupRackMembers("B101-B103", members, pending)).toEqual({
      selected: ["v101", "v102", "v103"],
      droppedDone: [],
      unknown: [],
    });
  });

  it("expands a comma/and list", () => {
    const pending = ["v101", "v102", "v103", "v104"];
    expect(selectGroupRackMembers("B101, B103 and B104", members, pending)).toEqual({
      selected: ["v101", "v103", "v104"],
      droppedDone: [],
      unknown: [],
    });
  });

  it("'the rest' / 'all remaining' / empty → every pending member", () => {
    const pending = ["v102", "v104"];
    expect(selectGroupRackMembers("the rest", members, pending).selected).toEqual(["v102", "v104"]);
    expect(selectGroupRackMembers("all remaining", members, pending).selected).toEqual(["v102", "v104"]);
    expect(selectGroupRackMembers("", members, pending).selected).toEqual(["v102", "v104"]);
    expect(selectGroupRackMembers(undefined, members, pending).selected).toEqual(["v102", "v104"]);
  });

  it("drops a member that's already done (not pending) rather than erroring", () => {
    const pending = ["v103", "v104"]; // B101, B102 already recorded
    const r = selectGroupRackMembers("B101-B103", members, pending);
    expect(r.selected).toEqual(["v103"]);
    expect(r.droppedDone).toEqual(["B101", "B102"]);
    expect(r.unknown).toEqual([]);
  });

  it("flags an unknown code (not a member of this task)", () => {
    const pending = ["v101", "v102", "v103", "v104"];
    const r = selectGroupRackMembers("B101, B999", members, pending);
    expect(r.selected).toEqual(["v101"]);
    expect(r.unknown).toEqual(["B999"]);
  });

  it("matches codes case/format-insensitively and dedupes", () => {
    const pending = ["v101"];
    const r = selectGroupRackMembers("b-101, B101", members, pending);
    expect(r.selected).toEqual(["v101"]);
  });

  it("throws on an inverted range (surfaces the mistake)", () => {
    expect(() => selectGroupRackMembers("B104-B101", members, ["v101"])).toThrow(/runs backward/i);
  });

  it("isAllRemainingExpr recognizes the sentinels", () => {
    expect(isAllRemainingExpr("")).toBe(true);
    expect(isAllRemainingExpr("the rest")).toBe(true);
    expect(isAllRemainingExpr("all remaining")).toBe(true);
    expect(isAllRemainingExpr("B101-B104")).toBe(false);
  });
});
