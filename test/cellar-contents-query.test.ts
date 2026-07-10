import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    variety: { findMany: vi.fn() },
    vineyard: { findMany: vi.fn() },
    vessel: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

import { queryCellarContents } from "@/lib/cellar/contents-query";

const vesselRow = (overrides?: Partial<Record<string, unknown>>) => ({
  id: "v-t5",
  code: "T5",
  type: "TANK",
  capacityL: 5000,
  vesselLots: [
    {
      lotId: "lot-cab",
      volumeL: 1200,
      lot: {
        id: "lot-cab",
        code: "24-CS-A",
        form: "WINE",
        status: "ACTIVE",
        originVarietyId: "var-cab",
        originVineyardId: "vy-qbo",
        vintageYear: 2024,
        sourceVineyards: [{ vineyardId: "vy-qbo" }],
      },
    },
  ],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.variety.findMany.mockResolvedValue([{ id: "var-cab", name: "Cabernet Sauvignon" }]);
  mocks.prisma.vineyard.findMany.mockResolvedValue([{ id: "vy-qbo", name: "QBO Demo Vineyard" }]);
});

describe("queryCellarContents", () => {
  it("returns current contents for an exact tank lookup", async () => {
    mocks.prisma.vessel.findMany.mockResolvedValue([vesselRow()]);

    const result = await queryCellarContents({ vessel: "tank 5" });

    expect(mocks.prisma.vessel.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        type: "TANK",
        OR: expect.arrayContaining([
          { code: { equals: "5", mode: "insensitive" } },
          { code: { equals: "T5", mode: "insensitive" } },
        ]),
      }),
    }));
    expect(result.vessels).toEqual([
      expect.objectContaining({
        vesselId: "v-t5",
        label: "Tank T5",
        totalVolumeL: 1200,
        lots: [
          expect.objectContaining({
            lotId: "lot-cab",
            code: "24-CS-A",
            varietyName: "Cabernet Sauvignon",
            vineyardName: "QBO Demo Vineyard",
            vintage: 2024,
          }),
        ],
      }),
    ]);
  });

  it("returns an empty result instead of throwing when an exact vessel has no match", async () => {
    mocks.prisma.vessel.findMany.mockResolvedValue([]);

    await expect(queryCellarContents({ vessel: "tank 404" })).resolves.toEqual({
      vessels: [],
      emptyMatches: 0,
      truncated: false,
    });
  });

  it("reverse-searches vineyards through source-vineyard membership", async () => {
    mocks.prisma.vineyard.findMany
      .mockResolvedValueOnce([{ id: "vy-qbo" }])
      .mockResolvedValueOnce([{ id: "vy-qbo", name: "QBO Demo Vineyard" }]);
    mocks.prisma.vessel.findMany.mockResolvedValue([vesselRow()]);

    const result = await queryCellarContents({ vineyard: "QBO Demo Vineyard", vesselType: "TANK" });

    expect(mocks.prisma.vessel.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        vesselLots: {
          some: {
            lot: expect.objectContaining({
              AND: expect.arrayContaining([
                expect.objectContaining({
                  OR: expect.arrayContaining([
                    { originVineyardId: { in: ["vy-qbo"] } },
                    { sourceVineyards: { some: { vineyardId: { in: ["vy-qbo"] } } } },
                  ]),
                }),
              ]),
            }),
          },
        },
      }),
    }));
    expect(result.vessels[0].lots[0].vineyardName).toBe("QBO Demo Vineyard");
  });

  it("maps user-facing form aliases onto actual lot forms", async () => {
    mocks.prisma.vessel.findMany.mockResolvedValue([vesselRow()]);

    await queryCellarContents({ form: "BULK" });

    expect(mocks.prisma.vessel.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        vesselLots: {
          some: {
            lot: expect.objectContaining({
              AND: expect.arrayContaining([{ form: "WINE" }]),
            }),
          },
        },
      }),
    }));
  });

  it("caps results and reports truncation", async () => {
    mocks.prisma.vessel.findMany.mockResolvedValue([
      vesselRow({ id: "v1", code: "T1" }),
      vesselRow({ id: "v2", code: "T2" }),
    ]);

    const result = await queryCellarContents({ limit: 1 });

    expect(mocks.prisma.vessel.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2 }));
    expect(result.truncated).toBe(true);
    expect(result.vessels).toHaveLength(1);
  });
});
