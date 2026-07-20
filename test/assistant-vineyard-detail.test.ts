import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Plan 082 Unit 6 — VineyardDetail (GPS, elevation, soil, manager) flattened onto the Vineyard
 * entity. The plan flagged this as the soft spot: no entity config had ever done a nested write.
 *
 * The mechanics that actually carry risk, and are pinned here:
 *
 *  - A vineyard with NO detail row is the normal first-write case. `current` must return a
 *    well-formed record with the detail fields simply absent, not throw and not short-circuit the
 *    whole preview.
 *  - The update is PARTIAL. The /reference form posts every detail field at once; the assistant
 *    sends deltas. Writing the full shape would null out soilType every time someone set GPS.
 *  - A vineyard-only edit must not conjure an empty detail row.
 *  - Decimals must reach the card and the audit diff as plain numbers.
 */

const mocks = vi.hoisted(() => ({
  vineyardFindUnique: vi.fn(),
  vineyardFindFirst: vi.fn(),
  txVineyardUpdate: vi.fn(),
  txDetailUpsert: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    vineyard: { findUnique: mocks.vineyardFindUnique, findFirst: mocks.vineyardFindFirst },
    vineyardBlock: { findUnique: vi.fn() },
    variety: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/assistant/scope", () => ({ findScopedBlocks: vi.fn(), resolveVineyards: vi.fn() }));
vi.mock("@/lib/vineyard/block-delete", () => ({
  assertBlockCascadeSafe: vi.fn(),
  cascadeDeleteBlockChildrenTx: vi.fn(),
}));

import { getEntity } from "@/lib/assistant/entities";

const vineyard = () => getEntity("Vineyard")!;
const tx = () =>
  ({
    vineyard: { update: mocks.txVineyardUpdate },
    vineyardDetail: { upsert: mocks.txDetailUpsert },
  }) as never;

/** Prisma hands Decimal columns back as Decimal objects, not numbers. */
const decimal = (n: number) => ({ toString: () => String(n), valueOf: () => n });

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
});

describe("Vineyard.current with the detail relation", () => {
  it("returns a well-formed record when NO detail row exists", async () => {
    mocks.vineyardFindUnique.mockResolvedValue({
      name: "Estate", abbreviation: "EST", isActive: true, detail: null,
    });

    const out = await vineyard().current!("vy1");

    expect(out).toEqual({
      name: "Estate", abbreviation: "EST", isActive: true,
      gpsLat: null, gpsLng: null, elevationM: null,
      soilType: null, manager: null, defaultUnit: null,
    });
  });

  it("flattens the detail row and normalizes Decimals to plain numbers", async () => {
    mocks.vineyardFindUnique.mockResolvedValue({
      name: "Estate", abbreviation: "EST", isActive: true,
      detail: {
        gpsLat: decimal(38.29), gpsLng: decimal(-122.45), elevationM: decimal(152.4),
        soilType: "schist", manager: "Mike", defaultUnit: "imperial",
      },
    });

    const out = (await vineyard().current!("vy1"))!;

    expect(out.gpsLat).toBe(38.29);
    expect(out.gpsLng).toBe(-122.45);
    expect(out.elevationM).toBe(152.4);
    // Not a Decimal object — `diff` compares primitives and the card would render "[object Object]".
    expect(typeof out.gpsLat).toBe("number");
    expect(out.soilType).toBe("schist");
  });

  it("returns null when the vineyard itself is gone", async () => {
    mocks.vineyardFindUnique.mockResolvedValue(null);
    expect(await vineyard().current!("nope")).toBeNull();
  });
});

describe("Vineyard.update — the nested write", () => {
  it("creates the detail row on first write via upsert", async () => {
    await vineyard().update!(tx(), "vy1", { gpsLat: 38.29, gpsLng: -122.45 });

    expect(mocks.txDetailUpsert).toHaveBeenCalledWith({
      where: { vineyardId: "vy1" },
      create: { vineyardId: "vy1", gpsLat: 38.29, gpsLng: -122.45 },
      update: { gpsLat: 38.29, gpsLng: -122.45 },
    });
    // No vineyard-column change, so the parent row is left alone entirely.
    expect(mocks.txVineyardUpdate).not.toHaveBeenCalled();
  });

  it("writes ONLY the provided detail fields — a GPS edit must not blank soilType", async () => {
    await vineyard().update!(tx(), "vy1", { gpsLat: 38.29 });

    const { update } = mocks.txDetailUpsert.mock.calls[0][0];
    expect(update).toEqual({ gpsLat: 38.29 });
    expect(update).not.toHaveProperty("soilType");
    expect(update).not.toHaveProperty("manager");
  });

  it("does NOT conjure a detail row for a vineyard-only edit", async () => {
    await vineyard().update!(tx(), "vy1", { name: "Renamed" });

    expect(mocks.txVineyardUpdate).toHaveBeenCalledWith({ where: { id: "vy1" }, data: { name: "Renamed" } });
    expect(mocks.txDetailUpsert).not.toHaveBeenCalled();
  });

  it("splits a mixed edit across both tables in one transaction", async () => {
    await vineyard().update!(tx(), "vy1", { name: "Renamed", soilType: "clay" });

    expect(mocks.txVineyardUpdate).toHaveBeenCalledWith({ where: { id: "vy1" }, data: { name: "Renamed" } });
    expect(mocks.txDetailUpsert.mock.calls[0][0].update).toEqual({ soilType: "clay" });
  });

  it("never writes the display-only elevation keys as columns", async () => {
    await vineyard().update!(tx(), "vy1", { elevation: "500 ft", elevationM: 152.4, elevationUnit: "imperial" });

    expect(mocks.txDetailUpsert.mock.calls[0][0].update).toEqual({ elevationM: 152.4 });
    expect(mocks.txVineyardUpdate).not.toHaveBeenCalled();
  });
});

describe("Vineyard.buildUpdate — elevation", () => {
  it("converts feet to canonical meters and keeps a readable display value", async () => {
    const out = (await vineyard().buildUpdate!({} as never, { elevation: 500 }, "vy1")) as Record<string, unknown>;
    expect(out.elevationM).toBeCloseTo(152.4, 1);
    expect(out.elevation).toBe("500 ft");
    expect(out.elevationUnit).toBeUndefined();
  });

  it("passes metres through when the unit says so", async () => {
    const out = (await vineyard().buildUpdate!({} as never, { elevation: 150, elevationUnit: "metric" }, "vy1")) as Record<string, unknown>;
    expect(out.elevationM).toBeCloseTo(150, 6);
    expect(out.elevation).toBe("150 m");
  });

  it("accepts sea level — 0 is a real elevation, unlike spacing", async () => {
    const out = (await vineyard().buildUpdate!({} as never, { elevation: 0 }, "vy1")) as Record<string, unknown>;
    expect(out.elevationM).toBe(0);
  });

  it("hides the canonical elevation from the confirm card", () => {
    expect(vineyard().internalUpdateKeys).toContain("elevationM");
  });
});

describe("Vineyard.auditGroups", () => {
  it("routes detail columns to VineyardDetail and the rest to Vineyard", () => {
    const groups = vineyard().auditGroups!({ name: "Renamed", gpsLat: 38.29, soilType: "clay" });
    const byType = Object.fromEntries(groups.map((g) => [g.entityType, g.values]));

    expect(byType.Vineyard).toEqual({ name: "Renamed" });
    expect(byType.VineyardDetail).toEqual({ gpsLat: 38.29, soilType: "clay" });
  });

  it("leaves the detail group empty for a vineyard-only edit, so no second row is written", () => {
    const groups = vineyard().auditGroups!({ name: "Renamed" });
    const detail = groups.find((g) => g.entityType === "VineyardDetail")!;
    expect(Object.keys(detail.values)).toHaveLength(0);
  });
});

describe("field validation reaches the detail fields", () => {
  it("rejects an out-of-range latitude at the spec layer", () => {
    const spec = vineyard().editable!.find((f) => f.name === "gpsLat")!;
    expect(spec.min).toBe(-90);
    expect(spec.max).toBe(90);
  });

  it("exposes every detail field for editing", () => {
    const editable = vineyard().editable!.map((f) => f.name);
    for (const field of ["gpsLat", "gpsLng", "elevation", "soilType", "manager", "defaultUnit"]) {
      expect(editable, field).toContain(field);
    }
  });
});
