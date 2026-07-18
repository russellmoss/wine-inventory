import { beforeEach, describe, expect, it, vi } from "vitest";

// Plan 074 U4 — the assistant create_vendor near-duplicate CHOICE, proven hermetically (DB deps mocked,
// so no react-server / Neon needed). The DB-integrated behavior is proven separately by verify:vendor-dedupe.

const mocks = vi.hoisted(() => ({
  findVendorsByName: vi.fn(),
  getVendorNearMatchesCore: vi.fn(),
}));

vi.mock("@/lib/vendors/vendors", () => ({
  findVendorsByName: mocks.findVendorsByName,
  getVendorNearMatchesCore: mocks.getVendorNearMatchesCore,
}));
vi.mock("@/lib/assistant/confirm", () => ({
  signProposal: () => "PROPOSAL_TOKEN",
  signResume: (_tool: string, args: Record<string, unknown>) => `RESUME:${JSON.stringify(args)}`,
}));

import { createVendorTool } from "@/lib/assistant/tools/create-vendor";

const ctx = { user: { activeOrganizationId: "org_demo" } } as never;
type Out = { needsChoice?: boolean; needsConfirmation?: boolean; options?: Array<{ label: string; send?: string; resume?: string }> };

describe("create_vendor near-duplicate guard", () => {
  beforeEach(() => {
    mocks.findVendorsByName.mockReset();
    mocks.getVendorNearMatchesCore.mockReset();
  });

  it("returns a CHOICE (use existing | create anyway) when a near-duplicate exists", async () => {
    mocks.findVendorsByName.mockResolvedValue([{ id: "v1", name: "Scott Labs" }]); // no EXACT match for the new name
    mocks.getVendorNearMatchesCore.mockResolvedValue({ high: [{ id: "v1", name: "Scott Labs" }], medium: [] });

    const out = (await createVendorTool.run(ctx, { name: "Scott Laboratories" })) as Out;
    expect(out.needsChoice).toBe(true);
    const opts = out.options ?? [];
    expect(opts.some((o) => o.send?.includes("Scott Labs"))).toBe(true); // "use existing"
    const anyway = opts.find((o) => o.resume);
    expect(anyway?.label).toMatch(/create/i);
    expect(anyway?.resume).toContain('"createAnyway":true'); // resume re-runs with the bypass flag
  });

  it("bypasses the guard and proposes when createAnyway is set (no loop)", async () => {
    const out = (await createVendorTool.run(ctx, { name: "Scott Laboratories", createAnyway: true })) as Out;
    expect(out.needsConfirmation).toBe(true);
    expect(out.needsChoice).toBeUndefined();
    expect(mocks.getVendorNearMatchesCore).not.toHaveBeenCalled();
  });

  it("still hard-refuses an EXACT duplicate before ever checking near-matches", async () => {
    mocks.findVendorsByName.mockResolvedValue([{ id: "v1", name: "Scott Labs" }]);
    await expect(createVendorTool.run(ctx, { name: "scott labs" })).rejects.toThrow(/already exists/i);
    expect(mocks.getVendorNearMatchesCore).not.toHaveBeenCalled();
  });

  it("proposes directly when there is no near match", async () => {
    mocks.findVendorsByName.mockResolvedValue([]);
    mocks.getVendorNearMatchesCore.mockResolvedValue({ high: [], medium: [] });
    const out = (await createVendorTool.run(ctx, { name: "Brand New Supply" })) as Out;
    expect(out.needsConfirmation).toBe(true);
    expect(out.needsChoice).toBeUndefined();
  });
});
