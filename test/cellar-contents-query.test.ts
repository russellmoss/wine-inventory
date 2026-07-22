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
  // What the wine is MADE OF. Single-origin by default; the blend case overrides it.
  components: [
    { vintage: 2024, volumeL: 1200, variety: { name: "Cabernet Sauvignon" }, vineyard: { name: "QBO Demo Vineyard" } },
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

    // Vineyard is matched at the VESSEL level, not inside the lot filter: source-vineyard membership
    // on the lot OR the vessel's composition. It moved out of the lot filter with the T5 fix — pushing
    // it there also emptied lots[] for a vessel that merely CONTAINS fruit from that vineyard.
    expect(mocks.prisma.vessel.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: [
          {
            OR: [
              { vesselLots: { some: { lot: { originVineyardId: { in: ["vy-qbo"] } } } } },
              { vesselLots: { some: { lot: { sourceVineyards: { some: { vineyardId: { in: ["vy-qbo"] } } } } } } },
              { components: { some: { vineyardId: { in: ["vy-qbo"] } } } },
            ],
          },
        ],
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

  // Regression: the assistant told a winemaker that T5 was "100% Syrah, not a blend" while the tank
  // held 6,370 L Syrah + 625 L Cabernet. It was reading lots[].varietyName — the surviving lot's
  // ORIGIN — which says nothing about what was blended in. Real shape from Demo T5.
  describe("a blended vessel reports what it is MADE OF, not just its lot's origin", () => {
    const blendedT5 = () =>
      vesselRow({
        vesselLots: [
          {
            lotId: "lot-sy",
            volumeL: 6995,
            lot: {
              id: "lot-sy",
              code: "2026-SY-2",
              form: "MUST",
              status: "ACTIVE",
              originVarietyId: "var-syrah", // <- origin is Syrah ONLY; the Cab is invisible here
              originVineyardId: "vy-ojai",
              vintageYear: 2026,
              sourceVineyards: [{ vineyardId: "vy-ojai" }],
            },
          },
        ],
        components: [
          { vintage: 2026, volumeL: 6370, variety: { name: "Syrah" }, vineyard: { name: "Ojai" } },
          { vintage: 2026, volumeL: 625, variety: { name: "Cabernet Sauvignon" }, vineyard: { name: "QBO Demo Vineyard" } },
        ],
      });

    it("answers 'is T5 100% Syrah?' with the composition, not the lot origin", async () => {
      mocks.prisma.variety.findMany.mockResolvedValue([{ id: "var-syrah", name: "Syrah" }]);
      mocks.prisma.vessel.findMany.mockResolvedValue([blendedT5()]);

      const { vessels } = await queryCellarContents({ vessel: "T5" });

      // The lot's own origin reads Syrah, and that is CORRECT — it is the surviving identity. Reading
      // it as the tank's makeup is what produced "T5 is 100% Syrah, it's not a blend."
      expect(vessels[0].lots[0].varietyName).toBe("Syrah");
      // The answer to "what is this made of" comes from the composition, and it disagrees.
      expect(vessels[0].composition.summary).toBe("91% Syrah · 9% Cabernet Sauvignon");
      expect(vessels[0].composition.isBlend).toBe(true);
      expect(vessels[0].composition.parts).toEqual([
        { variety: "Syrah", vineyardName: "Ojai", vintage: 2026, volumeL: 6370, pct: "91%" },
        { variety: "Cabernet Sauvignon", vineyardName: "QBO Demo Vineyard", vintage: 2026, volumeL: 625, pct: "9%" },
      ]);
    });

    it("a single-origin vessel is not a blend", async () => {
      mocks.prisma.vessel.findMany.mockResolvedValue([vesselRow()]);
      const { vessels } = await queryCellarContents({ vessel: "T5" });
      expect(vessels[0].composition.isBlend).toBe(false);
      expect(vessels[0].composition.summary).toBe("100% Cabernet Sauvignon");
    });
  });

  // The same bug in FILTER form, and the more dangerous half: asking "which tanks have Cabernet"
  // matched only the lot's originVarietyId, so a tank holding 625 L of absorbed Cab was omitted
  // outright — a confidently wrong answer rather than a vague one.
  it("a variety search matches the COMPOSITION as well as the lot's origin", async () => {
    mocks.prisma.variety.findMany.mockResolvedValue([{ id: "var-cab", name: "Cabernet Sauvignon" }]);
    mocks.prisma.vessel.findMany.mockResolvedValue([vesselRow()]);

    await queryCellarContents({ variety: "Cabernet Sauvignon" });

    const where = mocks.prisma.vessel.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual([
      {
        OR: [
          { vesselLots: { some: { lot: { originVarietyId: { in: ["var-cab"] } } } } },
          { components: { some: { varietyId: { in: ["var-cab"] } } } },
        ],
      },
    ]);
    // And it must NOT be pushed into the lot filter, which would empty out lots[] for a vessel whose
    // wine merely CONTAINS the variety rather than being it.
    expect(JSON.stringify(where.vesselLots ?? {})).not.toContain("originVarietyId");
  });
});
