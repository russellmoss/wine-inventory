import { describe, it, expect, vi, beforeEach } from "vitest";

// Plan 105 U1 — the committer branch, end to end through the two server actions it calls.
//
// Council (Codex S7) asked for this specifically, and the reason is worth keeping: NOTHING in
// `test/` or `scripts/` referenced `commitProposeWorkOrder` or the string "Issued work order"
// before this file existed. That was the ABSENCE of coverage on the busiest assistant write path,
// not evidence it was safe — so the behaviour change went in with no net under it.
//
// The load-bearing assertion is the negative one: on the default path `issueWorkOrderAction` is
// NEVER called. That is what "creates a DRAFT, never ISSUED" means in code
// (03-interaction-spec.md:179), and a mock-call count is the only way to prove a thing did not happen.

const createCalls: unknown[] = [];
const issueCalls: unknown[] = [];

vi.mock("@/lib/work-orders/actions", () => ({
  createWorkOrderFromBuildsAction: async (input: unknown) => {
    createCalls.push(input);
    return { ok: true as const, data: { workOrderId: "wo_1", number: 318 } };
  },
  issueWorkOrderAction: async (input: unknown) => {
    issueCalls.push(input);
    return { ok: true as const, data: { workOrderId: "wo_1", number: 318, status: "ISSUED", reservationWarnings: [] } };
  },
}));

vi.mock("@/lib/work-orders/nl-resolve", () => ({
  buildNlWorkOrderProposal: async () => null,
  buildNlWorkOrderCommitArgs: () => ({}),
  assertFreshNlWorkOrderProposal: async () => {},
  dueAtFromCommitArgs: () => ({ dueAt: null, dueAtHasTime: false }),
}));

vi.mock("@/lib/equipment/equipment", () => ({
  findEquipmentByName: async () => [],
  listEquipment: async () => [],
  equipmentKindLabel: (s: string) => s,
}));
vi.mock("@/lib/work-orders/data", () => ({ listOrgMembers: async () => [] }));
vi.mock("@/lib/cellar/materials", () => ({
  listMaterials: async () => [],
  materialDisplayName: (m: { name?: string }) => m.name ?? "material",
}));

const { commitProposeWorkOrder } = await import("@/lib/assistant/tools/propose-work-order");

const USER = { id: "u1", activeOrganizationId: "org_demo_winery" } as never;

/** The signed args a freshly-minted token carries. `issueOnConfirm` is always present post-plan-105. */
function args(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 2,
    sourceText: "rack T3 to T4",
    title: "Work order: rack",
    assigneeEmail: null,
    dueDate: null,
    dueTimeZone: null,
    taskBuilds: [{ taskType: "RACK", values: {} }],
    fingerprint: "fp-1",
    ...over,
  };
}

beforeEach(() => {
  createCalls.length = 0;
  issueCalls.length = 0;
});

describe("commitProposeWorkOrder — the default path leaves a DRAFT", () => {
  it("creates the work order and NEVER issues it", async () => {
    const res = await commitProposeWorkOrder(USER, args());

    expect(createCalls).toHaveLength(1);
    expect(issueCalls).toHaveLength(0); // the whole point of plan 105
    expect(res.message).toContain("Created draft work order #318");
    expect(res.message).toContain("Taking you to it");
    expect(res.message).not.toContain("Issued work order");
  });

  it("still returns a deep link to the created draft", async () => {
    const res = await commitProposeWorkOrder(USER, args());
    expect(res.navigate).toEqual({ path: "/work-orders/wo_1", label: "Draft WO #318" });
  });
});

describe("commitProposeWorkOrder — there is no way to make it issue", () => {
  it("ignores an issueOnConfirm flag entirely: the mechanism is gone, not merely defaulted", async () => {
    // A token forged (or left over) with the old flag must not resurrect the published path.
    const res = await commitProposeWorkOrder(USER, args({ issueOnConfirm: true }));
    expect(issueCalls).toHaveLength(0);
    expect(res.message).toContain("Created draft work order");
  });

  it("still refuses a stale schema version, before anything is created", async () => {
    await expect(commitProposeWorkOrder(USER, args({ schemaVersion: 1 }))).rejects.toThrow(/stale/i);
    expect(createCalls).toHaveLength(0);
  });

  it("refuses a proposal with no tasks, before anything is created", async () => {
    await expect(commitProposeWorkOrder(USER, args({ taskBuilds: [] }))).rejects.toThrow(/no tasks/i);
    expect(createCalls).toHaveLength(0);
  });
});
