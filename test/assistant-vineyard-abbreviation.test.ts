import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Plan 082 Unit 5 — `Vineyard.abbreviation` on both write paths.
 *
 * This is the token that appears in LOT CODES, so it is identity-bearing, not decoration. Two things
 * are pinned here:
 *
 *  - An assistant-created vineyard used to land with `abbreviation = null` and report success. It
 *    could not participate in lot coding until a human opened /reference — a half-built record
 *    presented as a finished one.
 *  - The vineyard's conflict guard only ever checked `name`. Two vineyards could therefore collide
 *    on the abbreviation itself, making every lot code carrying that prefix ambiguous with nothing
 *    downstream able to recover the difference. Unit 5 closes that pre-existing hole as a side
 *    effect, on create AND on update.
 */

const mocks = vi.hoisted(() => ({ vineyardFindFirst: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    vineyard: { findFirst: mocks.vineyardFindFirst },
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

describe("Vineyard.abbreviation — create", () => {
  beforeEach(() => mocks.vineyardFindFirst.mockReset());

  it("normalizes to the canonical uppercase token", async () => {
    const { data } = await vineyard().buildCreate!({} as never, { name: "Estate", abbreviation: "est" });
    expect(data.abbreviation).toBe("EST");
  });

  it("is optional — a vineyard can still be created without one", async () => {
    const { data } = await vineyard().buildCreate!({} as never, { name: "Estate" });
    expect(data.abbreviation).toBeNull();
  });

  it("rejects a non-alphanumeric token", async () => {
    await expect(vineyard().buildCreate!({} as never, { name: "Estate", abbreviation: "E-T" }))
      .rejects.toThrow(/letters and numbers/);
  });

  it("refuses an abbreviation already held by another vineyard, case-insensitively", async () => {
    // findConflict checks name first (clean), then the abbreviation.
    // The DB unique is case-sensitive, so "est" beside "EST" would otherwise both persist.
    mocks.vineyardFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ name: "Estate", abbreviation: "EST" });

    const conflict = await vineyard().findConflict!({ name: "Home Ranch", abbreviation: "est" });

    expect(conflict).toEqual({ label: "Estate (abbreviation EST)" });
    const abbrWhere = mocks.vineyardFindFirst.mock.calls[1][0].where;
    expect(abbrWhere.abbreviation).toEqual({ equals: "est", mode: "insensitive" });
  });

  it("still refuses a duplicate NAME — the original guard is intact", async () => {
    mocks.vineyardFindFirst.mockResolvedValueOnce({ name: "Estate" });
    expect(await vineyard().findConflict!({ name: "estate" })).toEqual({ label: "Estate" });
  });
});

describe("Vineyard.abbreviation — update", () => {
  beforeEach(() => mocks.vineyardFindFirst.mockReset());

  it("normalizes on the update path too", async () => {
    mocks.vineyardFindFirst.mockResolvedValue(null);
    const out = await vineyard().buildUpdate!({} as never, { abbreviation: "hr" }, "vy1");
    expect(out).toEqual({ abbreviation: "HR" });
  });

  it("refuses taking an abbreviation another vineyard holds", async () => {
    mocks.vineyardFindFirst.mockResolvedValue({ name: "Estate", abbreviation: "EST" });
    await expect(vineyard().buildUpdate!({} as never, { abbreviation: "EST" }, "vy2"))
      .rejects.toThrow(/already used by "Estate"/);
  });

  it("excludes the row being edited, so re-saving your own token is fine", async () => {
    mocks.vineyardFindFirst.mockResolvedValue(null);
    await vineyard().buildUpdate!({} as never, { abbreviation: "EST" }, "vy1");
    const where = mocks.vineyardFindFirst.mock.calls[0][0].where;
    expect(where.id).toEqual({ not: "vy1" });
  });

  it("does not query at all when abbreviation is not being changed", async () => {
    const out = await vineyard().buildUpdate!({} as never, { name: "Renamed" }, "vy1");
    expect(out).toEqual({ name: "Renamed" });
    expect(mocks.vineyardFindFirst).not.toHaveBeenCalled();
  });
});
