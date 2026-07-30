import { describe, expect, it } from "vitest";
import {
  freezeGroupSnapshotsTx,
  literalMembersFromPayload,
  parseMemberSnapshot,
  resolveTaskMembers,
  type MemberSnapshot,
} from "@/lib/work-orders/group-snapshot";

/**
 * GROUP-3 (plan 106, Unit 6) — an issued work order's member list is frozen.
 *
 * The end-to-end proof against a real database is `npm run verify:wo-member-snapshot`. What is
 * proven HERE is the decision logic of D3, which is where the invariant is actually decided:
 * the four cases, the once-only write, and the three refusals at issue.
 */

const SNAPSHOT: MemberSnapshot = {
  v: 1,
  groupId: "g1",
  groupName: "Rack 14",
  members: [
    { vesselId: "v1", code: "B101", label: "Barrel B101", position: 1 },
    { vesselId: "v2", code: "B102", label: "Barrel B102", position: 2 },
  ],
};

const LIVE = [
  { vesselId: "v1", code: "B101", label: "Barrel B101", position: 1 },
  { vesselId: "v3", code: "B103", label: "Barrel B103", position: 2 },
];

describe("D3 — which list a task reports, and from where", () => {
  it("reports the FROZEN list once a snapshot exists, ignoring live membership entirely", () => {
    const view = resolveTaskMembers(
      { vesselGroupId: "g1", memberSnapshot: SNAPSHOT as never, memberSnapshotAt: new Date("2026-07-30T10:00:00Z"), plannedPayload: {} },
      LIVE,
      "Rack 14 renamed",
    );
    expect(view.source).toBe("frozen");
    expect(view.members.map((m) => m.code)).toEqual(["B101", "B102"]);
    expect(view.frozenAt).toBe("2026-07-30T10:00:00.000Z");
  });

  it("keeps the group's name AS IT WAS at issue, so a rename cannot repaint the worksheet", () => {
    const view = resolveTaskMembers(
      { vesselGroupId: "g1", memberSnapshot: SNAPSHOT as never, memberSnapshotAt: new Date(), plannedPayload: {} },
      LIVE,
      "Rack 14 renamed",
    );
    expect(view.groupName).toBe("Rack 14");
  });

  it("reports LIVE membership while the task is still a draft with no snapshot", () => {
    const view = resolveTaskMembers(
      { vesselGroupId: "g1", memberSnapshot: null, memberSnapshotAt: null, plannedPayload: {} },
      LIVE,
      "Rack 14",
    );
    expect(view.source).toBe("live");
    expect(view.members.map((m) => m.code)).toEqual(["B101", "B103"]);
  });

  it("reports the LITERAL payload list when there was never a saved group", () => {
    const view = resolveTaskMembers(
      {
        vesselGroupId: null,
        memberSnapshot: null,
        memberSnapshotAt: null,
        plannedPayload: { groupActivity: { memberVesselIds: ["v7", "v8"], memberCodes: ["B201", "B202"] } } as never,
      },
      null,
      null,
    );
    expect(view.source).toBe("literal");
    expect(view.members.map((m) => m.code)).toEqual(["B201", "B202"]);
    expect(view.groupId).toBeNull();
  });

  it("reads a barrel-down payload, whose members live under destVesselIds", () => {
    expect(
      literalMembersFromPayload({ groupRack: { direction: "BARREL_DOWN", destVesselIds: ["v1"], memberCodes: ["B101"] } } as never).map(
        (m) => m.code,
      ),
    ).toEqual(["B101"]);
  });

  it("reads a rack-to-tank payload, whose members live under sourceVesselIds", () => {
    expect(
      literalMembersFromPayload({ groupRack: { direction: "RACK_TO_TANK", sourceVesselIds: ["v1"], memberCodes: ["B101"] } } as never).map(
        (m) => m.code,
      ),
    ).toEqual(["B101"]);
  });

  it("refuses to read an unversioned or malformed blob as a snapshot", () => {
    // A reader must never guess at a shape it doesn't recognise — that is how a "frozen" list quietly
    // becomes an empty one.
    expect(parseMemberSnapshot(null)).toBeNull();
    expect(parseMemberSnapshot([] as never)).toBeNull();
    expect(parseMemberSnapshot({ members: [] } as never)).toBeNull();
    expect(parseMemberSnapshot({ v: 2, groupId: "g1", members: [] } as never)).toBeNull();
  });
});

// ── the freeze itself ────────────────────────────────────────────────────────────────────────────

type FakeTask = { id: string; title: string; vesselGroupId: string | null; memberSnapshotAt: Date | null; memberSnapshot?: unknown; plannedPayload?: unknown };
type FakeGroup = { id: string; name: string; status: "ACTIVE" | "ARCHIVED"; members: { position: number; vessel: { id: string; code: string; type: string } }[] };

function fakeTx(tasks: FakeTask[], groups: FakeGroup[]) {
  return {
    workOrderTask: {
      findMany: async () => tasks.filter((t) => t.vesselGroupId !== null && t.memberSnapshotAt === null),
      updateMany: async ({ where, data }: { where: { id: string; memberSnapshotAt: null }; data: Record<string, unknown> }) => {
        const t = tasks.find((x) => x.id === where.id && x.memberSnapshotAt === null);
        if (!t) return { count: 0 };
        t.memberSnapshot = data.memberSnapshot;
        t.memberSnapshotAt = data.memberSnapshotAt as Date;
        if (data.plannedPayload !== undefined) t.plannedPayload = data.plannedPayload;
        return { count: 1 };
      },
    },
    vesselGroup: { findMany: async () => groups },
  } as never;
}

const GROUP: FakeGroup = {
  id: "g1",
  name: "Rack 14",
  status: "ACTIVE",
  members: [
    { position: 1, vessel: { id: "v1", code: "B101", type: "BARREL" } },
    { position: 2, vessel: { id: "v2", code: "B102", type: "BARREL" } },
  ],
};

const NOW = new Date("2026-07-30T12:00:00Z");

describe("freeze at issue", () => {
  it("writes the current membership onto the task", async () => {
    const tasks: FakeTask[] = [{ id: "t1", title: "Top rack 14", vesselGroupId: "g1", memberSnapshotAt: null, plannedPayload: { groupActivity: { activityType: "CLEAN", memberVesselIds: ["stale"], memberCodes: ["STALE"] } } }];
    const frozen = await freezeGroupSnapshotsTx(fakeTx(tasks, [GROUP]), "wo1", NOW);
    expect(frozen).toBe(1);
    expect(tasks[0].memberSnapshot).toMatchObject({
      v: 1,
      groupId: "g1",
      groupName: "Rack 14",
      members: [
        { vesselId: "v1", code: "B101", label: "Barrel B101", position: 1 },
        { vesselId: "v2", code: "B102", label: "Barrel B102", position: 2 },
      ],
    });
  });

  it("RECONCILES the executed payload to the snapshot — the fix that makes GROUP-3 real", async () => {
    // The first version wrote memberSnapshot and stopped. Nothing in the product read that column:
    // the worksheet, the execute form and the completion path all build their member list from
    // plannedPayload. So the frozen list was never shown and never executed, and the invariant was a
    // green check over a no-op. The freeze now rewrites the payload to match, so the list the crew
    // works IS the frozen list — through the surface that already exists.
    const tasks: FakeTask[] = [
      {
        id: "t1",
        title: "Top rack 14",
        vesselGroupId: "g1",
        memberSnapshotAt: null,
        plannedPayload: { groupActivity: { activityType: "CLEAN", memberVesselIds: ["stale"], memberCodes: ["STALE"] } },
      },
    ];
    await freezeGroupSnapshotsTx(fakeTx(tasks, [GROUP]), "wo1", NOW);
    const payload = tasks[0].plannedPayload as { groupActivity: Record<string, unknown> };
    expect(payload.groupActivity.memberVesselIds).toEqual(["v1", "v2"]);
    expect(payload.groupActivity.memberCodes).toEqual(["B101", "B102"]);
    // Everything else the task planned is left exactly as authored.
    expect(payload.groupActivity.activityType).toBe("CLEAN");
  });

  it("reconciles a barrel-down payload on destVesselIds and never invents a sourceVesselIds leg", async () => {
    const tasks: FakeTask[] = [
      {
        id: "t1",
        title: "Barrel down",
        vesselGroupId: "g1",
        memberSnapshotAt: null,
        plannedPayload: { groupRack: { direction: "BARREL_DOWN", sourceVesselId: "src", destVesselIds: ["stale"], memberCodes: ["STALE"], lossL: 3 } },
      },
    ];
    await freezeGroupSnapshotsTx(fakeTx(tasks, [GROUP]), "wo1", NOW);
    const gr = (tasks[0].plannedPayload as { groupRack: Record<string, unknown> }).groupRack;
    expect(gr.destVesselIds).toEqual(["v1", "v2"]);
    expect(gr.sourceVesselIds).toBeUndefined();
    expect(gr.lossL).toBe(3);
    expect(gr.sourceVesselId).toBe("src");
  });

  it("renumbers positions 1..N so the snapshot is internally consistent even if live order had drifted", async () => {
    const drifted: FakeGroup = { ...GROUP, members: [
      { position: 4, vessel: { id: "v1", code: "B101", type: "BARREL" } },
      { position: 9, vessel: { id: "v2", code: "B102", type: "BARREL" } },
    ] };
    const tasks: FakeTask[] = [{ id: "t1", title: "Top rack 14", vesselGroupId: "g1", memberSnapshotAt: null, plannedPayload: { groupActivity: { activityType: "CLEAN", memberVesselIds: ["stale"], memberCodes: ["STALE"] } } }];
    await freezeGroupSnapshotsTx(fakeTx(tasks, [drifted]), "wo1", NOW);
    expect((tasks[0].memberSnapshot as MemberSnapshot).members.map((m) => m.position)).toEqual([1, 2]);
  });

  it("is once-only: a task that already carries a snapshot is not re-frozen", async () => {
    // The guard is `memberSnapshotAt: null` in the WHERE, so it is the DATABASE that refuses the
    // second write — not a prior read that a concurrent issue could have raced past.
    const tasks: FakeTask[] = [
      { id: "t1", title: "Top rack 14", vesselGroupId: "g1", memberSnapshotAt: new Date("2026-07-01"), memberSnapshot: SNAPSHOT },
    ];
    const frozen = await freezeGroupSnapshotsTx(fakeTx(tasks, [GROUP]), "wo1", NOW);
    expect(frozen).toBe(0);
    expect(tasks[0].memberSnapshotAt).toEqual(new Date("2026-07-01"));
  });

  it("leaves a vesselGroupId-null task alone — its payload list is already the frozen list", async () => {
    const tasks: FakeTask[] = [{ id: "t1", title: "Top B101-B110", vesselGroupId: null, memberSnapshotAt: null }];
    expect(await freezeGroupSnapshotsTx(fakeTx(tasks, []), "wo1", NOW)).toBe(0);
  });

  it("REFUSES to issue against an archived group, naming it and the way out", async () => {
    const tasks: FakeTask[] = [{ id: "t1", title: "Top rack 14", vesselGroupId: "g1", memberSnapshotAt: null, plannedPayload: { groupActivity: { activityType: "CLEAN", memberVesselIds: ["stale"], memberCodes: ["STALE"] } } }];
    await expect(freezeGroupSnapshotsTx(fakeTx(tasks, [{ ...GROUP, status: "ARCHIVED" }]), "wo1", NOW)).rejects.toThrow(
      /archived group "Rack 14"\. Restore the group, or point the task somewhere else/,
    );
  });

  it("REFUSES to issue against an emptied group — a worksheet covering nothing is not a worksheet", async () => {
    const tasks: FakeTask[] = [{ id: "t1", title: "Top rack 14", vesselGroupId: "g1", memberSnapshotAt: null, plannedPayload: { groupActivity: { activityType: "CLEAN", memberVesselIds: ["stale"], memberCodes: ["STALE"] } } }];
    await expect(freezeGroupSnapshotsTx(fakeTx(tasks, [{ ...GROUP, members: [] }]), "wo1", NOW)).rejects.toThrow(
      /has no barrels in it, so "Top rack 14" would cover nothing/,
    );
  });

  it("REFUSES to issue when the group has been deleted out from under the draft", async () => {
    const tasks: FakeTask[] = [{ id: "t1", title: "Top rack 14", vesselGroupId: "g1", memberSnapshotAt: null, plannedPayload: { groupActivity: { activityType: "CLEAN", memberVesselIds: ["stale"], memberCodes: ["STALE"] } } }];
    await expect(freezeGroupSnapshotsTx(fakeTx(tasks, []), "wo1", NOW)).rejects.toThrow(/no longer exists/);
  });

  it("freezes several tasks against different groups independently (per-task, not per-work-order)", async () => {
    // F4: a single WorkOrder-level column could not represent this, which is why the snapshot is on
    // the TASK. groupSeq exists precisely so several task groups can run in one order.
    const g2: FakeGroup = { id: "g2", name: "New French oak", status: "ACTIVE", members: [{ position: 1, vessel: { id: "v9", code: "B900", type: "BARREL" } }] };
    const tasks: FakeTask[] = [
      { id: "t1", title: "Top rack 14", vesselGroupId: "g1", memberSnapshotAt: null, plannedPayload: { groupActivity: { activityType: "CLEAN", memberVesselIds: ["stale"], memberCodes: ["STALE"] } } },
      { id: "t2", title: "SO2 the new oak", vesselGroupId: "g2", memberSnapshotAt: null, plannedPayload: { groupActivity: { activityType: "CLEAN", memberVesselIds: [], memberCodes: [] } } },
    ];
    expect(await freezeGroupSnapshotsTx(fakeTx(tasks, [GROUP, g2]), "wo1", NOW)).toBe(2);
    expect((tasks[0].memberSnapshot as MemberSnapshot).groupName).toBe("Rack 14");
    expect((tasks[1].memberSnapshot as MemberSnapshot).groupName).toBe("New French oak");
  });
});

describe("AC-3 — the outcome the invariant is actually about", () => {
  it("add AND remove a barrel after issue; the reported list is byte-identical", async () => {
    const group: FakeGroup = JSON.parse(JSON.stringify(GROUP));
    const tasks: FakeTask[] = [{ id: "t1", title: "Top rack 14", vesselGroupId: "g1", memberSnapshotAt: null, plannedPayload: { groupActivity: { activityType: "CLEAN", memberVesselIds: ["stale"], memberCodes: ["STALE"] } } }];
    await freezeGroupSnapshotsTx(fakeTx(tasks, [group]), "wo1", NOW);
    const atIssue = JSON.stringify(
      resolveTaskMembers(
        { vesselGroupId: "g1", memberSnapshot: tasks[0].memberSnapshot as never, memberSnapshotAt: tasks[0].memberSnapshotAt, plannedPayload: {} },
        null,
        null,
      ),
    );

    // The membership churns underneath: one barrel leaves, another arrives, and the group is renamed.
    group.members = [
      { position: 1, vessel: { id: "v2", code: "B102", type: "BARREL" } },
      { position: 2, vessel: { id: "v3", code: "B103", type: "BARREL" } },
    ];
    group.name = "Rack 14 (rebuilt)";

    const later = JSON.stringify(
      resolveTaskMembers(
        { vesselGroupId: "g1", memberSnapshot: tasks[0].memberSnapshot as never, memberSnapshotAt: tasks[0].memberSnapshotAt, plannedPayload: {} },
        group.members.map((m, i) => ({ vesselId: m.vessel.id, code: m.vessel.code, label: `Barrel ${m.vessel.code}`, position: i + 1 })),
        group.name,
      ),
    );

    expect(later).toBe(atIssue);
    expect(JSON.parse(later).members).toHaveLength(2);
    expect(JSON.parse(later).members.map((m: { code: string }) => m.code)).toEqual(["B101", "B102"]);
  });
});
