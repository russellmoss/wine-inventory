import { describe, it, expect, vi, beforeEach } from "vitest";
import { asProposal, asChoice, isDraftProposal } from "@/lib/assistant/assistant-events";
import type { WorkOrderProposal } from "@/lib/work-orders/nl-proposal";

// Plan 081 U5 — propose_work_order must return a DRAFT card instead of prose when the readiness
// engine says the order is not ready.
//
// Before this change the tool computed the whole readiness model (unresolved fields, blocking
// warnings) and then flattened it into a sentence one line before returning — and a sentence is not a
// card. The four branches that matter are pinned below: ready / draft-missing-field / draft-blocked /
// ambiguous-picker.

const readiness = { value: null as WorkOrderProposal | null };
const catalog = { value: [] as unknown[] };

vi.mock("@/lib/cellar/materials", () => ({
  listMaterials: async () => catalog.value,
  materialDisplayName: (m: { name?: string }) => m.name ?? "material",
}));
vi.mock("@/lib/assistant/scope", () => ({ findScopedBlocks: async () => [] }));
vi.mock("@/lib/equipment/equipment", () => ({
  findEquipmentByName: async () => [],
  listEquipment: async () => [],
  equipmentKindLabel: (s: string) => s,
}));
vi.mock("@/lib/work-orders/data", () => ({ listOrgMembers: async () => [] }));
vi.mock("@/lib/work-orders/nl-resolve", () => ({
  buildNlWorkOrderProposal: async () => readiness.value,
  buildNlWorkOrderCommitArgs: (p: WorkOrderProposal) => ({
    schemaVersion: 2,
    sourceText: p.sourceText,
    title: p.title,
    assigneeEmail: p.assigneeEmail,
    dueDate: p.dueDate,
    taskBuilds: p.taskBuilds,
    fingerprint: p.fingerprint,
  }),
  assertFreshNlWorkOrderProposal: async () => {},
  dueAtFromCommitArgs: () => null,
}));

const { proposeWorkOrderTool } = await import("@/lib/assistant/tools/propose-work-order");

const CTX = { user: { id: "u1", activeOrganizationId: "org_demo_winery", vineyardIds: [] } } as never;

/** A readiness result shaped like the real engine's, with only the fields these branches read. */
function readinessResult(over: Partial<WorkOrderProposal>): WorkOrderProposal {
  return {
    schemaVersion: 2,
    sourceText: "rack all the wine from T3 to T4",
    title: "Work order: rack",
    assigneeEmail: null,
    dueDate: null,
    status: "ready",
    stateReadAt: "2026-07-19T00:00:00.000Z",
    tasks: [{ seq: 1, kind: "RACK", title: "Rack T3 → T4", summary: "Rack Tank T3 to Tank T4", entities: [] }],
    unresolved: [],
    warnings: [],
    cost: { totalKnownCost: 0, hasUnknownCost: false, currency: "USD", lines: [] },
    diff: { rows: [] },
    taskBuilds: [{ taskType: "RACK", values: {} }],
    fingerprint: "fp-1",
    ...over,
  } as WorkOrderProposal;
}

const INPUT = {
  sourceText: "rack all the wine from T3 to T4",
  tasks: [{ kind: "RACK", from: "T3", to: "T4" }],
};

beforeEach(() => {
  process.env.BETTER_AUTH_SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaa";
  readiness.value = null;
  catalog.value = [];
});

describe("propose_work_order — Ready", () => {
  it("a fully-specified request still produces a READY proposal with a commit token", async () => {
    readiness.value = readinessResult({ status: "ready" });
    const out = await proposeWorkOrderTool.run(CTX, INPUT);
    const proposal = asProposal(out);

    expect(proposal).not.toBeNull();
    expect(isDraftProposal(proposal!)).toBe(false);
    expect(typeof (proposal as { token?: string }).token).toBe("string");
    // Unchanged from before the Draft work: the ready preview wording is the pre-existing one.
    expect(proposal!.preview).toContain('Create and issue "Work order: rack"');
    expect(proposal!.preview).toContain("1 task");
  });

  it("carries the full readiness details through to the card", async () => {
    readiness.value = readinessResult({
      status: "ready",
      warnings: [{ severity: "confirmable", code: "rack_blend_review", message: "T3 contains multiple lots." }],
    });
    const details = asProposal(await proposeWorkOrderTool.run(CTX, INPUT))!.details as Record<string, unknown>;
    expect(details.tasks).toHaveLength(1);
    expect(details.warnings).toHaveLength(1);
    expect(details.cost).toBeDefined();
    expect(details.diff).toBeDefined();
  });
});

describe("propose_work_order — Draft", () => {
  it("needs_input returns a DRAFT card, not prose", async () => {
    readiness.value = readinessResult({
      status: "needs_input",
      unresolved: [{ key: "task-1-lot", label: "reading lot", reason: "Tank T4 holds a blend — pick which lot." }],
    });
    const out = await proposeWorkOrderTool.run(CTX, INPUT);

    // The regression this whole plan exists for: the tool used to return a string here.
    expect(typeof out).not.toBe("string");
    const proposal = asProposal(out);
    expect(proposal).not.toBeNull();
    expect(isDraftProposal(proposal!)).toBe(true);
  });

  it("a DRAFT carries NO commit token", async () => {
    readiness.value = readinessResult({
      status: "needs_input",
      unresolved: [{ key: "a", label: "Assignee", reason: "No assignee email was given." }],
    });
    const proposal = asProposal(await proposeWorkOrderTool.run(CTX, INPUT))!;
    expect((proposal as { token?: string }).token).toBeUndefined();
    expect(JSON.stringify(proposal)).not.toContain("token");
  });

  it("names the unresolved fields in the preview and carries them in details", async () => {
    readiness.value = readinessResult({
      status: "needs_input",
      unresolved: [{ key: "a", label: "Assignee", reason: "No assignee email was given." }],
    });
    const proposal = asProposal(await proposeWorkOrderTool.run(CTX, INPUT))!;
    expect(proposal.preview).toContain("not ready to issue");
    expect(proposal.preview).toContain("Assignee");
    expect((proposal.details as { unresolved: unknown[] }).unresolved).toHaveLength(1);
  });

  it("a BLOCKING warning returns a Draft whose preview leads with the blocker", async () => {
    readiness.value = readinessResult({
      status: "blocked",
      warnings: [
        { severity: "blocking", code: "same_vessel", message: "A transfer's source and destination must differ." },
        { severity: "confirmable", code: "unknown_cost", message: "Cost is unknown." },
      ],
    });
    const proposal = asProposal(await proposeWorkOrderTool.run(CTX, INPUT))!;

    expect(isDraftProposal(proposal)).toBe(true);
    expect((proposal as { token?: string }).token).toBeUndefined();
    expect(proposal.preview).toContain("1 blocker");
    expect(proposal.preview).toContain("source and destination must differ");
    // The severity vocabulary is the EXISTING one the client already groups on — not a parallel scheme.
    const warnings = (proposal.details as { warnings: { severity: string }[] }).warnings;
    expect(warnings.map((w) => w.severity).sort()).toEqual(["blocking", "confirmable"]);
  });
});

describe("propose_work_order — the paths a Draft must NOT swallow", () => {
  it("an ambiguous material still returns a CHOICE picker, not a Draft", async () => {
    catalog.value = [
      { id: "m1", name: "SO2 powder", kind: "ADDITIVE", category: "ADDITIVE", isStockTracked: true, stockUnit: "g", onHand: 10 },
      { id: "m2", name: "SO2 solution", kind: "ADDITIVE", category: "ADDITIVE", isStockTracked: true, stockUnit: "g", onHand: 10 },
    ];
    readiness.value = readinessResult({ status: "ready" });

    const out = await proposeWorkOrderTool.run(CTX, {
      sourceText: "add 30 ppm SO2 to T4",
      tasks: [{ kind: "ADDITION", vessel: "T4", material: "SO2", amount: 30, unit: "ppm" }],
    });

    expect(asChoice(out)).not.toBeNull();
    expect(asProposal(out)).toBeNull(); // the picker path is untouched by the Draft work
  });

  it("a stale schema version is still refused outright (never rendered as a draft card)", async () => {
    const out = await proposeWorkOrderTool.run(CTX, { ...INPUT, schemaVersion: 1 });
    expect(out).toBe("This work-order proposal is stale. Regenerate it before confirming.");
    expect(asProposal(out)).toBeNull();
  });
});
