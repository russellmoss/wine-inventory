import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Plan 082 Unit 3 — db_update gained a pre-transaction resolution step (`buildUpdate`), the mirror of
 * buildCreate. Two behaviors matter and neither had any coverage:
 *
 *  1. An ambiguous FK name must surface as a CLICKABLE picker and write nothing. `update` runs inside
 *     the transaction and cannot ask a question, which is exactly why resolution moved out here. This
 *     repo has twice shipped a "fix" where the model answered in prose instead of returning a picker
 *     (#328, #387), so the picker path gets a test rather than an assumption.
 *  2. A resolved FK id is plumbing. It must not appear on the card the user confirms — nobody should
 *     be asked to approve "varietyId: cmxyz…".
 */

const mocks = vi.hoisted(() => ({
  buildUpdate: vi.fn(),
  current: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/assistant/confirm", () => ({
  signProposal: () => "PROPOSAL_TOKEN",
  signResume: () => "RESUME_TOKEN",
}));
vi.mock("@/lib/access", () => ({ isTenantAdminLike: () => true }));
vi.mock("@/lib/tenant/tx", () => ({
  runInTenantTx: async (fn: (tx: unknown) => Promise<unknown>) => fn({}),
}));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn(), diff: () => ({}) }));

const ROW = { id: "b1", label: "Block 3 in Estate", vineyardId: "vy1" };

const fakeEntity = {
  name: "VineyardBlock",
  displayName: "block",
  vineyardScoped: true,
  find: async () => [ROW],
  load: async () => ROW,
  editable: [
    { name: "variety", type: "string" },
    { name: "numRows", type: "int", min: 0 },
  ],
  current: mocks.current,
  update: mocks.update,
  buildUpdate: mocks.buildUpdate,
  internalUpdateKeys: ["varietyId"],
};

vi.mock("@/lib/assistant/entities", () => ({
  getEntity: (n: string) => (n?.toLowerCase() === "vineyardblock" ? fakeEntity : null),
  allowedEntityNames: () => ["VineyardBlock"],
}));

import { dbUpdateTool } from "@/lib/assistant/tools/db-update";

const ctx = { user: { role: "admin", vineyardIds: ["vy1"] } } as never;

describe("db_update pre-transaction resolution", () => {
  beforeEach(() => {
    mocks.buildUpdate.mockReset();
    mocks.current.mockReset();
    mocks.update.mockReset();
    mocks.current.mockResolvedValue({ variety: "Cabernet", varietyId: "v-cab", numRows: 10 });
  });

  it("returns the picker and writes NOTHING when a name is ambiguous", async () => {
    mocks.buildUpdate.mockResolvedValue({
      needsChoice: true,
      prompt: 'Which variety did you mean by "merlo"?',
      options: [{ label: "Merlot" }, { label: "Merlot Blanc" }],
    });

    const res = (await dbUpdateTool.run(ctx, { entity: "VineyardBlock", id: "b1", values: { variety: "merlo" } })) as Record<string, unknown>;

    expect(res.needsChoice).toBe(true);
    expect(res.needsConfirmation).toBeUndefined();
    expect(res.token).toBeUndefined();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("hides the resolved FK id from the confirm card, showing the name instead", async () => {
    mocks.buildUpdate.mockResolvedValue({ variety: "Merlot", varietyId: "v-merlot" });

    const res = (await dbUpdateTool.run(ctx, { entity: "VineyardBlock", id: "b1", values: { variety: "merlot" } })) as Record<string, unknown>;

    expect(res.needsConfirmation).toBe(true);
    expect(res.preview).toContain("variety: Cabernet → Merlot");
    expect(res.preview).not.toContain("varietyId");
    expect(res.preview).not.toContain("v-merlot");
  });

  it("passes values straight through for entities with no buildUpdate", async () => {
    // The other seven entities resolve nothing; the hook must stay optional.
    const noHook = { ...fakeEntity, buildUpdate: undefined, internalUpdateKeys: undefined };
    vi.spyOn(await import("@/lib/assistant/entities"), "getEntity").mockReturnValue(noHook as never);

    const res = (await dbUpdateTool.run(ctx, { entity: "VineyardBlock", id: "b1", values: { numRows: 12 } })) as Record<string, unknown>;

    expect(res.needsConfirmation).toBe(true);
    expect(res.preview).toContain("numRows: 10 → 12");
    expect(mocks.buildUpdate).not.toHaveBeenCalled();
  });
});
