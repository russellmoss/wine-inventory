import { describe, it, expect, vi, beforeEach } from "vitest";
import { CALC_ENGINE_VERSION } from "@/lib/winemaking-calc/units";
import type { AppUser } from "@/lib/access";

// Mock the Prisma singleton so these tests are pure (no DB). runAsTenant is REAL — AsyncLocalStorage
// works under node, so we exercise the actual tenant-context wrapping.
const createMock = vi.fn();
const findManyMock = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    calculationLog: {
      create: (...a: unknown[]) => createMock(...a),
      findMany: (...a: unknown[]) => findManyMock(...a),
    },
  },
}));

import { logCalculation, queryCalculationHistory } from "@/lib/winemaking-calc/log";

const baseUser: AppUser = {
  id: "u1", name: null, email: "u@test", role: "user", banned: false, mustChangePassword: false,
  vineyardIds: [], organizationIds: ["org1"], activeOrganizationId: "org1",
};

const baseLog = {
  tenantId: "org1", userId: "u1", userEmail: "u@test", calculatorId: "so2-kmbs",
  section: "SO₂ Additions", inputs: { volume: 1000 }, output: { values: [] }, source: "PAGE" as const,
};

beforeEach(() => {
  createMock.mockReset();
  findManyMock.mockReset();
});

describe("logCalculation (best-effort append)", () => {
  it("swallows a write error and never throws (result must always be returned to the user)", async () => {
    createMock.mockRejectedValue(new Error("db down"));
    await expect(logCalculation(baseLog)).resolves.toBeUndefined();
  });

  it("skips silently — no write — when there is no tenant to scope the row to", async () => {
    await logCalculation({ ...baseLog, tenantId: null });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("stamps CALC_ENGINE_VERSION + formulaId on every row", async () => {
    createMock.mockResolvedValue({});
    await logCalculation(baseLog);
    expect(createMock).toHaveBeenCalledTimes(1);
    const data = (createMock.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data.engineVersion).toBe(CALC_ENGINE_VERSION);
    expect(data.formulaId).toBe("so2-kmbs");
    expect(data.tenantId).toBe("org1");
    expect(data.source).toBe("PAGE");
    expect(data.unitsUsed).toEqual({}); // defaulted when omitted
  });
});

describe("queryCalculationHistory (own-vs-tenant scoping, mirrors query-brix)", () => {
  it("a non-admin is scoped to their own userId", async () => {
    findManyMock.mockResolvedValue([]);
    await queryCalculationHistory(baseUser, {});
    const where = (findManyMock.mock.calls[0][0] as { where: { userId?: string } }).where;
    expect(where.userId).toBe("u1");
  });

  it("an admin sees the whole tenant (no userId filter)", async () => {
    findManyMock.mockResolvedValue([]);
    await queryCalculationHistory({ ...baseUser, role: "admin" }, {});
    const where = (findManyMock.mock.calls[0][0] as { where: { userId?: string } }).where;
    expect(where.userId).toBeUndefined();
  });

  it("returns [] without querying when the user has no active org", async () => {
    const rows = await queryCalculationHistory({ ...baseUser, activeOrganizationId: null }, {});
    expect(rows).toEqual([]);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("serializes createdAt to an ISO string", async () => {
    findManyMock.mockResolvedValue([
      { id: "c1", calculatorId: "so2-kmbs", section: "SO₂ Additions", source: "ASSISTANT", inputs: {}, output: {}, advisory: false, danger: false, userEmail: "u@test", engineVersion: "1.0.0", createdAt: new Date("2026-07-05T10:00:00Z") },
    ]);
    const rows = await queryCalculationHistory(baseUser, {});
    expect(rows[0].createdAt).toBe("2026-07-05T10:00:00.000Z");
  });
});
