import { describe, it, expect, vi, beforeEach } from "vitest";

// Spray S2b Unit 1 (KD-9) — resolveJurisdiction/resolveJurisdictionBatch. Same mocking style as
// pesticide-entitlement.test.ts: @/lib/prisma is mocked so this is testable without a DB; runAsTenant
// is the REAL implementation (pure AsyncLocalStorage, no DB dependency) so the TENANT-3 await-inside
// discipline is exercised for real.

const mockPrisma = vi.hoisted(() => ({
  vineyardDetail: { findUnique: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { resolveJurisdiction, resolveJurisdictionBatch } from "@/lib/pesticide/lookup";

const TENANT = "org_demo_winery";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveJurisdiction", () => {
  it("unset country returns null, never throws", async () => {
    mockPrisma.vineyardDetail.findUnique.mockResolvedValue({
      regulatoryCountry: null,
      regulatoryState: null,
      jurisdictionConfirmedAt: null,
    });
    await expect(resolveJurisdiction(TENANT, "vy1")).resolves.toBeNull();
  });

  it("no VineyardDetail row at all returns null, never throws", async () => {
    mockPrisma.vineyardDetail.findUnique.mockResolvedValue(null);
    await expect(resolveJurisdiction(TENANT, "vy1")).resolves.toBeNull();
  });

  it("a country set but NEVER CONFIRMED returns null — an unconfirmed proposal never resolves", async () => {
    mockPrisma.vineyardDetail.findUnique.mockResolvedValue({
      regulatoryCountry: "US",
      regulatoryState: "OR",
      jurisdictionConfirmedAt: null,
    });
    await expect(resolveJurisdiction(TENANT, "vy1")).resolves.toBeNull();
  });

  it("a confirmed US/unset-state resolves — the caller (lookupRegistration) is what turns a missing state into state-registration-unknown, never a clearance here", async () => {
    mockPrisma.vineyardDetail.findUnique.mockResolvedValue({
      regulatoryCountry: "US",
      regulatoryState: null,
      jurisdictionConfirmedAt: new Date("2026-06-01T00:00:00Z"),
    });
    await expect(resolveJurisdiction(TENANT, "vy1")).resolves.toEqual({ country: "US", state: null });
  });

  it("BT (non-US) resolves as a plain jurisdiction object — this function does not classify, lookupRegistration does", async () => {
    mockPrisma.vineyardDetail.findUnique.mockResolvedValue({
      regulatoryCountry: "BT",
      regulatoryState: null,
      jurisdictionConfirmedAt: new Date("2026-06-01T00:00:00Z"),
    });
    await expect(resolveJurisdiction(TENANT, "vy1")).resolves.toEqual({ country: "BT", state: null });
  });

  it("a confirmed US/CA jurisdiction resolves fully", async () => {
    mockPrisma.vineyardDetail.findUnique.mockResolvedValue({
      regulatoryCountry: "US",
      regulatoryState: "CA",
      jurisdictionConfirmedAt: new Date("2026-06-01T00:00:00Z"),
    });
    await expect(resolveJurisdiction(TENANT, "vy1")).resolves.toEqual({ country: "US", state: "CA" });
  });
});

describe("resolveJurisdictionBatch", () => {
  it("a pass spanning two vineyards resolves each independently — one resolved, one not", async () => {
    mockPrisma.vineyardDetail.findMany.mockResolvedValue([
      { vineyardId: "vy-ca", regulatoryCountry: "US", regulatoryState: "CA", jurisdictionConfirmedAt: new Date("2026-06-01") },
      { vineyardId: "vy-unconfirmed", regulatoryCountry: "US", regulatoryState: "NY", jurisdictionConfirmedAt: null },
    ]);
    const result = await resolveJurisdictionBatch(TENANT, ["vy-ca", "vy-unconfirmed", "vy-missing"]);
    expect(result["vy-ca"]).toEqual({ country: "US", state: "CA" });
    expect(result["vy-unconfirmed"]).toBeNull();
    expect(result["vy-missing"]).toBeNull(); // no row at all for a vineyard never given jurisdiction
  });

  it("every requested id gets an entry, even with an empty result set", async () => {
    mockPrisma.vineyardDetail.findMany.mockResolvedValue([]);
    const result = await resolveJurisdictionBatch(TENANT, ["a", "b"]);
    expect(Object.keys(result).sort()).toEqual(["a", "b"]);
    expect(result.a).toBeNull();
    expect(result.b).toBeNull();
  });

  it("an empty id list short-circuits without querying", async () => {
    const result = await resolveJurisdictionBatch(TENANT, []);
    expect(result).toEqual({});
    expect(mockPrisma.vineyardDetail.findMany).not.toHaveBeenCalled();
  });

  it("dedupes repeated vineyard ids into one query", async () => {
    mockPrisma.vineyardDetail.findMany.mockResolvedValue([
      { vineyardId: "vy1", regulatoryCountry: "US", regulatoryState: "CA", jurisdictionConfirmedAt: new Date("2026-06-01") },
    ]);
    await resolveJurisdictionBatch(TENANT, ["vy1", "vy1", "vy1"]);
    expect(mockPrisma.vineyardDetail.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.vineyardDetail.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { vineyardId: { in: ["vy1"] } } }),
    );
  });
});
