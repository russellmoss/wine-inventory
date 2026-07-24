import { beforeEach, describe, expect, it, vi } from "vitest";

// Plan 095 — the assistant create_grower dedup/near-duplicate CHOICE + the "also set up as a vendor" preview,
// proven hermetically (DB deps mocked, so no react-server / Neon needed). The DB-integrated behavior (the
// actual grower + linked vendor rows) is proven separately by a runAsTenant script against the Demo tenant.

const mocks = vi.hoisted(() => ({
  findGrowersByName: vi.fn(),
  getGrowerNearMatchesCore: vi.fn(),
}));

vi.mock("@/lib/grower/data", () => ({
  findGrowersByName: mocks.findGrowersByName,
  getGrowerNearMatchesCore: mocks.getGrowerNearMatchesCore,
}));
vi.mock("@/lib/assistant/confirm", () => ({
  signProposal: () => "PROPOSAL_TOKEN",
  signResume: (_tool: string, args: Record<string, unknown>) => `RESUME:${JSON.stringify(args)}`,
}));

import { createGrowerTool } from "@/lib/assistant/tools/create-grower";

const ctx = { user: { activeOrganizationId: "org_demo" } } as never;
type Out = { needsChoice?: boolean; needsConfirmation?: boolean; preview?: string; options?: Array<{ label: string; send?: string; resume?: string }> };

describe("create_grower near-duplicate guard", () => {
  beforeEach(() => {
    mocks.findGrowersByName.mockReset();
    mocks.getGrowerNearMatchesCore.mockReset();
  });

  it("returns a CHOICE (use existing | create anyway) when a near-duplicate exists", async () => {
    mocks.findGrowersByName.mockResolvedValue([{ id: "g1", name: "Bien Nacido Vineyard" }]);
    mocks.getGrowerNearMatchesCore.mockResolvedValue({ high: [{ id: "g1", name: "Bien Nacido Vineyard" }], medium: [] });

    const out = (await createGrowerTool.run(ctx, { name: "Bien Nacido Vineyards" })) as Out;
    expect(out.needsChoice).toBe(true);
    const opts = out.options ?? [];
    expect(opts.some((o) => o.send?.includes("Bien Nacido Vineyard"))).toBe(true);
    const anyway = opts.find((o) => o.resume);
    expect(anyway?.label).toMatch(/create/i);
    expect(anyway?.resume).toContain('"createAnyway":true');
  });

  it("bypasses the near-dup guard and proposes when createAnyway is set (no loop)", async () => {
    mocks.findGrowersByName.mockResolvedValue([]);
    const out = (await createGrowerTool.run(ctx, { name: "Bien Nacido Vineyards", createAnyway: true })) as Out;
    expect(out.needsConfirmation).toBe(true);
    expect(out.needsChoice).toBeUndefined();
    expect(mocks.getGrowerNearMatchesCore).not.toHaveBeenCalled();
  });

  it("hard-refuses an EXACT duplicate before ever checking near-matches", async () => {
    mocks.findGrowersByName.mockResolvedValue([{ id: "g1", name: "Bien Nacido Vineyard" }]);
    await expect(createGrowerTool.run(ctx, { name: "bien nacido vineyard" })).rejects.toThrow(/already exists/i);
    expect(mocks.getGrowerNearMatchesCore).not.toHaveBeenCalled();
  });

  it("proposes directly when there is no near match, noting the grower is also set up as a vendor", async () => {
    mocks.findGrowersByName.mockResolvedValue([]);
    mocks.getGrowerNearMatchesCore.mockResolvedValue({ high: [], medium: [] });
    const out = (await createGrowerTool.run(ctx, { name: "Brand New Ranch" })) as Out;
    expect(out.needsConfirmation).toBe(true);
    expect(out.preview).toMatch(/set up as a vendor/i);
  });

  it("an ESTATE grower proposes WITHOUT the vendor note", async () => {
    mocks.findGrowersByName.mockResolvedValue([]);
    mocks.getGrowerNearMatchesCore.mockResolvedValue({ high: [], medium: [] });
    const out = (await createGrowerTool.run(ctx, { name: "Home Estate Block", isEstate: true })) as Out;
    expect(out.needsConfirmation).toBe(true);
    expect(out.preview).not.toMatch(/vendor/i);
    expect(out.preview).toMatch(/estate/i);
  });
});
