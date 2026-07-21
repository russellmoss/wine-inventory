import { describe, it, expect } from "vitest";
import { dedupeByPhysicalReading, physicalReadingKey } from "@/lib/chemistry/fanout-plan";

// The FAN-OUT PLANNER is gone (plan 088, Unit 15). Plan 060 used to spread a whole-tank reading
// across every co-resident lot; a vessel now holds ONE cohesive liquid, so there is nothing to
// spread it over and nothing mints a group id any more.
//
// The read-side COLLAPSING below is deliberately kept. Five readings in production were genuinely
// fanned out, across lots since merged — without this each of them renders TWICE in a vessel view,
// forever. These tests guard that history, not a live feature.

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
