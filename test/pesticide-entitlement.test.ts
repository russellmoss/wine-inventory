import { describe, it, expect, vi, beforeEach } from "vitest";

// Spray S2 Unit 5 — the lookup service fails closed on BOTH gates: entitlement (K7) and
// jurisdiction (K12). The prisma module is mocked so the entitlement test can assert the check
// returns BEFORE any pesticide query runs, and so the composition rule is testable without a DB.

const mockPrisma = vi.hoisted(() => ({
  knowledgeSource: { findUnique: vi.fn() },
  knowledgeSourceSubscription: { findFirst: vi.fn() },
  pesticideDataRevision: { findMany: vi.fn() },
  pesticideProduct: { findFirst: vi.fn() },
  pesticideResistanceAssignment: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

import { lookupRegistration, isPesticideSourceEnabled } from "@/lib/pesticide/lookup";

const TENANT = "org_demo_winery";

function enableSource() {
  mockPrisma.knowledgeSource.findUnique.mockResolvedValue({ id: "src1", active: true, defaultEnabled: false });
  mockPrisma.knowledgeSourceSubscription.findFirst.mockResolvedValue({ enabled: true });
}

function publishRevision() {
  mockPrisma.pesticideDataRevision.findMany.mockResolvedValue([
    { id: "rev1", apprilAsOf: new Date("2026-07-21T13:27:10Z"), cdprAsOf: new Date("2026-07-25T00:00:00Z"), resistanceArtifactSha256: "abc123" },
  ]);
}

interface ProductOverrides {
  siteRegistrations?: unknown[];
  stateRegistrations?: unknown[];
  ingredients?: unknown[];
  resistanceAssignments?: unknown[];
}

function productFixture(overrides: ProductOverrides = {}) {
  return {
    id: "p1",
    epaRegNumber: "100-953",
    productName: "Switch 62.5wg",
    companyName: "Syngenta",
    labelDate: new Date("2025-04-21T00:00:00Z"),
    registrationStatus: "Active",
    pestCategoryRaw: "Fungicide",
    sourceStatus: "ACTIVE",
    siteRegistrations: overrides.siteRegistrations ?? [
      { siteNameRaw: "Grapes (Foliar Treatment)", siteModifier: "UNSPECIFIED", isGrape: true },
    ],
    stateRegistrations: overrides.stateRegistrations ?? [],
    useRestrictions: [],
    ingredients: overrides.ingredients ?? [],
    resistanceAssignments: overrides.resistanceAssignments ?? [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.pesticideResistanceAssignment.findMany.mockResolvedValue([]);
});

describe("entitlement (K7 — the service-layer gate S9/S10/S11 all share)", () => {
  it("a tenant without the subscription gets source-not-enabled BEFORE any pesticide query runs", async () => {
    mockPrisma.knowledgeSource.findUnique.mockResolvedValue({ id: "src1", active: true, defaultEnabled: false });
    mockPrisma.knowledgeSourceSubscription.findFirst.mockResolvedValue(null); // no override → default off
    const r = await lookupRegistration({ tenantId: TENANT, regNumber: "100-953", jurisdiction: { country: "US", state: "CA" } });
    expect(r).toEqual({ ok: false, reason: "source-not-enabled" });
    expect(mockPrisma.pesticideProduct.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.pesticideDataRevision.findMany).not.toHaveBeenCalled();
  });

  it("an unseeded or inactive source fails closed", async () => {
    mockPrisma.knowledgeSource.findUnique.mockResolvedValue(null);
    expect(await isPesticideSourceEnabled(TENANT)).toBe(false);
    mockPrisma.knowledgeSource.findUnique.mockResolvedValue({ id: "src1", active: false, defaultEnabled: true });
    expect(await isPesticideSourceEnabled(TENANT)).toBe(false);
  });

  it("an explicit enabling subscription row grants access (override beats defaultEnabled:false)", async () => {
    enableSource();
    expect(await isPesticideSourceEnabled(TENANT)).toBe(true);
  });
});

describe("jurisdiction (K12 — federal alone is never a clearance)", () => {
  beforeEach(() => {
    enableSource();
    publishRevision();
  });

  it("a non-CA US jurisdiction with a federally-registered product returns state-registration-unknown, never ok:true", async () => {
    mockPrisma.pesticideProduct.findFirst.mockResolvedValue(productFixture());
    const r = await lookupRegistration({ tenantId: TENANT, regNumber: "100-953", jurisdiction: { country: "US", state: "NY" } });
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === "state-registration-unknown") {
      expect(r.state).toBe("NY");
      expect(r.federalStatus.registeredOnGrapes).toBe(true); // the federal FACT is shown…
    } else {
      throw new Error(`expected state-registration-unknown, got ${JSON.stringify(r)}`);
    }
  });

  it("a missing state is state-registration-unknown too — no state, no clearance", async () => {
    mockPrisma.pesticideProduct.findFirst.mockResolvedValue(productFixture());
    const r = await lookupRegistration({ tenantId: TENANT, regNumber: "100-953", jurisdiction: { country: "US" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("state-registration-unknown");
  });

  it("a non-US jurisdiction returns jurisdiction-unsupported and does NOT throw (Bhutan is a live tenant)", async () => {
    const r = await lookupRegistration({ tenantId: TENANT, regNumber: "100-953", jurisdiction: { country: "BT" } });
    expect(r).toEqual({ ok: false, reason: "jurisdiction-unsupported" });
    expect(mockPrisma.pesticideProduct.findFirst).not.toHaveBeenCalled();
  });

  it("CA with only an UNKNOWN state row stays unknown; an explicit NOT_REGISTERED row is a real NO", async () => {
    mockPrisma.pesticideProduct.findFirst.mockResolvedValue(
      productFixture({ stateRegistrations: [{ state: "CA", status: "UNKNOWN", siteCode: "" }] }),
    );
    const r1 = await lookupRegistration({ tenantId: TENANT, regNumber: "100-953", jurisdiction: { country: "US", state: "CA" } });
    expect(!r1.ok && r1.reason).toBe("state-registration-unknown");

    mockPrisma.pesticideProduct.findFirst.mockResolvedValue(
      productFixture({ stateRegistrations: [{ state: "CA", status: "NOT_REGISTERED", siteCode: "" }] }),
    );
    const r2 = await lookupRegistration({ tenantId: TENANT, regNumber: "100-953", jurisdiction: { country: "US", state: "CA" } });
    expect(!r2.ok && r2.reason).toBe("state-not-registered");
  });
});

describe("bearing context (⚑ G1) and reg-number gates", () => {
  beforeEach(() => {
    enableSource();
    publishRevision();
  });

  it("a non-bearing-only registration is never reported as registered for a bearing block", async () => {
    mockPrisma.pesticideProduct.findFirst.mockResolvedValue(
      productFixture({
        siteRegistrations: [{ siteNameRaw: "Grapes (Nonbearing)", siteModifier: "NON_BEARING", isGrape: true }],
        stateRegistrations: [{ state: "CA", status: "REGISTERED", siteCode: "29141" }],
      }),
    );
    const r = await lookupRegistration({ tenantId: TENANT, regNumber: "70506-40", jurisdiction: { country: "US", state: "CA" } });
    expect(!r.ok && r.reason).toBe("non-bearing-only");
    // …but the same product IS answerable for a non-bearing context.
    const r2 = await lookupRegistration({
      tenantId: TENANT,
      regNumber: "70506-40",
      jurisdiction: { country: "US", state: "CA" },
      vineSiteContext: "NON_BEARING",
    });
    expect(r2.ok).toBe(true);
  });

  it("a malformed reg number is a typed rejection; a CA-state-only number is unsupported-format, not malformed", async () => {
    const bad = await lookupRegistration({ tenantId: TENANT, regNumber: "100‑953", jurisdiction: { country: "US", state: "CA" } });
    expect(!bad.ok && bad.reason).toBe("malformed-reg-number");
    const ca = await lookupRegistration({ tenantId: TENANT, regNumber: "40989-50001-AA", jurisdiction: { country: "US", state: "CA" } });
    expect(!ca.ok && ca.reason).toBe("unsupported-registration-format");
    expect(mockPrisma.pesticideProduct.findFirst).not.toHaveBeenCalled();
  });
});

describe("K13 most-conservative resistance rollup", () => {
  beforeEach(() => {
    enableSource();
    publishRevision();
  });

  it("a premix with one GAP AI resolves GAP at product level — resolved codes are partial evidence, never the answer", async () => {
    mockPrisma.pesticideProduct.findFirst.mockResolvedValue(
      productFixture({
        stateRegistrations: [{ state: "CA", status: "REGISTERED", siteCode: "29141" }],
        ingredients: [
          { activeIngredientId: "ai1", percent: 37.5, activeIngredient: { id: "ai1", name: "Cyprodinil", pcCode: "288202", parentActiveIngredientId: null } },
          { activeIngredientId: "ai2", percent: 25, activeIngredient: { id: "ai2", name: "Mystery Biological", pcCode: "999999", parentActiveIngredientId: null } },
        ],
      }),
    );
    mockPrisma.pesticideResistanceAssignment.findMany.mockResolvedValue([
      { activeIngredientId: "ai1", subjectKind: "ACTIVE_INGREDIENT", scheme: "FRAC", resolution: "CODED", codes: ["9"], siteType: "SINGLE", derivedFrom: "AI_KEYED_TABLE" },
      // ai2 has NO assignment row — a gap by construction, and the product must inherit it.
    ]);
    const r = await lookupRegistration({ tenantId: TENANT, regNumber: "100-953", jurisdiction: { country: "US", state: "CA" } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.resistance?.resolution).toBe("GAP");
      expect(r.data.resistance?.partialEvidence).toBe(true);
      expect(r.data.resistance?.codes).toEqual(["9"]); // labelled partial evidence
      expect(r.data.resistance?.perAi.find((a) => a.aiName === "Mystery Biological")?.resolution).toBe("GAP");
      expect(r.provenance).toBe("registry");
      expect(r.factsAsOf.publishedRevisionId).toBe("rev1");
    }
  });

  it("no result variant is readable as a permission", async () => {
    mockPrisma.knowledgeSource.findUnique.mockResolvedValue({ id: "src1", active: true, defaultEnabled: false });
    mockPrisma.knowledgeSourceSubscription.findFirst.mockResolvedValue(null);
    const results = [
      await lookupRegistration({ tenantId: TENANT, regNumber: "100-953", jurisdiction: { country: "US", state: "CA" } }),
    ];
    enableSource();
    results.push(await lookupRegistration({ tenantId: TENANT, regNumber: "garbage", jurisdiction: { country: "US", state: "CA" } }));
    results.push(await lookupRegistration({ tenantId: TENANT, regNumber: "100-953", jurisdiction: { country: "BT" } }));
    for (const r of results) {
      expect(r.ok).toBe(false);
      expect(r).not.toHaveProperty("data");
      expect(r).not.toHaveProperty("permitted");
      expect(r).not.toHaveProperty("registered");
    }
  });
});
