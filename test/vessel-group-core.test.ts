import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cellarhand v2 Phase 7 (plan 106, Unit 4) — the FIRST unit tests for vessel-group CRUD. There were
 * none for `groups.ts` or `group-apply.ts`, which is why F6/F7 (no admin gate, summary-only audit)
 * survived from the ledger spine to here unnoticed.
 *
 * The DB-level halves of GROUP-1 (the partial unique index) and the trigger that keeps `groupType`
 * honest are proven by `npm run verify:group-membership` against a real database — a mock cannot
 * prove a Postgres index. What IS proven here is everything the DB can't:
 *   - the OD-3 refusal NAMES the other group (SC-09's validation state needs the name; a bare
 *     constraint error is not enough)
 *   - reorder leaves positions contiguous 1..N
 *   - archive warns when open work orders reference the group, and proceeds on confirmation
 *   - the audit entry carries before/after `changes`, not just a sentence (RFC-001 AC-8 / F7)
 *   - the six group actions are admin-gated (D7)
 */

type Group = {
  id: string;
  name: string;
  note: string | null;
  type: "OPERATIONAL" | "AD_HOC";
  status: "ACTIVE" | "ARCHIVED";
  locationId: string | null;
  rackLabel: string | null;
  settings: unknown;
  createdAt: Date;
};
type Member = { id: string; groupId: string; vesselId: string; position: number; groupType: "OPERATIONAL" | "AD_HOC" };

const db = {
  groups: [] as Group[],
  members: [] as Member[],
  vessels: [] as { id: string; code: string; type: string }[],
  openWorkOrders: 0,
};

const audits: { summary: string; changes?: Record<string, { from: unknown; to: unknown }> }[] = [];

function group(id: string): Group | undefined {
  return db.groups.find((g) => g.id === id);
}

/** Mirrors the DB trigger: a member's groupType is always its group's type, never the caller's. */
function syncGroupType(m: Member): Member {
  m.groupType = group(m.groupId)?.type ?? "OPERATIONAL";
  return m;
}

const matches = (row: Record<string, unknown>, where: Record<string, unknown> | undefined): boolean => {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && "not" in (v as object)) return row[k] !== (v as { not: unknown }).not;
    return row[k] === v;
  });
};

const prismaMock = {
  vesselGroup: {
    // Returns a COPY, as real Prisma does. Handing back the live row would make `before` and `after`
    // the same object and every diff() assertion would pass vacuously — which is F7's bug wearing a
    // test's clothes.
    findUnique: async ({ where, include }: { where: { id: string }; include?: unknown }) => {
      const g = group(where.id);
      if (!g) return null;
      return include ? { ...g, members: membersOf(g.id) } : { ...g };
    },
    findFirst: async ({ where }: { where: Record<string, unknown> }) =>
      db.groups.find((g) => matches(g as unknown as Record<string, unknown>, where)) ?? null,
    findMany: async ({ where }: { where?: Record<string, unknown> } = {}) =>
      db.groups
        .filter((g) => matches(g as unknown as Record<string, unknown>, where))
        .map((g) => ({ ...g, members: membersOf(g.id) })),
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const g = group(where.id)!;
      Object.assign(g, data);
      // Mirrors the propagation trigger.
      for (const m of db.members) if (m.groupId === g.id) syncGroupType(m);
      return g;
    },
  },
  vesselGroupMember: {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      const m = db.members.find((x) => matches(x as unknown as Record<string, unknown>, where));
      return m ? { ...m, group: { name: group(m.groupId)!.name } } : null;
    },
    findMany: async ({ where }: { where?: Record<string, unknown> } = {}) =>
      db.members
        .filter((m) => matches(m as unknown as Record<string, unknown>, where))
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
        .map((m) => ({ ...m, vessel: db.vessels.find((v) => v.id === m.vesselId)! })),
    aggregate: async ({ where }: { where: { groupId: string } }) => ({
      _max: { position: Math.max(0, ...db.members.filter((m) => m.groupId === where.groupId).map((m) => m.position)) },
    }),
    create: async ({ data }: { data: { groupId: string; vesselId: string; position: number } }) => {
      const m = syncGroupType({ id: `m${db.members.length + 1}`, ...data, groupType: "OPERATIONAL" });
      db.members.push(m);
      return m;
    },
    deleteMany: async ({ where }: { where: { groupId: string; vesselId: string } }) => {
      const before = db.members.length;
      db.members = db.members.filter((m) => !(m.groupId === where.groupId && m.vesselId === where.vesselId));
      return { count: before - db.members.length };
    },
    update: async ({ where, data }: { where: { id: string }; data: { position: number } }) => {
      const m = db.members.find((x) => x.id === where.id)!;
      m.position = data.position;
      return m;
    },
  },
  vessel: { findUnique: async ({ where }: { where: { id: string } }) => db.vessels.find((v) => v.id === where.id) ?? null },
  location: {
    findUnique: async ({ where }: { where: { id: string } }) => (where.id === "loc1" ? { id: "loc1" } : null),
    findMany: async () => [{ id: "loc1", name: "Barrel hall" }],
  },
  workOrder: { count: async () => db.openWorkOrders },
};

function membersOf(groupId: string) {
  return db.members
    .filter((m) => m.groupId === groupId)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .map((m) => ({ ...m, vessel: db.vessels.find((v) => v.id === m.vesselId)! }));
}

// `vi.mock` factories are hoisted above every top-level binding, so handing it `prismaMock` directly
// is a TDZ error. The proxy is built at hoist time but only reads `prismaMock` when a model is
// actually accessed, which is inside a test.
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy({} as Record<string, unknown>, { get: (_t, k: string) => (prismaMock as Record<string, unknown>)[k] }),
}));
vi.mock("@/lib/tenant/tx", () => ({
  runInTenantTx: async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock),
}));
vi.mock("@/lib/audit", async () => {
  // The REAL diff(), because "the audit carries before/after" is the thing under test — a stubbed
  // diff returning {} would make that assertion pass while proving nothing (F7 is exactly this bug).
  const real = await vi.importActual<typeof import("@/lib/audit")>("@/lib/audit");
  return {
    diff: real.diff,
    writeAudit: async (_tx: unknown, entry: { summary: string; changes?: Record<string, { from: unknown; to: unknown }> }) => {
      audits.push(entry);
    },
  };
});

import {
  addGroupMemberCore,
  archiveGroupCore,
  configureGroupCore,
  removeGroupMemberCore,
  reorderGroupMembersCore,
} from "@/lib/vessels/group-core";

const ACTOR = { actorUserId: "u1", actorEmail: "cellar@demo.test" };

beforeEach(() => {
  audits.length = 0;
  db.openWorkOrders = 0;
  db.vessels = [
    { id: "v1", code: "B101", type: "BARREL" },
    { id: "v2", code: "B102", type: "BARREL" },
    { id: "v3", code: "B103", type: "BARREL" },
  ];
  db.groups = [
    { id: "g1", name: "Rack 14", note: null, type: "OPERATIONAL", status: "ACTIVE", locationId: null, rackLabel: null, settings: null, createdAt: new Date("2026-07-01") },
    { id: "g2", name: "New French oak", note: null, type: "OPERATIONAL", status: "ACTIVE", locationId: null, rackLabel: null, settings: null, createdAt: new Date("2026-07-01") },
  ];
  db.members = [
    { id: "m1", groupId: "g1", vesselId: "v1", position: 1, groupType: "OPERATIONAL" },
    { id: "m2", groupId: "g1", vesselId: "v2", position: 2, groupType: "OPERATIONAL" },
  ];
});

describe("GROUP-1 / OD-3 refusal", () => {
  it("names the group the barrel is already in", async () => {
    // The whole point. A raw unique violation says
    // `vessel_group_member_one_operational_group_per_vessel`, which tells a cellar hand nothing.
    await expect(addGroupMemberCore(ACTOR, { groupId: "g2", vesselId: "v1" })).rejects.toThrow(
      /Barrel B101 is already in the operational group "Rack 14"/,
    );
  });

  it("allows the same vessel into an AD_HOC group (unlimited overlap, RFC-001 §4.2)", async () => {
    db.groups.push({ id: "g3", name: "Tuesday touch-up", note: null, type: "AD_HOC", status: "ACTIVE", locationId: null, rackLabel: null, settings: null, createdAt: new Date() });
    const dto = await addGroupMemberCore(ACTOR, { groupId: "g3", vesselId: "v1" });
    expect(dto.members.map((m) => m.code)).toEqual(["B101"]);
  });

  it("refuses to retype a group to OPERATIONAL when that would collide", async () => {
    db.groups.push({ id: "g3", name: "Tuesday touch-up", note: null, type: "AD_HOC", status: "ACTIVE", locationId: null, rackLabel: null, settings: null, createdAt: new Date() });
    await addGroupMemberCore(ACTOR, { groupId: "g3", vesselId: "v1" });
    await expect(configureGroupCore(ACTOR, { groupId: "g3", type: "OPERATIONAL" })).rejects.toThrow(
      /Barrel B101 is already in "Rack 14"/,
    );
  });
});

describe("member order", () => {
  it("appends at the end of the walk", async () => {
    const dto = await addGroupMemberCore(ACTOR, { groupId: "g1", vesselId: "v3" });
    expect(dto.members.map((m) => [m.code, m.position])).toEqual([["B101", 1], ["B102", 2], ["B103", 3]]);
  });

  it("stays contiguous 1..N after a removal from the middle", async () => {
    await addGroupMemberCore(ACTOR, { groupId: "g1", vesselId: "v3" });
    const dto = await removeGroupMemberCore(ACTOR, { groupId: "g1", vesselId: "v2" });
    // A crew resuming "barrel 2 of 2" needs this to be literally true, not merely ordered.
    expect(dto.members.map((m) => m.position)).toEqual([1, 2]);
    expect(dto.members.map((m) => m.code)).toEqual(["B101", "B103"]);
  });

  it("reorders to the requested order and renumbers contiguously", async () => {
    await addGroupMemberCore(ACTOR, { groupId: "g1", vesselId: "v3" });
    const dto = await reorderGroupMembersCore(ACTOR, { groupId: "g1", vesselIds: ["v3", "v1", "v2"] });
    expect(dto.members.map((m) => [m.code, m.position])).toEqual([["B103", 1], ["B101", 2], ["B102", 3]]);
  });

  it("keeps members omitted from a partial reorder instead of dropping them", async () => {
    await addGroupMemberCore(ACTOR, { groupId: "g1", vesselId: "v3" });
    const dto = await reorderGroupMembersCore(ACTOR, { groupId: "g1", vesselIds: ["v3"] });
    expect(dto.members.map((m) => m.code)).toEqual(["B103", "B101", "B102"]);
  });

  it("rejects a vessel that isn't in the group", async () => {
    await expect(reorderGroupMembersCore(ACTOR, { groupId: "g1", vesselIds: ["v3"] })).rejects.toThrow(/isn't in this group/);
  });
});

describe("archive", () => {
  it("warns rather than silently archiving when open work orders reference the group", async () => {
    db.openWorkOrders = 2;
    await expect(archiveGroupCore(ACTOR, { groupId: "g1", archived: true })).rejects.toThrow(
      /referenced by 2 open work orders/,
    );
  });

  it("says archiving does not change those work orders, because it does not (GROUP-3)", async () => {
    db.openWorkOrders = 1;
    await expect(archiveGroupCore(ACTOR, { groupId: "g1", archived: true })).rejects.toThrow(
      /barrel lists are already frozen/,
    );
  });

  it("proceeds once confirmed", async () => {
    db.openWorkOrders = 1;
    const res = await archiveGroupCore(ACTOR, { groupId: "g1", archived: true, confirmOpenWorkOrders: true });
    expect(res.status).toBe("ARCHIVED");
    expect(res.openWorkOrderCount).toBe(1);
    expect(group("g1")!.status).toBe("ARCHIVED");
  });

  it("archives with no confirmation needed when nothing open references it", async () => {
    const res = await archiveGroupCore(ACTOR, { groupId: "g1", archived: true });
    expect(res.status).toBe("ARCHIVED");
  });

  it("refuses membership edits on an archived group", async () => {
    await archiveGroupCore(ACTOR, { groupId: "g1", archived: true });
    await expect(addGroupMemberCore(ACTOR, { groupId: "g1", vesselId: "v3" })).rejects.toThrow(/archived/);
  });
});

describe("audit carries before/after (RFC-001 AC-8, F7)", () => {
  it("records the old and new value of every changed field", async () => {
    await configureGroupCore(ACTOR, { groupId: "g1", name: "Rack 15", rackLabel: "R15", locationId: "loc1" });
    const entry = audits.at(-1)!;
    expect(entry.changes).toMatchObject({
      name: { from: "Rack 14", to: "Rack 15" },
      rackLabel: { from: null, to: "R15" },
      locationId: { from: null, to: "loc1" },
    });
  });

  it("records only what changed, not every field", async () => {
    await configureGroupCore(ACTOR, { groupId: "g1", note: "top weekly" });
    expect(Object.keys(audits.at(-1)!.changes!)).toEqual(["note"]);
  });

  it("records membership changes too — the ones most likely to be questioned later (§4.11)", async () => {
    await addGroupMemberCore(ACTOR, { groupId: "g1", vesselId: "v3" });
    expect(audits.at(-1)!.changes).toMatchObject({ members: { to: "+Barrel B103" } });
    await removeGroupMemberCore(ACTOR, { groupId: "g1", vesselId: "v3" });
    expect(audits.at(-1)!.changes).toMatchObject({ members: { to: "-Barrel B103" } });
  });

  it("records the reorder as a before/after ordering", async () => {
    await reorderGroupMembersCore(ACTOR, { groupId: "g1", vesselIds: ["v2", "v1"] });
    expect(audits.at(-1)!.changes).toMatchObject({ memberOrder: { from: "v1,v2", to: "v2,v1" } });
  });

  it("writes no audit entry when nothing actually changed", async () => {
    await reorderGroupMembersCore(ACTOR, { groupId: "g1", vesselIds: ["v1", "v2"] });
    expect(audits).toHaveLength(0);
  });
});

describe("name validation", () => {
  it("refuses a duplicate name", async () => {
    await expect(configureGroupCore(ACTOR, { groupId: "g1", name: "New French oak" })).rejects.toThrow(/already exists/);
  });

  it("allows a group to keep its own name", async () => {
    const dto = await configureGroupCore(ACTOR, { groupId: "g1", name: "Rack 14" });
    expect(dto.name).toBe("Rack 14");
  });

  it("refuses an empty name", async () => {
    await expect(configureGroupCore(ACTOR, { groupId: "g1", name: "   " })).rejects.toThrow(/Give the group a name/);
  });
});

describe("D7 — group definition is admin-gated (RFC-001 §4.10)", () => {
  // A source-level guard rather than a runtime one: the gate lives in the ACTION WRAPPER, so the only
  // way to prove every one of them is wrapped is to read the file. Each assertion matches on a SINGLE
  // line — a newline-spanning regex is silently vacuous on a CRLF checkout.
  const src = readFileSync(new URL("../src/lib/cellar/actions.ts", import.meta.url), "utf8");

  const GATED = [
    "createGroupAction",
    "renameGroupAction",
    "deactivateGroupAction",
    "addGroupMemberAction",
    "removeGroupMemberAction",
    "mergeGroupMembershipAction",
    "configureGroupAction",
    "archiveGroupAction",
    "addGroupMemberDetailedAction",
    "removeGroupMemberDetailedAction",
    "reorderGroupMembersAction",
  ];

  it.each(GATED)("%s is a safeAdminAction", (name) => {
    expect(src).toMatch(new RegExp(`export const ${name} = safeAdminAction`));
  });

  it("leaves recording work against a group open to any ready user", () => {
    // §4.10 splits DEFINING a group from RECORDING WORK against one. If these ever become admin-only
    // the cellar floor loses the ability to run a round, which is the opposite of the intent.
    expect(src).toMatch(/export const applyToGroupAction = action\(/);
    expect(src).toMatch(/export const previewGroupApplyAction = action\(/);
  });
});
