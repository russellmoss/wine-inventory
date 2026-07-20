import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Plan 082 Unit 3 — a block's variety became editable, so a mis-set variety is fixable by chat.
 *
 * Two things are worth pinning here. The NAME→id resolver is now shared by create and update, so the
 * two cannot disagree about what "Merlot" means. And on the update path an ambiguous name returns a
 * clickable PICKER rather than a thrown paragraph: db_update resolves before the transaction
 * precisely so it still can. A prose "which one did you mean?" is a dead end when the candidates
 * have similar names — the #328 lesson.
 */

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: { variety: { findMany: mocks.findMany } } }));
vi.mock("@/lib/assistant/scope", () => ({ findScopedBlocks: vi.fn(), resolveVineyards: vi.fn() }));
vi.mock("@/lib/vineyard/block-delete", () => ({
  assertBlockCascadeSafe: vi.fn(),
  cascadeDeleteBlockChildrenTx: vi.fn(),
}));

import { resolveVarietyId, getEntity } from "@/lib/assistant/entities";

const MERLOT = { id: "v-merlot", name: "Merlot" };
const MERLOT_BLANC = { id: "v-mb", name: "Merlot Blanc" };

describe("resolveVarietyId", () => {
  beforeEach(() => mocks.findMany.mockReset());

  it("resolves a single fuzzy match", async () => {
    mocks.findMany.mockResolvedValue([MERLOT]);
    const res = await resolveVarietyId("merl");
    expect(res.kind).toBe("one");
    expect(res.kind === "one" && res.row.id).toBe("v-merlot");
  });

  it("prefers an EXACT name over a longer superstring", async () => {
    // "Merlot" must not open a picker just because "Merlot Blanc" also exists.
    mocks.findMany.mockResolvedValue([MERLOT, MERLOT_BLANC]);
    const res = await resolveVarietyId("Merlot");
    expect(res.kind).toBe("one");
    expect(res.kind === "one" && res.row.name).toBe("Merlot");
  });

  it("matches an exact name case-insensitively", async () => {
    mocks.findMany.mockResolvedValue([MERLOT, MERLOT_BLANC]);
    const res = await resolveVarietyId("  merlot ");
    expect(res.kind === "one" && res.row.id).toBe("v-merlot");
  });

  it("returns a CHOICE on genuine ambiguity — never throws", async () => {
    mocks.findMany.mockResolvedValue([MERLOT, MERLOT_BLANC]);
    const res = await resolveVarietyId("merlo");
    expect(res.kind).toBe("choice");
    if (res.kind !== "choice") throw new Error("expected a choice");
    expect(res.choice.needsChoice).toBe(true);
    expect(res.choice.options.map((o) => o.label)).toEqual(["Merlot", "Merlot Blanc"]);
  });

  it("throws when nothing matches — there is nothing to pick", async () => {
    mocks.findMany.mockResolvedValue([]);
    await expect(resolveVarietyId("Zzzz")).rejects.toThrow(/No variety matches "Zzzz"/);
  });
});

describe("VineyardBlock.buildUpdate", () => {
  const block = () => getEntity("VineyardBlock")!;
  beforeEach(() => mocks.findMany.mockReset());

  it("passes values through untouched when variety is absent", async () => {
    const out = await block().buildUpdate!({} as never, { numRows: 12 });
    expect(out).toEqual({ numRows: 12 });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("adds varietyId and canonicalizes the typed name", async () => {
    mocks.findMany.mockResolvedValue([MERLOT]);
    const out = await block().buildUpdate!({} as never, { variety: "merlot" });
    expect(out).toEqual({ variety: "Merlot", varietyId: "v-merlot" });
  });

  it("returns the picker instead of resolving when ambiguous", async () => {
    mocks.findMany.mockResolvedValue([MERLOT, MERLOT_BLANC]);
    const out = await block().buildUpdate!({} as never, { variety: "merlo" });
    expect(out).toHaveProperty("needsChoice", true);
  });

  it("declares varietyId internal so it stays off the confirm card", () => {
    expect(block().internalUpdateKeys).toContain("varietyId");
  });
});

describe("VineyardBlock.update", () => {
  it("writes varietyId and drops the display-only variety name", async () => {
    const update = vi.fn();
    const tx = { vineyardBlock: { update } } as never;
    await getEntity("VineyardBlock")!.update!(tx, "b1", {
      variety: "Merlot",
      varietyId: "v-merlot",
      numRows: 12,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: { varietyId: "v-merlot", numRows: 12 },
    });
  });
});
